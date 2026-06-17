import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  BadgeDollarSign,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleAlert,
  FolderKanban,
  GraduationCap,
  Mail,
  Settings2,
  ShieldAlert,
  Sparkles,
  Swords,
  Table2,
  Trophy,
  Users,
} from 'lucide-react';
import { findProgram, programs } from './data/programs';
import { createProgramSchedule, getNextScheduledDayNumber, getProgramSeasonSchedule, getScheduledProgramGameForDay } from './engine/simulator';
import { buildTeamChemistryProfile, calculateCoachFit, getArchetypeDefinition, getProgramDevelopmentIdentity } from './lib/playerDevelopment';
import { buildSeasonSnapshot, calculateRecruitProgramFit, calculateSchoolGrades, getProgramRosterFromSave, getProgramStaffFromSave, selectSeasonOutlook, useFranchiseStore } from './state/franchiseStore';
import type {
  CoachRole,
  LeagueCoachingStaffs,
  LeagueRosters,
  LeagueSeasonSnapshot,
  Player,
  PlayerBattingLine,
  PlayerFieldingLine,
  PlayerPitchingLine,
  Position,
  RatingDisplayMode,
  RecruitingActionId,
  RecruitingNeed,
  SeasonGameRecord,
} from './types/models';

const tabs: Array<{
  id: 'overview' | 'mail' | 'roster' | 'player' | 'recruiting' | 'portal' | 'nil' | 'calendar' | 'settings' | 'preview' | 'stats' | 'polls';
  label: string;
  icon: typeof Users;
  group: 'Manager' | 'NCAA' | 'Team' | 'Hidden';
  hidden?: boolean;
}> = [
  { id: 'preview', label: 'Day View', icon: Swords, group: 'Manager' },
  { id: 'mail', label: 'Mail', icon: Mail, group: 'Manager' },
  { id: 'stats', label: 'League Overview', icon: BarChart3, group: 'NCAA' },
  { id: 'polls', label: 'National Polls', icon: Trophy, group: 'NCAA' },
  { id: 'recruiting', label: 'Recruiting', icon: GraduationCap, group: 'NCAA' },
  { id: 'calendar', label: 'Conference Standings', icon: Table2, group: 'NCAA' },
  { id: 'overview', label: 'Team Overview', icon: FolderKanban, group: 'Team' },
  { id: 'roster', label: 'Roster Control', icon: Users, group: 'Team' },
  { id: 'nil', label: 'NIL Management', icon: BadgeDollarSign, group: 'Team' },
  { id: 'player', label: 'Player Page', icon: Users, group: 'Hidden', hidden: true },
  { id: 'settings', label: 'Settings', icon: Settings2, group: 'Hidden', hidden: true },
];

const recruitingActionButtons: Array<{ id: RecruitingActionId; label: string; cost: number }> = [
  { id: 'scout', label: 'Scout', cost: 2 },
  { id: 'call', label: 'Call', cost: 3 },
  { id: 'campus-visit', label: 'Visit', cost: 5 },
  { id: 'development-pitch', label: 'Dev', cost: 4 },
  { id: 'nil-presentation', label: 'NIL', cost: 4 },
  { id: 'playing-time-pitch', label: 'PT', cost: 3 },
];

type RosterSortKey = 'name' | 'position' | 'classYear' | 'overall' | 'potential' | 'tools' | 'scholarship' | 'nil';

interface MoraleProfile {
  stayScore: number;
  riskTier: string;
  summary: string;
  reasons: string[];
}

function money(value: number) {
  return `$${value.toLocaleString()}`;
}

function totalRunsByInning(runsByInning: number[]) {
  return runsByInning.reduce((sum, runs) => sum + runs, 0);
}

function battingAverage(atBats: number, hits: number) {
  return atBats > 0 ? (hits / atBats).toFixed(3).replace(/^0/, '') : '.000';
}

function ops(atBats: number, hits: number, doubles: number, triples: number, homeRuns: number, walks: number, plateAppearances: number) {
  if (plateAppearances === 0) return '.000';
  const singles = hits - doubles - triples - homeRuns;
  const obp = (hits + walks) / plateAppearances;
  const slg = atBats > 0 ? (singles + doubles * 2 + triples * 3 + homeRuns * 4) / atBats : 0;
  return (obp + slg).toFixed(3).replace(/^0/, '');
}

function inningsText(outsRecorded: number) {
  return `${Math.floor(outsRecorded / 3)}.${outsRecorded % 3}`;
}

function era(outsRecorded: number, earnedRuns: number) {
  const innings = outsRecorded / 3;
  return innings > 0 ? ((earnedRuns * 9) / innings).toFixed(2) : '0.00';
}

function whip(outsRecorded: number, hitsAllowed: number, walks: number) {
  const innings = outsRecorded / 3;
  return innings > 0 ? ((hitsAllowed + walks) / innings).toFixed(2) : '0.00';
}

function fieldingPct(chances: number, errors: number) {
  return chances > 0 ? (((chances - errors) / chances)).toFixed(3).replace(/^0/, '') : '1.000';
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function scoreLabel(value: number, thresholds: [number, string][]) {
  for (const [cutoff, label] of thresholds) {
    if (value >= cutoff) return label;
  }
  return thresholds[thresholds.length - 1]?.[1] ?? '';
}

function leadershipLabel(value: number) {
  return scoreLabel(value, [[85, 'Captain'], [72, 'Leader'], [58, 'Support'], [0, 'Quiet']]);
}

function selfishnessLabel(value: number) {
  return scoreLabel(value, [[78, 'High-maintenance'], [62, 'Individualist'], [45, 'Balanced'], [0, 'Team-first']]);
}

function personalityLabel(type: Player['personalityProfile']['type']) {
  return type.replace(/-/g, ' ');
}

function coachRoleLabel(role: CoachRole) {
  if (role === 'headCoach') return 'Head Coach';
  if (role === 'assistantHitting') return 'Hitting Coach';
  if (role === 'assistantPitching') return 'Pitching Coach';
  return 'Development Coach';
}

function coachRoleShortLabel(role: CoachRole) {
  if (role === 'headCoach') return 'HC';
  if (role === 'assistantHitting') return 'Hit';
  if (role === 'assistantPitching') return 'Pitch';
  return 'Dev';
}

function interestLabel(value: number) {
  return scoreLabel(value, [
    [85, 'Very high'],
    [70, 'Strong'],
    [55, 'In play'],
    [40, 'Long shot'],
    [0, 'Cold'],
  ]);
}

function signabilityLabel(value: number) {
  return scoreLabel(value, [
    [85, 'Hard sign'],
    [70, 'Expensive'],
    [55, 'Manageable'],
    [40, 'Good value'],
    [0, 'Easy sign'],
  ]);
}

function transferRiskLabel(value: number) {
  return scoreLabel(value, [
    [75, 'Dangerous'],
    [55, 'Risky'],
    [35, 'Manageable'],
    [0, 'Clean'],
  ]);
}

function marketFitLabel(value: number) {
  return scoreLabel(value, [
    [80, 'Strong fit'],
    [60, 'Reasonable'],
    [45, 'Borderline'],
    [0, 'Over market'],
  ]);
}

function gameSiteLabel(teamId: string, homeProgramId: string, awayProgramId: string) {
  if (homeProgramId === teamId) return 'Home';
  if (awayProgramId === teamId) return 'Away';
  return 'Neutral';
}

function scheduleResultLabel(game: SeasonGameRecord, teamId: string) {
  if (game.status !== 'final' || !game.result) {
    return 'Scheduled';
  }

  const teamRuns = game.result.homeProgramId === teamId
    ? totalRunsByInning(game.result.homeSummary.runsByInning)
    : totalRunsByInning(game.result.awaySummary.runsByInning);
  const opponentRuns = game.result.homeProgramId === teamId
    ? totalRunsByInning(game.result.awaySummary.runsByInning)
    : totalRunsByInning(game.result.homeSummary.runsByInning);

  return `${teamRuns > opponentRuns ? 'W' : 'L'} ${teamRuns}-${opponentRuns}`;
}

function scheduleOpponentId(teamId: string, homeProgramId: string, awayProgramId: string) {
  return homeProgramId === teamId ? awayProgramId : homeProgramId;
}

function scheduleGameId(game: { dateLabel: string; homeProgramId: string; awayProgramId: string; seriesGameNumber: number }) {
  return `${game.dateLabel}-${game.homeProgramId}-${game.awayProgramId}-${game.seriesGameNumber}`;
}

function buildRecruitingNeeds(roster: Player[]): RecruitingNeed[] {
  const trackedPositions: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SP', 'RP'];
  const labelMap: Record<Position, string> = {
    C: 'Catcher',
    '1B': 'First Base',
    '2B': 'Second Base',
    '3B': 'Third Base',
    SS: 'Shortstop',
    LF: 'Left Field',
    CF: 'Center Field',
    RF: 'Right Field',
    DH: 'DH',
    SP: 'Starting Pitcher',
    RP: 'Relief Pitcher',
  };

  return trackedPositions
    .map((position) => {
      const players = roster.filter((player) => player.primaryPosition === position);
      const graduatingSeniors = players.filter((player) => player.classYear === 'SR').length;
      const draftRisks = players.filter((player) => player.overall >= 78 && (player.classYear === 'JR' || player.classYear === 'SR')).length;
      const transferRisks = players.filter((player) => transferOutlookForPlayer(player, roster).stayScore < 55).length;
      const urgency = graduatingSeniors * 4 + draftRisks * 3 + transferRisks * 2;
      return {
        position,
        label: labelMap[position],
        graduatingSeniors,
        draftRisks,
        transferRisks,
        urgency,
      };
    })
    .filter((need) => need.urgency > 0)
    .sort((left, right) => right.urgency - left.urgency || right.graduatingSeniors - left.graduatingSeniors)
    .slice(0, 6);
}

function compareValues(left: string | number, right: string | number, direction: 'asc' | 'desc') {
  const comparison = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right));
  return direction === 'asc' ? comparison : -comparison;
}

function formatRatingValue(value: number, mode: RatingDisplayMode) {
  if (mode === '20-80') {
    const twentyEighty = Math.round((20 + ((value / 100) * 60)) / 5) * 5;
    return `${Math.max(20, Math.min(80, twentyEighty))}`;
  }
  if (mode === 'stars') {
    const stars = Math.max(0.5, Math.min(5, Math.round((value / 20) * 2) / 2));
    return `${stars.toFixed(stars % 1 === 0 ? 0 : 1)}★`;
  }
  return `${value}`;
}

function formatRatingLabel(mode: RatingDisplayMode) {
  if (mode === '20-80') return '20-80';
  if (mode === 'stars') return 'Stars';
  return '0-100';
}

function playerToolsLabel(player: Player, mode: RatingDisplayMode) {
  if (player.offense) {
    return `CON ${formatRatingValue(player.offense.contact, mode)} / POW ${formatRatingValue(player.offense.power, mode)}`;
  }
  return `STF ${formatRatingValue(player.pitching?.stuff ?? 0, mode)} / CMD ${formatRatingValue(player.pitching?.command ?? 0, mode)}`;
}

function scoreProjectedHitter(player: Player) {
  const offense = player.offense;
  const defense = player.defense;
  if (!offense || !defense) return 0;
  return offense.contact * 0.22 + offense.power * 0.2 + offense.eye * 0.14 + offense.avoidK * 0.14 + offense.speed * 0.12 + defense.defense * 0.12 + defense.arm * 0.06;
}

function scoreProjectedPitcher(player: Player) {
  const pitching = player.pitching;
  if (!pitching) return 0;
  return pitching.stuff * 0.28 + pitching.command * 0.22 + pitching.movement * 0.18 + pitching.stamina * 0.14 + pitching.composure * 0.12 + pitching.groundBall * 0.06;
}

function buildProjectedRoster(roster: Player[], gameType?: 'midweek' | 'weekend' | 'postseason', seriesGameNumber = 1) {
  const hitters = roster
    .filter((player) => player.offense)
    .sort((left, right) => scoreProjectedHitter(right) - scoreProjectedHitter(left));
  const pitchers = roster
    .filter((player) => player.pitching)
    .sort((left, right) => scoreProjectedPitcher(right) - scoreProjectedPitcher(left));
  const starterSlot = gameType === 'midweek' ? 3 : Math.max(0, Math.min(2, seriesGameNumber - 1));

  return {
    lineup: hitters.slice(0, 9),
    bench: hitters.slice(9, 14),
    starter: pitchers[Math.min(starterSlot, Math.max(0, pitchers.length - 1))],
    bullpen: pitchers.filter((pitcher) => pitcher.id !== pitchers[Math.min(starterSlot, Math.max(0, pitchers.length - 1))]?.id).slice(0, 6),
  };
}

function calcPlayerOps(line: PlayerBattingLine) {
  const singles = line.hits - line.doubles - line.triples - line.homeRuns;
  const obp = line.plateAppearances > 0 ? (line.hits + line.walks) / line.plateAppearances : 0;
  const slg = line.atBats > 0 ? (singles + line.doubles * 2 + line.triples * 3 + line.homeRuns * 4) / line.atBats : 0;
  return obp + slg;
}

function calcPlayerEraLine(line: PlayerPitchingLine) {
  const innings = line.outsRecorded / 3;
  return innings > 0 ? (line.earnedRuns * 9) / innings : 0;
}

interface LeagueResultCard {
  id: string;
  label: string;
  score: string;
  note: string;
  runDiff: number;
  dayNumber: number;
}

interface ConferenceStandingLine {
  programId: string;
  conferenceWins: number;
  conferenceLosses: number;
  overallWins: number;
  overallLosses: number;
  runsScored: number;
  runsAllowed: number;
}

interface DayViewAction {
  id: string;
  label: string;
  description: string;
  icon: typeof Users;
  tone?: 'primary' | 'default' | 'ghost';
  onClick: () => void;
}

interface RankingRow {
  rank: number;
  previousRank: number | null;
  trend: number;
  programId: string;
  record: string;
  note: string;
  score: number;
  sortMetric: string;
}

interface RankingBoard {
  title: string;
  subtitle: string;
  metricLabel: string;
  rows: RankingRow[];
  receivingVotes: RankingRow[];
}

interface TeamResumeMetrics {
  programId: string;
  wins: number;
  losses: number;
  games: number;
  winPct: number;
  runsScored: number;
  runsAllowed: number;
  runDiff: number;
  runDiffPerGame: number;
  owp: number;
  oowp: number;
  rpi: number;
  qualityWins: number;
  eliteWins: number;
  badLosses: number;
  roadWins: number;
  homeLosses: number;
  recentWins: number;
  recentLosses: number;
  streak: number;
  preseasonBias: number;
  preseasonWeight: number;
}

const PRESEASON_POLL_BIAS_BY_SCHOOL: Record<string, number> = {
  LSU: 100,
  Texas: 98,
  'Mississippi State University': 95,
  'University of Arkansas': 94,
  'Auburn University': 92,
  'University of Tennessee': 90,
  'University of Florida': 88,
  'Vanderbilt University': 86,
  'University of Georgia': 84,
  'Ole Miss': 82,
  'University of Kentucky': 78,
  'Texas A&M': 76,
  'University of Oklahoma': 74,
  'Georgia Tech': 83,
  'North Carolina/Carolina': 82,
  'Florida State University': 81,
  Louisville: 78,
  'Clemson University': 76,
  'NC State': 74,
  'University of Virginia': 73,
  'University of Miami': 71,
  'Wake Forest University': 69,
  'Stanford University': 66,
  TCU: 80,
  'University of Arizona': 76,
  'Arizona State University': 73,
  'Oklahoma State University': 71,
  'West Virginia University': 69,
  'East Carolina University': 75,
  UTSA: 72,
  Charlotte: 69,
  'Coastal Carolina University': 77,
  'Southern Miss': 74,
  Troy: 70,
  'University of Oregon': 68,
  UCLA: 82,
  'Oregon State University': 80,
  'University of California, Irvine': 64,
};

function clampFloor(value: number, floor = 0) {
  return Number.isFinite(value) ? Math.max(floor, value) : floor;
}

function roundMetric(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function formatMetric(value: number, digits = 3) {
  return value.toFixed(digits);
}

function formatTrend(trend: number) {
  if (trend > 0) return `+${trend}`;
  if (trend < 0) return `${trend}`;
  return '—';
}

function preseasonPollBias(program: { school: string; conference: string; conferenceTier: number; prestige: { overall: number } }) {
  const explicitBias = PRESEASON_POLL_BIAS_BY_SCHOOL[program.school];
  if (explicitBias !== undefined) {
    return explicitBias;
  }

  // Keep unloved or randomly inflated teams from jumping the poll before games exist.
  const conferenceFloor =
    program.conference === 'SEC' ? 54
      : program.conference === 'Atlantic Coast' ? 51
      : program.conference === 'Big 12' ? 48
      : program.conference === 'Big Ten' ? 36
      : program.conference === 'Sun Belt' ? 34
      : program.conference === 'American' ? 32
      : program.conference === 'Big West' ? 28
      : 22;
  return Math.min(70, conferenceFloor + Math.max(0, (program.prestige.overall - 70) * 0.22));
}

function projectedRosterStrength(roster: Player[]) {
  const hitters = roster
    .filter((player) => player.offense)
    .sort((left, right) => scoreProjectedHitter(right) - scoreProjectedHitter(left))
    .slice(0, 9);
  const pitchers = roster
    .filter((player) => player.pitching)
    .sort((left, right) => scoreProjectedPitcher(right) - scoreProjectedPitcher(left));

  const lineupScore = hitters.length
    ? hitters.reduce((sum, player) => sum + scoreProjectedHitter(player), 0) / hitters.length
    : 50;
  const rotationScore = pitchers.slice(0, 3).length
    ? pitchers.slice(0, 3).reduce((sum, player) => sum + scoreProjectedPitcher(player), 0) / pitchers.slice(0, 3).length
    : 50;
  const bullpenScore = pitchers.slice(3, 8).length
    ? pitchers.slice(3, 8).reduce((sum, player) => sum + scoreProjectedPitcher(player), 0) / pitchers.slice(3, 8).length
    : rotationScore;

  return roundMetric(lineupScore * 0.46 + rotationScore * 0.36 + bullpenScore * 0.18, 2);
}

function coachingStrength(programId: string, coachingStaffs: LeagueCoachingStaffs) {
  const staff = coachingStaffs[programId];
  if (!staff) return 50;
  const coaches = [staff.headCoach, staff.assistantHitting, staff.assistantPitching, staff.assistantDevelopment];
  return roundMetric(
    coaches.reduce((sum, coach) => sum + coach.overall + coach.leadership * 0.2 + coach.recruitingSupport * 0.1, 0) / coaches.length,
    2,
  );
}

function buildRankingBoards(
  teamStats: LeagueSeasonSnapshot['teamStats'],
  completedLeagueGames: Array<{ dayNumber: number; result: NonNullable<SeasonGameRecord['result']> }>,
  leagueRosters: LeagueRosters,
  leagueCoachingStaffs: LeagueCoachingStaffs,
) {
  const allPrograms = programs.map((program) => {
    const seasonLine = teamStats.find((line) => line.programId === program.id);
    return {
      program,
      seasonLine: seasonLine ?? {
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
      },
      rosterStrength: projectedRosterStrength((leagueRosters || {})[program.id] ?? []),
      coachScore: coachingStrength(program.id, leagueCoachingStaffs || {}),
    };
  });

  const lineByProgramId = new Map(allPrograms.map((entry) => [entry.program.id, entry.seasonLine]));
  const gamesByProgram = new Map<string, Array<{
    opponentId: string;
    won: boolean;
    wasHome: boolean;
    opponentWinPct: number;
    dayNumber: number;
  }>>();
  const opponentFrequency = new Map<string, Map<string, number>>();

  for (const entry of allPrograms) {
    gamesByProgram.set(entry.program.id, []);
    opponentFrequency.set(entry.program.id, new Map());
  }

  for (const game of completedLeagueGames) {
    const homeRuns = totalRunsByInning(game.result.homeSummary.runsByInning);
    const awayRuns = totalRunsByInning(game.result.awaySummary.runsByInning);
    const homeList = gamesByProgram.get(game.result.homeProgramId);
    const awayList = gamesByProgram.get(game.result.awayProgramId);
    const homeCounts = opponentFrequency.get(game.result.homeProgramId);
    const awayCounts = opponentFrequency.get(game.result.awayProgramId);

    homeList?.push({
      opponentId: game.result.awayProgramId,
      won: homeRuns > awayRuns,
      wasHome: true,
      opponentWinPct: 0,
      dayNumber: game.dayNumber,
    });
    awayList?.push({
      opponentId: game.result.homeProgramId,
      won: awayRuns > homeRuns,
      wasHome: false,
      opponentWinPct: 0,
      dayNumber: game.dayNumber,
    });

    homeCounts?.set(game.result.awayProgramId, (homeCounts.get(game.result.awayProgramId) ?? 0) + 1);
    awayCounts?.set(game.result.homeProgramId, (awayCounts.get(game.result.homeProgramId) ?? 0) + 1);
  }

  function adjustedOpponentWinPct(opponentId: string, teamId: string) {
    const opponentLine = lineByProgramId.get(opponentId);
    if (!opponentLine) return 0;
    const opponentGames = gamesByProgram.get(opponentId) ?? [];
    const filtered = opponentGames.filter((game) => game.opponentId !== teamId);
    if (!filtered.length) {
      const games = opponentLine.wins + opponentLine.losses;
      return games ? opponentLine.wins / games : 0;
    }
    const wins = filtered.filter((game) => game.won).length;
    return wins / filtered.length;
  }

  const owpByProgram = new Map<string, number>();
  for (const entry of allPrograms) {
    const counts = opponentFrequency.get(entry.program.id) ?? new Map();
    let weightedOppWins = 0;
    let weightedOppGames = 0;
    for (const [opponentId, meetings] of counts.entries()) {
      weightedOppWins += adjustedOpponentWinPct(opponentId, entry.program.id) * meetings;
      weightedOppGames += meetings;
    }
    owpByProgram.set(entry.program.id, weightedOppGames ? weightedOppWins / weightedOppGames : 0);
  }

  const metricsByProgram = new Map<string, TeamResumeMetrics>();
  for (const entry of allPrograms) {
    const seasonLine = entry.seasonLine;
    const games = gamesByProgram.get(entry.program.id) ?? [];
    const sortedGames = [...games].sort((left, right) => right.dayNumber - left.dayNumber);
    const recentSlice = sortedGames.slice(0, 10);
    const recentWins = recentSlice.filter((game) => game.won).length;
    const recentLosses = recentSlice.length - recentWins;
    let streak = 0;
    if (sortedGames.length) {
      const targetResult = sortedGames[0]!.won;
      for (const game of sortedGames) {
        if (game.won !== targetResult) break;
        streak += targetResult ? 1 : -1;
      }
    }

    const counts = opponentFrequency.get(entry.program.id) ?? new Map();
    let weightedOowp = 0;
    let weightedGames = 0;
    for (const [opponentId, meetings] of counts.entries()) {
      weightedOowp += (owpByProgram.get(opponentId) ?? 0) * meetings;
      weightedGames += meetings;
    }

    const opponentWinPctByTeam = new Map<string, number>();
    for (const [opponentId] of counts.entries()) {
      const line = lineByProgramId.get(opponentId);
      const pct = line ? line.wins / Math.max(1, line.wins + line.losses) : 0;
      opponentWinPctByTeam.set(opponentId, pct);
    }

    const qualityWins = games.filter((game) => game.won && (opponentWinPctByTeam.get(game.opponentId) ?? 0) >= 0.55).length;
    const eliteWins = games.filter((game) => game.won && (opponentWinPctByTeam.get(game.opponentId) ?? 0) >= 0.67).length;
    const badLosses = games.filter((game) => !game.won && (opponentWinPctByTeam.get(game.opponentId) ?? 0) <= 0.42).length;
    const roadWins = games.filter((game) => !game.wasHome && game.won).length;
    const homeLosses = games.filter((game) => game.wasHome && !game.won).length;
    const gamesPlayed = seasonLine.wins + seasonLine.losses;
    const winPct = seasonLine.wins / Math.max(1, gamesPlayed);
    const owp = owpByProgram.get(entry.program.id) ?? 0;
    const oowp = weightedGames ? weightedOowp / weightedGames : 0;
    const rpi = 0.25 * winPct + 0.5 * owp + 0.25 * oowp;
    const preseasonBias = preseasonPollBias(entry.program);
    const preseasonWeight = Math.max(0, 1 - gamesPlayed / 16);

    metricsByProgram.set(entry.program.id, {
      programId: entry.program.id,
      wins: seasonLine.wins,
      losses: seasonLine.losses,
      games: gamesPlayed,
      winPct,
      runsScored: seasonLine.runsScored,
      runsAllowed: seasonLine.runsAllowed,
      runDiff: seasonLine.runsScored - seasonLine.runsAllowed,
      runDiffPerGame: gamesPlayed ? (seasonLine.runsScored - seasonLine.runsAllowed) / gamesPlayed : 0,
      owp,
      oowp,
      rpi,
      qualityWins,
      eliteWins,
      badLosses,
      roadWins,
      homeLosses,
      recentWins,
      recentLosses,
      streak,
      preseasonBias,
      preseasonWeight,
    });
  }

  const previousOrdering = [...allPrograms]
    .sort((left, right) => {
      const leftMetrics = metricsByProgram.get(left.program.id)!;
      const rightMetrics = metricsByProgram.get(right.program.id)!;
      return (
        (rightMetrics?.winPct ?? 0) - (leftMetrics?.winPct ?? 0)
        || (rightMetrics?.qualityWins ?? 0) - (leftMetrics?.qualityWins ?? 0)
        || (rightMetrics?.preseasonBias ?? 0) - (leftMetrics?.preseasonBias ?? 0)
        || (right?.rosterStrength ?? 0) - (left?.rosterStrength ?? 0)
      );
    })
    .map((entry) => entry.program.id);
  const previousRankByProgram = new Map(previousOrdering.map((programId, index) => [programId, index + 1]));

  function buildBoard(
    title: string,
    subtitle: string,
    metricLabel: string,
    scoreForProgram: (entry: (typeof allPrograms)[number], metrics: TeamResumeMetrics) => number,
    noteForProgram: (entry: (typeof allPrograms)[number], metrics: TeamResumeMetrics) => string,
    sortMetricForProgram: (entry: (typeof allPrograms)[number], metrics: TeamResumeMetrics) => string,
  ): RankingBoard {
    const ordered = [...allPrograms]
      .map((entry) => {
        const metrics = metricsByProgram.get(entry.program.id)!;
        return {
          entry,
          metrics,
          score: scoreForProgram(entry, metrics),
        };
      })
      .sort((left, right) => (right?.score ?? 0) - (left?.score ?? 0) || (right?.metrics?.winPct ?? 0) - (left?.metrics?.winPct ?? 0) || (right?.metrics?.preseasonBias ?? 0) - (left?.metrics?.preseasonBias ?? 0));

    const rows = ordered.slice(0, 25).map(({ entry, metrics, score }, index) => {
      const previousRank = metrics.games === 0 ? null : (previousRankByProgram.get(entry.program.id) ?? null);
      const currentRank = index + 1;
      const trend = previousRank ? previousRank - currentRank : 0;
      return {
        rank: currentRank,
        previousRank,
        trend,
        programId: entry.program.id,
        record: `${metrics.wins}-${metrics.losses}`,
        note: noteForProgram(entry, metrics),
        score,
        sortMetric: sortMetricForProgram(entry, metrics),
      };
    });

    const receivingVotes = ordered.slice(25, 35).map(({ entry, metrics, score }, index) => ({
      rank: 26 + index,
      previousRank: previousRankByProgram.get(entry.program.id) ?? null,
      trend: 0,
      programId: entry.program.id,
      record: `${metrics.wins}-${metrics.losses}`,
      note: noteForProgram(entry, metrics),
      score,
      sortMetric: sortMetricForProgram(entry, metrics),
    }));

    return {
      title,
      subtitle,
      metricLabel,
      rows,
      receivingVotes,
    };
  }

  const apBoard = buildBoard(
    'AP Top 25',
    'Writers lean into resume, storylines, road wins, and brand gravity.',
    'Score',
    (entry, metrics) => (
      (metrics?.winPct ?? 0) * 100
      + (metrics?.owp ?? 0) * 28
      + (metrics?.oowp ?? 0) * 12
      + (metrics?.runDiffPerGame ?? 0) * 4.4
      + (metrics?.qualityWins ?? 0) * 2.8
      + (metrics?.eliteWins ?? 0) * 2.5
      + (metrics?.roadWins ?? 0) * 1.1
      + Math.max(0, metrics?.streak ?? 0) * 0.9
      - (metrics?.badLosses ?? 0) * 2.6
      - (metrics?.homeLosses ?? 0) * 0.55
      + (metrics?.preseasonBias ?? 0) * (metrics?.preseasonWeight ?? 0) * 0.62
      + (entry?.program?.prestige?.overall ?? 0) * 0.04
      + (entry?.program?.conferenceTier ?? 0) * 0.08
      + (entry?.rosterStrength ?? 0) * 0.06
    ),
    (entry, metrics) => `${entry?.program?.conference ?? 'IND'} • ${metrics?.qualityWins ?? 0} QW • ${metrics?.roadWins ?? 0} road W`,
    (_entry, metrics) => formatMetric((metrics?.winPct ?? 0) * 100, 1),
  );

  const coachesBoard = buildBoard(
    'Coaches Poll',
    'Coaches reward roster quality, pitching depth, consistency, and fewer bad weekends.',
    'Score',
    (entry, metrics) => (
      (metrics?.winPct ?? 0) * 100
      + (metrics?.owp ?? 0) * 24
      + (metrics?.oowp ?? 0) * 10
      + (metrics?.runDiffPerGame ?? 0) * 3.2
      + (metrics?.qualityWins ?? 0) * 2.1
      + (metrics?.eliteWins ?? 0) * 1.9
      - (metrics?.badLosses ?? 0) * 2.2
      - (metrics?.homeLosses ?? 0) * 0.65
      + (metrics?.preseasonBias ?? 0) * (metrics?.preseasonWeight ?? 0) * 0.72
      + (entry?.rosterStrength ?? 0) * 0.28
      + (entry?.coachScore ?? 0) * 0.22
      + (entry?.program?.prestige?.developmentReputation ?? 0) * 0.03
      + clampFloor((metrics?.recentWins ?? 0) - (metrics?.recentLosses ?? 0), -10) * 0.55
    ),
    (entry, metrics) => `${entry?.program?.conference ?? 'IND'} • staff ${Math.round(entry?.coachScore ?? 0)} • ${metrics?.recentWins ?? 0}-${metrics?.recentLosses ?? 0} last 10`,
    (_entry, metrics) => formatMetric((metrics?.winPct ?? 0) * 100, 1),
  );

  const rpiBoard = buildBoard(
    'RPI',
    '25% team record, 50% opponents, 25% opponents’ opponents.',
    'RPI',
    (_entry, metrics) => metrics?.rpi ?? 0,
    (entry, metrics) => `${entry?.program?.conference ?? 'IND'} • OWP ${formatMetric(metrics?.owp ?? 0)} • OOWP ${formatMetric(metrics?.oowp ?? 0)}`,
    (_entry, metrics) => formatMetric(metrics?.rpi ?? 0),
  );

  return {
    apBoard,
    coachesBoard,
    rpiBoard,
    metricsByProgram,
  };
}

function transferOutlookForPlayer(player: Player, roster: Player[]): MoraleProfile {
  const samePosition = roster
    .filter((entry) => entry.primaryPosition === player.primaryPosition)
    .sort((left, right) => right.overall - left.overall);
  const depthRank = Math.max(1, samePosition.findIndex((entry) => entry.id === player.id) + 1);
  const chemistry = buildTeamChemistryProfile(roster);
  const scholarshipBoost = Math.min(14, Math.round(player.rosterStatus.scholarshipPct / 5));
  const nilBoost = Math.min(10, Math.round(player.rosterStatus.schoolNilValue / 4000));
  const depthBoost = depthRank === 1 ? 10 : depthRank === 2 ? 5 : depthRank <= 4 ? 1 : -6;
  const classBoost = player.classYear === 'SR' ? 8 : player.classYear === 'JR' ? 4 : player.classYear === 'FR' ? -3 : 0;
  const dissatisfactionPenalty = player.overall >= 78 && player.rosterStatus.scholarshipPct <= 10 ? 10 : 0;
  const chemistryBoost = Math.round((chemistry.score - 55) / 4) + Math.round((player.leadership.current - player.personalityProfile.selfishness) / 12);
  const stayScore = Math.max(
    1,
    Math.min(
      99,
      player.morale + scholarshipBoost + nilBoost + depthBoost + classBoost + chemistryBoost - dissatisfactionPenalty,
    ),
  );

  const reasons = [
    player.rosterStatus.scholarshipPct >= 40 ? 'Strong scholarship support helps anchor him to campus.' : 'Light scholarship support leaves room for outside pressure.',
    depthRank <= 2 ? `Projected ${depthRank === 1 ? 'starter' : 'top rotation/depth'} role supports playing-time confidence.` : 'Depth-chart squeeze could push him to look for a clearer role.',
    player.rosterStatus.schoolNilValue >= 12000 ? 'School NIL package is competitive for his current market.' : 'NIL package is modest enough that other schools could test it.',
    chemistry.score >= 70 ? 'Leadership and chemistry around him support staying put.' : 'Shaky clubhouse chemistry could make outside options more appealing.',
  ];

  if (stayScore >= 80) {
    return { stayScore, riskTier: 'Low', summary: 'Likely to stay', reasons };
  }
  if (stayScore >= 65) {
    return { stayScore, riskTier: 'Watch', summary: 'Stable but worth monitoring', reasons };
  }
  if (stayScore >= 50) {
    return { stayScore, riskTier: 'Medium', summary: 'Could listen to portal noise', reasons };
  }
  if (stayScore >= 35) {
    return { stayScore, riskTier: 'High', summary: 'Real transfer risk', reasons };
  }
  return { stayScore, riskTier: 'Severe', summary: 'Portal danger zone', reasons };
}

function findPlayerSeasonBatting(playerId: string, lines: PlayerBattingLine[]) {
  return lines.find((line) => line.playerId === playerId) ?? null;
}

function findPlayerSeasonPitching(playerId: string, lines: PlayerPitchingLine[]) {
  return lines.find((line) => line.playerId === playerId) ?? null;
}

function findPlayerSeasonFielding(playerId: string, lines: PlayerFieldingLine[]) {
  return lines.find((line) => line.playerId === playerId) ?? null;
}

function App() {
  const save = useFranchiseStore((state) => state.save);
  const selectedTab = useFranchiseStore((state) => state.selectedTab);
  const lastPreviewGame = useFranchiseStore((state) => state.lastPreviewGame);
  const createFranchise = useFranchiseStore((state) => state.createFranchise);
  const setSelectedTab = useFranchiseStore((state) => state.setSelectedTab);
  const restartFranchise = useFranchiseStore((state) => state.restartFranchise);
  const wipeSave = useFranchiseStore((state) => state.wipeSave);
  const releasePlayer = useFranchiseStore((state) => state.releasePlayer);
  const toggleRecruitTarget = useFranchiseStore((state) => state.toggleRecruitTarget);
  const applyRecruitingAction = useFranchiseStore((state) => state.applyRecruitingAction);
  const offerRecruit = useFranchiseStore((state) => state.offerRecruit);
  const offerPortalPlayer = useFranchiseStore((state) => state.offerPortalPlayer);
  const changeSchoolSponsor = useFranchiseStore((state) => state.changeSchoolSponsor);
  const setRatingDisplay = useFranchiseStore((state) => state.setRatingDisplay);
  const certifyCurrentRoster = useFranchiseStore((state) => state.certifyCurrentRoster);
  const restartSeason = useFranchiseStore((state) => state.restartSeason);
  const simulateNextUserGame = useFranchiseStore((state) => state.simulateNextUserGame);
  const advanceWeek = useFranchiseStore((state) => state.advanceWeek);
  const program = save ? findProgram(save.userProgramId) : null;
  const [selectedConference, setSelectedConference] = useState(program?.conference ?? '');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [selectedRecruitId, setSelectedRecruitId] = useState<string>('');
  const [offerNIL, setOfferNIL] = useState(0);
  const [offerScholly, setOfferScholly] = useState(0);
  const [recruitingView, setRecruitingView] = useState<'overview' | 'freshmen' | 'portal' | 'profile'>('overview');
  const [showRecruitingHelp, setShowRecruitingHelp] = useState(false);
  const [simulatingAction, setSimulatingAction] = useState<null | 'game' | 'day'>(null);
  const simTimeoutRef = useRef<number | null>(null);
  const [rosterSort, setRosterSort] = useState<{ key: RosterSortKey; direction: 'asc' | 'desc' }>({
    key: 'overall',
    direction: 'desc',
  });

  type RecruitSortKey = 'name' | 'position' | 'stars' | 'interest' | 'signability' | 'status';
  const [recruitSort, setRecruitSort] = useState<{ key: RecruitSortKey; direction: 'asc' | 'desc' }>({
    key: 'stars',
    direction: 'desc',
  });
  
  type PortalSortKey = 'name' | 'position' | 'overall' | 'ask' | 'interest' | 'risk';
  const [portalSort, setPortalSort] = useState<{ key: PortalSortKey; direction: 'asc' | 'desc' }>({
    key: 'overall',
    direction: 'desc',
  });

  const openPlayerProfile = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setSelectedTab('player');
  };
  const openRecruitingFreshmen = () => {
    setRecruitingView('freshmen');
    setSelectedTab('recruiting');
  };
  const openRecruitingPortal = () => {
    setRecruitingView('portal');
    setSelectedTab('recruiting');
  };

  const seasonOutlook = useMemo(() => selectSeasonOutlook(save), [save]);

  useEffect(() => {
    if (program?.conference) {
      setSelectedConference((current) => current || program.conference);
    }
  }, [program?.conference]);

  useEffect(() => {
    if (!save?.roster.length) {
      setSelectedPlayerId('');
      return;
    }
    setSelectedPlayerId((current) => (
      current && save.roster.some((player) => player.id === current)
        ? current
        : save.roster[0].id
    ));
  }, [save?.roster]);

  useEffect(() => () => {
    if (simTimeoutRef.current !== null) {
      window.clearTimeout(simTimeoutRef.current);
    }
  }, []);

  const runSimAction = (action: 'game' | 'day', execute: () => void) => {
    if (simulatingAction) return;
    setSimulatingAction(action);
    simTimeoutRef.current = window.setTimeout(() => {
      try {
        execute();
      } finally {
        setSimulatingAction(null);
        simTimeoutRef.current = null;
      }
    }, 0);
  };

  const teamChemistry = useMemo(
    () => buildTeamChemistryProfile(save?.roster ?? []),
    [save?.roster],
  );
  const coachingStaff = useMemo(
    () => (save ? getProgramStaffFromSave(save, save.userProgramId) : null),
    [save],
  );
  const programDevelopmentIdentity = useMemo(
    () => (coachingStaff ? getProgramDevelopmentIdentity(coachingStaff) : null),
    [coachingStaff],
  );
  const [overviewPollTab, setOverviewPollTab] = useState<string>('AP Top 25');
  const seasonSnapshot = useMemo(() => save?.seasonSnapshot ?? (save ? buildSeasonSnapshot(save) : null), [save]);

  if (!save || !program) {
    return (
      <main className="ootp-shell ootp-shell--landing">
        <section className="landing-hero">
          <div>
            <p className="ui-kicker">D1 Baseball Franchise Office</p>
            <h1>Run a modern college baseball program like a real front office.</h1>
            <p className="ui-muted">
              The new franchise app is built as a separate management sim with deep roster, league,
              recruiting, portal, NIL, and opening-day views inspired by the dense workflow of baseball
              management sims.
            </p>
          </div>

          <div className="landing-callout">
            <Sparkles size={18} />
            <div>
              <strong>Design target</strong>
              <p>Browser-style menus, deep tables, quick switching between team and league control screens.</p>
            </div>
          </div>
        </section>

        <section className="screen screen--landing">
          <div className="screen__header">
            <div>
              <p className="ui-kicker">Available Saves</p>
              <h2>Choose a school to take over</h2>
            </div>
            <div className="screen__meta">{programs.length} playable launch programs</div>
          </div>

          <div className="table-shell">
            <div className="table-toolbar">
              <span>Universe View: Division I Programs</span>
              <span>Prestige built from recent RPI and Omaha-era history</span>
            </div>
            <div className="table-grid table-grid--programs">
              <div className="table-head">Program</div>
              <div className="table-head">Conference</div>
              <div className="table-head">Prestige</div>
              <div className="table-head">NIL Pull</div>
              <div className="table-head">Action</div>

              {programs.map((entry) => (
                <div className="table-row table-row--programs" key={entry.id}>
                  <div className="table-cell table-cell--program">
                    <strong>{entry.school}</strong>
                    <span>{entry.nickname}</span>
                  </div>
                  <div className="table-cell">{entry.conference}</div>
                  <div className="table-cell">{entry.prestige.overall}</div>
                  
                  
                  <div className="table-cell">{entry.prestige.nilAttractiveness}</div>
                  <div className="table-cell">
                    <button className="ui-button ui-button--primary" onClick={() => createFranchise(entry.id)}>
                      Open Franchise
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  const rosterCount = save.roster.length;
  const ratingDisplay = save.settings.ratingDisplay;
  const pitcherCount = save.roster.filter((player) => player.pitching).length;
  const hitterCount = save.roster.filter((player) => player.offense).length;
  const schoolNilCommitted = save.roster.reduce((sum, player) => sum + player.rosterStatus.schoolNilValue, 0);
  const scholarshipCommitted = save.roster.reduce((sum, player) => sum + player.rosterStatus.scholarshipPct, 0);
  const scholarshipEquivalencies = scholarshipCommitted / 100;
  const pendingScholarshipOffers = (
    save.recruits.reduce((sum, recruit) => sum + (recruit.committedProgramId ? 0 : recruit.userOffer?.scholarshipPct ?? 0), 0)
    + save.portalEntries.reduce((sum, entry) => sum + (entry.destinationProgramId ? 0 : entry.userOffer?.scholarshipPct ?? 0), 0)
  ) / 100;
  const scholarshipAvailable = Math.max(0, program.resources.scholarshipBudget - scholarshipEquivalencies - pendingScholarshipOffers);
  const topRecruits = save.recruits.filter((recruit) => !recruit.committedProgramId).slice(0, 5);
  const targetedRecruits = save.recruits.filter((recruit) => recruit.targeted && !recruit.committedProgramId);
  const recruitingNeeds = buildRecruitingNeeds(save.roster);
  const sortedRoster = [...save.roster].sort((left, right) => {
    switch (rosterSort.key) {
      case 'name':
        return compareValues(left.name, right.name, rosterSort.direction);
      case 'position':
        return compareValues(left.primaryPosition, right.primaryPosition, rosterSort.direction);
      case 'classYear':
        return compareValues(left.classYear, right.classYear, rosterSort.direction);
      case 'overall':
        return compareValues(left.overall, right.overall, rosterSort.direction);
      case 'potential':
        return compareValues(left.potential, right.potential, rosterSort.direction);
      case 'tools': {
        const leftTools = left.offense ? left.offense.contact + left.offense.power : (left.pitching?.stuff ?? 0) + (left.pitching?.command ?? 0);
        const rightTools = right.offense ? right.offense.contact + right.offense.power : (right.pitching?.stuff ?? 0) + (right.pitching?.command ?? 0);
        return compareValues(leftTools, rightTools, rosterSort.direction);
      }
      case 'scholarship':
        return compareValues(left.rosterStatus.scholarshipPct, right.rosterStatus.scholarshipPct, rosterSort.direction);
      case 'nil':
        return compareValues(left.rosterStatus.schoolNilValue, right.rosterStatus.schoolNilValue, rosterSort.direction);
      default:
        return 0;
    }
  });

  const toggleRosterSort = (key: RosterSortKey) => {
    setRosterSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'name' || key === 'position' || key === 'classYear' ? 'asc' : 'desc' });
  };

  const rosterSortLabel = (key: RosterSortKey) => {
    if (rosterSort.key !== key) return '';
    return rosterSort.direction === 'asc' ? '▲' : '▼';
  };

  const toggleRecruitSort = (key: RecruitSortKey) => {
    setRecruitSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'name' || key === 'position' ? 'asc' : 'desc' });
  };
  const recruitSortLabel = (key: RecruitSortKey) => {
    if (recruitSort.key !== key) return '';
    return recruitSort.direction === 'asc' ? '▲' : '▼';
  };

  const togglePortalSort = (key: PortalSortKey) => {
    setPortalSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'name' || key === 'position' ? 'asc' : 'desc' });
  };
  const portalSortLabel = (key: PortalSortKey) => {
    if (portalSort.key !== key) return '';
    return portalSort.direction === 'asc' ? '▲' : '▼';
  };

  const openPortalEntries = save.portalEntries.filter((entry) => !entry.destinationProgramId).slice(0, 5);
  const flaggedReviews = save.complianceReviews.slice(0, 4);
  const leagueGames = save.season?.games ?? [];
  const completedLeagueGames = leagueGames.filter((game) => game.status === 'final' && game.result);
  const gameRecordById = new Map(leagueGames.map((game) => [game.id, game]));
  const userTeamSeasonLine = seasonSnapshot?.teamStats.find((line) => line.programId === save.userProgramId);
  const activeCoachingStaff = coachingStaff ?? getProgramStaffFromSave(save, save.userProgramId);
  const activeProgramDevelopmentIdentity = programDevelopmentIdentity ?? getProgramDevelopmentIdentity(activeCoachingStaff);
  const selectedPlayer = save.roster.find((player) => player.id === selectedPlayerId) ?? sortedRoster[0] ?? null;
  const selectedPlayerMorale = selectedPlayer ? transferOutlookForPlayer(selectedPlayer, save.roster) : null;
  const programStrategy = save.leagueStrategyProfiles?.[save.userProgramId];
  const selectedPlayerCoachFit = selectedPlayer ? calculateCoachFit(selectedPlayer, activeCoachingStaff) : null;
  const selectedPlayerArchetype = selectedPlayer ? getArchetypeDefinition(selectedPlayer.archetype) : null;
  const selectedPlayerBatting = selectedPlayer && seasonSnapshot
    ? findPlayerSeasonBatting(selectedPlayer.id, seasonSnapshot.userTeamBatting)
    : null;
  const selectedPlayerPitching = selectedPlayer && seasonSnapshot
    ? findPlayerSeasonPitching(selectedPlayer.id, seasonSnapshot.userTeamPitching)
    : null;
  const selectedPlayerFielding = selectedPlayer && seasonSnapshot
    ? findPlayerSeasonFielding(selectedPlayer.id, seasonSnapshot.userTeamFielding)
    : null;
  const isSeasonActive = save.openingDayReady;
  const calendarLabel = isSeasonActive
    ? (save.season?.lastSimulatedDayLabel
      ?? save.season?.games.find((game) => game.status === 'scheduled')?.dayLabel
      ?? 'Opening Day')
    : (save.weeklyPlan.find((week) => week.week === save.currentWeek)?.label ?? `Week ${save.currentWeek}`);
  const currentRecord = userTeamSeasonLine ? `${userTeamSeasonLine.wins}-${userTeamSeasonLine.losses}` : '0-0';
  const hydrateProgramSchedule = (teamId: string) =>
    save.season
      ? getProgramSeasonSchedule(save.season, teamId)
      : createProgramSchedule(teamId).map((context, index) => {
        const id = scheduleGameId(context);
        const persisted = gameRecordById.get(id);
        return persisted ?? {
          id,
          dayNumber: index + 1,
          dayLabel: context.dateLabel,
          context,
          status: 'scheduled' as const,
        };
      });
  const userSchedule = hydrateProgramSchedule(save.userProgramId);
  const recentUserGames = userSchedule
    .filter((game) => game.status === 'final')
    .slice(-5)
    .reverse();
  const topTeamHitters = seasonSnapshot
    ? [...seasonSnapshot.userTeamBatting]
      .sort((left, right) => calcPlayerOps(right) - calcPlayerOps(left) || right.homeRuns - left.homeRuns || right.runsBattedIn - left.runsBattedIn)
      .slice(0, 5)
    : [];
  const topTeamPitchers = seasonSnapshot
    ? [...seasonSnapshot.userTeamPitching]
      .sort((left, right) => calcPlayerEraLine(left) - calcPlayerEraLine(right) || right.outsRecorded - left.outsRecorded)
      .slice(0, 5)
    : [];
  const nextScheduledLeagueDayNumber = save.season ? getNextScheduledDayNumber(save.season) : null;
  const nextUserGame = isSeasonActive && save.season && nextScheduledLeagueDayNumber
    ? getScheduledProgramGameForDay(save.season, save.userProgramId, nextScheduledLeagueDayNumber)
    : null;
  const nextOpponentId = nextUserGame
    ? scheduleOpponentId(save.userProgramId, nextUserGame.context.homeProgramId, nextUserGame.context.awayProgramId)
    : null;
  const nextOpponentProgram = nextOpponentId ? findProgram(nextOpponentId) : null;
  const nextOpponentRoster = nextOpponentId ? getProgramRosterFromSave(save, nextOpponentId) : [];
  const userProjection = nextUserGame
    ? buildProjectedRoster(save.roster, nextUserGame.context.gameType, nextUserGame.context.seriesGameNumber)
    : null;
  const opponentProjection = nextUserGame
    ? buildProjectedRoster(nextOpponentRoster, nextUserGame.context.gameType, nextUserGame.context.seriesGameNumber)
    : null;
  const dayResult = lastPreviewGame;
  const dayResultIsUserGame = Boolean(
    dayResult
    && (dayResult.homeProgramId === save.userProgramId || dayResult.awayProgramId === save.userProgramId),
  );
  const isSimulating = simulatingAction !== null;
  const simulatingLabel = simulatingAction === 'game' ? 'Simulating game...' : simulatingAction === 'day' ? 'Advancing day...' : '';
  const availableConferences = [...new Set(programs.map((entry) => entry.conference))].sort();
  const majorLeagueResults: LeagueResultCard[] = completedLeagueGames
    .map((game) => {
      const homeRuns = totalRunsByInning(game.result!.homeSummary.runsByInning);
      const awayRuns = totalRunsByInning(game.result!.awaySummary.runsByInning);
      const homeProgram = findProgram(game.result!.homeProgramId);
      const awayProgram = findProgram(game.result!.awayProgramId);
      const runDiff = Math.abs(homeRuns - awayRuns);
      const winner = homeRuns > awayRuns ? homeProgram : awayProgram;
      const loser = homeRuns > awayRuns ? awayProgram : homeProgram;
      return {
        id: game.id,
        label: `${game.dayLabel} • ${winner?.school ?? 'Winner'} over ${loser?.school ?? 'Loser'}`,
        score: `${homeProgram?.school ?? 'Home'} ${homeRuns}, ${awayProgram?.school ?? 'Away'} ${awayRuns}`,
        note: runDiff >= 6 ? 'Blowout' : runDiff >= 3 ? 'Solid finish' : 'Close finish',
        runDiff,
        dayNumber: game.dayNumber,
      };
    })
    .sort((left, right) => right.runDiff - left.runDiff || right.dayNumber - left.dayNumber)
    .slice(0, 6);
  const rankingBoards = buildRankingBoards(
    seasonSnapshot?.teamStats ?? [],
    completedLeagueGames.map((game) => ({
      dayNumber: game.dayNumber,
      result: game.result!,
    })),
    save.leagueRosters,
    save.leagueCoachingStaffs,
  );
  const rankingRows = [rankingBoards.apBoard, rankingBoards.coachesBoard, rankingBoards.rpiBoard];
  const userApRank = rankingBoards.apBoard.rows.find((row) => row.programId === save.userProgramId);
  const userCoachesRank = rankingBoards.coachesBoard.rows.find((row) => row.programId === save.userProgramId);
  const userRpiRank = rankingBoards.rpiBoard.rows.find((row) => row.programId === save.userProgramId);
  const userResumeMetrics = rankingBoards.metricsByProgram.get(save.userProgramId) ?? null;
  const conferenceStandings: ConferenceStandingLine[] = (programs
    .filter((entry) => entry.conference === selectedConference)
    .map((entry) => {
      let conferenceWins = 0;
      let conferenceLosses = 0;
      for (const game of completedLeagueGames) {
        const result = game.result!;
        const homeProgram = findProgram(result.homeProgramId);
        const awayProgram = findProgram(result.awayProgramId);
        if (!homeProgram || !awayProgram) continue;
        if (homeProgram.conference !== selectedConference || awayProgram.conference !== selectedConference) continue;

        const homeRuns = totalRunsByInning(result.homeSummary.runsByInning);
        const awayRuns = totalRunsByInning(result.awaySummary.runsByInning);
        if (result.homeProgramId === entry.id) {
          if (homeRuns > awayRuns) conferenceWins += 1;
          else conferenceLosses += 1;
        } else if (result.awayProgramId === entry.id) {
          if (awayRuns > homeRuns) conferenceWins += 1;
          else conferenceLosses += 1;
        }
      }

      const overall = seasonSnapshot?.teamStats.find((line) => line.programId === entry.id);
      return {
        programId: entry.id,
        conferenceWins,
        conferenceLosses,
        overallWins: overall?.wins ?? 0,
        overallLosses: overall?.losses ?? 0,
        runsScored: overall?.runsScored ?? 0,
        runsAllowed: overall?.runsAllowed ?? 0,
      };
    })
    .sort((left, right) => right.conferenceWins - left.conferenceWins || left.conferenceLosses - right.conferenceLosses || right.overallWins - left.overallWins)) ?? [];
  const selectedPlayerGameLog = selectedPlayer
    ? userSchedule
      .filter((game) => game.status === 'final' && game.result)
      .map((game) => {
        const battingLine = [...(game.result?.homeBattingLines ?? []), ...(game.result?.awayBattingLines ?? [])]
          .find((line) => line.playerId === selectedPlayer.id);
        const pitchingLine = [...(game.result?.homePitchingLines ?? []), ...(game.result?.awayPitchingLines ?? [])]
          .find((line) => line.playerId === selectedPlayer.id);
        const fieldingLine = [...(game.result?.homeFieldingLines ?? []), ...(game.result?.awayFieldingLines ?? [])]
          .find((line) => line.playerId === selectedPlayer.id);
        const opponentId = scheduleOpponentId(save.userProgramId, game.context.homeProgramId, game.context.awayProgramId);

        return battingLine || pitchingLine || fieldingLine
          ? {
            id: game.id,
            dayLabel: game.dayLabel,
            opponent: findProgram(opponentId)?.school ?? opponentId,
            result: scheduleResultLabel(game, save.userProgramId),
            battingLine,
            pitchingLine,
            fieldingLine,
          }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .slice(-5)
      .reverse()
    : [];
  const coachingRows = [
    activeCoachingStaff.headCoach,
    activeCoachingStaff.assistantHitting,
    activeCoachingStaff.assistantPitching,
    activeCoachingStaff.assistantDevelopment,
  ];
  const userRuns = lastPreviewGame
    ? lastPreviewGame.homeProgramId === save.userProgramId
      ? totalRunsByInning(lastPreviewGame.homeSummary.runsByInning)
      : totalRunsByInning(lastPreviewGame.awaySummary.runsByInning)
    : null;
  const oppRuns = lastPreviewGame
    ? lastPreviewGame.homeProgramId === save.userProgramId
      ? totalRunsByInning(lastPreviewGame.awaySummary.runsByInning)
      : totalRunsByInning(lastPreviewGame.homeSummary.runsByInning)
    : null;
  const dayViewActions: DayViewAction[] = (() => {
    const actions: DayViewAction[] = [];
    const addAction = (action: DayViewAction) => {
      if (!actions.some((entry) => entry.id === action.id)) {
        actions.push(action);
      }
    };

    if (!isSeasonActive) {
      if (save.phase === 'roster-audit') {
        addAction({
          id: 'roster',
          label: 'Manage Roster',
          description: 'Trim the club, inspect roles, and get the 34-man group pointed in the right direction.',
          icon: Users,
          tone: 'primary',
          onClick: () => setSelectedTab('roster'),
        });
        addAction({
          id: 'team-overview',
          label: 'Team Overview',
          description: 'Review morale, depth, and the inherited roster shape before making cuts.',
          icon: FolderKanban,
          onClick: () => setSelectedTab('overview'),
        });
      } else if (save.phase === 'recruiting') {
        addAction({
          id: 'recruit-board',
          label: 'Recruiting Board',
          description: 'Work prep targets, spend points, and keep the next class moving forward.',
          icon: GraduationCap,
          tone: 'primary',
          onClick: openRecruitingFreshmen,
        });
        addAction({
          id: 'roster-needs',
          label: 'Check Team Needs',
          description: 'Cross-check the board against position gaps and long-term roster balance.',
          icon: Users,
          onClick: () => setSelectedTab('roster'),
        });
      } else if (save.phase === 'portal') {
        addAction({
          id: 'portal-board',
          label: 'Transfer Portal',
          description: 'Attack portal upgrades and patch weak spots before the roster locks in.',
          icon: ArrowRightLeft,
          tone: 'primary',
          onClick: openRecruitingPortal,
        });
        addAction({
          id: 'nil-management',
          label: 'NIL Packages',
          description: 'Adjust NIL strategy so you can close the players worth chasing.',
          icon: BadgeDollarSign,
          onClick: () => setSelectedTab('nil'),
        });
      } else if (save.phase === 'compliance') {
        addAction({
          id: 'nil-review',
          label: 'Review NIL Deals',
          description: 'Clear risky offers and tighten up your current deal structure.',
          icon: ShieldAlert,
          tone: 'primary',
          onClick: () => setSelectedTab('nil'),
        });
        addAction({
          id: 'roster-check',
          label: 'Roster Check',
          description: 'Make sure your scholarship mix and active roster still support the plan.',
          icon: Users,
          onClick: () => setSelectedTab('roster'),
        });
      } else if (save.phase === 'certification' || save.phase === 'opening-day') {
        addAction({
          id: 'roster-control',
          label: 'Roster Control',
          description: 'Finalize the 34-man group and set the club up for opening weekend.',
          icon: Users,
          tone: 'primary',
          onClick: () => setSelectedTab('roster'),
        });
        addAction({
          id: 'certify-roster',
          label: 'Certify Roster',
          description: 'Lock the roster and move the sim into opening-day mode when you are ready.',
          icon: ShieldAlert,
          onClick: () => {
            const certified = certifyCurrentRoster();
            if (!certified) {
              setSelectedTab('roster');
            }
          },
        });
      }
    } else if (!nextUserGame) {
      addAction({
        id: 'team-overview',
        label: 'Team Overview',
        description: 'Use the off day to check fatigue, morale, and where the club needs attention.',
        icon: FolderKanban,
        tone: 'primary',
        onClick: () => setSelectedTab('overview'),
      });
      addAction({
        id: 'roster-tuneup',
        label: 'Roster Control',
        description: 'Adjust your lineup thinking and keep tabs on who is trending up or down.',
        icon: Users,
        onClick: () => setSelectedTab('roster'),
      });
      addAction({
        id: 'league-scan',
        label: 'League Overview',
        description: 'Catch up on standings and results before you advance the calendar.',
        icon: BarChart3,
        onClick: () => setSelectedTab('stats'),
      });
    }

    return actions.slice(0, 3);
  })();
  const primaryDayAction = nextUserGame
    ? {
      label: simulatingAction === 'game' ? 'Simulating...' : 'Sim Game',
      icon: Swords,
      disabled: isSimulating,
      className: 'ui-button ui-button--primary',
      onClick: () => runSimAction('game', simulateNextUserGame),
    }
    : dayViewActions[0]
      ? {
        label: dayViewActions[0].label,
        icon: dayViewActions[0].icon,
        disabled: false,
        className: dayViewActions[0].tone === 'primary' ? 'ui-button ui-button--primary' : 'ui-button',
        onClick: dayViewActions[0].onClick,
      }
      : null;
  const dayViewStatusLabel = !isSeasonActive
    ? `${calendarLabel} • no game scheduled`
    : nextScheduledLeagueDayNumber === null
      ? 'Season calendar is complete'
      : nextUserGame
        ? `${nextUserGame.dayLabel} • ${nextUserGame.context.gameType} • G${nextUserGame.context.seriesGameNumber}`
        : `${save.season?.games.find((game) => game.dayNumber === nextScheduledLeagueDayNumber)?.dayLabel ?? 'Next league day'} • off day`;
  const dayViewSummary = !isSeasonActive
    ? 'This week is still in offseason management, so there is no game to preview or simulate.'
    : nextScheduledLeagueDayNumber === null
      ? 'There are no scheduled user games left.'
      : nextUserGame
        ? `${gameSiteLabel(save.userProgramId, nextUserGame.context.homeProgramId, nextUserGame.context.awayProgramId)} against ${nextOpponentProgram?.school ?? 'Opponent'}.`
        : 'Your club does not have a game on the next scheduled league day. Use Advance Day to continue.';
  const dayViewFocus = !isSeasonActive
    ? `Current phase: ${calendarLabel}. Jump straight into the work that advances this week.`
    : nextUserGame
      ? 'Current phase: game day. You can preview the matchup or simulate it directly from here.'
      : 'Current phase: off day. Use the shortcuts below to handle team management before you advance.';

  const visibleTabs = tabs.filter((tab) => !tab.hidden);
  const groupedTabs = visibleTabs.reduce<Record<string, Array<(typeof tabs)[number]>>>((groups, tab) => {
    groups[tab.group] = [...(groups[tab.group] ?? []), tab];
    return groups;
  }, {});

  return (
    <main className="ootp-shell">
      <aside className="left-rail">
        <div className="left-rail__brand">
          <p className="ui-kicker">College Baseball</p>
          <h1>Franchise Office</h1>
          <span>{program.school} {program.nickname}</span>
        </div>

        <div className="left-rail__status">
          <div>
            <span>{isSeasonActive ? 'Day' : 'Week'}</span>
            <strong>{isSeasonActive ? (save.season?.currentDayNumber || 0) : save.currentWeek}</strong>
          </div>
          <div>
            <span>{isSeasonActive ? 'Date' : 'Phase'}</span>
            <strong>{isSeasonActive ? calendarLabel : save.phase}</strong>
          </div>
          <div>
            <span>Roster</span>
            <strong className={rosterCount > 34 ? 'is-danger' : ''}>{rosterCount}/34</strong>
          </div>
        </div>

        <nav className="left-rail__nav">
          {Object.entries(groupedTabs).map(([group, groupTabs]) => (
            <section key={group} className="nav-group">
              <p className="nav-group__label">{group}</p>
              {groupTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={classNames('nav-item', selectedTab === tab.id && 'is-active')}
                    onClick={() => setSelectedTab(tab.id)}
                  >
                    <Icon size={16} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="left-rail__footer">
          <span>Prestige {program.prestige.overall}</span>
          <span>{program.conference}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="manager-header" style={{ '--team-primary': program.colors.primary } as any}>
          <div className="manager-header-left">
            <h2>{program.school} {program.nickname}</h2>
            <div className="manager-header-sub">Record: {currentRecord} | Projected: {seasonOutlook?.averageWins ?? '--'}</div>
          </div>
          <div className="manager-header-center">
            <div>{calendarLabel}</div>
          </div>
          <div className="manager-header-right">
            <div className="manager-header-actions">
              <button onClick={() => setSelectedTab('settings')}>Settings</button>
              <button onClick={() => certifyCurrentRoster()}>Certify Roster</button>
            </div>
            <button
              className="btn-continue"
              disabled={isSimulating}
              onClick={() => runSimAction('day', advanceWeek)}
            >
              {simulatingAction === 'day' ? 'ADVANCING...' : 'ADVANCE DAY'}
            </button>
          </div>
        </header>

        

        <section className="workspace-grid">
          <div className="workspace-main">
            {selectedTab === 'overview' && (
              <>
                <div className="dashboard-widgets-grid">
                  <div className="dashboard-widget">
                    <h3>Team Finances</h3>
                    <div className="widget-row"><span>School NIL Committed</span> <strong>{money(schoolNilCommitted)}</strong></div>
                    <div className="widget-row"><span>Scholarships Left</span> <strong>{scholarshipAvailable.toFixed(1)} equiv.</strong></div>
                    <div className="widget-row"><span>Scholarships Committed</span> <strong>{scholarshipEquivalencies.toFixed(1)} / {program.resources.scholarshipBudget.toFixed(1)}</strong></div>
                  </div>
                  <div className="dashboard-widget">
                    <h3>Program Status</h3>
                    <div className="widget-row"><span>Prestige Tier</span> <strong>{program.prestigeLevel}</strong></div>
                    <div className="widget-row"><span>Conference Tier</span> <strong>{program.conferenceTier}</strong></div>
                    <div className="widget-row"><span>NIL Rating</span> <strong>{program.prestige.nilAttractiveness}</strong></div>
                  </div>
                  <div className="dashboard-widget">
                    <h3>Roster Overview</h3>
                    <div className="widget-row"><span>Pitchers</span> <strong>{pitcherCount}</strong></div>
                    <div className="widget-row"><span>Hitters</span> <strong>{hitterCount}</strong></div>
                    <div className="widget-row"><span>Total</span> <strong>{save.roster.length}</strong></div>
                  </div>
                </div>

                <section className="screen">
                  <div className="screen__header">
                    <div>
                      <p className="ui-kicker">Team Overview</p>
                      <h2>{program.school} at a glance</h2>
                    </div>
                    <div className="screen__meta">Organization Control Panel</div>
                  </div>

                  <div className="info-panels">
                    <article className="info-panel">
                      <span>Program identity</span>
                      <strong>{program.school} {program.nickname}</strong>
                      <p>{program.conference} • {program.region} • Prestige momentum {program.prestige.momentumModifier}</p>
                    </article>
                    <article className="info-panel">
                      <span>Record</span>
                      <strong>{currentRecord}</strong>
                      <p>{seasonSnapshot?.teamStats.find((line) => line.programId === save.userProgramId)?.wins ?? 0} wins through the current season database.</p>
                    </article>
                    <article className="info-panel">
                      <span>Scholarship load</span>
                      <strong>{scholarshipEquivalencies.toFixed(1)} / {program.resources.scholarshipBudget.toFixed(1)} equivalencies</strong>
                      <p>Current players and uncommitted offers leave {scholarshipAvailable.toFixed(1)} equivalencies available.</p>
                    </article>
                    <article className="info-panel">
                      <span>Season outlook</span>
                      <strong>{seasonOutlook?.medianWins ?? '—'} median wins</strong>
                      <p>Range {seasonOutlook?.minWins ?? '—'} to {seasonOutlook?.maxWins ?? '—'} over the current sim sample.</p>
                    </article>
                  </div>
                </section>

                <section className="screen">
                  <div className="screen__header">
                    <div>
                      <p className="ui-kicker">Recent Results</p>
                      <h2>Last five games and top performers</h2>
                    </div>
                  </div>

                  <div className="two-column two-column--overview-results">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Past 5 games</span>
                      </div>
                      <div className="table-grid table-grid--schedule">
                        <div className="table-head">Day</div>
                        <div className="table-head">Series</div>
                        <div className="table-head">Opponent</div>
                        <div className="table-head">Site</div>
                        <div className="table-head">Type</div>
                        <div className="table-head">Result</div>

                        {recentUserGames.length ? recentUserGames.map((game) => {
                          const opponent = findProgram(scheduleOpponentId(save.userProgramId, game.context.homeProgramId, game.context.awayProgramId));
                          return (
                            <div className="table-row" key={game.id}>
                              <div className="table-cell">{game.dayLabel}</div>
                              <div className="table-cell">G{game.context.seriesGameNumber}</div>
                              <div className="table-cell table-cell--program">
                                <strong>{opponent?.school ?? 'Opponent'}</strong>
                                <span>{opponent?.conference ?? 'D1'}</span>
                              </div>
                              <div className="table-cell">{gameSiteLabel(save.userProgramId, game.context.homeProgramId, game.context.awayProgramId)}</div>
                              <div className="table-cell">{game.context.gameType}</div>
                              <div className={classNames('table-cell', game.result && scheduleResultLabel(game, save.userProgramId).startsWith('W') && 'is-success', game.result && scheduleResultLabel(game, save.userProgramId).startsWith('L') && 'is-danger')}>
                                {scheduleResultLabel(game, save.userProgramId)}
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="table-row">
                            <div className="table-cell">No results yet</div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">—</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="two-column two-column--stacked">
                      <div className="table-shell">
                        <div className="table-toolbar">
                          <span>Top hitters</span>
                        </div>
                        <div className="table-grid table-grid--leaders-batting">
                          <div className="table-head">Player</div>
                          <div className="table-head">AVG</div>
                          <div className="table-head">OPS</div>
                          <div className="table-head">HR</div>
                          <div className="table-head">RBI</div>
                          <div className="table-head">BB</div>

                          {topTeamHitters.map((line) => (
                            <div className="table-row" key={line.playerId}>
                              <div className="table-cell table-cell--program">
                                <strong>{line.playerName}</strong>
                                <span>{line.position}</span>
                              </div>
                              <div className="table-cell">{battingAverage(line.atBats, line.hits)}</div>
                              <div className="table-cell">{ops(line.atBats, line.hits, line.doubles, line.triples, line.homeRuns, line.walks, line.plateAppearances)}</div>
                              <div className="table-cell">{line.homeRuns}</div>
                              <div className="table-cell">{line.runsBattedIn}</div>
                              <div className="table-cell">{line.walks}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="table-shell">
                        <div className="table-toolbar">
                          <span>Top pitchers</span>
                        </div>
                        <div className="table-grid table-grid--leaders-pitching">
                          <div className="table-head">Player</div>
                          <div className="table-head">ERA</div>
                          <div className="table-head">WHIP</div>
                          <div className="table-head">SO</div>
                          <div className="table-head">IP</div>
                          <div className="table-head">W-L</div>

                          {topTeamPitchers.map((line) => (
                            <div className="table-row" key={line.playerId}>
                              <div className="table-cell table-cell--program">
                                <strong>{line.playerName}</strong>
                                <span>{line.gamesStarted ? 'SP' : 'RP'}</span>
                              </div>
                              <div className="table-cell">{era(line.outsRecorded, line.earnedRuns)}</div>
                              <div className="table-cell">{whip(line.outsRecorded, line.hitsAllowed, line.walks)}</div>
                              <div className="table-cell">{line.strikeouts}</div>
                              <div className="table-cell">{inningsText(line.outsRecorded)}</div>
                              <div className="table-cell">{line.wins}-{line.losses}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="screen">
                  <div className="screen__header">
                    <div>
                      <p className="ui-kicker">Development Environment</p>
                      <h2>Coaching staff and clubhouse</h2>
                    </div>
                  </div>

                  <div className="two-column">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Coaching staff</span>
                        <span>Head coach + 3 assistants</span>
                      </div>
                      <div className="table-grid table-grid--coaches">
                        <div className="table-head">Coach</div>
                        <div className="table-head">Role</div>
                        <div className="table-head">OVR</div>
                        <div className="table-head">Lead</div>
                        <div className="table-head">Mor</div>
                        <div className="table-head">Inj</div>

                        {coachingRows.map((coach) => (
                          <div className="table-row" key={coach.id}>
                            <div className="table-cell table-cell--program">
                              <strong>{coach.name}</strong>
                            </div>
                            <div className="table-cell">{coachRoleShortLabel(coach.role)}</div>
                            <div className="table-cell">{coach.overall}</div>
                            <div className="table-cell">{coach.leadership}</div>
                            <div className="table-cell">{coach.moraleSupport}</div>
                            <div className="table-cell">{coach.injuryPrevention}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mini-table">
                      <div className="mini-table__header">
                        <ShieldAlert size={16} />
                        <strong>Team chemistry snapshot</strong>
                      </div>
                      <div className="mini-table__body">
                        <div className="mini-table__row"><span>Clubhouse</span><strong>{teamChemistry.summary}</strong></div>
                        <div className="mini-table__row"><span>Chemistry score</span><strong>{teamChemistry.score}</strong></div>
                        <div className="mini-table__row"><span>Leadership avg</span><strong>{teamChemistry.leadership}</strong></div>
                        <div className="mini-table__row"><span>Selfishness avg</span><strong>{teamChemistry.selfishness}</strong></div>
                        <div className="mini-table__row"><span>Resilience avg</span><strong>{teamChemistry.resilience}</strong></div>
                        {programStrategy && (
                          <>
                            <div className="mini-table__row"><span>Offensive identity</span><strong>{programStrategy.offenseFocus}</strong></div>
                            <div className="mini-table__row"><span>Pitching identity</span><strong>{programStrategy.pitchingFocus}</strong></div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {selectedTab === 'roster' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Roster & Depth</p>
                    <h2>Organization roster list</h2>
                  </div>
                  <div className="screen__meta">Ratings: {formatRatingLabel(ratingDisplay)} • Click a player to open a dedicated player page</div>
                </div>

                <div className="table-shell">
                  <div className="table-toolbar">
                    <span>Total roster: {rosterCount}</span>
                    <span>Pitchers: {pitcherCount}</span>
                    <span>Hitters: {hitterCount}</span>
                  </div>
                  <div className="table-grid table-grid--roster">
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('name')}>Player {rosterSortLabel('name')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('position')}>Pos {rosterSortLabel('position')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('classYear')}>YR {rosterSortLabel('classYear')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('overall')}>OVR {rosterSortLabel('overall')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('potential')}>POT {rosterSortLabel('potential')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('tools')}>Tools {rosterSortLabel('tools')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('scholarship')}>Scholarship {rosterSortLabel('scholarship')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRosterSort('nil')}>School NIL {rosterSortLabel('nil')}</button>
                    <div className="table-head">Action</div>

                    {sortedRoster.map((player) => (
                        <div className="table-row" key={player.id}>
                          <div className="table-cell table-cell--program">
                            <button className="link-button" onClick={() => openPlayerProfile(player.id)}>
                              <strong>{player.name}</strong>
                            </button>
                            <span>{player.bats}/{player.throws} • {player.hometown}</span>
                          </div>
                          <div className="table-cell">{player.primaryPosition}</div>
                          <div className="table-cell">{player.classYear}</div>
                          <div className="table-cell">{formatRatingValue(player.overall, ratingDisplay)}</div>
                          <div className="table-cell">{formatRatingValue(player.potential, ratingDisplay)}</div>
                          <div className="table-cell">{playerToolsLabel(player, ratingDisplay)}</div>
                          <div className="table-cell">{player.rosterStatus.scholarshipPct}%</div>
                          <div className="table-cell">{money(player.rosterStatus.schoolNilValue)}</div>
                          <div className="table-cell table-cell--actions">
                            <button className="ui-button ui-button--ghost ui-button--compact" onClick={() => openPlayerProfile(player.id)}>
                              View
                            </button>
                            <button className="ui-button ui-button--ghost ui-button--compact" onClick={() => releasePlayer(player.id)}>
                              Release
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="mini-table">
                  <div className="mini-table__header">
                    <CalendarDays size={16} />
                    <strong>Season controls</strong>
                  </div>
                  <div className="mini-table__body">
                    <div className="mini-table__row">
                      <span>Restart franchise</span>
                      <button
                        className="ui-button ui-button--ghost"
                        onClick={() => {
                          if (window.confirm(`Restart ${program.school} and erase current progress?`)) {
                            restartFranchise();
                          }
                        }}
                      >
                        Restart
                      </button>
                    </div>
                    <div className="mini-table__row">
                      <span>Restart season</span>
                      <button
                        className="ui-button ui-button--ghost"
                        onClick={() => {
                          if (window.confirm(`Restart the ${program.school} season schedule and clear all played games?`)) {
                            restartSeason();
                          }
                        }}
                      >
                        Reset
                      </button>
                    </div>
                    <div className="mini-table__row">
                      <span>League Home</span>
                      <button className="ui-button ui-button--ghost" onClick={() => setSelectedTab('overview')}>
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {selectedTab === 'player' && selectedPlayer && selectedPlayerMorale && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Player Page</p>
                    <h2>{selectedPlayer.name}</h2>
                  </div>
                  <div className="screen__meta">
                    {selectedPlayer.classYear} • {selectedPlayer.primaryPosition} • Ratings {formatRatingLabel(ratingDisplay)}
                  </div>
                </div>

                <div className="toolbar-row">
                  <button className="ui-button" onClick={() => setSelectedTab('roster')}>
                    <Users size={15} />
                    Back To Roster
                  </button>
                </div>

                <div className="player-card__summary">
                  <article className="info-panel">
                    <span>Overall / Potential</span>
                    <strong>{formatRatingValue(selectedPlayer.overall, ratingDisplay)} / {formatRatingValue(selectedPlayer.potential, ratingDisplay)}</strong>
                    <p>{selectedPlayer.bats}/{selectedPlayer.throws} • {selectedPlayer.hometown}</p>
                  </article>
                  <article className="info-panel">
                    <span>Morale / Stay score</span>
                    <strong>{selectedPlayer.morale} morale • {selectedPlayerMorale.stayScore} stay</strong>
                    <p>{selectedPlayerMorale.summary} • {selectedPlayerMorale.riskTier} risk</p>
                  </article>
                  <article className="info-panel">
                    <span>Package</span>
                    <strong>{selectedPlayer.rosterStatus.scholarshipPct}% + {money(selectedPlayer.rosterStatus.schoolNilValue)}</strong>
                    <p>{selectedPlayer.rosterStatus.thirdPartyNilValue > 0 ? `${money(selectedPlayer.rosterStatus.thirdPartyNilValue)} third-party on file.` : 'No reported third-party NIL yet.'}</p>
                  </article>
                </div>

                <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header">
                      <Users size={16} />
                      <strong>Ratings breakdown</strong>
                    </div>
                    <div className="mini-table__body">
                      {selectedPlayer.offense && (
                        <>
                          <div className="mini-table__row"><span>Contact</span><strong>{formatRatingValue(selectedPlayer.offense.contact, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Power</span><strong>{formatRatingValue(selectedPlayer.offense.power, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Eye / Avoid K</span><strong>{formatRatingValue(selectedPlayer.offense.eye, ratingDisplay)} / {formatRatingValue(selectedPlayer.offense.avoidK, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Gap / Speed</span><strong>{formatRatingValue(selectedPlayer.offense.gap, ratingDisplay)} / {formatRatingValue(selectedPlayer.offense.speed, ratingDisplay)}</strong></div>
                        </>
                      )}
                      {selectedPlayer.pitching && (
                        <>
                          <div className="mini-table__row"><span>Stuff / Command</span><strong>{formatRatingValue(selectedPlayer.pitching.stuff, ratingDisplay)} / {formatRatingValue(selectedPlayer.pitching.command, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Movement / Stamina</span><strong>{formatRatingValue(selectedPlayer.pitching.movement, ratingDisplay)} / {formatRatingValue(selectedPlayer.pitching.stamina, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Composure</span><strong>{formatRatingValue(selectedPlayer.pitching.composure, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Ground-ball lean</span><strong>{formatRatingValue(selectedPlayer.pitching.groundBall, ratingDisplay)}</strong></div>
                        </>
                      )}
                      {selectedPlayer.defense && (
                        <>
                          <div className="mini-table__row"><span>Defense / Arm</span><strong>{formatRatingValue(selectedPlayer.defense.defense, ratingDisplay)} / {formatRatingValue(selectedPlayer.defense.arm, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Durability</span><strong>{formatRatingValue(selectedPlayer.durability, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Development curve</span><strong>{formatRatingValue(selectedPlayer.developmentCurve, ratingDisplay)}</strong></div>
                          <div className="mini-table__row"><span>Marketability</span><strong>{formatRatingValue(selectedPlayer.marketability, ratingDisplay)}</strong></div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <ArrowRightLeft size={16} />
                      <strong>Stay vs transfer</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row"><span>Current outlook</span><strong>{selectedPlayerMorale.summary}</strong></div>
                      <div className="mini-table__row"><span>Risk tier</span><strong>{selectedPlayerMorale.riskTier}</strong></div>
                      {selectedPlayerMorale.reasons.map((reason) => (
                        <div className="mini-table__row" key={reason}>
                          <span>Why</span>
                          <strong>{reason}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="two-column">
                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>Season summary</span>
                      <span>{selectedPlayer.offense ? 'Batting + fielding' : 'Pitching + fielding'}</span>
                    </div>
                    <div className="table-grid table-grid--player-summary">
                      <div className="table-head">Area</div>
                      <div className="table-head">Line</div>

                      {selectedPlayerBatting && (
                        <div className="table-row">
                          <div className="table-cell">Batting</div>
                          <div className="table-cell">
                            {selectedPlayerBatting.plateAppearances} PA • {battingAverage(selectedPlayerBatting.atBats, selectedPlayerBatting.hits)} AVG • {ops(selectedPlayerBatting.atBats, selectedPlayerBatting.hits, selectedPlayerBatting.doubles, selectedPlayerBatting.triples, selectedPlayerBatting.homeRuns, selectedPlayerBatting.walks, selectedPlayerBatting.plateAppearances)} OPS • {selectedPlayerBatting.homeRuns} HR • {selectedPlayerBatting.runsBattedIn} RBI
                          </div>
                        </div>
                      )}
                      {selectedPlayerPitching && (
                        <div className="table-row">
                          <div className="table-cell">Pitching</div>
                          <div className="table-cell">
                            {inningsText(selectedPlayerPitching.outsRecorded)} IP • {era(selectedPlayerPitching.outsRecorded, selectedPlayerPitching.earnedRuns)} ERA • {whip(selectedPlayerPitching.outsRecorded, selectedPlayerPitching.hitsAllowed, selectedPlayerPitching.walks)} WHIP • {selectedPlayerPitching.strikeouts} SO • {selectedPlayerPitching.wins}-{selectedPlayerPitching.losses}
                          </div>
                        </div>
                      )}
                      {selectedPlayerFielding && (
                        <div className="table-row">
                          <div className="table-cell">Fielding</div>
                          <div className="table-cell">
                            {selectedPlayerFielding.chances} chances • {selectedPlayerFielding.errors} E • {fieldingPct(selectedPlayerFielding.chances, selectedPlayerFielding.errors)} FPCT
                          </div>
                        </div>
                      )}
                      {!selectedPlayerBatting && !selectedPlayerPitching && !selectedPlayerFielding && (
                        <div className="table-row">
                          <div className="table-cell">Season</div>
                          <div className="table-cell table-cell--wrap">No live season stats yet. Advance into the schedule to build this page out.</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>Development history</span>
                      <span>Recent year-over-year growth notes</span>
                    </div>
                    <div className="table-grid table-grid--player-summary">
                      <div className="table-head">Year</div>
                      <div className="table-head">OVR</div>
                      <div className="table-head">POT</div>
                      <div className="table-head">Context</div>

                      {selectedPlayer.developmentHistory.slice().reverse().map((entry) => (
                        <div className="table-row" key={`${entry.year}-${entry.classYear}`}>
                          <div className="table-cell">Y{entry.year} ({entry.classYear})</div>
                          <div className="table-cell">{entry.overallBefore} → {entry.overallAfter}</div>
                          <div className="table-cell">{entry.potentialBefore} → {entry.potentialAfter}</div>
                          <div className="table-cell table-cell--wrap">{entry.summary}</div>
                        </div>
                      ))}
                      {!selectedPlayer.developmentHistory.length && (
                        <div className="table-row">
                          <div className="table-cell">No history</div>
                          <div className="table-cell">—</div>
                          <div className="table-cell">—</div>
                          <div className="table-cell table-cell--wrap">Year-over-year development notes will appear after your first offseason rollover.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="two-column">
                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>Recent game log</span>
                      <span>Last 5 appearances in team results</span>
                    </div>
                    <div className="table-grid table-grid--player-gamelog">
                      <div className="table-head">Date</div>
                      <div className="table-head">Opponent</div>
                      <div className="table-head">Result</div>
                      <div className="table-head">Line</div>

                      {selectedPlayerGameLog.map((entry) => (
                        <div className="table-row" key={entry.id}>
                          <div className="table-cell">{entry.dayLabel}</div>
                          <div className="table-cell">{entry.opponent}</div>
                          <div className="table-cell">{entry.result}</div>
                          <div className="table-cell table-cell--wrap">
                            {entry.battingLine && `${entry.battingLine.hits}-${entry.battingLine.atBats}, ${entry.battingLine.runsBattedIn} RBI`}
                            {entry.pitchingLine && `${inningsText(entry.pitchingLine.outsRecorded)} IP, ${entry.pitchingLine.runsAllowed} R, ${entry.pitchingLine.strikeouts} SO`}
                            {!entry.battingLine && !entry.pitchingLine && entry.fieldingLine && `${entry.fieldingLine.chances} chances, ${entry.fieldingLine.errors} E`}
                          </div>
                        </div>
                      ))}
                      {!selectedPlayerGameLog.length && (
                        <div className="table-row">
                          <div className="table-cell">No games</div>
                          <div className="table-cell">—</div>
                          <div className="table-cell">—</div>
                          <div className="table-cell table-cell--wrap">Game-by-game lines will appear here once this player logs live season results.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {selectedTab === 'recruiting' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Recruiting Hub</p>
                    <h2>Manage your pipeline</h2>
                  </div>
                  <div className="screen__meta" style={{ display: 'flex', gap: '8px' }}>
                    <button className={classNames('ui-button ui-button--compact', recruitingView === 'overview' ? '' : 'ui-button--ghost')} onClick={() => setRecruitingView('overview')}>Overview</button>
                    <button className={classNames('ui-button ui-button--compact', recruitingView === 'freshmen' ? '' : 'ui-button--ghost')} onClick={() => setRecruitingView('freshmen')}>Upcoming Freshmen</button>
                    <button className={classNames('ui-button ui-button--compact', recruitingView === 'portal' ? '' : 'ui-button--ghost')} onClick={() => setRecruitingView('portal')}>Transfer Portal</button>
                  </div>
                </div>

                {recruitingView === 'overview' && (
                  <>
                    <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header" style={{ cursor: 'pointer' }} onClick={() => setShowRecruitingHelp(!showRecruitingHelp)}>
                      <BookOpen size={16} />
                      <strong>{showRecruitingHelp ? 'Hide recruiting help' : 'How recruiting works (Help)'}</strong>
                    </div>
                    {showRecruitingHelp && (
                      <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Interest</span>
                        <strong>How much the player likes your school right now</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Likely to sign</span>
                        <strong>How expensive the player will be to land</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Your move</span>
                        <strong>Target recruits, spend points each week, then close with scholarship and NIL</strong>
                      </div>
                    </div>
                    )}
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <Sparkles size={16} />
                      <strong>Weekly recruiting budget</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Points this week</span>
                        <strong>{save.recruitingPointsRemaining} / {save.recruitingPointsPerWeek}</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Best use</span>
                        <strong>Focus on 4-8 real targets instead of touching everybody</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Closing rule</span>
                        <strong>Recruiting points open the door; scholarship and NIL still finish the deal</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="two-column">
                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>Next-season needs</span>
                      <span>Seniors, draft-risk, and transfer-risk are shaping next year's board</span>
                    </div>
                    <div className="table-grid table-grid--needs">
                      <div className="table-head">Need</div>
                      <div className="table-head">Seniors</div>
                      <div className="table-head">Draft Risk</div>
                      <div className="table-head">Transfer Risk</div>
                      <div className="table-head">Urgency</div>

                      {recruitingNeeds.map((need) => (
                        <div className="table-row" key={need.position}>
                          <div className="table-cell table-cell--program">
                            <strong>{need.label}</strong>
                            <span>{need.position}</span>
                          </div>
                          <div className="table-cell">{need.graduatingSeniors}</div>
                          <div className="table-cell">{need.draftRisks}</div>
                          <div className="table-cell">{need.transferRisks}</div>
                          <div className="table-cell">{need.urgency}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="mini-table">
                      <div className="mini-table__header"><strong>Program Recruiting Identity</strong></div>
                      <div className="mini-table__body">
                        <div className="mini-table__row"><span>Primary lane</span><strong>{activeProgramDevelopmentIdentity.primaryLabel}</strong></div>
                        <div className="mini-table__row"><span>Secondary lane</span><strong>{activeProgramDevelopmentIdentity.secondaryLabel}</strong></div>
                        <div className="mini-table__row"><span>Staff summary</span><strong>{activeProgramDevelopmentIdentity.summary}</strong></div>
                      </div>
                    </div>

                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Target board</span>
                        <span>{targetedRecruits.length} active targets</span>
                      </div>
                      <div className="table-grid table-grid--targets">
                        <div className="table-head">Recruit</div>
                        <div className="table-head">Interest</div>
                        <div className="table-head">Weekly</div>
                        <div className="table-head">Actions</div>

                        {targetedRecruits.length === 0 && (
                          <div className="table-row">
                            <div className="table-cell table-cell--program">
                              <strong>No active targets</strong>
                              <span>Target a few recruits below, then spend this week's points on them.</span>
                            </div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">—</div>
                          </div>
                        )}

                        {targetedRecruits.map((recruit) => (
                          <div className="table-row" key={recruit.id}>
                            <div className="table-cell table-cell--program">
                              <button className="crumb-button" style={{ fontSize: 'inherit', fontWeight: 'bold' }} onClick={() => { setSelectedRecruitId(recruit.id); setRecruitingView('profile'); setOfferNIL(recruit.userOffer?.nilValue ?? 0); setOfferScholly(recruit.userOffer?.scholarshipPct ?? 0); }}>{recruit.name}</button>
                              <span>{recruit.primaryPosition} • {recruit.stars}★ • scout {recruit.scoutingLevel ?? 0}/3</span>
                            </div>
                            <div className="table-cell">{recruit.interest} • {interestLabel(recruit.interest)}</div>
                            <div className="table-cell">{recruit.weeklyPointsSpent ?? 0} pts</div>
                            <div className="table-cell table-cell--actions">
                              {recruitingActionButtons.map((action) => (
                                <button
                                  key={action.id}
                                  className="ui-button ui-button--ghost ui-button--compact"
                                  disabled={(recruit.weeklyActions ?? []).includes(action.id) || save.recruitingPointsRemaining < action.cost}
                                  onClick={() => applyRecruitingAction(recruit.id, action.id)}
                                >
                                  {action.label} {action.cost}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {recruitingView === 'freshmen' && (
                <div className="table-shell">
                  <div className="table-toolbar">
                    <span>Open targets: {save.recruits.filter((recruit) => !recruit.committedProgramId).length}</span>
                    <span>Scholarship room left after current players and offers: {scholarshipAvailable.toFixed(1)} equiv.</span>
                  </div>
                  <div className="table-grid table-grid--recruiting">
                    <button className="table-head table-head--button" onClick={() => toggleRecruitSort('name')}>Player {recruitSortLabel('name')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRecruitSort('position')}>Pos {recruitSortLabel('position')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRecruitSort('stars')}>Stars {recruitSortLabel('stars')}</button>
                    <div className="table-head">Hometown</div>
                    <button className="table-head table-head--button" onClick={() => toggleRecruitSort('interest')}>Interest {recruitSortLabel('interest')}</button>
                    <button className="table-head table-head--button" onClick={() => toggleRecruitSort('signability')}>Likely to Sign {recruitSortLabel('signability')}</button>
                    <div className="table-head">Need Fit</div>
                    <button className="table-head table-head--button" onClick={() => toggleRecruitSort('status')}>Status {recruitSortLabel('status')}</button>
                    <div className="table-head">Action</div>

                    {save.recruits.slice().sort((a, b) => {
                      const dir = recruitSort.direction === 'asc' ? 1 : -1;
                      switch (recruitSort.key) {
                        case 'name': return a.name.localeCompare(b.name) * dir;
                        case 'position': return a.primaryPosition.localeCompare(b.primaryPosition) * dir;
                        case 'stars': return (a.stars - b.stars) * dir;
                        case 'interest': return (a.interest - b.interest) * dir;
                        case 'signability': return (a.signability - b.signability) * dir;
                        case 'status':
                          const statusA = a.committedProgramId ? 2 : a.targeted ? 1 : 0;
                          const statusB = b.committedProgramId ? 2 : b.targeted ? 1 : 0;
                          return (statusA - statusB) * dir;
                        default: return 0;
                      }
                    }).map((recruit) => (
                      (() => {
                        const recruitFit = calculateRecruitProgramFit(save.userProgramId, recruit, save.roster, getProgramStaffFromSave(save, save.userProgramId));
                        return (
                      <div className="table-row" key={recruit.id}>
                        <div className="table-cell table-cell--program">
                          <button className="crumb-button" style={{ fontSize: 'inherit', fontWeight: 'bold' }} onClick={() => { setSelectedRecruitId(recruit.id); setRecruitingView('profile'); setOfferNIL(recruit.userOffer?.nilValue ?? 0); setOfferScholly(recruit.userOffer?.scholarshipPct ?? 0); }}>{recruit.name}</button>
                        </div>
                        <div className="table-cell">{recruit.primaryPosition}</div>
                        <div className="table-cell">{recruit.stars}</div>
                        <div className="table-cell">{recruit.hometown?.city}, {recruit.hometown?.state}</div>
                        <div className="table-cell">{recruit.interest} • {interestLabel(recruit.interest)}</div>
                        <div className="table-cell">{recruit.signability} • {signabilityLabel(recruit.signability)}</div>
                        <div className="table-cell">{recruitFit.needFit.label} • {recruitFit.coachFit.summary}</div>
                        <div className="table-cell">
                          {recruit.committedProgramId ? `Committed: ${findProgram(recruit.committedProgramId)?.school ?? 'Elsewhere'}` : recruit.targeted ? 'Targeted' : 'Open'}
                        </div>
                        <div className="table-cell">
                          {!recruit.committedProgramId && (
                            <div className="table-cell__stack">
                              <button
                                className="ui-button ui-button--ghost ui-button--compact"
                                onClick={() => toggleRecruitTarget(recruit.id)}
                              >
                                {recruit.targeted ? 'Untarget' : 'Target'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                        );
                      })()
                    ))}
                  </div>
                </div>
            )}


            {recruitingView === 'profile' && (() => {
              const recruit = save.recruits.find((r) => r.id === selectedRecruitId);
              if (!recruit) return null;
              const grades = calculateSchoolGrades(save.userProgramId, recruit, save.roster);
              const recruitProgramFit = calculateRecruitProgramFit(save.userProgramId, recruit, save.roster, getProgramStaffFromSave(save, save.userProgramId));
              const recruitArchetype = getArchetypeDefinition(recruit.archetype);
              return (
                <div className="table-shell" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                      <button className="crumb-button" onClick={() => setRecruitingView('freshmen')}>← Back to Freshmen</button>
                      <h2 style={{ marginTop: '8px' }}>{recruit.name}</h2>
                      <div className="screen__meta">{recruit.primaryPosition} • {recruit.stars}★ • {recruit.hometown?.city}, {recruit.hometown?.state} • {recruit.marketability} MKT • <span style={{ color: '#ffb86c' }}>Dealbreaker: {recruit.dealbreaker?.toUpperCase() ?? 'NONE'}</span></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="screen__meta" style={{ fontSize: '1.1rem', fontWeight: 'bold', color: recruit.committedProgramId ? '#50fa7b' : 'inherit' }}>
                        {recruit.committedProgramId ? 'COMMITTED' : recruit.targeted ? 'Targeted' : 'Open'}
                      </div>
                    </div>
                  </div>

                  <div className="two-column">
                    <div>
                      <div className="mini-table">
                        <div className="mini-table__header"><strong>Attributes</strong></div>
                        <div className="mini-table__body">
                          {recruit.offense && (
                            <div className="mini-table__row"><span>Offense</span><strong>CON {recruit.offense.contact} • POW {recruit.offense.power} • EYE {recruit.offense.eye}</strong></div>
                          )}
                          {recruit.pitching && (
                            <div className="mini-table__row"><span>Pitching</span><strong>STU {recruit.pitching.stuff} • CMD {recruit.pitching.command} • STA {recruit.pitching.stamina}</strong></div>
                          )}
                          {recruit.defense && (
                            <div className="mini-table__row"><span>Defense</span><strong>DEF {recruit.defense.defense} • ARM {recruit.defense.arm}</strong></div>
                          )}
                          <div className="mini-table__row"><span>Archetype</span><strong>{recruitArchetype.label}</strong></div>
                          <div className="mini-table__row"><span>Likely to Sign</span><strong>{recruit.signability}</strong></div>
                        </div>
                      </div>

                      <div className="mini-table" style={{ marginTop: '16px' }}>
                        <div className="mini-table__header"><strong>Preferences & School Grades</strong></div>
                        <div className="mini-table__body">
                          <div className="mini-table__row"><span>Proximity (Pref: {recruit.preferences.proximity})</span><strong>{grades.proximity}</strong></div>
                          <div className="mini-table__row"><span>Playing Time (Pref: {recruit.preferences.playingTime})</span><strong>{grades.playingTime}</strong></div>
                          <div className="mini-table__row"><span>Prestige (Pref: {recruit.preferences.prestige})</span><strong>{grades.prestige}</strong></div>
                          <div className="mini-table__row"><span>NIL (Pref: {recruit.preferences.nil})</span><strong>{grades.nil}</strong></div>
                          <div className="mini-table__row"><span>Development (Pref: {recruit.preferences.development})</span><strong>{grades.development}</strong></div>
                        </div>
                      </div>

                      <div className="mini-table" style={{ marginTop: '16px' }}>
                        <div className="mini-table__header"><strong>Program Fit</strong></div>
                        <div className="mini-table__body">
                          <div className="mini-table__row"><span>Overall fit</span><strong>{recruitProgramFit.score} • {recruitProgramFit.label}</strong></div>
                          <div className="mini-table__row"><span>Roster need</span><strong>{recruitProgramFit.needFit.score} • {recruitProgramFit.needFit.label}</strong></div>
                          <div className="mini-table__row"><span>Coach fit</span><strong>{recruitProgramFit.coachFit.score} • {recruitProgramFit.coachFit.summary}</strong></div>
                          <div className="mini-table__row"><span>Identity bonus</span><strong>+{recruitProgramFit.identityBonus} • {recruitProgramFit.identity.summary}</strong></div>
                        </div>
                      </div>

                      <div className="mini-table" style={{ marginTop: '16px' }}>
                        <div className="mini-table__header"><strong>Top Interested Schools</strong></div>
                        <div className="mini-table__body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {(recruit.topSchools ?? []).map((school, index) => {
                            const p = programs.find((x) => x.id === school.programId);
                            if (!p) return null;
                            const isUser = p.id === save.userProgramId;
                            // Estimate progress out of 160 for a full bar
                            const progressPct = Math.min(100, Math.max(0, (school.score / 160) * 100));
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '24px', fontWeight: 'bold', color: '#6272a4' }}>#{index + 1}</div>
                                <div style={{ width: '120px', fontWeight: isUser ? 'bold' : 'normal', color: isUser ? '#f8f8f2' : '#8be9fd' }}>
                                  {p.school}
                                </div>
                                <div style={{ flex: 1, height: '12px', backgroundColor: '#282a36', borderRadius: '6px', overflow: 'hidden' }}>
                                  <div style={{ width: `${progressPct}%`, height: '100%', backgroundColor: p.colors.primary, transition: 'width 0.3s ease' }} />
                                </div>
                                <div style={{ width: '40px', textAlign: 'right', fontSize: '0.85rem' }}>{Math.round(school.score)}</div>
                              </div>
                            );
                          })}
                          {(!recruit.topSchools || recruit.topSchools.length === 0) && (
                            <div className="screen__meta">No scouting data available yet. Advance a week to see competition.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="mini-table">
                        <div className="mini-table__header"><strong>Recruiting Actions</strong> (Points left: {save.recruitingPointsRemaining})</div>
                        <div className="mini-table__body" style={{ padding: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {!recruit.targeted && !recruit.committedProgramId && (
                            <button className="ui-button ui-button--primary" style={{ width: '100%' }} onClick={() => toggleRecruitTarget(recruit.id)}>Target Recruit</button>
                          )}
                          {recruit.targeted && !recruit.committedProgramId && (
                            <>
                              {recruitingActionButtons.map((action) => (
                                <button
                                  key={action.id}
                                  className="ui-button ui-button--ghost ui-button--compact"
                                  disabled={(recruit.weeklyActions ?? []).includes(action.id) || save.recruitingPointsRemaining < action.cost}
                                  onClick={() => applyRecruitingAction(recruit.id, action.id)}
                                >
                                  {action.label} ({action.cost} pts)
                                </button>
                              ))}
                              <button className="ui-button ui-button--ghost ui-button--compact" onClick={() => toggleRecruitTarget(recruit.id)}>Untarget</button>
                            </>
                          )}
                        </div>
                      </div>

                      {recruit.targeted && !recruit.committedProgramId && (
                        <div className="mini-table" style={{ marginTop: '16px' }}>
                          <div className="mini-table__header"><strong>Scholarship & NIL Offer</strong></div>
                          <div className="mini-table__body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.8rem', opacity: 0.8, marginBottom: '4px' }}>Scholarship % (Equivalency)</label>
                              <input type="number" min="0" max="100" className="ui-input" value={offerScholly} onChange={(e) => setOfferScholly(Number(e.target.value))} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.8rem', opacity: 0.8, marginBottom: '4px' }}>NIL Cash</label>
                              <input type="number" min="0" step="1000" className="ui-input" value={offerNIL} onChange={(e) => setOfferNIL(Number(e.target.value))} />
                            </div>
                            <button className="ui-button ui-button--primary" onClick={() => offerRecruit(recruit.id, offerScholly, offerNIL)}>
                              Submit Offer
                            </button>
                            {recruit.userOffer && (
                              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '8px' }}>
                                Current Offer: {recruit.userOffer.scholarshipPct}% + ${recruit.userOffer.nilValue.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {recruitingView === 'portal' && (
              <>
                {(save.currentWeek < 4 || save.currentWeek > 5) ? (
                  <div className="table-shell" style={{ padding: '24px', textAlign: 'center' }}>
                    <h3>Transfer Portal Closed</h3>
                    <p>The NCAA Transfer Portal is currently closed. The window is open from June 1 to July 1 (Offseason Weeks 4-5).</p>
                  </div>
                ) : (
                  <>
                <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header">
                      <ArrowRightLeft size={16} />
                          <strong>Portal Window Open (June 1 - July 1)</strong>
                        </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Ask</span>
                        <strong>The scholarship slice and NIL package the player expects from your 11.7 pool</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Interest</span>
                        <strong>How open the player is to joining you</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Transfer risk</span>
                        <strong>Higher numbers mean a messier, more dangerous recruitment</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <CircleAlert size={16} />
                      <strong>Simple strategy</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Best targets</span>
                        <strong>High overall, solid interest, lower transfer risk</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Use portal for</span>
                        <strong>Friday starter upgrades and bullpen depth</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Be careful with</span>
                        <strong>Big asks plus very high risk scores</strong>
                      </div>
                      {programStrategy && (
                        <div className="mini-table__row">
                          <span>Your identity</span>
                          <strong>{programStrategy.offenseFocus} offense • {programStrategy.pitchingFocus} pitching</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="table-shell">
                  <div className="table-toolbar">
                    <span>Available entries: {save.portalEntries.filter((entry) => !entry.destinationProgramId).length}</span>
                    <span>Midweek help and bullpen upgrades can swing the season</span>
                  </div>
                  <div className="table-grid table-grid--portal">
                    <button className="table-head table-head--button" onClick={() => togglePortalSort('name')}>Player {portalSortLabel('name')}</button>
                    <div className="table-head">From</div>
                    <button className="table-head table-head--button" onClick={() => togglePortalSort('position')}>Pos {portalSortLabel('position')}</button>
                    <button className="table-head table-head--button" onClick={() => togglePortalSort('overall')}>OVR {portalSortLabel('overall')}</button>
                    <button className="table-head table-head--button" onClick={() => togglePortalSort('ask')}>Ask {portalSortLabel('ask')}</button>
                    <button className="table-head table-head--button" onClick={() => togglePortalSort('interest')}>Interest {portalSortLabel('interest')}</button>
                    <button className="table-head table-head--button" onClick={() => togglePortalSort('risk')}>Transfer Risk {portalSortLabel('risk')}</button>
                    <div className="table-head">Action</div>

                    {save.portalEntries.slice().sort((a, b) => {
                      const dir = portalSort.direction === 'asc' ? 1 : -1;
                      switch (portalSort.key) {
                        case 'name': return a.player.name.localeCompare(b.player.name) * dir;
                        case 'position': return a.player.primaryPosition.localeCompare(b.player.primaryPosition) * dir;
                        case 'overall': return (a.player.overall - b.player.overall) * dir;
                        case 'ask': return (a.askingScholarshipPct - b.askingScholarshipPct) * dir;
                        case 'interest': return (a.interest - b.interest) * dir;
                        case 'risk': return (a.tamperRisk - b.tamperRisk) * dir;
                        default: return 0;
                      }
                    }).map((entry) => (
                      <div className="table-row" key={entry.id}>
                        <div className="table-cell table-cell--program">
                          <strong>{entry.player.name}</strong>
                          <span>{entry.reason ?? `${entry.player.bats}/${entry.player.throws} • ${entry.player.hometown}`}{entry.topDestinations?.[0] ? ` • Lean: ${findProgram(entry.topDestinations[0].programId)?.school ?? 'Unknown'}` : ''}</span>
                        </div>
                        <div className="table-cell">{findProgram(entry.originProgramId)?.school}</div>
                        <div className="table-cell">{entry.player.primaryPosition}</div>
                        <div className="table-cell">{entry.player.overall}</div>
                        <div className="table-cell">{entry.askingScholarshipPct}% equiv. + {money(entry.askingSchoolNil)}</div>
                        <div className="table-cell">{entry.interest} • {interestLabel(entry.interest)}</div>
                        <div className="table-cell">{entry.tamperRisk} • {transferRiskLabel(entry.tamperRisk)}{entry.coachChange ? ' • Staff shake-up' : ''}</div>
                        <div className="table-cell">
                          {!entry.destinationProgramId ? (
                            <button
                              className="ui-button ui-button--ghost"
                              onClick={() => offerPortalPlayer(entry.id, entry.askingScholarshipPct, entry.askingSchoolNil)}
                            >
                              Match Ask
                            </button>
                          ) : (
                            <span>{findProgram(entry.destinationProgramId)?.school ?? 'Committed elsewhere'}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
              </>
            )}
              </section>
            )}

            {selectedTab === 'nil' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Player Pay & Rules</p>
                    <h2>School support, outside deals, and deal review</h2>
                  </div>
                  <div className="screen__meta">This screen checks whether player deals look believable and conflict-free</div>
                </div>

                <div className="toolbar-row">
                  {['Rawlings', 'Mizuno', 'Marucci'].map((brand) => (
                    <button
                      key={brand}
                      className={classNames('ui-button', save.schoolSponsor === brand && 'ui-button--primary')}
                      onClick={() => changeSchoolSponsor(brand)}
                    >
                      {brand}
                    </button>
                  ))}
                </div>

                <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header">
                      <BadgeDollarSign size={16} />
                      <strong>What NIL means here</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>School NIL</span>
                        <strong>Money your program gives as part of its package</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Outside deal</span>
                        <strong>Money from brands or businesses outside the school</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Deal review</span>
                        <strong>The game checks if an outside deal looks realistic or suspicious</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <ShieldAlert size={16} />
                      <strong>How to read this screen</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Market fit</span>
                        <strong>Whether the deal size matches the player’s profile</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Flagged</span>
                        <strong>The deal probably needs attention before it hurts you</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Sponsor conflict</span>
                        <strong>The player’s brand deal clashes with your school sponsor</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header">
                      <Users size={16} />
                      <strong>Archetype profile</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row"><span>Archetype</span><strong>{selectedPlayerArchetype?.label ?? selectedPlayer.archetype}</strong></div>
                      <div className="mini-table__row"><span>Family</span><strong>{selectedPlayerArchetype?.family.replace(/-/g, ' ')}</strong></div>
                      <div className="mini-table__row"><span>Role tags</span><strong>{selectedPlayerArchetype?.roleTags.join(', ')}</strong></div>
                      <div className="mini-table__row"><span>Profile</span><strong>{selectedPlayerArchetype?.description}</strong></div>
                    </div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <Sparkles size={16} />
                      <strong>Development outlook</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row"><span>Current note</span><strong>{selectedPlayer.seasonDevelopmentContext.note}</strong></div>
                      <div className="mini-table__row"><span>Coach fit</span><strong>{selectedPlayerCoachFit?.score} • {selectedPlayerCoachFit?.summary}</strong></div>
                      <div className="mini-table__row"><span>In-season progress</span><strong>{selectedPlayer.seasonDevelopmentContext.inSeasonProgress}</strong></div>
                      <div className="mini-table__row"><span>Work ethic / Coachability</span><strong>{selectedPlayer.developmentProfile.workEthic} / {selectedPlayer.developmentProfile.coachability}</strong></div>
                      <div className="mini-table__row"><span>Ceiling reliability</span><strong>{selectedPlayer.developmentProfile.ceilingReliability}</strong></div>
                    </div>
                  </div>
                </div>

                <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header">
                      <ShieldAlert size={16} />
                      <strong>Leadership and personality</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row"><span>Leadership</span><strong>{leadershipLabel(selectedPlayer.leadership.current)} ({selectedPlayer.leadership.current})</strong></div>
                      <div className="mini-table__row"><span>Leadership potential</span><strong>{selectedPlayer.leadership.potential}</strong></div>
                      <div className="mini-table__row"><span>Personality</span><strong>{personalityLabel(selectedPlayer.personalityProfile.type)}</strong></div>
                      <div className="mini-table__row"><span>Team-first / Selfishness</span><strong>{selectedPlayer.personalityProfile.teamFirst} / {selectedPlayer.personalityProfile.selfishness} ({selfishnessLabel(selectedPlayer.personalityProfile.selfishness)})</strong></div>
                      <div className="mini-table__row"><span>Drive / Resilience</span><strong>{selectedPlayer.personalityProfile.competitiveDrive} / {selectedPlayer.personalityProfile.resilience}</strong></div>
                    </div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <FolderKanban size={16} />
                      <strong>Coach fit</strong>
                    </div>
                    <div className="mini-table__body">
                      {coachingRows.map((coach) => (
                        <div className="mini-table__row" key={coach.id}>
                          <span>{coachRoleLabel(coach.role)}</span>
                          <strong>{coach.developmentRatings[selectedPlayerCoachFit?.family ?? 'outfielders']}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="two-column">
                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>Recent player deals</span>
                    </div>
                    <div className="table-grid table-grid--nil">
                      <div className="table-head">Player</div>
                      <div className="table-head">Type</div>
                      <div className="table-head">Brand</div>
                      <div className="table-head">Value</div>
                      <div className="table-head">Market Fit</div>
                      <div className="table-head">Status</div>

                      {save.nilDeals.slice(0, 8).map((deal) => (
                        <div className="table-row" key={deal.id}>
                          <div className="table-cell table-cell--program">
                            <strong>{deal.playerName}</strong>
                            <span>Week {deal.createdWeek}</span>
                          </div>
                          <div className="table-cell">{deal.type}</div>
                          <div className="table-cell">{deal.brand ?? '—'}</div>
                          <div className="table-cell">{money(deal.value)}</div>
                          <div className="table-cell">{deal.fairMarketScore} • {marketFitLabel(deal.fairMarketScore)}</div>
                          <div className="table-cell">
                            <span className={deal.status === 'flagged' ? 'is-danger' : deal.status === 'approved' ? 'is-success' : ''}>
                              {deal.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>Problems to fix</span>
                    </div>
                    <div className="table-grid table-grid--reviews">
                      <div className="table-head">Issue</div>
                      <div className="table-head">Risk</div>
                      <div className="table-head">Outcome</div>

                      {save.complianceReviews.slice(0, 6).map((review) => (
                        <div className="table-row" key={review.id}>
                          <div className="table-cell table-cell--program">
                            <strong>{review.reason}</strong>
                            <span>{review.playerId}</span>
                          </div>
                          <div className="table-cell">{review.riskLevel}</div>
                          <div className="table-cell">{review.verdict}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {selectedTab === 'mail' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Manager</p>
                    <h2>Mail</h2>
                  </div>
                  <div className="screen__meta">Clubhouse notes, coach messages, recruiting wins, and league notices</div>
                </div>

                <div className="table-shell">
                  <div className="table-toolbar">
                    <span>Recent messages</span>
                    <span>{save.eventLog.slice(0, 20).length} most recent notes</span>
                  </div>
                  <div className="table-grid">
                    <div className="table-head">Type</div>
                    <div className="table-head">Message</div>

                    {save.eventLog.slice(0, 20).map((entry, index) => (
                      <div className="table-row" key={`${entry}-${index}`}>
                        <div className="table-cell">
                          {entry.includes('clubhouse') || entry.includes('morale') || entry.includes('frustration') ? 'Clubhouse' : entry.includes('committed') ? 'Recruiting' : entry.includes('transferred') || entry.includes('portal') ? 'Portal' : entry.includes('Staff') || entry.includes('coach') ? 'Staff' : 'League'}
                        </div>
                        <div className="table-cell table-cell--program">
                          <strong>{entry}</strong>
                          <span>Most recent franchise activity and environment notes.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {selectedTab === 'calendar' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Conference Standings</p>
                    <h2>{selectedConference || program.conference} leaderboard</h2>
                  </div>
                  <div className="screen__meta">Conference records plus the basic run-scoring shape of each team</div>
                </div>

                <div className="table-shell">
                  <div className="table-toolbar">
                    <span>Conference selector</span>
                    <span>Compare league peers at a glance</span>
                  </div>
                  <div className="schedule-toolbar">
                    <label className="schedule-toolbar__label" htmlFor="conference-select">
                      Conference
                    </label>
                    <select
                      id="conference-select"
                      className="ui-select"
                      value={selectedConference}
                      onChange={(event) => setSelectedConference(event.target.value)}
                    >
                      {availableConferences.map((conference) => (
                        <option key={conference} value={conference}>
                          {conference}
                        </option>
                      ))}
                    </select>
                    <span className="ui-muted">
                      {conferenceStandings.length} teams in view
                    </span>
                  </div>
                  <div className="table-grid table-grid--conference-standings">
                    <div className="table-head">Team</div>
                    <div className="table-head">Conf W-L</div>
                    <div className="table-head">Overall W-L</div>
                    <div className="table-head">RS</div>
                    <div className="table-head">RA</div>

                    {conferenceStandings.map((line) => {
                      const team = findProgram(line.programId);
                      return (
                        <div className="table-row" key={line.programId}>
                          <div className="table-cell table-cell--program">
                            <strong>{team?.school ?? line.programId}</strong>
                            <span>{team?.nickname ?? team?.conference ?? selectedConference}</span>
                          </div>
                          <div className="table-cell">{line.conferenceWins}-{line.conferenceLosses}</div>
                          <div className="table-cell">{line.overallWins}-{line.overallLosses}</div>
                          <div className="table-cell">{line.runsScored}</div>
                          <div className="table-cell">{line.runsAllowed}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {selectedTab === 'settings' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Settings</p>
                    <h2>Presentation and franchise controls</h2>
                  </div>
                  <div className="screen__meta">Tune how ratings read, then manage resets from one place</div>
                </div>

                <div className="two-column">
                  <div className="mini-table">
                    <div className="mini-table__header">
                      <Settings2 size={16} />
                      <strong>Ratings display</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Current mode</span>
                        <strong>{formatRatingLabel(ratingDisplay)}</strong>
                      </div>
                      <div className="settings-options">
                        <button className={classNames('ui-button', ratingDisplay === '100' && 'ui-button--primary')} onClick={() => setRatingDisplay('100')}>
                          0-100 Scale
                        </button>
                        <button className={classNames('ui-button', ratingDisplay === '20-80' && 'ui-button--primary')} onClick={() => setRatingDisplay('20-80')}>
                          20-80 Scout
                        </button>
                        <button className={classNames('ui-button', ratingDisplay === 'stars' && 'ui-button--primary')} onClick={() => setRatingDisplay('stars')}>
                          Star Ratings
                        </button>
                      </div>
                      <div className="mini-table__row">
                        <span>Where it applies</span>
                        <strong>Roster cards, overall/potential, and tool breakdowns all follow this setting.</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-table__header">
                      <ArrowRightLeft size={16} />
                      <strong>Morale system explainer</strong>
                    </div>
                    <div className="mini-table__body">
                      <div className="mini-table__row">
                        <span>Morale</span>
                        <strong>How happy the player feels inside the program right now.</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Stay score</span>
                        <strong>Morale plus role security, scholarship support, and NIL strength.</strong>
                      </div>
                      <div className="mini-table__row">
                        <span>Use it for</span>
                        <strong>Spotting players you need to retain before the portal window opens.</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mini-table">
                  <div className="mini-table__header">
                    <CalendarDays size={16} />
                    <strong>Season controls</strong>
                  </div>
                  <div className="mini-table__body">
                    <div className="mini-table__row">
                      <span>Restart season</span>
                      <button
                        className="ui-button ui-button--ghost"
                        onClick={() => {
                          if (window.confirm(`Restart the ${program.school} season schedule and clear all played games?`)) {
                            restartSeason();
                          }
                        }}
                      >
                        Reset season
                      </button>
                    </div>
                    <div className="mini-table__row">
                      <span>Restart franchise</span>
                      <button
                        className="ui-button ui-button--danger"
                        onClick={() => {
                          if (window.confirm(`Delete this franchise save and return to the main menu?`)) {
                            wipeSave();
                          }
                        }}
                      >
                        Wipe save
                      </button>
                    </div>
                    <div className="mini-table__row">
                      <span>Jump to dashboard</span>
                      <button className="ui-button ui-button--ghost" onClick={() => setSelectedTab('overview')}>
                        League home
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {selectedTab === 'preview' && (
              <section className="screen">
                <div className="screen__header">
                  <div>
                    <p className="ui-kicker">Day View</p>
                    <h2>{nextUserGame ? `${program.school} vs. ${nextOpponentProgram?.school ?? 'Opponent'}` : 'No game scheduled'}</h2>
                  </div>
                  <div className="screen__meta">
                    {dayViewStatusLabel}
                  </div>
                </div>

                <div className="info-panels">
                  <article className="info-panel">
                    <span>Next game</span>
                    <strong>{nextUserGame?.dayLabel ?? 'None scheduled'}</strong>
                    <p>{dayViewSummary}</p>
                  </article>
                  <article className="info-panel">
                    <span>Probable starter</span>
                    <strong>{userProjection?.starter?.name ?? '—'}</strong>
                    <p>{userProjection?.starter ? `${userProjection.starter.primaryPosition} • STF ${formatRatingValue(userProjection.starter.pitching?.stuff ?? 0, ratingDisplay)} / CMD ${formatRatingValue(userProjection.starter.pitching?.command ?? 0, ratingDisplay)}` : 'Certify roster to generate projected arms.'}</p>
                  </article>
                  <article className="info-panel">
                    <span>Opponent starter</span>
                    <strong>{opponentProjection?.starter?.name ?? '—'}</strong>
                    <p>{opponentProjection?.starter ? `${opponentProjection.starter.primaryPosition} • STF ${formatRatingValue(opponentProjection.starter.pitching?.stuff ?? 0, ratingDisplay)} / CMD ${formatRatingValue(opponentProjection.starter.pitching?.command ?? 0, ratingDisplay)}` : 'Opponent projection unavailable.'}</p>
                  </article>
                  <article className="info-panel">
                    <span>{isSeasonActive ? 'Season record' : 'Today’s focus'}</span>
                    <strong>{isSeasonActive ? currentRecord : calendarLabel}</strong>
                    <p>{isSeasonActive ? 'Sim Game finalizes only this matchup; Advance Day moves the whole league calendar.' : dayViewFocus}</p>
                  </article>
                </div>

                <div className="toolbar-row">
                  {primaryDayAction && (
                    <button
                      className={primaryDayAction.className}
                      disabled={primaryDayAction.disabled}
                      onClick={primaryDayAction.onClick}
                    >
                      <primaryDayAction.icon size={15} />
                      {primaryDayAction.label}
                    </button>
                  )}
                  <button
                    className="ui-button"
                    disabled={isSimulating}
                    onClick={() => runSimAction('day', advanceWeek)}
                  >
                    <CalendarDays size={15} />
                    {simulatingAction === 'day' ? 'Advancing...' : 'Advance Day'}
                  </button>
                </div>

                {dayViewActions.length > 0 && (
                  <div className="day-action-grid">
                    {dayViewActions.map((action) => (
                      <article className="info-panel day-action-card" key={action.id}>
                        <div className="day-action-card__header">
                          <span>{action.label}</span>
                          <action.icon size={16} />
                        </div>
                        <p>{action.description}</p>
                        <button
                          className={action.tone === 'primary' ? 'ui-button ui-button--primary' : action.tone === 'ghost' ? 'ui-button ui-button--ghost' : 'ui-button'}
                          onClick={action.onClick}
                        >
                          Open {action.label}
                        </button>
                      </article>
                    ))}
                  </div>
                )}

                {isSimulating && (
                  <div className="sim-status" aria-live="polite" aria-busy="true">
                    <div className="sim-status__spinner" aria-hidden="true" />
                    <div>
                      <strong>{simulatingLabel}</strong>
                      <p>Crunching the schedule, box score, and roster updates.</p>
                    </div>
                  </div>
                )}

                {nextUserGame && userProjection && opponentProjection && (
                  <div className="two-column">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>{program.school} projected lineup</span>
                        <span>Starter: {userProjection.starter?.name ?? '—'}</span>
                      </div>
                      <div className="table-grid table-grid--projected-lineup">
                        <div className="table-head">Slot</div>
                        <div className="table-head">Player</div>
                        <div className="table-head">POS</div>
                        <div className="table-head">OVR</div>
                        <div className="table-head">Tools</div>

                        {userProjection.lineup.map((player, index) => (
                          <div className="table-row" key={player.id}>
                            <div className="table-cell">{index + 1}</div>
                            <div className="table-cell table-cell--program">
                              <strong>{player.name}</strong>
                              <span>{player.bats}/{player.throws} • {player.hometown}</span>
                            </div>
                            <div className="table-cell">{player.primaryPosition}</div>
                            <div className="table-cell">{formatRatingValue(player.overall, ratingDisplay)}</div>
                            <div className="table-cell">{playerToolsLabel(player, ratingDisplay)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>{nextOpponentProgram?.school ?? 'Opponent'} projected lineup</span>
                        <span>Starter: {opponentProjection.starter?.name ?? '—'}</span>
                      </div>
                      <div className="table-grid table-grid--projected-lineup">
                        <div className="table-head">Slot</div>
                        <div className="table-head">Player</div>
                        <div className="table-head">POS</div>
                        <div className="table-head">OVR</div>
                        <div className="table-head">Tools</div>

                        {opponentProjection.lineup.map((player, index) => (
                          <div className="table-row" key={player.id}>
                            <div className="table-cell">{index + 1}</div>
                            <div className="table-cell table-cell--program">
                              <strong>{player.name}</strong>
                              <span>{player.bats}/{player.throws} • {player.hometown}</span>
                            </div>
                            <div className="table-cell">{player.primaryPosition}</div>
                            <div className="table-cell">{formatRatingValue(player.overall, ratingDisplay)}</div>
                            <div className="table-cell">{playerToolsLabel(player, ratingDisplay)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {dayResultIsUserGame && dayResult && (
                  <div className="scorebox">
                    <div className="scorebox__line">
                      <strong>{program.school}</strong>
                      <span>{userRuns}</span>
                    </div>
                    <div className="scorebox__line">
                      <strong>{findProgram(dayResult.homeProgramId === save.userProgramId ? dayResult.awayProgramId : dayResult.homeProgramId)?.school}</strong>
                      <span>{oppRuns}</span>
                    </div>
                    <p className="ui-muted">
                      Winning pitcher: {dayResult.winningPitcher} • Losing pitcher: {dayResult.losingPitcher}
                    </p>

                    <div className="two-column">
                      <div className="table-shell">
                        <div className="table-toolbar">
                          <span>User team batting box</span>
                        </div>
                        <div className="table-grid table-grid--box-batting">
                          <div className="table-head">Player</div>
                          <div className="table-head">AB</div>
                          <div className="table-head">R</div>
                          <div className="table-head">H</div>
                          <div className="table-head">RBI</div>
                          <div className="table-head">BB</div>
                          <div className="table-head">SO</div>
                          <div className="table-head">XBH</div>

                          {(dayResult.homeProgramId === save.userProgramId ? dayResult.homeBattingLines : dayResult.awayBattingLines)
                            .slice()
                            .sort((left, right) => right.plateAppearances - left.plateAppearances)
                            .map((line) => (
                              <div className="table-row" key={line.playerId}>
                                <div className="table-cell table-cell--program">
                                  <strong>{line.playerName}</strong>
                                  <span>{line.position}</span>
                                </div>
                                <div className="table-cell">{line.atBats}</div>
                                <div className="table-cell">{line.runs}</div>
                                <div className="table-cell">{line.hits}</div>
                                <div className="table-cell">{line.runsBattedIn}</div>
                                <div className="table-cell">{line.walks}</div>
                                <div className="table-cell">{line.strikeouts}</div>
                                <div className="table-cell">{line.doubles + line.triples + line.homeRuns}</div>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="table-shell">
                        <div className="table-toolbar">
                          <span>User team pitching box</span>
                        </div>
                        <div className="table-grid table-grid--box-pitching">
                          <div className="table-head">Pitcher</div>
                          <div className="table-head">IP</div>
                          <div className="table-head">R</div>
                          <div className="table-head">BB</div>
                          <div className="table-head">SO</div>
                          <div className="table-head">HR</div>

                          {(dayResult.homeProgramId === save.userProgramId ? dayResult.homePitchingLines : dayResult.awayPitchingLines)
                            .filter((line) => line.outsRecorded > 0 || line.gamesStarted > 0)
                            .map((line) => (
                              <div className="table-row" key={line.playerId}>
                                <div className="table-cell table-cell--program">
                                  <strong>{line.playerName}</strong>
                                  <span>{line.gamesStarted ? 'Starter' : 'Reliever'}</span>
                                </div>
                                <div className="table-cell">{inningsText(line.outsRecorded)}</div>
                                <div className="table-cell">{line.runsAllowed}</div>
                                <div className="table-cell">{line.walks}</div>
                                <div className="table-cell">{line.strikeouts}</div>
                                <div className="table-cell">{line.homeRunsAllowed}</div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className="log-shell">
                      {dayResult.keyMoments.map((moment, index) => (
                        <div className="log-row" key={`${moment.text}-${index}`}>
                          {moment.half === 'top' ? 'Top' : 'Bottom'} {moment.inning}: {moment.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {selectedTab === 'stats' && seasonSnapshot && (
              <>
                <section className="screen">
                  <div className="screen__header">
                    <div>
                      <p className="ui-kicker">League Overview</p>
                      <h2>Division I landscape, polls, RPI, and recent results</h2>
                    </div>
                    <div className="screen__meta">A D1Baseball-style home page with resume-driven rankings and bias tuned for writers, coaches, and the RPI sheet.</div>
                  </div>

                  <div className="league-overview-hero">
                    <div className="league-overview-hero__lead">
                      <div className="league-overview-hero__copy">
                        <p className="ui-kicker">National Snapshot</p>
                        <h3>{program.school} in the national picture</h3>
                        <p className="ui-muted">
                          {userResumeMetrics
                            ? `${currentRecord} overall with ${userResumeMetrics.qualityWins} quality wins, ${userResumeMetrics.roadWins} road wins, and ${userResumeMetrics.badLosses} bad losses shaping the current profile.`
                            : 'Advance into the schedule to build a real national resume and populate the polling logic.'}
                        </p>
                      </div>

                      <div className="info-panels info-panels--rankings">
                        <div className="info-panel">
                          <span>AP Position</span>
                          <strong>{userApRank ? `#${userApRank.rank}` : 'Unranked'}</strong>
                          <p>{userApRank ? `${formatTrend(userApRank.trend)} movement with a ${userApRank.record} record.` : 'Writers need more resume to pull your club into the poll.'}</p>
                        </div>
                        <div className="info-panel">
                          <span>Coaches Position</span>
                          <strong>{userCoachesRank ? `#${userCoachesRank.rank}` : 'Unranked'}</strong>
                          <p>{userCoachesRank ? `${formatTrend(userCoachesRank.trend)} movement with roster/staff context baked in.` : 'Coaches are not sold on the weekend profile yet.'}</p>
                        </div>
                        <div className="info-panel">
                          <span>RPI</span>
                          <strong>{userRpiRank ? `#${userRpiRank.rank}` : 'N/A'}</strong>
                          <p>{userResumeMetrics ? `RPI ${formatMetric(userResumeMetrics.rpi)} with OWP ${formatMetric(userResumeMetrics.owp)}.` : 'No resume sheet until games are logged.'}</p>
                        </div>
                        <div className="info-panel">
                          <span>Resume Snapshot</span>
                          <strong>{userResumeMetrics ? `${userResumeMetrics.qualityWins} quality wins` : 'No games yet'}</strong>
                          <p>{userResumeMetrics ? `${userResumeMetrics.roadWins} road wins, ${userResumeMetrics.badLosses} bad losses, streak ${userResumeMetrics.streak > 0 ? `W${userResumeMetrics.streak}` : userResumeMetrics.streak < 0 ? `L${Math.abs(userResumeMetrics.streak)}` : 'Even'}.` : 'Advance the season to build a real national resume.'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="table-shell ranking-board ranking-board--featured">
                      <div className="table-toolbar ranking-board__toolbar">
                        <div>
                          <span>Top 25 Overview</span>
                          <span>{rankingRows.find((board) => board.title === overviewPollTab)?.subtitle}</span>
                        </div>
                        <div className="poll-tabs" role="tablist" aria-label="League overview poll selector">
                          {rankingRows.map((board) => (
                            <button
                              key={`tab-${board.title}`}
                              className={classNames('poll-tab', overviewPollTab === board.title && 'is-active')}
                              onClick={() => setOverviewPollTab(board.title)}
                              type="button"
                            >
                              {board.title}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="table-grid table-grid--rankings-simplified">
                        <div className="table-head">#</div>
                        <div className="table-head">Team</div>
                        <div className="table-head">Trend</div>

                        {rankingRows.find((board) => board.title === overviewPollTab)?.rows.slice(0, 25).map((row) => {
                          const team = findProgram(row.programId);
                          const isUser = row.programId === save.userProgramId;
                          return (
                            <div className="table-row" key={`${overviewPollTab}-${row.programId}`}>
                              <div className={classNames('table-cell', 'table-cell--rank', isUser && 'table-cell--user-highlight')}>
                                <strong>{row.rank}</strong>
                              </div>
                              <div className={classNames('table-cell', 'table-cell--program', isUser && 'table-cell--user-highlight')}>
                                <strong>{team?.school ?? row.programId}</strong>
                                <span>{row.record} • {row.note}</span>
                              </div>
                              <div className={classNames('table-cell', 'table-cell--trend', isUser && 'table-cell--user-highlight')}>
                                <span>{formatTrend(row.trend)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="ranking-board__votes">
                        <span>Receiving votes</span>
                        <p>{rankingRows.find((board) => board.title === overviewPollTab)?.receivingVotes.map((row) => findProgram(row.programId)?.school ?? row.programId).join(', ') || 'None yet'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="two-column two-column--overview-results">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Major results</span>
                        <span>Biggest final scores from the current season database</span>
                      </div>
                      <div className="table-grid table-grid--league-results">
                        <div className="table-head">Game</div>
                        <div className="table-head">Score</div>
                        <div className="table-head">Type</div>

                        {majorLeagueResults.length ? majorLeagueResults.map((result) => (
                          <div className="table-row" key={result.id}>
                            <div className="table-cell">{result.label}</div>
                            <div className="table-cell">{result.score}</div>
                            <div className="table-cell">{result.note}</div>
                          </div>
                        )) : (
                          <div className="table-row">
                            <div className="table-cell">No final games yet</div>
                            <div className="table-cell">—</div>
                            <div className="table-cell">Play a day to populate this board.</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="scorebox">
                      <div className="screen__header">
                        <div>
                          <p className="ui-kicker">Methodology</p>
                          <h3>How the boards think</h3>
                        </div>
                      </div>
                      <div className="scorebox__line">
                        <span>AP</span>
                        <strong>Resume + quality wins + road work + a little brand inertia.</strong>
                      </div>
                      <div className="scorebox__line">
                        <span>Coaches</span>
                        <strong>Roster strength, staff quality, and clean weekend consistency matter more.</strong>
                      </div>
                      <div className="scorebox__line">
                        <span>RPI</span>
                        <strong>{completedLeagueGames.length ? '25% record, 50% opponent win %, 25% opponent-opponent win %.' : 'Waiting on real games before the formula has teeth.'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="two-column">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>User team batting</span>
                      </div>
                      <div className="table-grid table-grid--season-batting">
                        <div className="table-head">Player</div>
                        <div className="table-head">PA</div>
                        <div className="table-head">AVG</div>
                        <div className="table-head">OPS</div>
                        <div className="table-head">HR</div>
                        <div className="table-head">RBI</div>
                        <div className="table-head">BB</div>

                        {seasonSnapshot.userTeamBatting.slice(0, 14).map((line) => (
                          <div className="table-row" key={line.playerId}>
                            <div className="table-cell table-cell--program">
                              <strong>{line.playerName}</strong>
                              <span>{line.position}</span>
                            </div>
                            <div className="table-cell">{line.plateAppearances}</div>
                            <div className="table-cell">{battingAverage(line.atBats, line.hits)}</div>
                            <div className="table-cell">{ops(line.atBats, line.hits, line.doubles, line.triples, line.homeRuns, line.walks, line.plateAppearances)}</div>
                            <div className="table-cell">{line.homeRuns}</div>
                            <div className="table-cell">{line.runsBattedIn}</div>
                            <div className="table-cell">{line.walks}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>User team pitching</span>
                      </div>
                      <div className="table-grid table-grid--season-pitching">
                        <div className="table-head">Pitcher</div>
                        <div className="table-head">IP</div>
                        <div className="table-head">ERA</div>
                        <div className="table-head">WHIP</div>
                        <div className="table-head">W-L</div>
                        <div className="table-head">SO</div>
                        <div className="table-head">SV</div>

                        {seasonSnapshot.userTeamPitching.slice(0, 12).map((line) => (
                          <div className="table-row" key={line.playerId}>
                            <div className="table-cell table-cell--program">
                              <strong>{line.playerName}</strong>
                              <span>{line.gamesStarted ? 'SP' : 'RP'}</span>
                            </div>
                            <div className="table-cell">{inningsText(line.outsRecorded)}</div>
                            <div className="table-cell">{era(line.outsRecorded, line.earnedRuns)}</div>
                            <div className="table-cell">{whip(line.outsRecorded, line.hitsAllowed, line.walks)}</div>
                            <div className="table-cell">{line.wins}-{line.losses}</div>
                            <div className="table-cell">{line.strikeouts}</div>
                            <div className="table-cell">{line.saves}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="table-shell">
                    <div className="table-toolbar">
                      <span>User team fielding</span>
                    </div>
                    <div className="table-grid table-grid--season-fielding">
                      <div className="table-head">Player</div>
                      <div className="table-head">Chances</div>
                      <div className="table-head">PO</div>
                      <div className="table-head">A</div>
                      <div className="table-head">E</div>
                      <div className="table-head">FPCT</div>

                      {seasonSnapshot.userTeamFielding.slice(0, 12).map((line) => (
                        <div className="table-row" key={line.playerId}>
                          <div className="table-cell table-cell--program">
                            <strong>{line.playerName}</strong>
                            <span>{line.position}</span>
                          </div>
                          <div className="table-cell">{line.chances}</div>
                          <div className="table-cell">{line.putouts}</div>
                          <div className="table-cell">{line.assists}</div>
                          <div className="table-cell">{line.errors}</div>
                          <div className="table-cell">{fieldingPct(line.chances, line.errors)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="screen">
                  <div className="screen__header">
                    <div>
                      <p className="ui-kicker">League Leaders</p>
                      <h2>Teams and individual leaderboards</h2>
                    </div>
                  </div>

                  <div className="two-column">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Team standings / stat leaders</span>
                      </div>
                      <div className="table-grid table-grid--team-stats">
                        <div className="table-head">Team</div>
                        <div className="table-head">W-L</div>
                        <div className="table-head">RS</div>
                        <div className="table-head">RA</div>
                        <div className="table-head">HR</div>
                        <div className="table-head">ERA</div>
                        <div className="table-head">WHIP</div>

                        {seasonSnapshot.teamStats.slice(0, 12).map((line) => (
                          <div className="table-row" key={line.programId}>
                            <div className="table-cell table-cell--program">
                              <strong>{findProgram(line.programId)?.school}</strong>
                              <span>{findProgram(line.programId)?.conference}</span>
                            </div>
                            <div className="table-cell">{line.wins}-{line.losses}</div>
                            <div className="table-cell">{line.runsScored}</div>
                            <div className="table-cell">{line.runsAllowed}</div>
                            <div className="table-cell">{line.homeRuns}</div>
                            <div className="table-cell">{line.era.toFixed(2)}</div>
                            <div className="table-cell">{line.whip.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Batting leaders</span>
                      </div>
                      <div className="table-grid table-grid--leaders-batting">
                        <div className="table-head">Player</div>
                        <div className="table-head">Team</div>
                        <div className="table-head">AVG</div>
                        <div className="table-head">OPS</div>
                        <div className="table-head">HR</div>
                        <div className="table-head">RBI</div>

                        {seasonSnapshot.battingLeaders.slice(0, 10).map((line) => (
                          <div className="table-row" key={line.playerId}>
                            <div className="table-cell table-cell--program">
                              <strong>{line.playerName}</strong>
                              <span>{line.position}</span>
                            </div>
                            <div className="table-cell">{findProgram(line.programId)?.school}</div>
                            <div className="table-cell">{battingAverage(line.atBats, line.hits)}</div>
                            <div className="table-cell">{ops(line.atBats, line.hits, line.doubles, line.triples, line.homeRuns, line.walks, line.plateAppearances)}</div>
                            <div className="table-cell">{line.homeRuns}</div>
                            <div className="table-cell">{line.runsBattedIn}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="two-column">
                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Pitching leaders</span>
                      </div>
                      <div className="table-grid table-grid--leaders-pitching">
                        <div className="table-head">Pitcher</div>
                        <div className="table-head">Team</div>
                        <div className="table-head">ERA</div>
                        <div className="table-head">WHIP</div>
                        <div className="table-head">SO</div>
                        <div className="table-head">W</div>

                        {seasonSnapshot.pitchingLeaders.slice(0, 10).map((line) => (
                          <div className="table-row" key={line.playerId}>
                            <div className="table-cell table-cell--program">
                              <strong>{line.playerName}</strong>
                              <span>{line.gamesStarted ? 'SP' : 'RP'}</span>
                            </div>
                            <div className="table-cell">{findProgram(line.programId)?.school}</div>
                            <div className="table-cell">{era(line.outsRecorded, line.earnedRuns)}</div>
                            <div className="table-cell">{whip(line.outsRecorded, line.hitsAllowed, line.walks)}</div>
                            <div className="table-cell">{line.strikeouts}</div>
                            <div className="table-cell">{line.wins}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="table-shell">
                      <div className="table-toolbar">
                        <span>Fielding leaders</span>
                      </div>
                      <div className="table-grid table-grid--leaders-fielding">
                        <div className="table-head">Player</div>
                        <div className="table-head">Team</div>
                        <div className="table-head">Chances</div>
                        <div className="table-head">E</div>
                        <div className="table-head">FPCT</div>

                        {seasonSnapshot.fieldingLeaders.slice(0, 10).map((line) => (
                          <div className="table-row" key={line.playerId}>
                            <div className="table-cell table-cell--program">
                              <strong>{line.playerName}</strong>
                              <span>{line.position}</span>
                            </div>
                            <div className="table-cell">{findProgram(line.programId)?.school}</div>
                            <div className="table-cell">{line.chances}</div>
                            <div className="table-cell">{line.errors}</div>
                            <div className="table-cell">{fieldingPct(line.chances, line.errors)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {selectedTab === 'polls' && seasonSnapshot && (
              <>
                <section className="screen">
                  <div className="screen__header">
                    <div>
                      <p className="ui-kicker">National Polls</p>
                      <h2>AP Top 25, Coaches Poll, and RPI</h2>
                    </div>
                    <div className="screen__meta">Deep dive into the 25-team boards and the teams receiving votes.</div>
                  </div>

                  <div className="three-column">
                    {rankingRows.map((board) => (
                      <div className="table-shell ranking-board" key={board.title}>
                        <div className="table-toolbar">
                          <span>{board.title}</span>
                          <span>{board.subtitle}</span>
                        </div>
                        <div className="table-grid table-grid--rankings">
                          <div className="table-head">#</div>
                          <div className="table-head">Team</div>
                          <div className="table-head">Rec</div>
                          <div className="table-head">{board.metricLabel}</div>

                          {board.rows.map((row) => {
                            const team = findProgram(row.programId);
                            const isUser = row.programId === save.userProgramId;
                            return (
                              <div className="table-row" key={`${board.title}-${row.programId}`}>
                                <div className={classNames('table-cell', 'table-cell--rank', isUser && 'table-cell--user-highlight')}>
                                  <strong>{row.rank}</strong>
                                  <span>{formatTrend(row.trend)}</span>
                                </div>
                                <div className={classNames('table-cell', 'table-cell--program', isUser && 'table-cell--user-highlight')}>
                                  <strong>{team?.school ?? row.programId}</strong>
                                  <span>{row.note}</span>
                                </div>
                                <div className={classNames('table-cell', isUser && 'table-cell--user-highlight')}>{row.record}</div>
                                <div className={classNames('table-cell', isUser && 'table-cell--user-highlight')}>{board.title === 'RPI' ? row.sortMetric : Math.round(row.score)}</div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="ranking-board__votes">
                          <span>Receiving votes</span>
                          <p>{board.receivingVotes.map((row) => findProgram(row.programId)?.school ?? row.programId).join(', ') || 'None yet'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="inspector">
            <section className="screen screen--inspector">
              <div className="screen__header">
                <div>
                  <p className="ui-kicker">Sidebar</p>
                  <h3>Shortlist</h3>
                </div>
              </div>

              <div className="inspector-block">
                <div className="inspector-block__title">
                  <BookOpen size={15} />
                  <strong>Top recruits</strong>
                </div>
                {topRecruits.map((recruit) => (
                  <div className="inspector-row" key={recruit.id}>
                    <span>{recruit.name}</span>
                    <strong>{recruit.stars}★</strong>
                  </div>
                ))}
              </div>

              <div className="inspector-block">
                <div className="inspector-block__title">
                  <ArrowRightLeft size={15} />
                  <strong>Portal targets</strong>
                </div>
                {openPortalEntries.map((entry) => (
                  <div className="inspector-row" key={entry.id}>
                    <span>{entry.player.name}</span>
                    <strong>{entry.player.overall}</strong>
                  </div>
                ))}
              </div>

              <div className="inspector-block">
                <div className="inspector-block__title">
                  <CircleAlert size={15} />
                  <strong>Compliance inbox</strong>
                </div>
                {flaggedReviews.length ? flaggedReviews.map((review) => (
                  <div className="inspector-row" key={review.id}>
                    <span>{review.verdict}</span>
                    <strong>{review.riskLevel}</strong>
                  </div>
                )) : <div className="inspector-empty">No active review flags.</div>}
              </div>

            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

export default App;
