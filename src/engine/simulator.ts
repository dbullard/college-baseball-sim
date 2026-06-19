import { clamp, createSeededRandom, centeredNoise, type RandomSource } from '../lib/random';
import { createRosterForProgram, findProgram, programs } from '../data/programs';
import type {
  GameContext,
  GameResult,
  KeyMoment,
  LeaguePostseasonSummary,
  LeagueSeasonSnapshot,
  LineupCard,
  PlayerBattingLine,
  PlayerFieldingLine,
  PlayerPitchingLine,
  PitcherUsageLine,
  PitchingPlan,
  Player,
  PostseasonRegionalSummary,
  PostseasonSeriesSummary,
  PostseasonStage,
  SeasonOutlook,
  SeasonPostseasonState,
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
  isStarter: boolean;
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

interface LeadChangeCandidate {
  leadingTeam: 'home' | 'away';
  winningPitcherId: string;
  losingPitcherId: string;
}

interface PostseasonTeam {
  programId: string;
  nationalSeed: number;
  regionalSeed?: number;
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

function scoreAvailablePitcher(player: Player, fatigueWeight: number) {
  return scorePitcher(player) - player.rosterStatus.fatigue * fatigueWeight;
}

export function buildLineupCard(roster: Player[], plan: PitchingPlan): LineupCard {
  const hitters = [...getHitters(roster)].sort((left, right) => scoreHitter(right) - scoreHitter(left));
  const pitchers = [...getPitchers(roster)].sort((left, right) => scorePitcher(right) - scorePitcher(left));
  const rotationCandidates = pitchers.slice(0, 5);
  const rotationIndex = new Map(rotationCandidates.map((pitcher, index) => [pitcher.id, index]));

  const battingOrder = hitters.slice(0, 9);
  const bench = hitters.slice(9, 14);
  const starter = [...rotationCandidates].sort((left, right) => {
    const leftSlotPenalty = Math.abs((rotationIndex.get(left.id) ?? 0) - plan.rotationSlot) * 7;
    const rightSlotPenalty = Math.abs((rotationIndex.get(right.id) ?? 0) - plan.rotationSlot) * 7;
    return scoreAvailablePitcher(right, 1.1) - rightSlotPenalty - (scoreAvailablePitcher(left, 1.1) - leftSlotPenalty);
  })[0] ?? pitchers[Math.min(plan.rotationSlot, pitchers.length - 1)];
  const bullpen = pitchers
    .filter((pitcher) => pitcher.id !== starter.id)
    .sort((left, right) => scoreAvailablePitcher(right, 1.35) - scoreAvailablePitcher(left, 1.35))
    .slice(0, 8);

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
      starterPitchLimit: 54,
      bullpenAggression: 0.8,
    };
  }

  if (gameType === 'postseason') {
    return {
      gameType: 'postseason',
      rotationSlot: (index % 3) as 0 | 1 | 2,
      starterPitchLimit: index === 0 ? 98 : 90,
      bullpenAggression: 0.94,
    };
  }

  return {
    gameType,
    rotationSlot: (index % 3) as 0 | 1 | 2,
    starterPitchLimit: index === 0 ? 92 : 84,
    bullpenAggression: 0.9,
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

function createPitcherState(pitcher: Player, isStarter = false): ActivePitcherState {
  return {
    pitcher,
    isStarter,
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

  if (!state.isStarter) {
    const reliefWear = state.battersFaced * 2 + state.fatigue * 0.55;
    const leverageBump = scoreMargin <= 2 && inning >= 8 ? 4 : 0;
    const runStress = state.usage.runsAllowed * 8;
    const longOutingPenalty = state.usage.outsRecorded >= 6 ? 8 : 0;
    const threshold = ratings.stamina * 0.75 + 24 + leverageBump;
    return reliefWear + runStress + longOutingPenalty + random.int(0, 8) > threshold;
  }

  const staminaWear = state.battersFaced * 1.7 + state.fatigue * 0.48;
  const threshold = ratings.stamina + plan.starterPitchLimit * 0.5 + (1 - plan.bullpenAggression) * 14;
  const leverageBump = scoreMargin <= 3 && inning >= 5 ? 12 : 0;
  const timesThroughPenalty = state.battersFaced >= 24 ? 28 : state.battersFaced >= 18 ? 16 : state.battersFaced >= 9 ? 6 : 0;
  const runStress = state.usage.runsAllowed * 6.5;
  const outingCapPenalty = Math.max(0, state.usage.outsRecorded - Math.round(plan.starterPitchLimit * 0.24)) * 2.2;
  return staminaWear + leverageBump + timesThroughPenalty + runStress + outingCapPenalty + random.int(0, 8) > threshold;
}

function swapPitcher(
  bullpen: Player[],
  usageLines: PitcherUsageLine[],
  current: ActivePitcherState,
  inning: number,
  scoreMargin: number,
) {
  const sorted = [...bullpen].sort((left, right) => scorePitcher(right) - scorePitcher(left));
  const unavailable = new Set([...usageLines.map((usage) => usage.pitcherId), current.pitcher.id]);
  const available = sorted.filter((pitcher) => !unavailable.has(pitcher.id));
  const pool = available.length > 0 ? available : sorted.filter((pitcher) => pitcher.id !== current.pitcher.id);
  const leveragePitcher =
    inning >= 8 && scoreMargin <= 3 ? pool[0] : inning >= 6 && scoreMargin <= 4 ? pool[1] ?? pool[0] : pool[pool.length - 1];

  usageLines.push(current.usage);
  return createPitcherState(leveragePitcher, false);
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

  const walkChance = clamp(0.099 + disciplineEdge + commandVariance * 0.001 + fatiguePenalty * 0.5, 0.048, 0.175);
  const strikeoutChance = clamp(0.19 - avoidKEdge - fatiguePenalty * 0.5, 0.08, 0.35);
  const homeRunChance = clamp(0.031 + powerEdge + parkEffect + fatiguePenalty * 0.24, 0.008, 0.088);
  const errorChance = clamp(0.013 + (60 - defense.defense) * 0.00025 + (1 - fieldingSharpness) * 0.02, 0.005, 0.052);
  const inPlayHitChance = clamp(0.212 + contactEdge + (offense.baserunning - defense.defense) * 0.0005 + sequencingBoost + postseasonTightness, 0.14, 0.302);

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

function applyPitchingUsageToLines(lines: PlayerPitchingLine[], usageLines: PitcherUsageLine[]) {
  const usageByPitcher = new Map(usageLines.map((usage) => [usage.pitcherId, usage]));
  return lines.map((line) => {
    const usage = usageByPitcher.get(line.playerId);
    if (usage) {
      line.outsRecorded = usage.outsRecorded;
      line.runsAllowed = usage.runsAllowed;
      line.earnedRuns = usage.runsAllowed;
      line.walks = usage.walks;
      line.strikeouts = usage.strikeouts;
    }
    return line;
  });
}

function selectWinningPitcherLine(lines: PlayerPitchingLine[], candidateId: string) {
  const candidate = lines.find((line) => line.playerId === candidateId) ?? lines[lines.length - 1];
  if (!candidate) {
    return null;
  }
  if (!candidate.gamesStarted || candidate.outsRecorded >= 15) {
    return candidate;
  }

  const reliefOptions = lines
    .filter((line) => line.playerId !== candidate.playerId && line.outsRecorded > 0)
    .sort((left, right) =>
      right.outsRecorded - left.outsRecorded
      || left.runsAllowed - right.runsAllowed
      || right.strikeouts - left.strikeouts,
    );
  return reliefOptions[0] ?? candidate;
}

function selectSavePitcherLine(lines: PlayerPitchingLine[], winningPitcherId: string, leadMargin: number) {
  if (leadMargin > 3) {
    const longSave = [...lines]
      .filter((line) => line.playerId !== winningPitcherId && !line.gamesStarted && line.outsRecorded >= 9)
      .sort((left, right) => right.outsRecorded - left.outsRecorded || left.runsAllowed - right.runsAllowed)[0];
    return longSave ?? null;
  }

  return [...lines]
    .filter((line) => line.playerId !== winningPitcherId && !line.gamesStarted && line.outsRecorded > 0)
    .sort((left, right) => right.outsRecorded - left.outsRecorded || left.runsAllowed - right.runsAllowed)[0] ?? null;
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

  const runEnvironment = context.gameType === 'postseason'
    ? random.pick([0.94, 1, 1.04, 1.08, 1.12])
    : context.gameType === 'midweek'
      ? random.pick([0.8, 0.9, 0.98, 1.06, 1.16, 1.26, 1.38])
      : random.pick([0.86, 0.96, 1.02, 1.08, 1.16, 1.24, 1.32]);
  const sequencingSpread = context.gameType === 'midweek'
    ? 0.078
    : context.gameType === 'postseason'
      ? 0.038
      : 0.048;
  const homeSequencing = centeredNoise(random, sequencingSpread);
  const awaySequencing = centeredNoise(random, sequencingSpread);
  const homeFieldingSharpness = clamp(1 + centeredNoise(random, 0.08), 0.84, 1.14);
  const awayFieldingSharpness = clamp(1 + centeredNoise(random, 0.08), 0.84, 1.14);
  const homeAdvantage = context.neutralSite
    ? 0
    : 0.012 + (findProgram(context.homeProgramId)?.prestige.overall ?? 70 - (findProgram(context.awayProgramId)?.prestige.overall ?? 70)) * 0.00008;

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

  let homePitcher = createPitcherState(homeLineup.starter, true);
  let awayPitcher = createPitcherState(awayLineup.starter, true);
  getOrCreatePitchingLine(homePitchingMap, homeLineup.starter, true);
  getOrCreatePitchingLine(awayPitchingMap, awayLineup.starter, true);
  const homePitchingUsage: PitcherUsageLine[] = [];
  const awayPitchingUsage: PitcherUsageLine[] = [];
  const leadChanges: LeadChangeCandidate[] = [];
  let homeRuns = 0;
  let awayRuns = 0;

  const maxInnings = 12;
  for (let inning = 1; inning <= maxInnings; inning += 1) {
    const awayPitcherOfRecord = awayPitcher.pitcher.id;
    const homePitcherFacingAway = homePitcher.pitcher.id;
    const awayBeforeTop = awayRuns;
    const homeBeforeTop = homeRuns;
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
    if (awayRuns > homeRuns && awayBeforeTop <= homeBeforeTop) {
      leadChanges.push({
        leadingTeam: 'away',
        winningPitcherId: awayPitcherOfRecord,
        losingPitcherId: homePitcherFacingAway,
      });
    }

    if (inning >= 9 && inning === maxInnings && awayRuns !== homeRuns) {
      break;
    }

    const skipBottom = inning >= 9 && inning < maxInnings && homeRuns > awayRuns;
    if (skipBottom) {
      homeSummary.runsByInning.push(0);
      continue;
    }

    const homePitcherOfRecord = homePitcher.pitcher.id;
    const awayPitcherFacingHome = awayPitcher.pitcher.id;
    const homeBeforeBottom = homeRuns;
    const awayBeforeBottom = awayRuns;
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
    if (homeRuns > awayRuns && homeBeforeBottom <= awayBeforeBottom) {
      leadChanges.push({
        leadingTeam: 'home',
        winningPitcherId: homePitcherOfRecord,
        losingPitcherId: awayPitcherFacingHome,
      });
    }

    if (inning >= 9 && homeRuns !== awayRuns) {
      break;
    }
  }

  homePitchingUsage.push(homePitcher.usage);
  awayPitchingUsage.push(awayPitcher.usage);
  getOrCreatePitchingLine(homePitchingMap, homePitcher.pitcher);
  getOrCreatePitchingLine(awayPitchingMap, awayPitcher.pitcher);

  const winnerIsHome = homeRuns > awayRuns;
  const homePitchingLines = applyPitchingUsageToLines([...homePitchingMap.values()], homePitchingUsage);
  const awayPitchingLines = applyPitchingUsageToLines([...awayPitchingMap.values()], awayPitchingUsage);
  const winningLeadChange = [...leadChanges].reverse().find((entry) => entry.leadingTeam === (winnerIsHome ? 'home' : 'away'));
  const defaultWinningPitcherId = winnerIsHome ? homeLineup.starter.id : awayLineup.starter.id;
  const defaultLosingPitcherId = winnerIsHome ? awayLineup.starter.id : homeLineup.starter.id;
  const winningPitcherLine = selectWinningPitcherLine(
    winnerIsHome ? homePitchingLines : awayPitchingLines,
    winningLeadChange?.winningPitcherId ?? defaultWinningPitcherId,
  ) ?? (winnerIsHome ? homePitchingLines[0] : awayPitchingLines[0]);
  const losingPitcherLine = (winnerIsHome ? awayPitchingLines : homePitchingLines)
    .find((line) => line.playerId === (winningLeadChange?.losingPitcherId ?? defaultLosingPitcherId))
    ?? (winnerIsHome ? awayPitchingLines[0] : homePitchingLines[0]);
  winningPitcherLine.wins += 1;
  losingPitcherLine.losses += 1;

  const savePitcherLine = selectSavePitcherLine(
    winnerIsHome ? homePitchingLines : awayPitchingLines,
    winningPitcherLine.playerId,
    Math.abs(homeRuns - awayRuns),
  );
  if (savePitcherLine) {
    savePitcherLine.saves += 1;
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

function cloneRoster(roster: Player[]) {
  return roster.map((player) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
    },
  }));
}

function recoverRosterForNextDay(roster: Player[]) {
  return roster.map((player) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
      fatigue: Math.max(0, player.rosterStatus.fatigue - (player.pitching ? 9 : 4)),
    },
  }));
}

function applyGameFatigueToRoster(roster: Player[], updatedFatigue: Record<string, number>) {
  return roster.map((player) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
      fatigue: clamp(player.rosterStatus.fatigue + (updatedFatigue[player.id] ?? 0), 0, 100),
    },
  }));
}

function recoverLeagueRostersForNextDay(rosterMap: Map<string, Player[]>) {
  for (const [programId, roster] of rosterMap.entries()) {
    rosterMap.set(programId, recoverRosterForNextDay(roster));
  }
}

function simulateScheduledGameWithFatigue(
  context: GameContext,
  rosterMap: Map<string, Player[]>,
  seed: string,
) {
  const homeRoster = rosterMap.get(context.homeProgramId)!;
  const awayRoster = rosterMap.get(context.awayProgramId)!;
  const result = simulateGame(context, homeRoster, awayRoster, seed);

  rosterMap.set(context.homeProgramId, applyGameFatigueToRoster(homeRoster, result.updatedFatigue));
  rosterMap.set(context.awayProgramId, applyGameFatigueToRoster(awayRoster, result.updatedFatigue));

  return result;
}

function gameRecordId(context: GameContext) {
  return `${context.dateLabel}-${context.homeProgramId}-${context.awayProgramId}-${context.seriesGameNumber}`;
}

const OPENING_NON_CONFERENCE_WEEKS = 4;
const CONFERENCE_START_WEEK = 5;
const TOTAL_REGULAR_SEASON_WEEKS = 14;
const FINAL_MIDWEEK_WEEK = 10;
const MIN_REGULAR_SEASON_GAMES = 52;
const MAX_REGULAR_SEASON_GAMES = 56;
const WEEKEND_DAYS = ['Friday', 'Saturday', 'Sunday'] as const;

function normalizeConferenceName(conference: string) {
  switch (conference) {
    case 'ACC':
      return 'Atlantic Coast';
    case 'SEC':
      return 'Southeastern';
    case 'AAC':
      return 'American';
    case 'CUSA':
      return 'Conference USA';
    case 'MVC':
      return 'Missouri Valley';
    default:
      return conference;
  }
}

function conferenceKeyForProgram(programId: string) {
  return normalizeConferenceName(findProgram(programId)?.conference ?? 'Independent');
}

function areConferenceOpponents(leftId: string, rightId: string) {
  return conferenceKeyForProgram(leftId) === conferenceKeyForProgram(rightId);
}

function homeAwayForPair(leftId: string, rightId: string, week: number, game: number) {
  const left = findProgram(leftId)!;
  const right = findProgram(rightId)!;
  const leftHome = (week + game + left.prestige.overall + right.prestige.overall) % 2 === 0;
  return {
    homeProgramId: leftHome ? leftId : rightId,
    awayProgramId: leftHome ? rightId : leftId,
  };
}

function buildPreferredPairings(
  entries: typeof programs,
  offset: number,
  preferredOpponent: (leftId: string, rightId: string) => boolean,
  allowFallback = true,
) {
  const ordered = entries.map((program) => program.id);
  const rotated = ordered.slice(offset % ordered.length).concat(ordered.slice(0, offset % ordered.length));
  const available = [...rotated];
  const pairings: Array<[string, string]> = [];
  const deferred: string[] = [];

  while (available.length >= 2) {
    const leftId = available.shift()!;
    let rightIndex = available.findIndex((rightId) => preferredOpponent(leftId, rightId));
    if (rightIndex < 0) {
      if (!allowFallback) {
        deferred.push(leftId);
        continue;
      }
      rightIndex = available.length - 1;
    }
    const [rightId] = available.splice(rightIndex, 1);
    pairings.push([leftId, rightId]);
  }

  if (!allowFallback) {
    const leftovers = available.concat(deferred);
    for (let leftIndex = 0; leftIndex < leftovers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < leftovers.length; rightIndex += 1) {
        const leftId = leftovers[leftIndex]!;
        const rightId = leftovers[rightIndex]!;
        if (!preferredOpponent(leftId, rightId)) continue;
        pairings.push([leftId, rightId]);
        leftovers.splice(rightIndex, 1);
        leftovers.splice(leftIndex, 1);
        leftIndex -= 1;
        break;
      }
    }
  }

  return pairings;
}

function createGameCountMap(games: GameContext[]) {
  const counts = new Map(programs.map((program) => [program.id, 0]));
  for (const game of games) {
    counts.set(game.homeProgramId, (counts.get(game.homeProgramId) ?? 0) + 1);
    counts.set(game.awayProgramId, (counts.get(game.awayProgramId) ?? 0) + 1);
  }
  return counts;
}

function createOccupiedDateMap(games: GameContext[]) {
  const occupied = new Map(programs.map((program) => [program.id, new Set<string>()]));
  for (const game of games) {
    occupied.get(game.homeProgramId)?.add(game.dateLabel);
    occupied.get(game.awayProgramId)?.add(game.dateLabel);
  }
  return occupied;
}

function compareScoreTuples(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return (left[index] ?? 0) - (right[index] ?? 0);
    }
  }
  return 0;
}

function pushMidweekGame(games: GameContext[], week: number, leftId: string, rightId: string, day: 'Tuesday' | 'Wednesday', weatherNote: string) {
  const { homeProgramId, awayProgramId } = homeAwayForPair(leftId, rightId, week - 1, day === 'Tuesday' ? 0 : 4);
  const homeProgram = findProgram(homeProgramId)!;
  games.push({
    dateLabel: `Week ${week} ${day}`,
    homeProgramId,
    awayProgramId,
    seriesGameNumber: 1,
    gameType: 'midweek',
    parkFactor: homeProgram.parkFactor,
    weatherNote,
    homeTravelDays: 0,
    awayTravelDays: 1,
    postseasonStage: 'regular-season',
  });
}

function pushWeekendSeries(games: GameContext[], week: number, leftId: string, rightId: string, weatherNotePrefix: string) {
  for (let game = 0; game < 3; game += 1) {
    const { homeProgramId, awayProgramId } = homeAwayForPair(leftId, rightId, week - 1, game + 1);
    const homeProgram = findProgram(homeProgramId)!;
    games.push({
      dateLabel: `Week ${week} ${WEEKEND_DAYS[game]}`,
      homeProgramId,
      awayProgramId,
      seriesGameNumber: game + 1,
      gameType: 'weekend',
      parkFactor: homeProgram.parkFactor,
      weatherNote: game === 0 ? `${weatherNotePrefix} opener` : game === 1 ? `${weatherNotePrefix} middle game` : `${weatherNotePrefix} finale`,
      homeTravelDays: 0,
      awayTravelDays: game === 0 ? 1 : 0,
      postseasonStage: 'regular-season',
    });
  }
}

type ProgramEntry = (typeof programs)[number];

function programsByConferenceKey() {
  const groups = new Map<string, ProgramEntry[]>();
  for (const program of programs) {
    const key = normalizeConferenceName(program.conference);
    const bucket = groups.get(key) ?? [];
    bucket.push(program);
    groups.set(key, bucket);
  }
  return groups;
}

function buildConferenceRoundPairings(entries: ProgramEntry[], roundIndex: number) {
  const ids = [...entries].sort((left, right) => right.prestige.overall - left.prestige.overall).map((program) => program.id);
  const slots: Array<string | null> = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const rounds = Math.max(1, slots.length - 1);

  for (let round = 0; round < roundIndex % rounds; round += 1) {
    const fixed = slots[0];
    const rotating = slots.slice(1);
    rotating.unshift(rotating.pop() ?? null);
    slots.splice(0, slots.length, fixed, ...rotating);
  }

  const pairings: Array<[string, string]> = [];
  const byes: string[] = [];

  for (let index = 0; index < slots.length / 2; index += 1) {
    const leftId = slots[index];
    const rightId = slots[slots.length - 1 - index];
    if (leftId && rightId) {
      pairings.push([leftId, rightId]);
    } else if (leftId || rightId) {
      byes.push((leftId ?? rightId)!);
    }
  }

  return { pairings, byes };
}

function buildNonConferenceWeekends(games: GameContext[], startWeek: number, endWeek: number) {
  const prestigeOrder = [...programs].sort((left, right) => right.prestige.overall - left.prestige.overall);
  for (let week = startWeek; week <= endWeek; week += 1) {
    const pairings = buildPreferredPairings(
      prestigeOrder,
      week * 5 + 1,
      (leftId, rightId) => !areConferenceOpponents(leftId, rightId),
      false,
    );

    for (const [leftId, rightId] of pairings) {
      pushWeekendSeries(games, week, leftId, rightId, 'Non-conference weekend');
    }
  }
}

function buildConferenceWeekendSeries(games: GameContext[], startWeek: number, endWeek: number) {
  const conferenceGroups = programsByConferenceKey();
  for (let week = startWeek; week <= endWeek; week += 1) {
    const leftovers: ProgramEntry[] = [];

    for (const conferencePrograms of conferenceGroups.values()) {
      if (conferencePrograms.length < 2) {
        leftovers.push(...conferencePrograms);
        continue;
      }

      const { pairings, byes } = buildConferenceRoundPairings(conferencePrograms, week - startWeek);
      for (const [leftId, rightId] of pairings) {
        pushWeekendSeries(games, week, leftId, rightId, 'Conference weekend');
      }
      leftovers.push(...byes.map((programId) => findProgram(programId)!).filter(Boolean));
    }

    if (leftovers.length >= 2) {
      const latePairings = buildPreferredPairings(
        leftovers as typeof programs,
        week * 7,
        (leftId, rightId) => !areConferenceOpponents(leftId, rightId),
      );

      for (const [leftId, rightId] of latePairings) {
        pushWeekendSeries(games, week, leftId, rightId, 'Late non-conference weekend');
      }
    }
  }
}

function scoreMidweekOpponent(programId: string, opponentId: string, scheduledGames: Map<string, number>) {
  const program = findProgram(programId)!;
  const opponent = findProgram(opponentId)!;

  return [
    program.location.state === opponent.location.state ? 0 : 1,
    program.region === opponent.region ? 0 : 1,
    Math.abs((scheduledGames.get(programId) ?? 0) - (scheduledGames.get(opponentId) ?? 0)),
    opponent.conferenceTier,
    Math.abs(program.prestige.overall - opponent.prestige.overall),
  ];
}

function chooseBestMidweekOpponent(programId: string, candidates: ProgramEntry[], scheduledGames: Map<string, number>) {
  return [...candidates]
    .filter((candidate) => !areConferenceOpponents(programId, candidate.id))
    .sort((left, right) =>
      compareScoreTuples(
        scoreMidweekOpponent(programId, left.id, scheduledGames),
        scoreMidweekOpponent(programId, right.id, scheduledGames),
      ) || left.id.localeCompare(right.id))
    [0] ?? null;
}

function updateMapsForScheduledGame(
  scheduledGames: Map<string, number>,
  occupiedDates: Map<string, Set<string>>,
  dateLabel: string,
  homeProgramId: string,
  awayProgramId: string,
) {
  scheduledGames.set(homeProgramId, (scheduledGames.get(homeProgramId) ?? 0) + 1);
  scheduledGames.set(awayProgramId, (scheduledGames.get(awayProgramId) ?? 0) + 1);
  occupiedDates.get(homeProgramId)?.add(dateLabel);
  occupiedDates.get(awayProgramId)?.add(dateLabel);
}

function fillRegionalMidweeks(games: GameContext[], startWeek: number, endWeek: number) {
  const scheduledGames = createGameCountMap(games);
  const occupiedDates = createOccupiedDateMap(games);

  for (let week = startWeek; week <= Math.min(FINAL_MIDWEEK_WEEK, endWeek); week += 1) {
    const day = week < CONFERENCE_START_WEEK ? 'Wednesday' : 'Tuesday';
    const dateLabel = `Week ${week} ${day}`;
    const candidates = [...programs]
      .filter((program) =>
        (scheduledGames.get(program.id) ?? 0) < MIN_REGULAR_SEASON_GAMES
        && !occupiedDates.get(program.id)?.has(dateLabel))
      .sort((left, right) =>
        (scheduledGames.get(left.id) ?? 0) - (scheduledGames.get(right.id) ?? 0)
        || right.prestige.overall - left.prestige.overall);

    while (candidates.length >= 2) {
      const program = candidates.shift()!;
      const opponent = chooseBestMidweekOpponent(program.id, candidates, scheduledGames);
      if (!opponent) continue;

      pushMidweekGame(
        games,
        week,
        program.id,
        opponent.id,
        day,
        week < CONFERENCE_START_WEEK ? 'Early-season regional tune-up' : 'Regional midweek matchup',
      );
      const opponentIndex = candidates.findIndex((candidate) => candidate.id === opponent.id);
      if (opponentIndex >= 0) {
        candidates.splice(opponentIndex, 1);
      }
      updateMapsForScheduledGame(scheduledGames, occupiedDates, dateLabel, program.id, opponent.id);
    }
  }

  for (let week = FINAL_MIDWEEK_WEEK + 1; week <= endWeek; week += 1) {
    const dateLabel = `Week ${week} Tuesday`;
    const candidates = [...programs]
      .filter((program) =>
        (scheduledGames.get(program.id) ?? 0) < MAX_REGULAR_SEASON_GAMES
        && !occupiedDates.get(program.id)?.has(dateLabel))
      .sort((left, right) =>
        (scheduledGames.get(left.id) ?? 0) - (scheduledGames.get(right.id) ?? 0)
        || right.prestige.overall - left.prestige.overall);

    while (candidates.length >= 2) {
      const activeIndex = candidates.findIndex((program) => (scheduledGames.get(program.id) ?? 0) < MIN_REGULAR_SEASON_GAMES);
      if (activeIndex < 0) {
        break;
      }
      const [program] = candidates.splice(activeIndex, 1);
      const opponent = chooseBestMidweekOpponent(program.id, candidates, scheduledGames);
      if (!opponent) continue;

      pushMidweekGame(games, week, program.id, opponent.id, 'Tuesday', 'Late-season regional makeup');
      const opponentIndex = candidates.findIndex((candidate) => candidate.id === opponent.id);
      if (opponentIndex >= 0) {
        candidates.splice(opponentIndex, 1);
      }
      updateMapsForScheduledGame(scheduledGames, occupiedDates, dateLabel, program.id, opponent.id);
    }
  }
}

function createLeagueSchedule() {
  const games: GameContext[] = [];

  buildNonConferenceWeekends(games, 1, OPENING_NON_CONFERENCE_WEEKS);
  buildConferenceWeekendSeries(games, CONFERENCE_START_WEEK, TOTAL_REGULAR_SEASON_WEEKS);
  fillRegionalMidweeks(games, 1, TOTAL_REGULAR_SEASON_WEEKS);
  return games.sort(compareGameContexts);
}

let cachedLeagueSchedule: GameContext[] | null = null;

export function createProgramSchedule(programId: string) {
  if (!cachedLeagueSchedule) {
    cachedLeagueSchedule = createLeagueSchedule();
  }
  return cachedLeagueSchedule.filter((game) => game.homeProgramId === programId || game.awayProgramId === programId);
}

export function createSeasonDatabase(): SeasonDatabase {
  const orderedGames = cachedLeagueSchedule ?? (cachedLeagueSchedule = createLeagueSchedule());
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

function isProgramGame(game: SeasonGameRecord, programId: string) {
  return game.context.homeProgramId === programId || game.context.awayProgramId === programId;
}

export function getProgramSeasonSchedule(season: SeasonDatabase, programId: string) {
  return season.games.filter((game) => isProgramGame(game, programId));
}

export function getNextScheduledDayNumber(season: SeasonDatabase) {
  return season.games.find((game) => game.status === 'scheduled')?.dayNumber ?? null;
}

export function getScheduledProgramGameForDay(season: SeasonDatabase, programId: string, dayNumber: number) {
  return getProgramSeasonSchedule(season, programId)
    .find((game) => game.status === 'scheduled' && game.dayNumber === dayNumber) ?? null;
}

export function getNextScheduledProgramGame(season: SeasonDatabase, programId: string) {
  return getProgramSeasonSchedule(season, programId).find((game) => game.status === 'scheduled') ?? null;
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

function rankTeamSeasonLines(teamLines: TeamSeasonLine[]) {
  return [...teamLines].sort((left, right) =>
    right.wins - left.wins
    || (right.runsScored - right.runsAllowed) - (left.runsScored - left.runsAllowed)
    || right.runsScored - left.runsScored
    || (findProgram(right.programId)?.prestige.overall ?? 0) - (findProgram(left.programId)?.prestige.overall ?? 0),
  );
}

function mergeGameResultIntoSeasonTotals(
  teamStats: Map<string, TeamSeasonLine>,
  battingTotals: Map<string, PlayerBattingLine>,
  pitchingTotals: Map<string, PlayerPitchingLine>,
  fieldingTotals: Map<string, PlayerFieldingLine>,
  result: GameResult,
) {
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

function chooseTournamentHomeAway(teamA: PostseasonTeam, teamB: PostseasonTeam, hostProgramId: string, neutralSite = false) {
  if (neutralSite) {
    return teamA.nationalSeed <= teamB.nationalSeed
      ? { homeProgramId: teamA.programId, awayProgramId: teamB.programId }
      : { homeProgramId: teamB.programId, awayProgramId: teamA.programId };
  }
  if (teamA.programId === hostProgramId) {
    return { homeProgramId: teamA.programId, awayProgramId: teamB.programId };
  }
  if (teamB.programId === hostProgramId) {
    return { homeProgramId: teamB.programId, awayProgramId: teamA.programId };
  }
  return teamA.nationalSeed <= teamB.nationalSeed
    ? { homeProgramId: teamA.programId, awayProgramId: teamB.programId }
    : { homeProgramId: teamB.programId, awayProgramId: teamA.programId };
}

function simulateTournamentGame(
  label: string,
  stage: GameContext['postseasonStage'],
  seriesGameNumber: number,
  hostProgramId: string,
  teamA: PostseasonTeam,
  teamB: PostseasonTeam,
  rosterMap: Map<string, Player[]>,
  seed: string,
  neutralSite = false,
) {
  const { homeProgramId, awayProgramId } = chooseTournamentHomeAway(teamA, teamB, hostProgramId, neutralSite);
  const hostProgram = findProgram(hostProgramId) ?? findProgram(homeProgramId)!;
  const context: GameContext = {
    dateLabel: label,
    homeProgramId,
    awayProgramId,
    seriesGameNumber,
    gameType: 'postseason',
    parkFactor: hostProgram.parkFactor,
    weatherNote: neutralSite ? 'Neutral-site postseason game' : `Postseason game hosted by ${hostProgram.school}`,
    homeTravelDays: 0,
    awayTravelDays: 1,
    postseasonStage: stage,
    neutralSite,
  };
  recoverLeagueRostersForNextDay(rosterMap);
  const result = simulateScheduledGameWithFatigue(context, rosterMap, seed);
  const homeRuns = totalRunsByInning(result.homeSummary.runsByInning);
  const awayRuns = totalRunsByInning(result.awaySummary.runsByInning);
  const winnerProgramId = homeRuns > awayRuns ? homeProgramId : awayProgramId;
  const loserProgramId = winnerProgramId === homeProgramId ? awayProgramId : homeProgramId;
  return { result, winnerProgramId, loserProgramId };
}

function simulateRegional(
  regionalIndex: number,
  teams: PostseasonTeam[],
  rosterMap: Map<string, Player[]>,
  seedNamespace: string,
): { summary: PostseasonRegionalSummary; results: GameResult[]; winner: PostseasonTeam } {
  const sortedTeams = [...teams].sort((left, right) => (left.regionalSeed ?? 9) - (right.regionalSeed ?? 9));
  const host = sortedTeams.find((team) => team.regionalSeed === 1) ?? sortedTeams[0]!;
  const results: GameResult[] = [];

  const game1 = simulateTournamentGame(
    `Regional ${regionalIndex} Game 1`,
    'regional',
    1,
    host.programId,
    sortedTeams[0]!,
    sortedTeams[3]!,
    rosterMap,
    `${seedNamespace}-regional-${regionalIndex}-g1`,
    false,
  );
  const game2 = simulateTournamentGame(
    `Regional ${regionalIndex} Game 2`,
    'regional',
    1,
    host.programId,
    sortedTeams[1]!,
    sortedTeams[2]!,
    rosterMap,
    `${seedNamespace}-regional-${regionalIndex}-g2`,
    false,
  );
  results.push(game1.result, game2.result);

  const winnersGame = simulateTournamentGame(
    `Regional ${regionalIndex} Game 3`,
    'regional',
    1,
    host.programId,
    sortedTeams.find((team) => team.programId === game1.winnerProgramId)!,
    sortedTeams.find((team) => team.programId === game2.winnerProgramId)!,
    rosterMap,
    `${seedNamespace}-regional-${regionalIndex}-g3`,
    false,
  );
  const eliminationOne = simulateTournamentGame(
    `Regional ${regionalIndex} Game 4`,
    'regional',
    1,
    host.programId,
    sortedTeams.find((team) => team.programId === game1.loserProgramId)!,
    sortedTeams.find((team) => team.programId === game2.loserProgramId)!,
    rosterMap,
    `${seedNamespace}-regional-${regionalIndex}-g4`,
    false,
  );
  results.push(winnersGame.result, eliminationOne.result);

  const eliminationTwo = simulateTournamentGame(
    `Regional ${regionalIndex} Game 5`,
    'regional',
    1,
    host.programId,
    sortedTeams.find((team) => team.programId === winnersGame.loserProgramId)!,
    sortedTeams.find((team) => team.programId === eliminationOne.winnerProgramId)!,
    rosterMap,
    `${seedNamespace}-regional-${regionalIndex}-g5`,
    false,
  );
  results.push(eliminationTwo.result);

  const championshipOne = simulateTournamentGame(
    `Regional ${regionalIndex} Game 6`,
    'regional',
    1,
    host.programId,
    sortedTeams.find((team) => team.programId === winnersGame.winnerProgramId)!,
    sortedTeams.find((team) => team.programId === eliminationTwo.winnerProgramId)!,
    rosterMap,
    `${seedNamespace}-regional-${regionalIndex}-g6`,
    false,
  );
  results.push(championshipOne.result);

  let regionalWinnerId = championshipOne.winnerProgramId;
  let regionalRunnerUpId = championshipOne.loserProgramId;
  if (championshipOne.winnerProgramId !== winnersGame.winnerProgramId) {
    const winnerTakeAll = simulateTournamentGame(
      `Regional ${regionalIndex} Game 7`,
      'regional',
      1,
      host.programId,
      sortedTeams.find((team) => team.programId === championshipOne.winnerProgramId)!,
      sortedTeams.find((team) => team.programId === championshipOne.loserProgramId)!,
      rosterMap,
      `${seedNamespace}-regional-${regionalIndex}-g7`,
      false,
    );
    results.push(winnerTakeAll.result);
    regionalWinnerId = winnerTakeAll.winnerProgramId;
    regionalRunnerUpId = winnerTakeAll.loserProgramId;
  }

  return {
    summary: {
      label: `Regional ${regionalIndex}`,
      stage: 'regional',
      hostProgramId: host.programId,
      teamIds: sortedTeams.map((team) => team.programId),
      winnerProgramId: regionalWinnerId,
      loserProgramId: regionalRunnerUpId,
      winsByProgram: Object.fromEntries(sortedTeams.map((team) => [team.programId, results.filter((result) => {
        const homeRuns = totalRunsByInning(result.homeSummary.runsByInning);
        const awayRuns = totalRunsByInning(result.awaySummary.runsByInning);
        const winnerId = homeRuns > awayRuns ? result.homeProgramId : result.awayProgramId;
        return winnerId === team.programId;
      }).length])),
      seeds: sortedTeams.map((team) => ({
        programId: team.programId,
        nationalSeed: team.nationalSeed,
        regionalSeed: team.regionalSeed ?? 4,
      })),
    },
    results,
    winner: sortedTeams.find((team) => team.programId === regionalWinnerId)!,
  };
}

function simulateBestOfThreeSeries(
  label: string,
  stage: 'super-regional' | 'mcws',
  hostProgramId: string,
  teamA: PostseasonTeam,
  teamB: PostseasonTeam,
  rosterMap: Map<string, Player[]>,
  seedBase: string,
  neutralSite = false,
) {
  const winsByProgram: Record<string, number> = {
    [teamA.programId]: 0,
    [teamB.programId]: 0,
  };
  const results: GameResult[] = [];

  for (let gameNumber = 1; gameNumber <= 3; gameNumber += 1) {
    const game = simulateTournamentGame(
      `${label} Game ${gameNumber}`,
      stage,
      gameNumber,
      hostProgramId,
      teamA,
      teamB,
      rosterMap,
      `${seedBase}-g${gameNumber}`,
      neutralSite,
    );
    results.push(game.result);
    winsByProgram[game.winnerProgramId] += 1;
    if (winsByProgram[game.winnerProgramId] === 2) {
      return {
        summary: {
          label,
          stage,
          hostProgramId: neutralSite ? undefined : hostProgramId,
          teamIds: [teamA.programId, teamB.programId],
          winnerProgramId: game.winnerProgramId,
          loserProgramId: game.loserProgramId,
          winsByProgram,
        } satisfies PostseasonSeriesSummary,
        results,
        winner: game.winnerProgramId === teamA.programId ? teamA : teamB,
      };
    }
  }

  return {
    summary: {
      label,
      stage,
      hostProgramId: neutralSite ? undefined : hostProgramId,
      teamIds: [teamA.programId, teamB.programId],
      winnerProgramId: winsByProgram[teamA.programId] > winsByProgram[teamB.programId] ? teamA.programId : teamB.programId,
      loserProgramId: winsByProgram[teamA.programId] > winsByProgram[teamB.programId] ? teamB.programId : teamA.programId,
      winsByProgram,
    } satisfies PostseasonSeriesSummary,
    results,
    winner: winsByProgram[teamA.programId] > winsByProgram[teamB.programId] ? teamA : teamB,
  };
}

function simulateMcwsBracket(
  bracketIndex: number,
  teams: PostseasonTeam[],
  rosterMap: Map<string, Player[]>,
  seedNamespace: string,
) {
  const sortedTeams = [...teams].sort((left, right) => left.nationalSeed - right.nationalSeed);
  const results: GameResult[] = [];
  const game1 = simulateTournamentGame(
    `MCWS Bracket ${bracketIndex} Game 1`,
    'mcws',
    1,
    sortedTeams[0]!.programId,
    sortedTeams[0]!,
    sortedTeams[3]!,
    rosterMap,
    `${seedNamespace}-mcws-b${bracketIndex}-g1`,
    true,
  );
  const game2 = simulateTournamentGame(
    `MCWS Bracket ${bracketIndex} Game 2`,
    'mcws',
    1,
    sortedTeams[1]!.programId,
    sortedTeams[1]!,
    sortedTeams[2]!,
    rosterMap,
    `${seedNamespace}-mcws-b${bracketIndex}-g2`,
    true,
  );
  results.push(game1.result, game2.result);

  const winnersGame = simulateTournamentGame(
    `MCWS Bracket ${bracketIndex} Game 3`,
    'mcws',
    1,
    sortedTeams[0]!.programId,
    sortedTeams.find((team) => team.programId === game1.winnerProgramId)!,
    sortedTeams.find((team) => team.programId === game2.winnerProgramId)!,
    rosterMap,
    `${seedNamespace}-mcws-b${bracketIndex}-g3`,
    true,
  );
  const eliminationOne = simulateTournamentGame(
    `MCWS Bracket ${bracketIndex} Game 4`,
    'mcws',
    1,
    sortedTeams[0]!.programId,
    sortedTeams.find((team) => team.programId === game1.loserProgramId)!,
    sortedTeams.find((team) => team.programId === game2.loserProgramId)!,
    rosterMap,
    `${seedNamespace}-mcws-b${bracketIndex}-g4`,
    true,
  );
  results.push(winnersGame.result, eliminationOne.result);

  const eliminationTwo = simulateTournamentGame(
    `MCWS Bracket ${bracketIndex} Game 5`,
    'mcws',
    1,
    sortedTeams[0]!.programId,
    sortedTeams.find((team) => team.programId === winnersGame.loserProgramId)!,
    sortedTeams.find((team) => team.programId === eliminationOne.winnerProgramId)!,
    rosterMap,
    `${seedNamespace}-mcws-b${bracketIndex}-g5`,
    true,
  );
  results.push(eliminationTwo.result);

  const championshipOne = simulateTournamentGame(
    `MCWS Bracket ${bracketIndex} Game 6`,
    'mcws',
    1,
    sortedTeams[0]!.programId,
    sortedTeams.find((team) => team.programId === winnersGame.winnerProgramId)!,
    sortedTeams.find((team) => team.programId === eliminationTwo.winnerProgramId)!,
    rosterMap,
    `${seedNamespace}-mcws-b${bracketIndex}-g6`,
    true,
  );
  results.push(championshipOne.result);

  let bracketWinnerId = championshipOne.winnerProgramId;
  let bracketRunnerUpId = championshipOne.loserProgramId;
  if (championshipOne.winnerProgramId !== winnersGame.winnerProgramId) {
    const winnerTakeAll = simulateTournamentGame(
      `MCWS Bracket ${bracketIndex} Game 7`,
      'mcws',
      1,
      sortedTeams[0]!.programId,
      sortedTeams.find((team) => team.programId === championshipOne.winnerProgramId)!,
      sortedTeams.find((team) => team.programId === championshipOne.loserProgramId)!,
      rosterMap,
      `${seedNamespace}-mcws-b${bracketIndex}-g7`,
      true,
    );
    results.push(winnerTakeAll.result);
    bracketWinnerId = winnerTakeAll.winnerProgramId;
    bracketRunnerUpId = winnerTakeAll.loserProgramId;
  }

  return {
    summary: {
      label: `MCWS Bracket ${bracketIndex}`,
      stage: 'mcws',
      teamIds: sortedTeams.map((team) => team.programId),
      winnerProgramId: bracketWinnerId,
      loserProgramId: bracketRunnerUpId,
      winsByProgram: Object.fromEntries(sortedTeams.map((team) => [team.programId, results.filter((result) => {
        const homeRuns = totalRunsByInning(result.homeSummary.runsByInning);
        const awayRuns = totalRunsByInning(result.awaySummary.runsByInning);
        const winnerId = homeRuns > awayRuns ? result.homeProgramId : result.awayProgramId;
        return winnerId === team.programId;
      }).length])),
    } satisfies PostseasonSeriesSummary,
    results,
    winner: sortedTeams.find((team) => team.programId === bracketWinnerId)!,
  };
}

function createSelectedPostseasonTeams(rankedRegularSeasonTeams: TeamSeasonLine[]) {
  return rankedRegularSeasonTeams.slice(0, 64).map((team, index) => ({
    programId: team.programId,
    nationalSeed: index + 1,
  }));
}

function createRegionalTeamSeeds(selectedTeams: PostseasonTeam[]) {
  const oneSeeds = selectedTeams.slice(0, 16);
  const twoSeeds = selectedTeams.slice(16, 32);
  const threeSeeds = selectedTeams.slice(32, 48);
  const fourSeeds = selectedTeams.slice(48, 64);

  return Array.from({ length: 16 }, (_, index) => [
    { ...oneSeeds[index]!, regionalSeed: 1 },
    { ...twoSeeds[15 - index]!, regionalSeed: 2 },
    { ...threeSeeds[index]!, regionalSeed: 3 },
    { ...fourSeeds[15 - index]!, regionalSeed: 4 },
  ] satisfies PostseasonTeam[]);
}

function createEmptySeriesSummary(
  label: string,
  stage: PostseasonStage,
  teamIds: string[],
  hostProgramId?: string,
): PostseasonSeriesSummary {
  return {
    label,
    stage,
    hostProgramId,
    teamIds,
    winsByProgram: Object.fromEntries(teamIds.map((teamId) => [teamId, 0])),
  };
}

export function initializeLeaguePostseason(rankedRegularSeasonTeams: TeamSeasonLine[]): SeasonPostseasonState {
  const selectedTeams = createSelectedPostseasonTeams(rankedRegularSeasonTeams);
  const regionals = createRegionalTeamSeeds(selectedTeams).map((teams, index) => ({
    ...createEmptySeriesSummary(
      `Regional ${index + 1}`,
      'regional',
      teams.map((team) => team.programId),
      teams.find((team) => team.regionalSeed === 1)?.programId,
    ),
    hostProgramId: teams.find((team) => team.regionalSeed === 1)?.programId ?? teams[0]!.programId,
    seeds: teams.map((team) => ({
      programId: team.programId,
      nationalSeed: team.nationalSeed,
      regionalSeed: team.regionalSeed ?? 4,
    })),
  } satisfies PostseasonRegionalSummary));

  return {
    currentWeek: 15,
    results: [],
    summary: {
      currentStage: 'selection',
      currentWeekLabel: 'Postseason Selection',
      selectedTeamIds: selectedTeams.map((team) => team.programId),
      nationalSeeds: selectedTeams.slice(0, 16).map((team) => ({
        programId: team.programId,
        nationalSeed: team.nationalSeed,
        regionalSeed: 1,
      })),
      regionals,
      superRegionals: [],
      mcwsBrackets: [],
      mcwsTeamIds: [],
    },
  };
}

export function advanceLeaguePostseason(
  postseason: SeasonPostseasonState,
  rosterMap: Map<string, Player[]>,
  seedNamespace = 'postseason',
): SeasonPostseasonState {
  const nextState = structuredClone(postseason);
  const summary = nextState.summary;

  if (summary.currentStage === 'selection') {
    const regionalResults = summary.regionals.map((regional, index) => {
      const teams = regional.seeds.map((seed) => ({
        programId: seed.programId,
        nationalSeed: seed.nationalSeed,
        regionalSeed: seed.regionalSeed,
      }));
      return simulateRegional(index + 1, teams, rosterMap, `${seedNamespace}-week${nextState.currentWeek}`);
    });
    nextState.results.push(...regionalResults.flatMap((entry) => entry.results));
    summary.regionals = regionalResults.map((entry) => entry.summary);

    const superRegionalPairs: Array<[number, number]> = [
      [1, 16],
      [8, 9],
      [5, 12],
      [4, 13],
      [6, 11],
      [3, 14],
      [7, 10],
      [2, 15],
    ];
    summary.superRegionals = superRegionalPairs.map(([leftSeed, rightSeed], index) => {
      const teamA = regionalResults[leftSeed - 1]!.winner;
      const teamB = regionalResults[rightSeed - 1]!.winner;
      const hostProgramId = teamA.nationalSeed <= teamB.nationalSeed ? teamA.programId : teamB.programId;
      return createEmptySeriesSummary(
        `Super Regional ${index + 1}`,
        'super-regional',
        [teamA.programId, teamB.programId],
        hostProgramId,
      );
    });
    summary.currentStage = 'regionals';
    summary.currentWeekLabel = 'Regionals Complete';
    nextState.currentWeek += 1;
    return nextState;
  }

  if (summary.currentStage === 'regionals') {
    const superResults = summary.superRegionals.map((series, index) => {
      const [teamAId, teamBId] = series.teamIds;
      const teamASeed = summary.regionals.flatMap((regional) => regional.seeds).find((seed) => seed.programId === teamAId)!;
      const teamBSeed = summary.regionals.flatMap((regional) => regional.seeds).find((seed) => seed.programId === teamBId)!;
      return simulateBestOfThreeSeries(
        `Super Regional ${index + 1}`,
        'super-regional',
        series.hostProgramId ?? teamAId,
        { programId: teamASeed.programId, nationalSeed: teamASeed.nationalSeed, regionalSeed: teamASeed.regionalSeed },
        { programId: teamBSeed.programId, nationalSeed: teamBSeed.nationalSeed, regionalSeed: teamBSeed.regionalSeed },
        rosterMap,
        `${seedNamespace}-week${nextState.currentWeek}-super-${index + 1}`,
        false,
      );
    });
    nextState.results.push(...superResults.flatMap((entry) => entry.results));
    summary.superRegionals = superResults.map((entry) => entry.summary);
    summary.mcwsTeamIds = superResults.map((entry) => entry.winner.programId);

    const mcwsTeams = superResults.map((entry) => entry.winner).sort((left, right) => left.nationalSeed - right.nationalSeed);
    summary.mcwsBrackets = [
      createEmptySeriesSummary('MCWS Bracket 1', 'mcws', mcwsTeams.slice(0, 4).map((team) => team.programId)),
      createEmptySeriesSummary('MCWS Bracket 2', 'mcws', mcwsTeams.slice(4, 8).map((team) => team.programId)),
    ];
    summary.currentStage = 'super-regionals';
    summary.currentWeekLabel = 'Super Regionals Complete';
    nextState.currentWeek += 1;
    return nextState;
  }

  if (summary.currentStage === 'super-regionals') {
    const mcwsSeedMap = new Map(summary.regionals.flatMap((regional) => regional.seeds).map((seed) => [seed.programId, seed]));
    const bracketResults = summary.mcwsBrackets.map((bracket, index) => {
      const teams = bracket.teamIds.map((teamId) => {
        const seed = mcwsSeedMap.get(teamId)!;
        return { programId: seed.programId, nationalSeed: seed.nationalSeed, regionalSeed: seed.regionalSeed };
      });
      return simulateMcwsBracket(index + 1, teams, rosterMap, `${seedNamespace}-week${nextState.currentWeek}`);
    });
    nextState.results.push(...bracketResults.flatMap((entry) => entry.results));
    summary.mcwsBrackets = bracketResults.map((entry) => entry.summary);

    const finalists = bracketResults.map((entry) => entry.winner);
    const finalsHostProgramId = finalists[0]!.nationalSeed <= finalists[1]!.nationalSeed ? finalists[0]!.programId : finalists[1]!.programId;
    summary.finals = createEmptySeriesSummary('MCWS Finals', 'mcws', finalists.map((team) => team.programId), finalsHostProgramId);
    summary.currentStage = 'mcws';
    summary.currentWeekLabel = 'MCWS Brackets Complete';
    nextState.currentWeek += 1;
    return nextState;
  }

  if (summary.currentStage === 'mcws' && summary.finals) {
    const finalistSeedMap = new Map(summary.regionals.flatMap((regional) => regional.seeds).map((seed) => [seed.programId, seed]));
    const [teamAId, teamBId] = summary.finals.teamIds;
    const teamASeed = finalistSeedMap.get(teamAId)!;
    const teamBSeed = finalistSeedMap.get(teamBId)!;
    const finals = simulateBestOfThreeSeries(
      'MCWS Finals',
      'mcws',
      summary.finals.hostProgramId ?? teamAId,
      { programId: teamASeed.programId, nationalSeed: teamASeed.nationalSeed, regionalSeed: teamASeed.regionalSeed },
      { programId: teamBSeed.programId, nationalSeed: teamBSeed.nationalSeed, regionalSeed: teamBSeed.regionalSeed },
      rosterMap,
      `${seedNamespace}-week${nextState.currentWeek}-finals`,
      true,
    );
    nextState.results.push(...finals.results);
    summary.finals = finals.summary;
    summary.championProgramId = finals.summary.winnerProgramId;
    summary.runnerUpProgramId = finals.summary.loserProgramId ?? finals.summary.teamIds.find((teamId) => teamId !== finals.summary.winnerProgramId);
    summary.currentStage = 'complete';
    summary.currentWeekLabel = 'College World Series Final';
    nextState.currentWeek += 1;
  }

  return nextState;
}

function simulateLeaguePostseason(
  rankedRegularSeasonTeams: TeamSeasonLine[],
  rosterMap: Map<string, Player[]>,
  seedNamespace = 'postseason',
): { summary: LeaguePostseasonSummary; results: GameResult[] } {
  let postseason = initializeLeaguePostseason(rankedRegularSeasonTeams);
  while (postseason.summary.currentStage !== 'complete') {
    postseason = advanceLeaguePostseason(postseason, rosterMap, seedNamespace);
  }
  return {
    summary: postseason.summary,
    results: postseason.results,
  };
}

function buildLeagueSeasonSnapshot(
  userProgramId: string,
  results: GameResult[],
  rosterMap?: Map<string, Player[]>,
  postseasonSeedNamespace = 'postseason',
): LeagueSeasonSnapshot {
  const teamStats = new Map<string, TeamSeasonLine>();
  const battingTotals = new Map<string, PlayerBattingLine>();
  const pitchingTotals = new Map<string, PlayerPitchingLine>();
  const fieldingTotals = new Map<string, PlayerFieldingLine>();
  let postseason: LeaguePostseasonSummary | undefined;

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
    mergeGameResultIntoSeasonTotals(teamStats, battingTotals, pitchingTotals, fieldingTotals, result);
  }

  const fullScheduleLength = (cachedLeagueSchedule ?? (cachedLeagueSchedule = createLeagueSchedule())).length;
  const regularSeasonComplete = results.length >= fullScheduleLength;
  if (regularSeasonComplete && rosterMap) {
    const rankedTeams = rankTeamSeasonLines([...teamStats.values()]);
    const postseasonSimulation = simulateLeaguePostseason(rankedTeams, rosterMap, postseasonSeedNamespace);
    postseason = postseasonSimulation.summary;
    for (const result of postseasonSimulation.results) {
      mergeGameResultIntoSeasonTotals(teamStats, battingTotals, pitchingTotals, fieldingTotals, result);
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
    .filter((line) => line.gamesStarted >= 12 && line.outsRecorded >= 225)
    .sort((left, right) => {
      const leftEra = calculateEra(left);
      const rightEra = calculateEra(right);
      return leftEra - rightEra || right.strikeouts - left.strikeouts || right.wins - left.wins || right.outsRecorded - left.outsRecorded;
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
    teamStats: rankTeamSeasonLines([...teamStats.values()]),
    userTeamBatting: [...battingTotals.values()].filter((line) => line.programId === userProgramId).sort((left, right) => right.homeRuns - left.homeRuns || right.runsBattedIn - left.runsBattedIn),
    userTeamPitching: [...pitchingTotals.values()].filter((line) => line.programId === userProgramId).sort((left, right) => right.outsRecorded - left.outsRecorded),
    userTeamFielding: [...fieldingTotals.values()].filter((line) => line.programId === userProgramId).sort((left, right) => right.chances - left.chances),
    battingLeaders,
    pitchingLeaders,
    fieldingLeaders,
    postseason,
  };
}

export function buildSeasonSnapshotFromDatabase(
  userProgramId: string,
  season: SeasonDatabase,
  leagueRosters?: Record<string, Player[]>,
) {
  const rosterMap = new Map<string, Player[]>();
  for (const program of programs) {
    rosterMap.set(program.id, program.id === userProgramId
      ? leagueRosters?.[program.id] ?? createOpponentRoster(program.id, leagueRosters)
      : createOpponentRoster(program.id, leagueRosters));
  }
  const snapshot = buildLeagueSeasonSnapshot(
    userProgramId,
    [...getCompletedResults(season.games), ...(season.postseason?.results ?? [])],
    undefined,
  );
  if (season.postseason?.summary) {
    snapshot.postseason = season.postseason.summary;
  }
  return snapshot;
}

export function simulateSeasonDay(
  season: SeasonDatabase,
  userProgramId: string,
  userRoster: Player[],
  leagueRosters?: Record<string, Player[]>,
): { season: SeasonDatabase; userGame: GameResult | null } | null {
  const nextDayNumber = getNextScheduledDayNumber(season);
  if (!nextDayNumber) {
    return null;
  }

  const dayGames = season.games.filter((game) => game.dayNumber === nextDayNumber);
  const rosterMap = new Map<string, Player[]>();
  for (const program of programs) {
    rosterMap.set(program.id, cloneRoster(program.id === userProgramId ? userRoster : createOpponentRoster(program.id, leagueRosters)));
  }
  recoverLeagueRostersForNextDay(rosterMap);
  let userGame: GameResult | null = null;
  const updatedGames = season.games.map((game) => {
    if (game.dayNumber !== nextDayNumber || game.status === 'final') {
      return game;
    }

    const result = simulateScheduledGameWithFatigue(game.context, rosterMap, `season-db-${game.id}`);
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

export function simulateLeagueSeasonSnapshot(
  userProgramId: string,
  userRoster: Player[],
  weeksPlayed = 14,
  leagueRosters?: Record<string, Player[]>,
  seedNamespace = 'snapshot',
): LeagueSeasonSnapshot {
  const rosterMap = new Map<string, Player[]>();
  for (const program of programs) {
    rosterMap.set(program.id, cloneRoster(program.id === userProgramId ? userRoster : createOpponentRoster(program.id, leagueRosters)));
  }

  const results: GameResult[] = [];
  let lastDateLabel = '';
  for (const game of createLeagueSchedule().filter((entry) => scheduleWeekNumber(entry) <= weeksPlayed)) {
    if (game.dateLabel !== lastDateLabel) {
      recoverLeagueRostersForNextDay(rosterMap);
      lastDateLabel = game.dateLabel;
    }
    results.push(simulateScheduledGameWithFatigue(game, rosterMap, `${seedNamespace}-${gameRecordId(game)}`));
  }

  return buildLeagueSeasonSnapshot(userProgramId, results, rosterMap, seedNamespace);
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

function createOpponentRoster(programId: string, leagueRosters?: Record<string, Player[]>) {
  if (leagueRosters?.[programId]) {
    return leagueRosters[programId];
  }
  if (!opponentRosterCache.has(programId)) {
    opponentRosterCache.set(programId, createRosterForProgram(programId));
  }
  return opponentRosterCache.get(programId)!;
}
