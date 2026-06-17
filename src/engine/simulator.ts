import { clamp, createSeededRandom, centeredNoise, type RandomSource } from '../lib/random';
import { createRosterForProgram, findProgram, programs } from '../data/programs';
import type {
  GameContext,
  GameResult,
  KeyMoment,
  LeagueSeasonSnapshot,
  LineupCard,
  PlayerBattingLine,
  PlayerFieldingLine,
  PlayerPitchingLine,
  PitcherUsageLine,
  PitchingPlan,
  Player,
  SeasonOutlook,
  SeasonDatabase,
  SeasonGameRecord,
  TeamSeasonLine,
  TeamGameSummary,
} from '../types/models';

interface TeamStrengthProfile {
  contact: number;
  power: number;
  discipline: number;
  defense: number;
  baserunning: number;
  bullpen: number;
  lineupDepth: number;
}

interface ActivePitcherState {
  pitcher: Player;
  fatigue: number;
  battersFaced: number;
  usage: PitcherUsageLine;
}

interface PlateAppearanceResult {
  runs: number;
  scorers: Player[];
  description: string;
  outRecorded: boolean;
  strikeout: boolean;
  hitType?: 'single' | 'double' | 'triple' | 'home-run';
  walk?: boolean;
  reachedOnError?: boolean;
  doublePlay?: boolean;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function getHitters(roster: Player[]) {
  return roster.filter((player) => player.offense);
}

function getPitchers(roster: Player[]) {
  return roster.filter((player) => player.pitching);
}

function scoreHitter(player: Player) {
  const offense = player.offense;
  const defense = player.defense;
  if (!offense || !defense) {
    return 0;
  }

  return offense.contact * 0.2 + offense.power * 0.2 + offense.eye * 0.16 + offense.avoidK * 0.14 + offense.speed * 0.14 + defense.defense * 0.1 + defense.arm * 0.06;
}

function scorePitcher(player: Player) {
  const pitching = player.pitching;
  if (!pitching) {
    return 0;
  }

  return pitching.stuff * 0.3 + pitching.command * 0.22 + pitching.movement * 0.18 + pitching.stamina * 0.12 + pitching.composure * 0.1 + pitching.groundBall * 0.08;
}

export function buildLineupCard(roster: Player[], plan: PitchingPlan): LineupCard {
  const hitters = [...getHitters(roster)].sort((left, right) => scoreHitter(right) - scoreHitter(left));
  const pitchers = [...getPitchers(roster)].sort((left, right) => scorePitcher(right) - scorePitcher(left));

  const battingOrder = hitters.slice(0, 9);
  const bench = hitters.slice(9, 14);
  const starter = pitchers[Math.min(plan.rotationSlot, pitchers.length - 1)];
  const bullpen = pitchers.filter((pitcher) => pitcher.id !== starter.id).slice(0, 6);

  return {
    battingOrder,
    bench,
    starter,
    bullpen,
  };
}

function createPitchingPlan(gameType: GameContext['gameType'], index: number): PitchingPlan {
  if (gameType === 'midweek') {
    return {
      gameType: 'midweek',
      rotationSlot: 3,
      starterPitchLimit: 75,
      bullpenAggression: 0.72,
    };
  }

  return {
    gameType: 'weekend',
    rotationSlot: (index % 3) as 0 | 1 | 2,
    starterPitchLimit: index === 0 ? 98 : 90,
    bullpenAggression: 0.82,
  };
}

function buildTeamStrength(lineup: LineupCard): TeamStrengthProfile {
  const topNine = lineup.battingOrder;
  const bench = lineup.bench;
  const defenseRatings = topNine.map((player) => player.defense?.defense ?? 50);
  const armRatings = topNine.map((player) => player.defense?.arm ?? 50);

  return {
    contact: average(topNine.map((player) => player.offense?.contact ?? 45)),
    power: average(topNine.map((player) => player.offense?.power ?? 45)),
    discipline: average(topNine.map((player) => ((player.offense?.eye ?? 45) + (player.offense?.avoidK ?? 45)) / 2)),
    defense: average([...defenseRatings, ...armRatings]),
    baserunning: average(topNine.map((player) => ((player.offense?.speed ?? 45) + (player.offense?.baserunning ?? 45)) / 2)),
    bullpen: average(lineup.bullpen.map((pitcher) => scorePitcher(pitcher))),
    lineupDepth: average(bench.map((player) => scoreHitter(player))),
  };
}

function createPitcherState(pitcher: Player): ActivePitcherState {
  return {
    pitcher,
    fatigue: pitcher.rosterStatus.fatigue,
    battersFaced: 0,
    usage: {
      pitcherId: pitcher.id,
      pitcherName: pitcher.name,
      outsRecorded: 0,
      runsAllowed: 0,
      strikeouts: 0,
      walks: 0,
    },
  };
}

function createBattingLine(player: Player): PlayerBattingLine {
  return {
    playerId: player.id,
    playerName: player.name,
    programId: player.programId,
    position: player.primaryPosition,
    games: 1,
    plateAppearances: 0,
    atBats: 0,
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    runsBattedIn: 0,
    walks: 0,
    strikeouts: 0,
  };
}

function createFieldingLine(player: Player): PlayerFieldingLine {
  return {
    playerId: player.id,
    playerName: player.name,
    programId: player.programId,
    position: player.primaryPosition,
    games: 1,
    putouts: 0,
    assists: 0,
    errors: 0,
    chances: 0,
  };
}

function createPitchingLine(player: Player, isStarter: boolean): PlayerPitchingLine {
  return {
    playerId: player.id,
    playerName: player.name,
    programId: player.programId,
    games: 1,
    gamesStarted: isStarter ? 1 : 0,
    wins: 0,
    losses: 0,
    saves: 0,
    outsRecorded: 0,
    hitsAllowed: 0,
    runsAllowed: 0,
    earnedRuns: 0,
    walks: 0,
    strikeouts: 0,
    homeRunsAllowed: 0,
  };
}

function getOrCreateBattingLine(map: Map<string, PlayerBattingLine>, player: Player) {
  const existing = map.get(player.id);
  if (existing) return existing;
  const created = createBattingLine(player);
  map.set(player.id, created);
  return created;
}

function getOrCreateFieldingLine(map: Map<string, PlayerFieldingLine>, player: Player) {
  const existing = map.get(player.id);
  if (existing) return existing;
  const created = createFieldingLine(player);
  map.set(player.id, created);
  return created;
}

function getOrCreatePitchingLine(map: Map<string, PlayerPitchingLine>, player: Player, isStarter = false) {
  const existing = map.get(player.id);
  if (existing) return existing;
  const created = createPitchingLine(player, isStarter);
  map.set(player.id, created);
  return created;
}

function chooseDefender(lineup: LineupCard, random: RandomSource, group: 'infield' | 'outfield' | 'battery') {
  const defenders = lineup.battingOrder.filter((player) => player.primaryPosition !== 'DH');
  const infield = defenders.filter((player) => ['C', '1B', '2B', '3B', 'SS'].includes(player.primaryPosition));
  const outfield = defenders.filter((player) => ['LF', 'CF', 'RF'].includes(player.primaryPosition));
  const battery = defenders.filter((player) => ['C'].includes(player.primaryPosition));

  if (group === 'battery' && battery.length) return random.pick(battery);
  if (group === 'infield' && infield.length) return random.pick(infield);
  if (group === 'outfield' && outfield.length) return random.pick(outfield);
  return random.pick(defenders.length ? defenders : lineup.battingOrder);
}

function shouldPullPitcher(
  state: ActivePitcherState,
  bullpen: Player[],
  plan: PitchingPlan,
  inning: number,
  scoreMargin: number,
  random: RandomSource,
) {
  const ratings = state.pitcher.pitching;
  if (!ratings || bullpen.length === 0) {
    return false;
  }

  const staminaWear = state.battersFaced * 1.8 + state.fatigue * 0.6;
  const threshold = ratings.stamina + plan.starterPitchLimit * 0.5;
  const leverageBump = scoreMargin <= 2 && inning >= 6 ? 12 : 0;
  const timesThroughPenalty = state.battersFaced >= 18 ? 12 : state.battersFaced >= 9 ? 4 : 0;
  return staminaWear + leverageBump + timesThroughPenalty + random.int(0, 18) > threshold;
}

function swapPitcher(
  bullpen: Player[],
  usageLines: PitcherUsageLine[],
  current: ActivePitcherState,
  inning: number,
  scoreMargin: number,
) {
  const sorted = [...bullpen].sort((left, right) => scorePitcher(right) - scorePitcher(left));
  const leveragePitcher =
    inning >= 8 && scoreMargin <= 3 ? sorted[0] : inning >= 6 && scoreMargin <= 4 ? sorted[1] ?? sorted[0] : sorted[sorted.length - 1];

  usageLines.push(current.usage);
  return createPitcherState(leveragePitcher);
}

function applyBaserunning(
  bases: Array<Player | null>,
  batter: Player,
  kind: 'single' | 'double' | 'triple' | 'walk' | 'home-run',
  random: RandomSource,
) {
  let runs = 0;
  const scorers: Player[] = [];

  if (kind === 'home-run') {
    for (const runner of bases.filter(Boolean) as Player[]) {
      scorers.push(runner);
    }
    scorers.push(batter);
    runs += scorers.length;
    bases[0] = null;
    bases[1] = null;
    bases[2] = null;
    return { runs, scorers };
  }

  if (kind === 'walk') {
    if (bases[0] && bases[1] && bases[2]) {
      runs += 1;
      scorers.push(bases[2]);
    }
    bases[2] = bases[1] ?? bases[2];
    bases[1] = bases[0] ?? bases[1];
    bases[0] = batter;
    return { runs, scorers };
  }

  const speed = batter.offense?.speed ?? 50;
  if (kind === 'single') {
    if (bases[2]) {
      runs += 1;
      scorers.push(bases[2]);
      bases[2] = null;
    }
    if (bases[1] && random.next() < (speed + batter.offense!.baserunning) / 220) {
      runs += 1;
      scorers.push(bases[1]);
      bases[1] = null;
    }
    bases[2] = bases[0] && random.next() < 0.45 ? bases[0] : bases[1];
    bases[1] = bases[0] && bases[2] !== bases[0] ? bases[0] : null;
    bases[0] = batter;
    return { runs, scorers };
  }

  if (kind === 'double') {
    if (bases[2]) {
      runs += 1;
      scorers.push(bases[2]);
    }
    if (bases[1] && bases[1] !== bases[2]) {
      runs += 1;
      scorers.push(bases[1]);
    }
    if (bases[0] && random.next() < 0.5) {
      runs += 1;
      scorers.push(bases[0]);
      bases[0] = null;
    }
    bases[2] = bases[0] && random.next() < 0.4 ? bases[0] : null;
    bases[1] = batter;
    bases[0] = null;
    return { runs, scorers };
  }

  for (const runner of bases.filter(Boolean) as Player[]) {
    scorers.push(runner);
  }
  runs += scorers.length;
  bases[0] = null;
  bases[1] = null;
  bases[2] = batter;
  return { runs, scorers };
}

function consumePlateAppearance(
  batter: Player,
  pitcherState: ActivePitcherState,
  offense: TeamStrengthProfile,
  defense: TeamStrengthProfile,
  defenseLineup: LineupCard,
  context: GameContext,
  random: RandomSource,
  sequencingBoost: number,
  fieldingSharpness: number,
  summary: TeamGameSummary,
  battingLines: Map<string, PlayerBattingLine>,
  pitchingLines: Map<string, PlayerPitchingLine>,
  fieldingLines: Map<string, PlayerFieldingLine>,
  bases: Array<Player | null>,
  outs: { value: number },
): PlateAppearanceResult {
  const batting = batter.offense!;
  const pitching = pitcherState.pitcher.pitching!;
  const battingLine = getOrCreateBattingLine(battingLines, batter);
  const pitchingLine = getOrCreatePitchingLine(pitchingLines, pitcherState.pitcher);
  const commandVariance = centeredNoise(random, 6);
  const contactEdge = (batting.contact - pitching.stuff) * 0.0008;
  const powerEdge = (batting.power - pitching.movement) * 0.0006;
  const disciplineEdge = (batting.eye - pitching.command) * 0.0008;
  const avoidKEdge = (batting.avoidK - pitching.stuff) * 0.0010;
  const fatiguePenalty = pitcherState.battersFaced >= 18 ? 0.02 : pitcherState.battersFaced >= 9 ? 0.008 : 0;
  const parkEffect = (context.parkFactor - 1) * 0.02;
  const postseasonTightness = context.postseasonStage !== 'regular-season' ? -0.004 : 0;

  const walkChance = clamp(0.09 + disciplineEdge + commandVariance * 0.001 + fatiguePenalty * 0.5, 0.04, 0.16);
  const strikeoutChance = clamp(0.19 - avoidKEdge - fatiguePenalty * 0.5, 0.08, 0.35);
  const homeRunChance = clamp(0.025 + powerEdge + parkEffect + fatiguePenalty * 0.2, 0.005, 0.08);
  const errorChance = clamp(0.012 + (60 - defense.defense) * 0.00022 + (1 - fieldingSharpness) * 0.02, 0.004, 0.05);
  const inPlayHitChance = clamp(0.19 + contactEdge + (offense.baserunning - defense.defense) * 0.0005 + sequencingBoost + postseasonTightness, 0.12, 0.28);

  const roll = random.next();
  pitcherState.battersFaced += 1;
  pitcherState.fatigue += 2;
  battingLine.plateAppearances += 1;

  if (roll < walkChance) {
    pitcherState.usage.walks += 1;
    pitchingLine.walks += 1;
    summary.walks += 1;
    battingLine.walks += 1;
    const advancement = applyBaserunning(bases, batter, 'walk', random);
    return {
      runs: advancement.runs,
      scorers: advancement.scorers,
      description: `${batter.name} worked a walk.`,
      outRecorded: false,
      strikeout: false,
      walk: true,
    };
  }

  if (roll < walkChance + strikeoutChance) {
    outs.value += 1;
    pitcherState.usage.outsRecorded += 1;
    pitcherState.usage.strikeouts += 1;
    pitchingLine.outsRecorded += 1;
    pitchingLine.strikeouts += 1;
    summary.strikeouts += 1;
    battingLine.atBats += 1;
    battingLine.strikeouts += 1;
    const catcher = chooseDefender(defenseLineup, random, 'battery');
    const catcherFielding = getOrCreateFieldingLine(fieldingLines, catcher);
    catcherFielding.putouts += 1;
    catcherFielding.chances += 1;
    return {
      runs: 0,
      description: `${batter.name} went down swinging.`,
      outRecorded: true,
      strikeout: true,
      scorers: [],
    };
  }

  if (roll < walkChance + strikeoutChance + homeRunChance) {
    summary.hits += 1;
    battingLine.atBats += 1;
    battingLine.hits += 1;
    battingLine.homeRuns += 1;
    pitchingLine.hitsAllowed += 1;
    pitchingLine.homeRunsAllowed += 1;
    const advancement = applyBaserunning(bases, batter, 'home-run', random);
    return {
      runs: advancement.runs,
      scorers: advancement.scorers,
      description: `${batter.name} drove one out to the gapside seats.`,
      outRecorded: false,
      strikeout: false,
      hitType: 'home-run',
    };
  }

  if (roll < walkChance + strikeoutChance + homeRunChance + errorChance) {
    summary.errors += 1;
    battingLine.atBats += 1;
    const defender = chooseDefender(defenseLineup, random, random.next() < 0.55 ? 'infield' : 'outfield');
    const fieldingLine = getOrCreateFieldingLine(fieldingLines, defender);
    fieldingLine.errors += 1;
    fieldingLine.chances += 1;
    const advancement = applyBaserunning(bases, batter, 'single', random);
    return {
      runs: advancement.runs,
      scorers: advancement.scorers,
      description: `${batter.name} reached on a shaky defensive play.`,
      outRecorded: false,
      strikeout: false,
      reachedOnError: true,
    };
  }

  if (roll < walkChance + strikeoutChance + homeRunChance + errorChance + inPlayHitChance) {
    summary.hits += 1;
    battingLine.atBats += 1;
    battingLine.hits += 1;
    pitchingLine.hitsAllowed += 1;
    const xbhRoll = random.next() + (batting.gap + batting.power) / 250;
    const hitType = xbhRoll > 1.6 ? 'triple' : xbhRoll > 1.3 ? 'double' : 'single';
    if (hitType === 'double') battingLine.doubles += 1;
    if (hitType === 'triple') battingLine.triples += 1;
    const advancement = applyBaserunning(bases, batter, hitType === 'triple' ? 'triple' : hitType, random);
    return {
      runs: advancement.runs,
      scorers: advancement.scorers,
      description:
        hitType === 'double'
          ? `${batter.name} split the alley for a double.`
          : hitType === 'triple'
            ? `${batter.name} flew around the bases for a triple.`
          : `${batter.name} punched a single through the infield.`,
      outRecorded: false,
      strikeout: false,
      hitType,
    };
  }

  const doublePlayChance = bases[0] && outs.value <= 1 ? clamp(0.08 + (defense.defense - offense.baserunning) * 0.0012, 0.03, 0.18) : 0;
  if (bases[0] && outs.value <= 1 && random.next() < doublePlayChance) {
    outs.value += 2;
    pitcherState.usage.outsRecorded += 2;
    pitchingLine.outsRecorded += 2;
    battingLine.atBats += 1;
    bases[0] = null;
    const infielder = chooseDefender(defenseLineup, random, 'infield');
    const firstBaseman =
      defenseLineup.battingOrder.find((player) => player.primaryPosition === '1B') ?? chooseDefender(defenseLineup, random, 'infield');
    const fieldingOne = getOrCreateFieldingLine(fieldingLines, infielder);
    const fieldingTwo = getOrCreateFieldingLine(fieldingLines, firstBaseman);
    fieldingOne.assists += 1;
    fieldingOne.chances += 1;
    fieldingTwo.putouts += 2;
    fieldingTwo.chances += 2;
    return {
      runs: 0,
      description: `${batter.name} bounced into a double play.`,
      outRecorded: true,
      strikeout: false,
      doublePlay: true,
      scorers: [],
    };
  }

  outs.value += 1;
  pitcherState.usage.outsRecorded += 1;
  pitchingLine.outsRecorded += 1;
  battingLine.atBats += 1;
  const defender = chooseDefender(defenseLineup, random, random.next() < 0.6 ? 'infield' : 'outfield');
  const fieldingLine = getOrCreateFieldingLine(fieldingLines, defender);
  fieldingLine.putouts += 1;
  fieldingLine.chances += 1;
  if (defender.primaryPosition !== '1B' && random.next() < 0.55) {
    fieldingLine.assists += 1;
  }
  return {
    runs: 0,
    description: `${batter.name} was retired on a ball in play.`,
    outRecorded: true,
    strikeout: false,
    scorers: [],
  };
}

function createSummary(): TeamGameSummary {
  return {
    runsByInning: [],
    hits: 0,
    errors: 0,
    walks: 0,
    strikeouts: 0,
    leftOnBase: 0,
  };
}

function simulateHalfInning(
  offenseLineup: LineupCard,
  defenseLineup: LineupCard,
  offenseStrength: TeamStrengthProfile,
  defenseStrength: TeamStrengthProfile,
  context: GameContext,
  inning: number,
  battingIndexRef: { value: number },
  activePitcher: ActivePitcherState,
  bullpen: Player[],
  usageLines: PitcherUsageLine[],
  plan: PitchingPlan,
  random: RandomSource,
  sequencingBoost: number,
  fieldingSharpness: number,
  summary: TeamGameSummary,
  battingLines: Map<string, PlayerBattingLine>,
  pitchingLines: Map<string, PlayerPitchingLine>,
  fieldingLines: Map<string, PlayerFieldingLine>,
  keyMoments: KeyMoment[],
  half: 'top' | 'bottom',
  scoreMargin: number,
) {
  const bases: Array<Player | null> = [null, null, null];
  const outs = { value: 0 };
  let runs = 0;
  let workingPitcher = activePitcher;

  while (outs.value < 3) {
    const batter = offenseLineup.battingOrder[battingIndexRef.value % offenseLineup.battingOrder.length];
    if (shouldPullPitcher(workingPitcher, bullpen, plan, inning, Math.abs(scoreMargin), random)) {
      workingPitcher = swapPitcher(bullpen, usageLines, workingPitcher, inning, Math.abs(scoreMargin));
      keyMoments.push({
        inning,
        half,
        text: `${findProgram(context[half === 'top' ? 'homeProgramId' : 'awayProgramId'])?.school ?? 'Defense'} went to the bullpen.`,
      });
    }

    const result = consumePlateAppearance(
      batter,
      workingPitcher,
      offenseStrength,
      defenseStrength,
      defenseLineup,
      context,
      random,
      sequencingBoost,
      fieldingSharpness,
      summary,
      battingLines,
      pitchingLines,
      fieldingLines,
      bases,
      outs,
    );

    battingIndexRef.value += 1;
    runs += result.runs;
    workingPitcher.usage.runsAllowed += result.runs;
    const batterLine = getOrCreateBattingLine(battingLines, batter);
    if (!result.reachedOnError) {
      batterLine.runsBattedIn += result.runs;
    }
    for (const scorer of result.scorers) {
      const scorerLine = getOrCreateBattingLine(battingLines, scorer);
      scorerLine.runs += 1;
    }

    if (result.runs >= 2 || (result.description.includes('double') && random.next() < 0.25) || result.description.includes('out to the gapside seats')) {
      keyMoments.push({ inning, half, text: result.description });
    }
  }

  summary.leftOnBase += bases.filter(Boolean).length;
  return { runs, pitcher: workingPitcher };
}

export function simulateGame(
  context: GameContext,
  homeRoster: Player[],
  awayRoster: Player[],
  seed = `${context.dateLabel}-${context.homeProgramId}-${context.awayProgramId}`,
) : GameResult {
  const random = createSeededRandom(seed);
  const homePlan = createPitchingPlan(context.gameType, context.seriesGameNumber - 1);
  const awayPlan = createPitchingPlan(context.gameType, context.seriesGameNumber - 1);
  const homeLineup = buildLineupCard(homeRoster, homePlan);
  const awayLineup = buildLineupCard(awayRoster, awayPlan);

  const homeStrength = buildTeamStrength(homeLineup);
  const awayStrength = buildTeamStrength(awayLineup);

  const runEnvironment = random.pick([0.78, 0.88, 0.96, 1, 1.08, 1.18, 1.3]);
  const homeSequencing = centeredNoise(random, context.gameType === 'midweek' ? 0.075 : 0.052);
  const awaySequencing = centeredNoise(random, context.gameType === 'midweek' ? 0.075 : 0.052);
  const homeFieldingSharpness = clamp(1 + centeredNoise(random, 0.08), 0.84, 1.14);
  const awayFieldingSharpness = clamp(1 + centeredNoise(random, 0.08), 0.84, 1.14);
  const homeAdvantage = 0.012 + (findProgram(context.homeProgramId)?.prestige.overall ?? 70 - (findProgram(context.awayProgramId)?.prestige.overall ?? 70)) * 0.00008;

  const homeSummary = createSummary();
  const awaySummary = createSummary();
  const keyMoments: KeyMoment[] = [];
  const homeBattingMap = new Map<string, PlayerBattingLine>();
  const awayBattingMap = new Map<string, PlayerBattingLine>();
  const homePitchingMap = new Map<string, PlayerPitchingLine>();
  const awayPitchingMap = new Map<string, PlayerPitchingLine>();
  const homeFieldingMap = new Map<string, PlayerFieldingLine>();
  const awayFieldingMap = new Map<string, PlayerFieldingLine>();
  const homeBattingIndex = { value: 0 };
  const awayBattingIndex = { value: 0 };

  let homePitcher = createPitcherState(homeLineup.starter);
  let awayPitcher = createPitcherState(awayLineup.starter);
  getOrCreatePitchingLine(homePitchingMap, homeLineup.starter, true);
  getOrCreatePitchingLine(awayPitchingMap, awayLineup.starter, true);
  const homePitchingUsage: PitcherUsageLine[] = [];
  const awayPitchingUsage: PitcherUsageLine[] = [];
  let homeRuns = 0;
  let awayRuns = 0;

  const maxInnings = 12;
  for (let inning = 1; inning <= maxInnings; inning += 1) {
    const topResult = simulateHalfInning(
      awayLineup,
      homeLineup,
      awayStrength,
      homeStrength,
      context,
      inning,
      awayBattingIndex,
      homePitcher,
      homeLineup.bullpen,
      homePitchingUsage,
      homePlan,
      random,
      (awaySequencing + (runEnvironment - 1) * 0.05) + (context.gameType === 'midweek' ? 0.01 : 0),
      homeFieldingSharpness,
      awaySummary,
      awayBattingMap,
      homePitchingMap,
      homeFieldingMap,
      keyMoments,
      'top',
      homeRuns - awayRuns,
    );
    awayRuns += topResult.runs;
    awaySummary.runsByInning.push(topResult.runs);
    homePitcher = topResult.pitcher;

    if (inning >= 9 && inning === maxInnings && awayRuns !== homeRuns) {
      break;
    }

    const skipBottom = inning >= 9 && inning < maxInnings && homeRuns > awayRuns;
    if (skipBottom) {
      homeSummary.runsByInning.push(0);
      continue;
    }

    const bottomResult = simulateHalfInning(
      homeLineup,
      awayLineup,
      { ...homeStrength, contact: homeStrength.contact + homeAdvantage * 100 },
      awayStrength,
      context,
      inning,
      homeBattingIndex,
      awayPitcher,
      awayLineup.bullpen,
      awayPitchingUsage,
      awayPlan,
      random,
      (homeSequencing + (runEnvironment - 1) * 0.05) + homeAdvantage,
      awayFieldingSharpness,
      homeSummary,
      homeBattingMap,
      awayPitchingMap,
      awayFieldingMap,
      keyMoments,
      'bottom',
      awayRuns - homeRuns,
    );
    homeRuns += bottomResult.runs;
    homeSummary.runsByInning.push(bottomResult.runs);
    awayPitcher = bottomResult.pitcher;

    if (inning >= 9 && homeRuns !== awayRuns) {
      break;
    }
  }

  homePitchingUsage.push(homePitcher.usage);
  awayPitchingUsage.push(awayPitcher.usage);
  getOrCreatePitchingLine(homePitchingMap, homePitcher.pitcher);
  getOrCreatePitchingLine(awayPitchingMap, awayPitcher.pitcher);

  const winnerIsHome = homeRuns > awayRuns;
  const homePitchingLines = [...homePitchingMap.values()].map((line) => {
    const usage = [...homePitchingUsage, homePitcher.usage].find((entry) => entry.pitcherId === line.playerId);
    if (usage) {
      line.outsRecorded = usage.outsRecorded;
      line.runsAllowed = usage.runsAllowed;
      line.earnedRuns = usage.runsAllowed;
      line.walks = usage.walks;
      line.strikeouts = usage.strikeouts;
    }
    return line;
  });
  const awayPitchingLines = [...awayPitchingMap.values()].map((line) => {
    const usage = [...awayPitchingUsage, awayPitcher.usage].find((entry) => entry.pitcherId === line.playerId);
    if (usage) {
      line.outsRecorded = usage.outsRecorded;
      line.runsAllowed = usage.runsAllowed;
      line.earnedRuns = usage.runsAllowed;
      line.walks = usage.walks;
      line.strikeouts = usage.strikeouts;
    }
    return line;
  });

  const winningPitcherLine = winnerIsHome
    ? homePitchingLines[homePitchingLines.length - 1]
    : awayPitchingLines[awayPitchingLines.length - 1];
  const losingPitcherLine = winnerIsHome
    ? awayPitchingLines[awayPitchingLines.length - 1]
    : homePitchingLines[homePitchingLines.length - 1];
  winningPitcherLine.wins += 1;
  losingPitcherLine.losses += 1;
  if (context.gameType !== 'midweek') {
    winningPitcherLine.saves += winningPitcherLine.gamesStarted ? 0 : 1;
  }

  return {
    context,
    homeProgramId: context.homeProgramId,
    awayProgramId: context.awayProgramId,
    homeLineup,
    awayLineup,
    homeSummary: { ...homeSummary, runsByInning: [...homeSummary.runsByInning], hits: homeSummary.hits, errors: homeSummary.errors },
    awaySummary: { ...awaySummary, runsByInning: [...awaySummary.runsByInning], hits: awaySummary.hits, errors: awaySummary.errors },
    homeBattingLines: [...homeBattingMap.values()],
    awayBattingLines: [...awayBattingMap.values()],
    homePitchingLines,
    awayPitchingLines,
    homeFieldingLines: [...homeFieldingMap.values()],
    awayFieldingLines: [...awayFieldingMap.values()],
    winningPitcher: winningPitcherLine.playerName,
    losingPitcher: losingPitcherLine.playerName,
    homePitchingUsage,
    awayPitchingUsage,
    keyMoments: keyMoments.slice(0, 8),
    updatedFatigue: Object.fromEntries(
      [...homePitchingUsage, ...awayPitchingUsage].map((usageLine) => [usageLine.pitcherId, clamp(usageLine.outsRecorded * 2 + usageLine.runsAllowed * 3, 5, 55)]),
    ),
  };
}

function compareGameContexts(left: GameContext, right: GameContext) {
  const weekLeft = scheduleWeekNumber(left);
  const weekRight = scheduleWeekNumber(right);
  if (weekLeft !== weekRight) return weekLeft - weekRight;

  const dayOrder = (label: string) => {
    if (label.includes('Tuesday')) return 0;
    if (label.includes('Friday')) return 1;
    if (label.includes('Saturday')) return 2;
    if (label.includes('Sunday')) return 3;
    return 4;
  };

  const dayLeft = dayOrder(left.dateLabel);
  const dayRight = dayOrder(right.dateLabel);
  if (dayLeft !== dayRight) return dayLeft - dayRight;

  return left.homeProgramId.localeCompare(right.homeProgramId) || left.awayProgramId.localeCompare(right.awayProgramId);
}

function gameRecordId(context: GameContext) {
  return `${context.dateLabel}-${context.homeProgramId}-${context.awayProgramId}-${context.seriesGameNumber}`;
}

function rotatePairings(entries: typeof programs, offset: number) {
  const ordered = entries.map((program) => program.id);
  const rotated = ordered.slice(offset % ordered.length).concat(ordered.slice(0, offset % ordered.length));
  const pairings: Array<[string, string]> = [];

  for (let index = 0; index < Math.floor(rotated.length / 2); index += 1) {
    pairings.push([rotated[index], rotated[rotated.length - 1 - index]]);
  }

  return pairings;
}

function homeAwayForPair(leftId: string, rightId: string, week: number, game: number) {
  const left = findProgram(leftId)!;
  const right = findProgram(rightId)!;
  const leftHome = (week + game + left.prestige.history.avgRpiRank + right.prestige.history.cwsTrips) % 2 === 0;
  return {
    homeProgramId: leftHome ? leftId : rightId,
    awayProgramId: leftHome ? rightId : leftId,
  };
}

function addDeficitShowcaseGames(games: GameContext[]) {
  const gameCounts = new Map(programs.map((program) => [program.id, 0]));
  const occupiedDates = new Map(programs.map((program) => [program.id, new Set<string>()]));

  for (const game of games) {
    gameCounts.set(game.homeProgramId, (gameCounts.get(game.homeProgramId) ?? 0) + 1);
    gameCounts.set(game.awayProgramId, (gameCounts.get(game.awayProgramId) ?? 0) + 1);
    occupiedDates.get(game.homeProgramId)?.add(game.dateLabel);
    occupiedDates.get(game.awayProgramId)?.add(game.dateLabel);
  }

  let guard = 0;
  while ([...gameCounts.values()].some((count) => count < 56) && guard < 400) {
    guard += 1;
    const week = ((guard - 1) % 14) + 1;
    const dateLabel = `Week ${week} Wednesday`;
    const candidates = programs
      .filter((program) => (gameCounts.get(program.id) ?? 0) < 56 && !occupiedDates.get(program.id)?.has(dateLabel))
      .sort((left, right) =>
        (gameCounts.get(left.id) ?? 0) - (gameCounts.get(right.id) ?? 0)
        || left.region.localeCompare(right.region)
        || right.prestige.overall - left.prestige.overall,
      );

    while (candidates.length >= 2) {
      const left = candidates.shift()!;
      const rightIndex = candidates.findIndex((program) => program.region === left.region);
      const right = rightIndex >= 0 ? candidates.splice(rightIndex, 1)[0] : candidates.pop()!;
      const { homeProgramId, awayProgramId } = homeAwayForPair(left.id, right.id, week - 1, 4);
      const homeProgram = findProgram(homeProgramId)!;

      games.push({
        dateLabel,
        homeProgramId,
        awayProgramId,
        seriesGameNumber: 1,
        gameType: 'midweek',
        parkFactor: homeProgram.parkFactor,
        weatherNote: 'Regional midweek showcase',
        homeTravelDays: 0,
        awayTravelDays: 1,
        postseasonStage: 'regular-season',
      });
      gameCounts.set(homeProgramId, (gameCounts.get(homeProgramId) ?? 0) + 1);
      gameCounts.set(awayProgramId, (gameCounts.get(awayProgramId) ?? 0) + 1);
      occupiedDates.get(homeProgramId)?.add(dateLabel);
      occupiedDates.get(awayProgramId)?.add(dateLabel);
    }
  }
}

function createLeagueSchedule() {
  const games: GameContext[] = [];
  const prestigeOrder = [...programs].sort((left, right) => right.prestige.overall - left.prestige.overall);

  for (let week = 0; week < 14; week += 1) {
    const midweekPairings = rotatePairings(prestigeOrder, week * 3);
    for (const [leftId, rightId] of midweekPairings) {
      const { homeProgramId, awayProgramId } = homeAwayForPair(leftId, rightId, week, 0);
      const homeProgram = findProgram(homeProgramId)!;
      games.push({
        dateLabel: `Week ${week + 1} Tuesday`,
        homeProgramId,
        awayProgramId,
        seriesGameNumber: 1,
        gameType: 'midweek',
        parkFactor: homeProgram.parkFactor,
        weatherNote: week < 4 ? 'Early-season non-conference test' : 'Midweek staff game',
        homeTravelDays: 0,
        awayTravelDays: 1,
        postseasonStage: 'regular-season',
      });
    }

    const weekendPairings = rotatePairings(prestigeOrder, week * 5 + 1);

    for (const [leftId, rightId] of weekendPairings) {
      for (let game = 0; game < 3; game += 1) {
        const { homeProgramId, awayProgramId } = homeAwayForPair(leftId, rightId, week, game + 1);
        const homeProgram = findProgram(homeProgramId)!;
        games.push({
          dateLabel: `Week ${week + 1} ${['Friday', 'Saturday', 'Sunday'][game]}`,
          homeProgramId,
          awayProgramId,
          seriesGameNumber: game + 1,
          gameType: 'weekend',
          parkFactor: homeProgram.parkFactor,
          weatherNote: game === 0 ? 'Friday ace night' : game === 1 ? 'Weekend middle game' : 'Sunday staff management',
          homeTravelDays: 0,
          awayTravelDays: game === 0 ? 1 : 0,
          postseasonStage: 'regular-season',
        });
      }
    }
  }

  addDeficitShowcaseGames(games);
  return games.sort(compareGameContexts);
}

export function createProgramSchedule(programId: string) {
  return createLeagueSchedule().filter((game) => game.homeProgramId === programId || game.awayProgramId === programId);
}

export function createSeasonDatabase(): SeasonDatabase {
  const orderedGames = createLeagueSchedule();
  const dayLabelToNumber = new Map<string, number>();
  let currentDay = 0;

  const games: SeasonGameRecord[] = orderedGames.map((context) => {
    if (!dayLabelToNumber.has(context.dateLabel)) {
      currentDay += 1;
      dayLabelToNumber.set(context.dateLabel, currentDay);
    }

    return {
      id: gameRecordId(context),
      dayNumber: dayLabelToNumber.get(context.dateLabel)!,
      dayLabel: context.dateLabel,
      context,
      status: 'scheduled',
    };
  });

  return {
    currentDayNumber: 0,
    completedDays: [],
    games,
  };
}

export function simulateSeasonOutlook(programId: string, roster: Player[], simulations = 24): SeasonOutlook {
  const schedule = createProgramSchedule(programId);
  const winTotals: number[] = [];
  let undefeatedCount = 0;
  let postseasonCount = 0;

  for (let season = 0; season < simulations; season += 1) {
    let wins = 0;

    for (const game of schedule) {
      const opponentRoster = roster.map((player) => player.programId === programId ? player : player);
      const actualOpponentRoster = programs.find((program) => program.id === game.homeProgramId || program.id === game.awayProgramId)?.id === programId
        ? roster
        : roster;
      const homeRoster = game.homeProgramId === programId ? roster : createOpponentRoster(game.homeProgramId);
      const awayRoster = game.awayProgramId === programId ? roster : createOpponentRoster(game.awayProgramId);
      const result = simulateGame(game, homeRoster, awayRoster, `season-${season}-${game.dateLabel}`);
      const userWins = game.homeProgramId === programId
        ? result.homeSummary.runsByInning.reduce((sum, runs) => sum + runs, 0) > result.awaySummary.runsByInning.reduce((sum, runs) => sum + runs, 0)
        : result.awaySummary.runsByInning.reduce((sum, runs) => sum + runs, 0) > result.homeSummary.runsByInning.reduce((sum, runs) => sum + runs, 0);
      if (userWins) {
        wins += 1;
      }
      void opponentRoster;
      void actualOpponentRoster;
    }

    winTotals.push(wins);
    if (wins === schedule.length) {
      undefeatedCount += 1;
    }
    if (wins >= 35) {
      postseasonCount += 1;
    }
  }

  return {
    medianWins: [...winTotals].sort((left, right) => left - right)[Math.floor(winTotals.length / 2)],
    averageWins: Math.round(average(winTotals) * 10) / 10,
    maxWins: Math.max(...winTotals),
    minWins: Math.min(...winTotals),
    undefeatedRate: undefeatedCount / simulations,
    postseasonRate: postseasonCount / simulations,
  };
}

function scheduleWeekNumber(game: GameContext) {
  const match = game.dateLabel.match(/Week (\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function getCompletedResults(games: SeasonGameRecord[]) {
  return games
    .filter((game) => game.status === 'final' && game.result)
    .map((game) => game.result as GameResult);
}

function mergeBattingLine(target: PlayerBattingLine, source: PlayerBattingLine) {
  target.games += source.games;
  target.plateAppearances += source.plateAppearances;
  target.atBats += source.atBats;
  target.runs += source.runs;
  target.hits += source.hits;
  target.doubles += source.doubles;
  target.triples += source.triples;
  target.homeRuns += source.homeRuns;
  target.runsBattedIn += source.runsBattedIn;
  target.walks += source.walks;
  target.strikeouts += source.strikeouts;
}

function mergePitchingLine(target: PlayerPitchingLine, source: PlayerPitchingLine) {
  target.games += source.games;
  target.gamesStarted += source.gamesStarted;
  target.wins += source.wins;
  target.losses += source.losses;
  target.saves += source.saves;
  target.outsRecorded += source.outsRecorded;
  target.hitsAllowed += source.hitsAllowed;
  target.runsAllowed += source.runsAllowed;
  target.earnedRuns += source.earnedRuns;
  target.walks += source.walks;
  target.strikeouts += source.strikeouts;
  target.homeRunsAllowed += source.homeRunsAllowed;
}

function mergeFieldingLine(target: PlayerFieldingLine, source: PlayerFieldingLine) {
  target.games += source.games;
  target.putouts += source.putouts;
  target.assists += source.assists;
  target.errors += source.errors;
  target.chances += source.chances;
}

function getOrCreateMergedBatting(map: Map<string, PlayerBattingLine>, line: PlayerBattingLine) {
  const existing = map.get(line.playerId);
  if (existing) return existing;
  const created = { ...line, games: 0, plateAppearances: 0, atBats: 0, runs: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, runsBattedIn: 0, walks: 0, strikeouts: 0 };
  map.set(line.playerId, created);
  return created;
}

function getOrCreateMergedPitching(map: Map<string, PlayerPitchingLine>, line: PlayerPitchingLine) {
  const existing = map.get(line.playerId);
  if (existing) return existing;
  const created = { ...line, games: 0, gamesStarted: 0, wins: 0, losses: 0, saves: 0, outsRecorded: 0, hitsAllowed: 0, runsAllowed: 0, earnedRuns: 0, walks: 0, strikeouts: 0, homeRunsAllowed: 0 };
  map.set(line.playerId, created);
  return created;
}

function getOrCreateMergedFielding(map: Map<string, PlayerFieldingLine>, line: PlayerFieldingLine) {
  const existing = map.get(line.playerId);
  if (existing) return existing;
  const created = { ...line, games: 0, putouts: 0, assists: 0, errors: 0, chances: 0 };
  map.set(line.playerId, created);
  return created;
}

function calculateEra(line: PlayerPitchingLine) {
  const innings = line.outsRecorded / 3;
  return innings > 0 ? (line.earnedRuns * 9) / innings : 0;
}

function buildLeagueSeasonSnapshot(userProgramId: string, results: GameResult[]): LeagueSeasonSnapshot {
  const teamStats = new Map<string, TeamSeasonLine>();
  const battingTotals = new Map<string, PlayerBattingLine>();
  const pitchingTotals = new Map<string, PlayerPitchingLine>();
  const fieldingTotals = new Map<string, PlayerFieldingLine>();

  for (const program of programs) {
    teamStats.set(program.id, {
      programId: program.id,
      wins: 0,
      losses: 0,
      runsScored: 0,
      runsAllowed: 0,
      hits: 0,
      homeRuns: 0,
      walks: 0,
      strikeouts: 0,
      era: 0,
      whip: 0,
      errors: 0,
    });
  }

  for (const result of results) {
    const homeRuns = totalRunsByInning(result.homeSummary.runsByInning);
    const awayRuns = totalRunsByInning(result.awaySummary.runsByInning);
    const homeTeam = teamStats.get(result.homeProgramId)!;
    const awayTeam = teamStats.get(result.awayProgramId)!;
    homeTeam.runsScored += homeRuns;
    homeTeam.runsAllowed += awayRuns;
    homeTeam.hits += result.homeSummary.hits;
    homeTeam.walks += result.homeSummary.walks;
    homeTeam.strikeouts += result.homeSummary.strikeouts;
    homeTeam.errors += result.homeSummary.errors;
    homeTeam.homeRuns += result.homeBattingLines.reduce((sum, line) => sum + line.homeRuns, 0);
    awayTeam.runsScored += awayRuns;
    awayTeam.runsAllowed += homeRuns;
    awayTeam.hits += result.awaySummary.hits;
    awayTeam.walks += result.awaySummary.walks;
    awayTeam.strikeouts += result.awaySummary.strikeouts;
    awayTeam.errors += result.awaySummary.errors;
    awayTeam.homeRuns += result.awayBattingLines.reduce((sum, line) => sum + line.homeRuns, 0);

    if (homeRuns > awayRuns) {
      homeTeam.wins += 1;
      awayTeam.losses += 1;
    } else {
      awayTeam.wins += 1;
      homeTeam.losses += 1;
    }

    for (const line of result.homeBattingLines) {
      mergeBattingLine(getOrCreateMergedBatting(battingTotals, line), line);
    }
    for (const line of result.awayBattingLines) {
      mergeBattingLine(getOrCreateMergedBatting(battingTotals, line), line);
    }
    for (const line of result.homePitchingLines) {
      mergePitchingLine(getOrCreateMergedPitching(pitchingTotals, line), line);
    }
    for (const line of result.awayPitchingLines) {
      mergePitchingLine(getOrCreateMergedPitching(pitchingTotals, line), line);
    }
    for (const line of result.homeFieldingLines) {
      mergeFieldingLine(getOrCreateMergedFielding(fieldingTotals, line), line);
    }
    for (const line of result.awayFieldingLines) {
      mergeFieldingLine(getOrCreateMergedFielding(fieldingTotals, line), line);
    }
  }

  const allPitchers = [...pitchingTotals.values()];
  for (const team of teamStats.values()) {
    const teamPitchers = allPitchers.filter((line) => line.programId === team.programId);
    const outs = teamPitchers.reduce((sum, line) => sum + line.outsRecorded, 0);
    const er = teamPitchers.reduce((sum, line) => sum + line.earnedRuns, 0);
    const baserunners = teamPitchers.reduce((sum, line) => sum + line.walks + line.hitsAllowed, 0);
    const innings = outs / 3;
    team.era = innings > 0 ? Number(((er * 9) / innings).toFixed(2)) : 0;
    team.whip = innings > 0 ? Number((baserunners / innings).toFixed(2)) : 0;
  }

  const battingLeaders = [...battingTotals.values()]
    .filter((line) => line.plateAppearances >= 12)
    .sort((left, right) => {
      const rightOps = calcOps(right);
      const leftOps = calcOps(left);
      return rightOps - leftOps || right.homeRuns - left.homeRuns || right.runsBattedIn - left.runsBattedIn;
    })
    .slice(0, 12);
  const pitchingLeaders = [...pitchingTotals.values()]
    .filter((line) => line.outsRecorded >= 9)
    .sort((left, right) => {
      const leftEra = calculateEra(left);
      const rightEra = calculateEra(right);
      return leftEra - rightEra || right.strikeouts - left.strikeouts;
    })
    .slice(0, 12);
  const fieldingLeaders = [...fieldingTotals.values()]
    .filter((line) => line.chances >= 5)
    .sort((left, right) => {
      const leftPct = left.chances ? (left.chances - left.errors) / left.chances : 0;
      const rightPct = right.chances ? (right.chances - right.errors) / right.chances : 0;
      return rightPct - leftPct || right.putouts + right.assists - (left.putouts + left.assists);
    })
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    teamStats: [...teamStats.values()].sort((left, right) => right.wins - left.wins || left.losses - right.losses),
    userTeamBatting: [...battingTotals.values()].filter((line) => line.programId === userProgramId).sort((left, right) => right.homeRuns - left.homeRuns || right.runsBattedIn - left.runsBattedIn),
    userTeamPitching: [...pitchingTotals.values()].filter((line) => line.programId === userProgramId).sort((left, right) => right.outsRecorded - left.outsRecorded),
    userTeamFielding: [...fieldingTotals.values()].filter((line) => line.programId === userProgramId).sort((left, right) => right.chances - left.chances),
    battingLeaders,
    pitchingLeaders,
    fieldingLeaders,
  };
}

export function buildSeasonSnapshotFromDatabase(userProgramId: string, season: SeasonDatabase) {
  return buildLeagueSeasonSnapshot(userProgramId, getCompletedResults(season.games));
}

export function simulateSeasonDay(
  season: SeasonDatabase,
  userProgramId: string,
  userRoster: Player[],
): { season: SeasonDatabase; userGame: GameResult | null } | null {
  const nextDayNumber = season.games.find((game) => game.status === 'scheduled')?.dayNumber;
  if (!nextDayNumber) {
    return null;
  }

  const dayGames = season.games.filter((game) => game.dayNumber === nextDayNumber);
  let userGame: GameResult | null = null;
  const updatedGames = season.games.map((game) => {
    if (game.dayNumber !== nextDayNumber || game.status === 'final') {
      return game;
    }

    const homeRoster = game.context.homeProgramId === userProgramId
      ? userRoster
      : createOpponentRoster(game.context.homeProgramId);
    const awayRoster = game.context.awayProgramId === userProgramId
      ? userRoster
      : createOpponentRoster(game.context.awayProgramId);
    const result = simulateGame(game.context, homeRoster, awayRoster, `season-db-${game.id}`);
    if (game.context.homeProgramId === userProgramId || game.context.awayProgramId === userProgramId) {
      userGame = result;
    }

    return {
      ...game,
      status: 'final' as const,
      result,
    };
  });

  return {
    season: {
      ...season,
      currentDayNumber: nextDayNumber,
      completedDays: [...new Set([...season.completedDays, nextDayNumber])].sort((left, right) => left - right),
      lastSimulatedDayLabel: dayGames[0]?.dayLabel ?? season.lastSimulatedDayLabel,
      games: updatedGames,
    },
    userGame,
  };
}

export function simulateLeagueSeasonSnapshot(userProgramId: string, userRoster: Player[], weeksPlayed = 14): LeagueSeasonSnapshot {
  const rosterMap = new Map<string, Player[]>();
  for (const program of programs) {
    rosterMap.set(program.id, program.id === userProgramId ? userRoster : createOpponentRoster(program.id));
  }

  const results = createLeagueSchedule()
    .filter((game) => scheduleWeekNumber(game) <= weeksPlayed)
    .map((game) => simulateGame(
      game,
      rosterMap.get(game.homeProgramId)!,
      rosterMap.get(game.awayProgramId)!,
      `snapshot-${gameRecordId(game)}`,
    ));

  return buildLeagueSeasonSnapshot(userProgramId, results);
}

function totalRunsByInning(runsByInning: number[]) {
  return runsByInning.reduce((sum, runs) => sum + runs, 0);
}

function calcOps(line: PlayerBattingLine) {
  const singles = line.hits - line.doubles - line.triples - line.homeRuns;
  const obp = line.plateAppearances > 0 ? (line.hits + line.walks) / line.plateAppearances : 0;
  const slg = line.atBats > 0 ? (singles + line.doubles * 2 + line.triples * 3 + line.homeRuns * 4) / line.atBats : 0;
  return obp + slg;
}

const opponentRosterCache = new Map<string, Player[]>();

function createOpponentRoster(programId: string) {
  if (!opponentRosterCache.has(programId)) {
    opponentRosterCache.set(programId, createRosterForProgram(programId));
  }
  return opponentRosterCache.get(programId)!;
}
