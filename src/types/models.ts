export type Handedness = 'L' | 'R' | 'S';
export type PlayerRole = 'hitter' | 'pitcher' | 'two-way';
export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR';
export type ArchetypeFamily =
  | 'catchers'
  | 'corner-infielders'
  | 'middle-infielders'
  | 'outfielders'
  | 'designated-hitters'
  | 'starters'
  | 'relievers'
  | 'two-way';
export type PlayerArchetype =
  | 'catcher-defense-anchor'
  | 'catcher-offense-first'
  | 'corner-power-bat'
  | 'corner-contact-bat'
  | 'middle-glove-wizard'
  | 'middle-table-setter'
  | 'outfield-speed-defender'
  | 'outfield-run-producer'
  | 'dh-bat-first-masher'
  | 'starter-power-ace'
  | 'starter-command-artist'
  | 'starter-groundball-machine'
  | 'reliever-fireman'
  | 'reliever-control-specialist'
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
  | 'postseason'
  | 'season-complete';
export type DealStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'flagged';
export type PostseasonStage = 'regular-season' | 'conference' | 'regional' | 'super-regional' | 'mcws';
export type PostseasonWeekStage = 'selection' | 'regionals' | 'super-regionals' | 'mcws' | 'finals' | 'complete';
export type WeekFocus = 'recruiting' | 'portal' | 'compliance' | 'roster' | 'opening-day';
export type RecruitingActionId =
  | 'scout'
  | 'call'
  | 'campus-visit'
  | 'development-pitch'
  | 'nil-presentation'
  | 'playing-time-pitch';
export type RatingDisplayMode = '100' | '20-80' | 'stars';
export type PersonalityType =
  | 'captain'
  | 'steady-pro'
  | 'clubhouse-glue'
  | 'quiet-worker'
  | 'individualist'
  | 'volatile-competitor';
export type CoachRole = 'headCoach' | 'assistantHitting' | 'assistantPitching' | 'assistantDevelopment';
export type MailType = 'clubhouse' | 'recruiting' | 'portal' | 'staff' | 'league' | 'system';

export interface Location {
  city: string;
  state: string;
  lat: number;
  lon: number;
}

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

export interface DevelopmentProfile {
  ceilingReliability: number;
  workEthic: number;
  coachability: number;
  consistency: number;
  leadershipPotential: number;
}

export interface PersonalityProfile {
  type: PersonalityType;
  selfishness: number;
  teamFirst: number;
  competitiveDrive: number;
  resilience: number;
}

export interface LeadershipProfile {
  current: number;
  potential: number;
}

export interface DevelopmentHistoryEntry {
  year: number;
  classYear: ClassYear;
  overallBefore: number;
  overallAfter: number;
  potentialBefore: number;
  potentialAfter: number;
  coachFit: number;
  performanceScore: number;
  healthScore: number;
  moraleScore: number;
  chemistryScore: number;
  summary: string;
}

export interface SeasonDevelopmentContext {
  inSeasonProgress: number;
  coachFit: number;
  performanceScore: number;
  healthScore: number;
  moraleScore: number;
  playingTimeScore: number;
  chemistryScore: number;
  note: string;
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
  developmentProfile: DevelopmentProfile;
  personalityProfile: PersonalityProfile;
  leadership: LeadershipProfile;
  developmentHistory: DevelopmentHistoryEntry[];
  seasonDevelopmentContext: SeasonDevelopmentContext;
  preferences: PlayerPreferences;
  offense?: OffenseRatings;
  defense?: DefenseRatings;
  pitching?: PitchingRatings;
  rosterStatus: RosterStatus;
}

export type LeagueRosters = Record<string, Player[]>;

export interface Coach {
  id: string;
  name: string;
  role: CoachRole;
  overall: number;
  leadership: number;
  developmentRatings: Record<ArchetypeFamily, number>;
  injuryPrevention: number;
  moraleSupport: number;
  recruitingSupport: number;
}

export interface CoachingStaff {
  headCoach: Coach;
  assistantHitting: Coach;
  assistantPitching: Coach;
  assistantDevelopment: Coach;
}

export type LeagueCoachingStaffs = Record<string, CoachingStaff>;


export interface PrestigeProfile {
  overall: number;
  competitivePrestige: number;
  developmentReputation: number;
  nilAttractiveness: number;
  conferenceModifier: number;
  momentumModifier: number;

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
  location: Location;
  colors: {
    primary: string;
    secondary: string;
  };
  conferenceTier: number;
  parkFactor: number;
  travelDifficulty: number;
  prestigeLevel: number;
  resources: ProgramResources;
  prestige: PrestigeProfile;
}

export type Dealbreaker = 'proximity' | 'playingTime' | 'prestige' | 'nil' | 'development' | 'none';

export interface Recruit {
  id: string;
  name: string;
  primaryPosition: Position;
  archetype: PlayerArchetype;
  hometown: Location;
  stars: 2 | 3 | 4 | 5;
  interest: number;
  signability: number;
  askingNil: number;
  developmentCurve: number;
  marketability: number;
  preferences: PlayerPreferences;
  dealbreaker: Dealbreaker;
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
  userScore?: number;
  topSchools?: { programId: string; score: number }[];
}

export interface TransferPortalEntry {
  id: string;
  player: Player;
  originProgramId: string;
  destinationProgramId?: string;
  reason?: string;
  originStayScore?: number;
  coachChange?: boolean;
  topDestinations?: { programId: string; score: number }[];
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
  gameType: 'midweek' | 'weekend' | 'postseason';
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
  neutralSite?: boolean;
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
  postseason?: LeaguePostseasonSummary;
}

export interface PostseasonTeamSeed {
  programId: string;
  nationalSeed: number;
  regionalSeed: number;
}

export interface PostseasonSeriesSummary {
  label: string;
  stage: PostseasonStage;
  hostProgramId?: string;
  teamIds: string[];
  winnerProgramId?: string;
  loserProgramId?: string;
  winsByProgram: Record<string, number>;
}

export interface PostseasonRegionalSummary extends PostseasonSeriesSummary {
  hostProgramId: string;
  seeds: PostseasonTeamSeed[];
}

export interface LeaguePostseasonSummary {
  currentStage: PostseasonWeekStage;
  currentWeekLabel: string;
  selectedTeamIds: string[];
  nationalSeeds: PostseasonTeamSeed[];
  regionals: PostseasonRegionalSummary[];
  superRegionals: PostseasonSeriesSummary[];
  mcwsBrackets: PostseasonSeriesSummary[];
  finals?: PostseasonSeriesSummary;
  mcwsTeamIds: string[];
  championProgramId?: string;
  runnerUpProgramId?: string;
}

export interface SeasonPostseasonState {
  currentWeek: number;
  summary: LeaguePostseasonSummary;
  results: GameResult[];
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
  postseason?: SeasonPostseasonState;
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

export interface ProgramStrategyProfile {
  programId: string;
  offenseFocus: 'contact' | 'power' | 'speed' | 'balanced';
  pitchingFocus: 'power-arms' | 'command' | 'bullpen' | 'balanced';
  identitySummary: string;
}

export interface FranchiseSettings {
  ratingDisplay: RatingDisplayMode;
}

export interface MailMessage {
  id: string;
  type: MailType;
  subject: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
  eventLogEntry: string;
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
  leagueRosters: LeagueRosters;
  leagueCoachingStaffs: LeagueCoachingStaffs;
  leagueStrategyProfiles: Record<string, ProgramStrategyProfile>;
  recruits: Recruit[];
  portalEntries: TransferPortalEntry[];
  nilDeals: NILDeal[];
  complianceReviews: ComplianceReview[];
  weeklyPlan: OffseasonWeek[];
  eventLog: string[];
  mail: MailMessage[];
  recruitingPointsPerWeek: number;
  recruitingPointsRemaining: number;
  certifiedRosterIds: string[];
  openingDayReady: boolean;
  schoolSponsor: string;
  settings: FranchiseSettings;
  seasonSnapshot?: LeagueSeasonSnapshot;
  season?: SeasonDatabase;
}
