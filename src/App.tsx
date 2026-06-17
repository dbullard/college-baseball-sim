import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  BadgeDollarSign,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleAlert,
  Flag,
  FolderKanban,
  GraduationCap,
  Mail,
  Settings2,
  ShieldAlert,
  Sparkles,
  Swords,
  Table2,
  Users,
} from 'lucide-react';
import { createRosterForProgram, findProgram, programs } from './data/programs';
import { createProgramSchedule } from './engine/simulator';
import { selectSeasonOutlook, useFranchiseStore } from './state/franchiseStore';
import type {
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
  id: 'overview' | 'mail' | 'roster' | 'player' | 'recruiting' | 'portal' | 'nil' | 'calendar' | 'settings' | 'preview' | 'stats';
  label: string;
  icon: typeof Users;
  group: 'Manager' | 'NCAA' | 'Team' | 'Hidden';
  hidden?: boolean;
}> = [
  { id: 'preview', label: 'Day View', icon: Swords, group: 'Manager' },
  { id: 'mail', label: 'Mail', icon: Mail, group: 'Manager' },
  { id: 'stats', label: 'League Overview', icon: BarChart3, group: 'NCAA' },
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

function transferOutlookForPlayer(player: Player, roster: Player[]): MoraleProfile {
  const samePosition = roster
    .filter((entry) => entry.primaryPosition === player.primaryPosition)
    .sort((left, right) => right.overall - left.overall);
  const depthRank = Math.max(1, samePosition.findIndex((entry) => entry.id === player.id) + 1);
  const scholarshipBoost = Math.min(14, Math.round(player.rosterStatus.scholarshipPct / 5));
  const nilBoost = Math.min(10, Math.round(player.rosterStatus.schoolNilValue / 4000));
  const depthBoost = depthRank === 1 ? 10 : depthRank === 2 ? 5 : depthRank <= 4 ? 1 : -6;
  const classBoost = player.classYear === 'SR' ? 8 : player.classYear === 'JR' ? 4 : player.classYear === 'FR' ? -3 : 0;
  const dissatisfactionPenalty = player.overall >= 78 && player.rosterStatus.scholarshipPct <= 10 ? 10 : 0;
  const stayScore = Math.max(
    1,
    Math.min(
      99,
      player.morale + scholarshipBoost + nilBoost + depthBoost + classBoost - dissatisfactionPenalty,
    ),
  );

  const reasons = [
    player.rosterStatus.scholarshipPct >= 40 ? 'Strong scholarship support helps anchor him to campus.' : 'Light scholarship support leaves room for outside pressure.',
    depthRank <= 2 ? `Projected ${depthRank === 1 ? 'starter' : 'top rotation/depth'} role supports playing-time confidence.` : 'Depth-chart squeeze could push him to look for a clearer role.',
    player.rosterStatus.schoolNilValue >= 12000 ? 'School NIL package is competitive for his current market.' : 'NIL package is modest enough that other schools could test it.',
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
  const [rosterSort, setRosterSort] = useState<{ key: RosterSortKey; direction: 'asc' | 'desc' }>({
    key: 'overall',
    direction: 'desc',
  });

  const openPlayerProfile = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setSelectedTab('player');
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
              <div className="table-head">10Y Avg RPI</div>
              <div className="table-head">Titles</div>
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
                  <div className="table-cell">{entry.prestige.history.avgRpiRank}</div>
                  <div className="table-cell">{entry.prestige.history.nationalTitles}</div>
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

  type RecruitSortKey = 'name' | 'position' | 'stars' | 'interest' | 'signability' | 'status';
  const [recruitSort, setRecruitSort] = useState<{ key: RecruitSortKey; direction: 'asc' | 'desc' }>({
    key: 'stars',
    direction: 'desc',
  });
  const toggleRecruitSort = (key: RecruitSortKey) => {
    setRecruitSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'name' || key === 'position' ? 'asc' : 'desc' });
  };
  const recruitSortLabel = (key: RecruitSortKey) => {
    if (recruitSort.key !== key) return '';
    return recruitSort.direction === 'asc' ? '▲' : '▼';
  };

  type PortalSortKey = 'name' | 'position' | 'overall' | 'ask' | 'interest' | 'risk';
  const [portalSort, setPortalSort] = useState<{ key: PortalSortKey; direction: 'asc' | 'desc' }>({
    key: 'overall',
    direction: 'desc',
  });
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
  const seasonSnapshot = save.seasonSnapshot;
  const leagueGames = save.season?.games ?? [];
  const completedLeagueGames = leagueGames.filter((game) => game.status === 'final' && game.result);
  const gameRecordById = new Map(leagueGames.map((game) => [game.id, game]));
  const activeTab = tabs.find((tab) => tab.id === selectedTab) ?? tabs[0];
  const userTeamSeasonLine = seasonSnapshot?.teamStats.find((line) => line.programId === save.userProgramId);
  const selectedPlayer = save.roster.find((player) => player.id === selectedPlayerId) ?? sortedRoster[0] ?? null;
  const selectedPlayerMorale = selectedPlayer ? transferOutlookForPlayer(selectedPlayer, save.roster) : null;
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
  const nextAdvanceLabel = isSeasonActive ? 'Advance One Day' : 'Advance One Week';
  const calendarLabel = isSeasonActive
    ? (save.season?.lastSimulatedDayLabel
      ?? save.season?.games.find((game) => game.status === 'scheduled')?.dayLabel
      ?? 'Opening Day')
    : (save.weeklyPlan.find((week) => week.week === save.currentWeek)?.label ?? `Week ${save.currentWeek}`);
  const currentRecord = userTeamSeasonLine ? `${userTeamSeasonLine.wins}-${userTeamSeasonLine.losses}` : '0-0';
  const hydrateProgramSchedule = (teamId: string) =>
    createProgramSchedule(teamId).map((context, index) => {
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
  const userUpcomingGames = userSchedule
    .filter((game) => game.status === 'scheduled')
    .slice(0, 8);
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
  const nextUserGame = userUpcomingGames[0] ?? null;
  const nextOpponentId = nextUserGame
    ? scheduleOpponentId(save.userProgramId, nextUserGame.context.homeProgramId, nextUserGame.context.awayProgramId)
    : null;
  const nextOpponentProgram = nextOpponentId ? findProgram(nextOpponentId) : null;
  const nextOpponentRoster = nextOpponentId ? createRosterForProgram(nextOpponentId) : [];
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

  const visibleTabs = tabs.filter((tab) => !tab.hidden || (tab.id === 'player' && selectedPlayer));
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
        <header className="topbar">
          <div className="topbar__breadcrumbs">
            <button className="crumb-button" onClick={() => setSelectedTab('stats')}>League Home</button>
            <span>/</span>
            <button className="crumb-button" onClick={() => setSelectedTab('overview')}>{program.school}</button>
            <span>/</span>
            {selectedTab === 'player' && selectedPlayer ? (
              <strong>{selectedPlayer.name}</strong>
            ) : (
              <strong>{activeTab.label}</strong>
            )}
          </div>

          <div className="topbar__actions">
            <button className="ui-button" onClick={() => setSelectedTab('settings')}>
              <Settings2 size={15} />
              Settings
            </button>
            <button className="ui-button" onClick={() => certifyCurrentRoster()}>
              <Flag size={15} />
              Certify Roster
            </button>
            <button className="ui-button ui-button--primary" onClick={() => advanceWeek()}>
              <CalendarDays size={15} />
              {nextAdvanceLabel}
            </button>
          </div>
        </header>

        <section className="scorestrip">
          <article>
            <span>Record</span>
            <strong>{currentRecord}</strong>
          </article>
          <article>
            <span>Calendar</span>
            <strong>{calendarLabel}</strong>
          </article>
          <article>
            <span>Scholarships Committed</span>
            <strong>{scholarshipEquivalencies.toFixed(1)} / {program.resources.scholarshipBudget.toFixed(1)}</strong>
          </article>
          <article>
            <span>Scholarships Left</span>
            <strong>{scholarshipAvailable.toFixed(1)} equiv.</strong>
          </article>
          <article>
            <span>School NIL Committed</span>
            <strong>{money(schoolNilCommitted)}</strong>
          </article>
          <article>
            <span>Pitchers / Hitters</span>
            <strong>{pitcherCount} / {hitterCount}</strong>
          </article>
          <article>
            <span>10Y Avg RPI</span>
            <strong>{program.prestige.history.avgRpiRank}</strong>
          </article>
          <article>
            <span>National Titles</span>
            <strong>{program.prestige.history.nationalTitles}</strong>
          </article>
          <article>
            <span>CWS Trips</span>
            <strong>{program.prestige.history.cwsTrips}</strong>
          </article>
          <article>
            <span>Projected Wins</span>
            <strong>{seasonOutlook?.averageWins ?? '—'}</strong>
          </article>
        </section>

        <section className="workspace-grid">
          <div className="workspace-main">
            {selectedTab === 'overview' && (
              <>
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

                  <div className="two-column">
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

                    <div className="two-column">
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
                            <span>{player.archetype}</span>
                          </div>
                          <div className="table-cell">{player.primaryPosition}</div>
                          <div className="table-cell">{player.classYear}</div>
                          <div className="table-cell">{formatRatingValue(player.overall, ratingDisplay)}</div>
                          <div className="table-cell">{formatRatingValue(player.potential, ratingDisplay)}</div>
                          <div className="table-cell">{playerToolsLabel(player, ratingDisplay)}</div>
                          <div className="table-cell">{player.rosterStatus.scholarshipPct}%</div>
                          <div className="table-cell">{money(player.rosterStatus.schoolNilValue)}</div>
                          <div className="table-cell table-cell--actions">
                            <button className="ui-button ui-button--ghost" onClick={() => openPlayerProfile(player.id)}>
                              View
                            </button>
                            <button className="ui-button ui-button--ghost" onClick={() => releasePlayer(player.id)}>
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
                    {selectedPlayer.classYear} • {selectedPlayer.primaryPosition} • {selectedPlayer.archetype} • Ratings {formatRatingLabel(ratingDisplay)}
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
                          <div className="table-cell">No live season stats yet. Advance into the schedule to build this page out.</div>
                        </div>
                      )}
                    </div>
                  </div>

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
                          <div className="table-cell">
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
                          <div className="table-cell">Game-by-game lines will appear here once this player logs live season results.</div>
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
                    <div className="table-head">Region</div>
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
                      <div className="table-row" key={recruit.id}>
                        <div className="table-cell table-cell--program">
                          <button className="crumb-button" style={{ fontSize: 'inherit', fontWeight: 'bold' }} onClick={() => { setSelectedRecruitId(recruit.id); setRecruitingView('profile'); setOfferNIL(recruit.userOffer?.nilValue ?? 0); setOfferScholly(recruit.userOffer?.scholarshipPct ?? 0); }}>{recruit.name}</button>
                          <span>{recruit.marketability} marketability</span>
                        </div>
                        <div className="table-cell">{recruit.primaryPosition}</div>
                        <div className="table-cell">{recruit.stars}</div>
                        <div className="table-cell">{recruit.region}</div>
                        <div className="table-cell">{recruit.interest} • {interestLabel(recruit.interest)}</div>
                        <div className="table-cell">{recruit.signability} • {signabilityLabel(recruit.signability)}</div>
                        <div className="table-cell">{recruitingNeeds.some((need) => need.position === recruit.primaryPosition && need.urgency >= 4) ? 'Priority' : 'Depth'}</div>
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
                    ))}
                  </div>
                </div>
            )}


            {recruitingView === 'profile' && (() => {
              const recruit = save.recruits.find((r) => r.id === selectedRecruitId);
              if (!recruit) return null;
              return (
                <div className="table-shell" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                      <button className="crumb-button" onClick={() => setRecruitingView('freshmen')}>← Back to Freshmen</button>
                      <h2 style={{ marginTop: '8px' }}>{recruit.name}</h2>
                      <div className="screen__meta">{recruit.primaryPosition} • {recruit.stars}★ • {recruit.region} • {recruit.marketability} Marketability</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Interest: {recruit.interest}</div>
                      <div className="screen__meta">{recruit.committedProgramId ? 'Committed' : recruit.targeted ? 'Targeted' : 'Open'}</div>
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
                          <div className="mini-table__row"><span>Likely to Sign</span><strong>{recruit.signability}</strong></div>
                        </div>
                      </div>

                      <div className="mini-table" style={{ marginTop: '16px' }}>
                        <div className="mini-table__header"><strong>Preferences</strong></div>
                        <div className="mini-table__body">
                          <div className="mini-table__row"><span>Proximity</span><strong>{recruit.preferences.proximity}</strong></div>
                          <div className="mini-table__row"><span>Playing Time</span><strong>{recruit.preferences.playingTime}</strong></div>
                          <div className="mini-table__row"><span>Prestige</span><strong>{recruit.preferences.prestige}</strong></div>
                          <div className="mini-table__row"><span>NIL</span><strong>{recruit.preferences.nil}</strong></div>
                          <div className="mini-table__row"><span>Development</span><strong>{recruit.preferences.development}</strong></div>
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
                          <span>{entry.player.archetype}</span>
                        </div>
                        <div className="table-cell">{findProgram(entry.originProgramId)?.school}</div>
                        <div className="table-cell">{entry.player.primaryPosition}</div>
                        <div className="table-cell">{entry.player.overall}</div>
                        <div className="table-cell">{entry.askingScholarshipPct}% equiv. + {money(entry.askingSchoolNil)}</div>
                        <div className="table-cell">{entry.interest} • {interestLabel(entry.interest)}</div>
                        <div className="table-cell">{entry.tamperRisk} • {transferRiskLabel(entry.tamperRisk)}</div>
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
                  <div className="screen__meta">Future home for injuries, eligibility notes, coach messages, and league notices</div>
                </div>

                <div className="mail-empty">
                  <BookOpen size={18} />
                  <strong>No messages yet</strong>
                  <p>
                    This inbox will eventually carry player injury updates, eligibility warnings,
                    recruiting communication, and other front-office notes that need your attention.
                  </p>
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
                        className="ui-button ui-button--ghost"
                        onClick={() => {
                          if (window.confirm(`Restart ${program.school} and erase current progress?`)) {
                            restartFranchise();
                          }
                        }}
                      >
                        Reset save
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
                    <h2>{nextUserGame ? `${program.school} vs. ${nextOpponentProgram?.school ?? 'Opponent'}` : 'No upcoming game'}</h2>
                  </div>
                  <div className="screen__meta">
                    {nextUserGame ? `${nextUserGame.dayLabel} • ${nextUserGame.context.gameType} • G${nextUserGame.context.seriesGameNumber}` : 'Season calendar is complete'}
                  </div>
                </div>

                <div className="info-panels">
                  <article className="info-panel">
                    <span>Next game</span>
                    <strong>{nextUserGame?.dayLabel ?? 'Complete'}</strong>
                    <p>{nextUserGame ? `${gameSiteLabel(save.userProgramId, nextUserGame.context.homeProgramId, nextUserGame.context.awayProgramId)} against ${nextOpponentProgram?.school ?? 'Opponent'}.` : 'There are no scheduled user games left.'}</p>
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
                    <span>Season record</span>
                    <strong>{currentRecord}</strong>
                    <p>Sim Game finalizes only this matchup; Advance Day moves the whole league calendar.</p>
                  </article>
                </div>

                <div className="toolbar-row">
                  <button
                    className="ui-button ui-button--primary"
                    disabled={!nextUserGame}
                    onClick={() => simulateNextUserGame()}
                  >
                    <Swords size={15} />
                    Sim Game
                  </button>
                  <button className="ui-button" onClick={() => advanceWeek()}>
                    <CalendarDays size={15} />
                    Advance Day
                  </button>
                </div>

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
                              <span>{player.archetype}</span>
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
                              <span>{player.archetype}</span>
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
                      <h2>Division I landscape, rankings, and recent results</h2>
                    </div>
                    <div className="screen__meta">A D1Baseball-style home page for the current season database</div>
                  </div>

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

              <div className="inspector-block">
                <div className="inspector-block__title">
                  <BarChart3 size={15} />
                  <strong>League notes</strong>
                </div>
                <ul className="compact-list">
                  <li>Midweeks are intentionally looser than weekend openers.</li>
                  <li>Bullpen trust is one of the main upset levers.</li>
                  <li>Prestige shapes roster building, not direct game outcomes.</li>
                </ul>
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

export default App;
