export type Handedness = 'L' | 'R' | 'S';
export type PlayerRole = 'hitter' | 'pitcher' | 'two-way';
export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR';
export type PlayerArchetype =
  | 'table-setter'
  | 'slugger'
  | 'contact-bat'
  | 'glove-first'
  | 'power-arm'
  | 'command-arm'
  | 'bullpen-fireman'
  | 'two-way-star';
export type Position =
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF'
  | 'DH'
  | 'SP'
  | 'RP';
export type SeasonPhase =
  | 'setup'
  | 'roster-audit'
  | 'recruiting'
  | 'portal'
  | 'compliance'
  | 'certification'
  | 'opening-day'
  | 'in-season'
  | 'season-complete';
export type DealStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'flagged';
export type PostseasonStage = 'regular-season' | 'conference' | 'regional' | 'super-regional' | 'mcws';
export type WeekFocus = 'recruiting' | 'portal' | 'compliance' | 'roster' | 'opening-day';
export type RecruitingActionId =
  | 'scout'
  | 'call'
  | 'campus-visit'
  | 'development-pitch'
  | 'nil-presentation'
  | 'playing-time-pitch';
export type RatingDisplayMode = '100' | '20-80' | 'stars';

export interface OffenseRatings {
  contact: number;
  power: number;
  eye: number;
  avoidK: number;
  gap: number;
  speed: number;
  baserunning: number;
}

export interface DefenseRatings {
  defense: number;
  arm: number;
}

export interface PitchingRatings {
  stuff: number;
  command: number;
  movement: number;
  stamina: number;
  composure: number;
  groundBall: number;
}

export interface PlayerPreferences {
  proximity: number;
  playingTime: number;
  prestige: number;
  nil: number;
  development: number;
}

export interface RosterStatus {
  scholarshipPct: number;
  schoolNilValue: number;
  thirdPartyNilValue: number;
  fatigue: number;
  injuryRisk: number;
  certified: boolean;
}

export interface Player {
  id: string;
  name: string;
  hometown: string;
  programId: string;
  classYear: ClassYear;
  eligibilityYears: number;
  age: number;
  role: PlayerRole;
  primaryPosition: Position;
  secondaryPositions: Position[];
  bats: Handedness;
  throws: Handedness;
  archetype: PlayerArchetype;
  overall: number;
  potential: number;
  signability: number;
  marketability: number;
  morale: number;
  durability: number;
  developmentCurve: number;
  preferences: PlayerPreferences;
  offense?: OffenseRatings;
  defense?: DefenseRatings;
  pitching?: PitchingRatings;
  rosterStatus: RosterStatus;
}

export interface PrestigeHistorySummary {
  avgRpiRank: number;
  topEightRpiFinishes: number;
  nationalTitles: number;
  cwsFinals: number;
  cwsTrips: number;
  superRegionalTrips: number;
  regionalTrips: number;
  recentTrend: number;
}

export interface PrestigeProfile {
  overall: number;
  competitivePrestige: number;
  developmentReputation: number;
  nilAttractiveness: number;
  conferenceModifier: number;
  momentumModifier: number;
  history: PrestigeHistorySummary;
}

export interface ProgramResources {
  scholarshipBudget: number;
  schoolNilPool: number;
  donorConfidence: number;
  facilities: number;
}

export interface Program {
  id: string;
  school: string;
  nickname: string;
  conference: string;
  region: string;
  colors: {
    primary: string;
    secondary: string;
  };
  conferenceTier: number;
  parkFactor: number;
  travelDifficulty: number;
  resources: ProgramResources;
  prestige: PrestigeProfile;
}

export interface Recruit {
  id: string;
  name: string;
  primaryPosition: Position;
  region: string;
  stars: 2 | 3 | 4 | 5;
  interest: number;
  signability: number;
  developmentCurve: number;
  marketability: number;
  preferences: PlayerPreferences;
  offense?: OffenseRatings;
  defense?: DefenseRatings;
  pitching?: PitchingRatings;
  targeted?: boolean;
  totalRecruitingPoints?: number;
  weeklyPointsSpent?: number;
  weeklyActions?: RecruitingActionId[];
  scoutingLevel?: number;
  userOffer?: {
    scholarshipPct: number;
    nilValue: number;
  };
  committedProgramId?: string;
}

export interface TransferPortalEntry {
  id: string;
  player: Player;
  originProgramId: string;
  destinationProgramId?: string;
  askingSchoolNil: number;
  askingScholarshipPct: number;
  interest: number;
  tamperRisk: number;
  userOffer?: {
    scholarshipPct: number;
    nilValue: number;
  };
}

export interface NILDeal {
  id: string;
  playerId: string;
  playerName: string;
  type: 'school-package' | 'third-party';
  value: number;
  brand?: string;
  validBusinessPurpose: boolean;
  fairMarketScore: number;
  status: DealStatus;
  createdWeek: number;
}

export interface ComplianceReview {
  id: string;
  dealId: string;
  playerId: string;
  reason: string;
  verdict: 'approved' | 'rejected' | 'warning';
  riskLevel: number;
}

export interface OffseasonWeek {
  week: number;
  label: string;
  phase: SeasonPhase;
  focus: WeekFocus;
  tasks: string[];
}

export interface SeasonStructure {
  regularSeasonGames: number;
  seriesLength: number;
  conferenceWeeks: number;
  regionalsTeams: number;
  superRegionalSeries: number;
  mcwsTeams: number;
}

export interface LineupCard {
  battingOrder: Player[];
  bench: Player[];
  starter: Player;
  bullpen: Player[];
}

export interface PitchingPlan {
  gameType: 'midweek' | 'weekend';
  rotationSlot: 0 | 1 | 2 | 3;
  starterPitchLimit: number;
  bullpenAggression: number;
}

export interface GameContext {
  dateLabel: string;
  homeProgramId: string;
  awayProgramId: string;
  seriesGameNumber: number;
  gameType: 'midweek' | 'weekend' | 'postseason';
  parkFactor: number;
  weatherNote: string;
  homeTravelDays: number;
  awayTravelDays: number;
  postseasonStage: PostseasonStage;
}

export interface PitcherUsageLine {
  pitcherId: string;
  pitcherName: string;
  outsRecorded: number;
  runsAllowed: number;
  strikeouts: number;
  walks: number;
}

export interface PlayerBattingLine {
  playerId: string;
  playerName: string;
  programId: string;
  position: Position;
  games: number;
  plateAppearances: number;
  atBats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runsBattedIn: number;
  walks: number;
  strikeouts: number;
}

export interface PlayerPitchingLine {
  playerId: string;
  playerName: string;
  programId: string;
  games: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  saves: number;
  outsRecorded: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  homeRunsAllowed: number;
}

export interface PlayerFieldingLine {
  playerId: string;
  playerName: string;
  programId: string;
  position: Position;
  games: number;
  putouts: number;
  assists: number;
  errors: number;
  chances: number;
}

export interface KeyMoment {
  inning: number;
  half: 'top' | 'bottom';
  text: string;
}

export interface TeamGameSummary {
  runsByInning: number[];
  hits: number;
  errors: number;
  walks: number;
  strikeouts: number;
  leftOnBase: number;
}

export interface GameResult {
  context: GameContext;
  homeProgramId: string;
  awayProgramId: string;
  homeLineup: LineupCard;
  awayLineup: LineupCard;
  homeSummary: TeamGameSummary;
  awaySummary: TeamGameSummary;
  homeBattingLines: PlayerBattingLine[];
  awayBattingLines: PlayerBattingLine[];
  homePitchingLines: PlayerPitchingLine[];
  awayPitchingLines: PlayerPitchingLine[];
  homeFieldingLines: PlayerFieldingLine[];
  awayFieldingLines: PlayerFieldingLine[];
  winningPitcher: string;
  losingPitcher: string;
  homePitchingUsage: PitcherUsageLine[];
  awayPitchingUsage: PitcherUsageLine[];
  keyMoments: KeyMoment[];
  updatedFatigue: Record<string, number>;
}

export interface SeasonOutlook {
  medianWins: number;
  averageWins: number;
  maxWins: number;
  minWins: number;
  undefeatedRate: number;
  postseasonRate: number;
}

export interface TeamSeasonLine {
  programId: string;
  wins: number;
  losses: number;
  runsScored: number;
  runsAllowed: number;
  hits: number;
  homeRuns: number;
  walks: number;
  strikeouts: number;
  era: number;
  whip: number;
  errors: number;
}

export interface LeagueSeasonSnapshot {
  generatedAt: string;
  teamStats: TeamSeasonLine[];
  userTeamBatting: PlayerBattingLine[];
  userTeamPitching: PlayerPitchingLine[];
  userTeamFielding: PlayerFieldingLine[];
  battingLeaders: PlayerBattingLine[];
  pitchingLeaders: PlayerPitchingLine[];
  fieldingLeaders: PlayerFieldingLine[];
}

export type SeasonGameStatus = 'scheduled' | 'final';

export interface SeasonGameRecord {
  id: string;
  dayNumber: number;
  dayLabel: string;
  context: GameContext;
  status: SeasonGameStatus;
  result?: GameResult;
}

export interface SeasonDatabase {
  currentDayNumber: number;
  completedDays: number[];
  lastSimulatedDayLabel?: string;
  games: SeasonGameRecord[];
}

export interface ProgramBundle {
  program: Program;
  roster: Player[];
}

export interface RecruitingNeed {
  position: Position;
  label: string;
  graduatingSeniors: number;
  draftRisks: number;
  transferRisks: number;
  urgency: number;
}

export interface FranchiseSettings {
  ratingDisplay: RatingDisplayMode;
}

export interface FranchiseSave {
  version: number;
  year: number;
  createdAt: string;
  currentWeek: number;
  phase: SeasonPhase;
  userProgramId: string;
  seasonStructure: SeasonStructure;
  roster: Player[];
  recruits: Recruit[];
  portalEntries: TransferPortalEntry[];
  nilDeals: NILDeal[];
  complianceReviews: ComplianceReview[];
  weeklyPlan: OffseasonWeek[];
  eventLog: string[];
  recruitingPointsPerWeek: number;
  recruitingPointsRemaining: number;
  certifiedRosterIds: string[];
  openingDayReady: boolean;
  schoolSponsor: string;
  settings: FranchiseSettings;
  seasonSnapshot?: LeagueSeasonSnapshot;
  season?: SeasonDatabase;
}
