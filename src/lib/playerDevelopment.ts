import { clamp, createSeededRandom } from './random';
import { realCoaches } from '../data/coaches';
import type {
  ArchetypeFamily,
  ClassYear,
  Coach,
  CoachRole,
  CoachingStaff,
  DefenseRatings,
  DevelopmentHistoryEntry,
  DevelopmentProfile,
  LeadershipProfile,
  LeagueCoachingStaffs,
  OffenseRatings,
  PersonalityProfile,
  PersonalityType,
  PitchingRatings,
  Player,
  PlayerArchetype,
  Position,
  Program,
  SeasonDevelopmentContext,
} from '../types/models';

export interface PlayerArchetypeDefinition {
  id: PlayerArchetype;
  label: string;
  family: ArchetypeFamily;
  eligiblePositions: Position[];
  roleTags: string[];
  description: string;
  offenseWeights?: Partial<Record<keyof OffenseRatings, number>>;
  pitchingWeights?: Partial<Record<keyof PitchingRatings, number>>;
  defenseWeights?: Partial<Record<keyof DefenseRatings, number>>;
}

export interface TeamChemistryProfile {
  score: number;
  leadership: number;
  selfishness: number;
  resilience: number;
  summary: string;
}

export interface OffseasonProgressionInput {
  year: number;
  coachingStaff: CoachingStaff;
  teamChemistryScore: number;
  performanceScore: number;
  healthScore: number;
  moraleScore: number;
  playingTimeScore: number;
}

export interface ProgramDevelopmentIdentity {
  primaryFamily: ArchetypeFamily;
  secondaryFamily: ArchetypeFamily;
  primaryLabel: string;
  secondaryLabel: string;
  summary: string;
}

export interface CoachingStaffTransition {
  nextStaff: CoachingStaff;
  changedRoles: CoachRole[];
  summary: string;
}

export interface AggregatedSeasonStats {
  batting?: {
    games: number;
    plateAppearances: number;
    atBats: number;
    hits: number;
    doubles: number;
    triples: number;
    homeRuns: number;
    walks: number;
    strikeouts: number;
    runsBattedIn: number;
  };
  pitching?: {
    games: number;
    gamesStarted: number;
    outsRecorded: number;
    hitsAllowed: number;
    earnedRuns: number;
    walks: number;
    strikeouts: number;
  };
  fielding?: {
    games: number;
    chances: number;
    errors: number;
  };
}

const coachFirstNames = [
  'Chris', 'Matt', 'Tyler', 'Bryan', 'Scott', 'Kevin', 'Ryan', 'Mark', 'Steve', 'Jeff',
  'Luke', 'Eric', 'Brad', 'Adam', 'Paul', 'Mike', 'John', 'Derek', 'Nathan', 'Shawn',
];

const coachLastNames = [
  'Johnson', 'Miller', 'Anderson', 'Sullivan', 'Carter', 'Parker', 'Reed', 'Walker', 'Griffin', 'Harper',
  'Donovan', 'Morrison', 'Bailey', 'Bishop', 'Murphy', 'Holland', 'Kendrick', 'Coleman', 'Ramsey', 'Foster',
];

export const PLAYER_ARCHETYPE_DEFINITIONS: Record<PlayerArchetype, PlayerArchetypeDefinition> = {
  'catcher-defense-anchor': {
    id: 'catcher-defense-anchor',
    label: 'Catcher Defense Anchor',
    family: 'catchers',
    eligiblePositions: ['C'],
    roleTags: ['defense', 'game-caller', 'durability'],
    description: 'Handles the staff, controls the run game, and grows through defense-first reps.',
    offenseWeights: { contact: 0.7, eye: 0.6, avoidK: 0.7, power: 0.35 },
    defenseWeights: { defense: 1.2, arm: 1.05 },
  },
  'catcher-offense-first': {
    id: 'catcher-offense-first',
    label: 'Catcher Offense First',
    family: 'catchers',
    eligiblePositions: ['C'],
    roleTags: ['run-production', 'plate-discipline'],
    description: 'Bat-forward catcher whose receiving improves slower than his offensive impact.',
    offenseWeights: { contact: 0.95, power: 0.95, eye: 0.85, avoidK: 0.8 },
    defenseWeights: { defense: 0.65, arm: 0.7 },
  },
  'corner-power-bat': {
    id: 'corner-power-bat',
    label: 'Corner Power Bat',
    family: 'corner-infielders',
    eligiblePositions: ['1B', '3B'],
    roleTags: ['power', 'middle-order'],
    description: 'Carries corner-infield value through damage at the plate.',
    offenseWeights: { power: 1.15, eye: 0.8, contact: 0.75, gap: 0.7 },
    defenseWeights: { defense: 0.55, arm: 0.6 },
  },
  'corner-contact-bat': {
    id: 'corner-contact-bat',
    label: 'Corner Contact Bat',
    family: 'corner-infielders',
    eligiblePositions: ['1B', '3B'],
    roleTags: ['bat-control', 'run-creation'],
    description: 'Hit-over-power corner profile built on barrel accuracy and on-base feel.',
    offenseWeights: { contact: 1.05, avoidK: 0.95, eye: 0.8, power: 0.6 },
    defenseWeights: { defense: 0.6, arm: 0.7 },
  },
  'middle-glove-wizard': {
    id: 'middle-glove-wizard',
    label: 'Middle Infield Glove Wizard',
    family: 'middle-infielders',
    eligiblePositions: ['2B', '3B', 'SS'],
    roleTags: ['defense', 'range', 'instincts'],
    description: 'Premium infield defender whose development leans heavily on glove and arm.',
    offenseWeights: { contact: 0.65, avoidK: 0.7, speed: 0.75, baserunning: 0.75 },
    defenseWeights: { defense: 1.25, arm: 1.0 },
  },
  'middle-table-setter': {
    id: 'middle-table-setter',
    label: 'Middle Infield Table Setter',
    family: 'middle-infielders',
    eligiblePositions: ['2B', 'SS'],
    roleTags: ['contact', 'speed', 'on-base'],
    description: 'Top-of-order middle infielder who grows through contact, speed, and instincts.',
    offenseWeights: { contact: 1.0, eye: 0.85, avoidK: 0.9, speed: 0.95, baserunning: 0.9 },
    defenseWeights: { defense: 0.9, arm: 0.8 },
  },
  'outfield-speed-defender': {
    id: 'outfield-speed-defender',
    label: 'Outfield Speed Defender',
    family: 'outfielders',
    eligiblePositions: ['LF', 'CF', 'RF'],
    roleTags: ['range', 'speed', 'pressure'],
    description: 'Tracks balls in space and creates value with speed and defense.',
    offenseWeights: { contact: 0.7, speed: 1.05, baserunning: 1.0, gap: 0.75 },
    defenseWeights: { defense: 1.05, arm: 0.85 },
  },
  'outfield-run-producer': {
    id: 'outfield-run-producer',
    label: 'Outfield Run Producer',
    family: 'outfielders',
    eligiblePositions: ['LF', 'CF', 'RF'],
    roleTags: ['power', 'middle-order'],
    description: 'Bat-driven outfielder who profiles around extra-base production.',
    offenseWeights: { power: 1.05, contact: 0.8, eye: 0.8, gap: 0.85 },
    defenseWeights: { defense: 0.7, arm: 0.75 },
  },
  'dh-bat-first-masher': {
    id: 'dh-bat-first-masher',
    label: 'DH Bat-First Masher',
    family: 'designated-hitters',
    eligiblePositions: ['DH', '1B'],
    roleTags: ['pure-bat', 'run-production'],
    description: 'Minimal defensive value, but can carry a lineup with damage and discipline.',
    offenseWeights: { power: 1.2, eye: 0.9, contact: 0.75, avoidK: 0.7 },
    defenseWeights: { defense: 0.25, arm: 0.2 },
  },
  'starter-power-ace': {
    id: 'starter-power-ace',
    label: 'Starter Power Ace',
    family: 'starters',
    eligiblePositions: ['SP'],
    roleTags: ['frontline', 'velocity', 'swing-miss'],
    description: 'Velocity and bat-missing starter who needs stamina and command refinement.',
    pitchingWeights: { stuff: 1.15, stamina: 0.9, composure: 0.8, command: 0.7, movement: 0.75 },
    defenseWeights: { defense: 0.4, arm: 0.4 },
  },
  'starter-command-artist': {
    id: 'starter-command-artist',
    label: 'Starter Command Artist',
    family: 'starters',
    eligiblePositions: ['SP'],
    roleTags: ['command', 'craft', 'efficiency'],
    description: 'Wins through execution, sequencing, and stamina rather than raw overpowering stuff.',
    pitchingWeights: { command: 1.15, movement: 0.95, composure: 0.95, stamina: 0.85, stuff: 0.65 },
    defenseWeights: { defense: 0.45, arm: 0.4 },
  },
  'starter-groundball-machine': {
    id: 'starter-groundball-machine',
    label: 'Starter Groundball Machine',
    family: 'starters',
    eligiblePositions: ['SP'],
    roleTags: ['contact-management', 'efficiency'],
    description: 'Develops through movement, command, and ground-ball suppression.',
    pitchingWeights: { movement: 1.05, groundBall: 1.1, command: 0.85, stamina: 0.8, composure: 0.7 },
    defenseWeights: { defense: 0.45, arm: 0.4 },
  },
  'reliever-fireman': {
    id: 'reliever-fireman',
    label: 'Reliever Fireman',
    family: 'relievers',
    eligiblePositions: ['RP'],
    roleTags: ['leverage', 'swing-miss', 'short-burst'],
    description: 'Late-inning arm built for stuff, composure, and high-leverage innings.',
    pitchingWeights: { stuff: 1.2, composure: 0.95, movement: 0.85, command: 0.7, stamina: 0.35 },
    defenseWeights: { defense: 0.35, arm: 0.35 },
  },
  'reliever-control-specialist': {
    id: 'reliever-control-specialist',
    label: 'Reliever Control Specialist',
    family: 'relievers',
    eligiblePositions: ['RP'],
    roleTags: ['strikes', 'matchups', 'efficiency'],
    description: 'Short-burst bullpen profile built around strike-throwing and feel.',
    pitchingWeights: { command: 1.15, movement: 0.9, composure: 0.8, stuff: 0.75, stamina: 0.3 },
    defenseWeights: { defense: 0.35, arm: 0.35 },
  },
  'two-way-star': {
    id: 'two-way-star',
    label: 'Two-Way Star',
    family: 'two-way',
    eligiblePositions: ['DH', '1B', 'LF', 'RF', 'SP', 'RP'],
    roleTags: ['rare', 'upside', 'dual-role'],
    description: 'High-variance dual-threat player who can develop on both sides of the ball.',
    offenseWeights: { contact: 0.8, power: 0.8, eye: 0.7, speed: 0.6 },
    pitchingWeights: { stuff: 0.85, command: 0.75, movement: 0.75, stamina: 0.6 },
    defenseWeights: { defense: 0.6, arm: 0.7 },
  },
};

export function getArchetypeDefinition(archetype: PlayerArchetype) {
  return PLAYER_ARCHETYPE_DEFINITIONS[archetype];
}

export function createDevelopmentProfile(seed: string): DevelopmentProfile {
  const random = createSeededRandom(`${seed}-dev-profile`);
  return {
    ceilingReliability: clamp(45 + random.int(0, 45), 35, 95),
    workEthic: clamp(40 + random.int(0, 50), 35, 95),
    coachability: clamp(42 + random.int(0, 48), 35, 95),
    consistency: clamp(38 + random.int(0, 50), 30, 95),
    leadershipPotential: clamp(35 + random.int(0, 55), 25, 95),
  };
}

export function createPersonalityProfile(seed: string): PersonalityProfile {
  const random = createSeededRandom(`${seed}-personality`);
  const selfishness = clamp(25 + random.int(0, 55), 10, 95);
  const teamFirst = clamp(100 - selfishness + random.int(-12, 12), 10, 95);
  const competitiveDrive = clamp(45 + random.int(0, 45), 35, 95);
  const resilience = clamp(40 + random.int(0, 45), 30, 95);
  const type = selfishness >= 72
    ? random.pick<PersonalityType>(['individualist', 'volatile-competitor'])
    : teamFirst >= 72
      ? random.pick<PersonalityType>(['captain', 'clubhouse-glue'])
      : random.pick<PersonalityType>(['steady-pro', 'quiet-worker']);

  return {
    type,
    selfishness,
    teamFirst,
    competitiveDrive,
    resilience,
  };
}

export function createLeadershipProfile(seed: string, developmentProfile: DevelopmentProfile, personalityProfile: PersonalityProfile): LeadershipProfile {
  const random = createSeededRandom(`${seed}-leadership`);
  const potential = clamp(
    Math.round(developmentProfile.leadershipPotential * 0.55 + personalityProfile.teamFirst * 0.25 + personalityProfile.competitiveDrive * 0.2 + random.int(-6, 6)),
    20,
    95,
  );
  return {
    current: clamp(potential - random.int(4, 18), 15, 92),
    potential,
  };
}

export function resolveArchetypeForPlayer(position: Position, role: Player['role'], seed: string): PlayerArchetype {
  const random = createSeededRandom(`${seed}-archetype`);
  if (role === 'two-way') return 'two-way-star';
  if (position === 'C') {
    return random.pick(['catcher-defense-anchor', 'catcher-offense-first']);
  }
  if (position === '1B' || position === '3B') {
    return random.pick(['corner-power-bat', 'corner-contact-bat']);
  }
  if (position === '2B' || position === 'SS') {
    return random.pick(['middle-glove-wizard', 'middle-table-setter']);
  }
  if (position === 'LF' || position === 'CF' || position === 'RF') {
    return random.pick(['outfield-speed-defender', 'outfield-run-producer']);
  }
  if (position === 'DH') {
    return 'dh-bat-first-masher';
  }
  if (position === 'SP') {
    return random.pick(['starter-power-ace', 'starter-command-artist', 'starter-groundball-machine']);
  }
  if (position === 'RP') {
    return random.pick(['reliever-fireman', 'reliever-control-specialist']);
  }
  return 'two-way-star';
}

export function createSeasonDevelopmentContext(): SeasonDevelopmentContext {
  return {
    inSeasonProgress: 0,
    coachFit: 50,
    performanceScore: 50,
    healthScore: 65,
    moraleScore: 60,
    playingTimeScore: 50,
    chemistryScore: 55,
    note: 'New baseline. Progression will respond once the season gets underway.',
  };
}

export function enrichPlayerDevelopment(player: Player, seed = player.id): Player {
  const developmentProfile = player.developmentProfile ?? createDevelopmentProfile(seed);
  const personalityProfile = player.personalityProfile ?? createPersonalityProfile(seed);
  const leadership = player.leadership ?? createLeadershipProfile(seed, developmentProfile, personalityProfile);

  return {
    ...player,
    archetype: getArchetypeDefinition(player.archetype)?.eligiblePositions.includes(player.primaryPosition)
      ? player.archetype
      : resolveArchetypeForPlayer(player.primaryPosition, player.role, seed),
    developmentProfile,
    personalityProfile,
    leadership,
    developmentHistory: player.developmentHistory ?? [],
    seasonDevelopmentContext: player.seasonDevelopmentContext ?? createSeasonDevelopmentContext(),
  };
}

function coachName(seed: string) {
  const random = createSeededRandom(`${seed}-coach-name`);
  return `${random.pick(coachFirstNames)} ${random.pick(coachLastNames)}`;
}

function baselineCoachRatings(seed: string, role: CoachRole): Record<ArchetypeFamily, number> {
  const random = createSeededRandom(`${seed}-coach-ratings`);
  const base: Record<ArchetypeFamily, number> = {
    catchers: 45 + random.int(0, 35),
    'corner-infielders': 45 + random.int(0, 35),
    'middle-infielders': 45 + random.int(0, 35),
    outfielders: 45 + random.int(0, 35),
    'designated-hitters': 45 + random.int(0, 35),
    starters: 45 + random.int(0, 35),
    relievers: 45 + random.int(0, 35),
    'two-way': 45 + random.int(0, 35),
  };

  if (role === 'assistantHitting') {
    base['corner-infielders'] += 8;
    base.outfielders += 5;
    base['designated-hitters'] += 10;
  }
  if (role === 'assistantPitching') {
    base.starters += 10;
    base.relievers += 10;
  }
  if (role === 'assistantDevelopment') {
    base['middle-infielders'] += 5;
    base.catchers += 5;
    base['two-way'] += 8;
  }
  if (role === 'headCoach') {
    for (const family of Object.keys(base) as ArchetypeFamily[]) {
      base[family] += 4;
    }
  }

  return Object.fromEntries(
    (Object.entries(base) as Array<[ArchetypeFamily, number]>).map(([family, value]) => [family, clamp(value, 35, 95)]),
  ) as Record<ArchetypeFamily, number>;
}

export function createCoach(program: Program | string, role: CoachRole, prestigeLevel: number = 50): Coach {
  // We accept `Program | string` to handle the `nudgeCoach` string fallback easily,
  // but we prefer full Program to do a name match.
  const programId = typeof program === 'string' ? program : program.id;
  
  const seed = `${programId}-${role}`;
  const random = createSeededRandom(`${seed}-profile`);
  
  const realCoach = role === 'headCoach' ? realCoaches[programId] : null;
  const isReal = !!realCoach;
  
  const name = realCoach ? realCoach.name : coachName(seed);
  
  let baseOverall: number;
  let baseLeadership: number;
  let baseRecruiting: number;
  
  if (isReal) {
    const years = 2024 - realCoach!.hireYear;
    baseOverall = clamp(75 + years * 1.5, 75, 95);
    baseLeadership = clamp(70 + years * 1.5, 70, 95);
    baseRecruiting = clamp(70 + (prestigeLevel - 50) * 0.4 + years, 70, 95);
  } else {
    const prestigeBonus = (prestigeLevel - 50) * 0.4;
    baseOverall = clamp(50 + prestigeBonus + random.int(0, 30), 40, 90);
    baseLeadership = clamp(45 + prestigeBonus + random.int(0, 35), 35, 90);
    baseRecruiting = clamp(45 + prestigeBonus + random.int(0, 30), 35, 90);
  }

  return {
    id: seed,
    name,
    role,
    overall: baseOverall,
    leadership: baseLeadership,
    developmentRatings: baselineCoachRatings(seed, role),
    injuryPrevention: clamp(40 + random.int(0, 45), 35, 95),
    moraleSupport: clamp(42 + random.int(0, 45), 35, 95),
    recruitingSupport: baseRecruiting,
  };
}

export function createCoachingStaffForProgram(program: Program): CoachingStaff {
  return {
    headCoach: createCoach(program, 'headCoach', program.prestigeLevel),
    assistantHitting: createCoach(program, 'assistantHitting', program.prestigeLevel),
    assistantPitching: createCoach(program, 'assistantPitching', program.prestigeLevel),
    assistantDevelopment: createCoach(program, 'assistantDevelopment', program.prestigeLevel),
  };
}

export function createLeagueCoachingStaffs(programList: Program[]): LeagueCoachingStaffs {
  return Object.fromEntries(programList.map((program) => [program.id, createCoachingStaffForProgram(program)]));
}

function nudgeCoach(existing: Coach, seed: string, roleChanged: boolean): Coach {
  const random = createSeededRandom(seed);
  if (roleChanged) {
    return {
      ...createCoach(existing.id.split('-').slice(0, -1).join('-'), existing.role, 50),
      id: `${existing.id}-${seed}-new`,
    };
  }
  const nextRatings = Object.fromEntries(
    (Object.entries(existing.developmentRatings) as Array<[ArchetypeFamily, number]>).map(([family, value]) => [
      family,
      clamp(value + random.int(-3, 4), 35, 95),
    ]),
  ) as Record<ArchetypeFamily, number>;
  return {
    ...existing,
    overall: clamp(existing.overall + random.int(-2, 3), 40, 95),
    leadership: clamp(existing.leadership + random.int(-2, 3), 35, 95),
    developmentRatings: nextRatings,
    injuryPrevention: clamp(existing.injuryPrevention + random.int(-2, 3), 35, 95),
    moraleSupport: clamp(existing.moraleSupport + random.int(-2, 3), 35, 95),
    recruitingSupport: clamp(existing.recruitingSupport + random.int(-2, 3), 35, 95),
  };
}

function promoteCoachToRole(candidate: Coach, role: CoachRole, seed: string): Coach {
  const random = createSeededRandom(seed);
  const nextRatings = Object.fromEntries(
    (Object.entries(candidate.developmentRatings) as Array<[ArchetypeFamily, number]>).map(([family, value]) => [
      family,
      clamp(value + random.int(-1, 4) + (role === 'headCoach' ? 3 : 1), 35, 95),
    ]),
  ) as Record<ArchetypeFamily, number>;
  return {
    ...candidate,
    id: `${candidate.id}-${role}-${seed}`,
    role,
    overall: clamp(candidate.overall + random.int(1, 5) + (role === 'headCoach' ? 4 : 2), 40, 95),
    leadership: clamp(candidate.leadership + random.int(1, 5) + (role === 'headCoach' ? 5 : 2), 35, 95),
    developmentRatings: nextRatings,
    injuryPrevention: clamp(candidate.injuryPrevention + random.int(-1, 3), 35, 95),
    moraleSupport: clamp(candidate.moraleSupport + random.int(0, 4), 35, 95),
    recruitingSupport: clamp(candidate.recruitingSupport + random.int(0, 4), 35, 95),
  };
}

export function evolveCoachingStaff(programId: string, coachingStaff: CoachingStaff, year: number, performanceScore: number): CoachingStaffTransition {
  const random = createSeededRandom(`${programId}-staff-${year}`);
  const retentionBonus = performanceScore >= 78 ? -0.08 : performanceScore <= 52 ? 0.1 : 0;
  const changeRoles: CoachRole[] = (['headCoach', 'assistantHitting', 'assistantPitching', 'assistantDevelopment'] as CoachRole[])
    .filter((role) => {
      const baseChance = role === 'headCoach' ? 0.09 : 0.15;
      return random.next() < Math.max(0.03, Math.min(0.32, baseChance + retentionBonus));
    });
  const promoteAssistant = changeRoles.includes('headCoach') && performanceScore >= 58 && random.next() < 0.55;
  const promotedHeadCoach = promoteAssistant
    ? random.pick([coachingStaff.assistantHitting, coachingStaff.assistantPitching, coachingStaff.assistantDevelopment])
    : null;
  const nextHeadCoach = changeRoles.includes('headCoach')
    ? promotedHeadCoach
      ? promoteCoachToRole(promotedHeadCoach, 'headCoach', `${programId}-${year}-promote-head`)
      : nudgeCoach(coachingStaff.headCoach, `${programId}-${year}-head`, true)
    : nudgeCoach(coachingStaff.headCoach, `${programId}-${year}-head`, false);
  const nextStaff: CoachingStaff = {
    headCoach: nextHeadCoach,
    assistantHitting: promotedHeadCoach?.role === 'assistantHitting'
      ? nudgeCoach(coachingStaff.assistantHitting, `${programId}-${year}-hit-replace`, true)
      : nudgeCoach(coachingStaff.assistantHitting, `${programId}-${year}-hit`, changeRoles.includes('assistantHitting')),
    assistantPitching: promotedHeadCoach?.role === 'assistantPitching'
      ? nudgeCoach(coachingStaff.assistantPitching, `${programId}-${year}-pit-replace`, true)
      : nudgeCoach(coachingStaff.assistantPitching, `${programId}-${year}-pit`, changeRoles.includes('assistantPitching')),
    assistantDevelopment: promotedHeadCoach?.role === 'assistantDevelopment'
      ? nudgeCoach(coachingStaff.assistantDevelopment, `${programId}-${year}-dev-replace`, true)
      : nudgeCoach(coachingStaff.assistantDevelopment, `${programId}-${year}-dev`, changeRoles.includes('assistantDevelopment')),
  };
  const changedRoleLabels = changeRoles.map((role) => {
    if (role === 'headCoach') return 'head coach';
    if (role === 'assistantHitting') return 'hitting coach';
    if (role === 'assistantPitching') return 'pitching coach';
    return 'development coach';
  });
  const summary = changeRoles.length
    ? `${promotedHeadCoach ? 'Internal promotion reshaped the staff.' : 'Staff turnover hit the program.'} Changed: ${changedRoleLabels.join(', ')}.`
    : 'Staff continuity stayed intact.';
  return { nextStaff, changedRoles: changeRoles, summary };
}

export function calculateCoachFit(player: Player, coachingStaff: CoachingStaff) {
  const family = getArchetypeDefinition(player.archetype).family;
  const roleStaffWeight = player.offense
    ? (coachingStaff.headCoach.developmentRatings[family] * 0.3
      + coachingStaff.assistantHitting.developmentRatings[family] * 0.45
      + coachingStaff.assistantDevelopment.developmentRatings[family] * 0.25)
    : (coachingStaff.headCoach.developmentRatings[family] * 0.3
      + coachingStaff.assistantPitching.developmentRatings[family] * 0.45
      + coachingStaff.assistantDevelopment.developmentRatings[family] * 0.25);
  const coachabilityLift = player.developmentProfile.coachability * 0.18;
  const score = clamp(Math.round(roleStaffWeight + coachabilityLift * 0.4), 25, 95);
  const summary = score >= 80
    ? 'Strong coach fit'
    : score >= 65
      ? 'Healthy coach fit'
      : score >= 50
        ? 'Mixed coach fit'
        : 'Weak coach fit';

  return { score, summary, family };
}

export function calculateArchetypeCoachFit(archetype: PlayerArchetype, role: Player['role'], coachingStaff: CoachingStaff, coachability = 58) {
  const family = getArchetypeDefinition(archetype).family;
  const roleStaffWeight = role === 'pitcher'
    ? (coachingStaff.headCoach.developmentRatings[family] * 0.3
      + coachingStaff.assistantPitching.developmentRatings[family] * 0.45
      + coachingStaff.assistantDevelopment.developmentRatings[family] * 0.25)
    : (coachingStaff.headCoach.developmentRatings[family] * 0.3
      + coachingStaff.assistantHitting.developmentRatings[family] * 0.45
      + coachingStaff.assistantDevelopment.developmentRatings[family] * 0.25);
  const score = clamp(Math.round(roleStaffWeight + coachability * 0.07), 25, 95);
  const summary = score >= 80
    ? 'Strong coach fit'
    : score >= 65
      ? 'Healthy coach fit'
      : score >= 50
        ? 'Mixed coach fit'
        : 'Weak coach fit';
  return { score, summary, family };
}

function familyLabel(family: ArchetypeFamily) {
  switch (family) {
    case 'catchers': return 'catchers';
    case 'corner-infielders': return 'corner bats';
    case 'middle-infielders': return 'up-the-middle defenders';
    case 'outfielders': return 'outfield athletes';
    case 'designated-hitters': return 'bat-first sluggers';
    case 'starters': return 'starting pitchers';
    case 'relievers': return 'bullpen arms';
    case 'two-way': return 'two-way talents';
  }
}

export function getProgramDevelopmentIdentity(coachingStaff: CoachingStaff): ProgramDevelopmentIdentity {
  const families = Object.keys(coachingStaff.headCoach.developmentRatings) as ArchetypeFamily[];
  const scored = families.map((family) => {
    const blended = coachingStaff.headCoach.developmentRatings[family] * 0.32
      + coachingStaff.assistantDevelopment.developmentRatings[family] * 0.24
      + coachingStaff.assistantHitting.developmentRatings[family] * 0.22
      + coachingStaff.assistantPitching.developmentRatings[family] * 0.22;
    return { family, score: blended };
  }).sort((left, right) => right.score - left.score);
  const primaryFamily = scored[0]?.family ?? 'outfielders';
  const secondaryFamily = scored[1]?.family ?? primaryFamily;
  const primaryLabel = familyLabel(primaryFamily);
  const secondaryLabel = familyLabel(secondaryFamily);
  return {
    primaryFamily,
    secondaryFamily,
    primaryLabel,
    secondaryLabel,
    summary: `Staff leans toward ${primaryLabel} and ${secondaryLabel}.`,
  };
}

function compressHighRating(value: number, threshold: number, factor: number, min = 25, max = 95) {
  if (value <= threshold) {
    return clamp(Math.round(value), min, max);
  }
  return clamp(Math.round(threshold + (value - threshold) * factor), min, max);
}

export function buildTeamChemistryProfile(roster: Player[]): TeamChemistryProfile {
  if (!roster.length) {
    return { score: 50, leadership: 50, selfishness: 50, resilience: 50, summary: 'Neutral clubhouse' };
  }
  const leadership = roster.reduce((sum, player) => sum + player.leadership.current, 0) / roster.length;
  const selfishness = roster.reduce((sum, player) => sum + player.personalityProfile.selfishness, 0) / roster.length;
  const resilience = roster.reduce((sum, player) => sum + player.personalityProfile.resilience, 0) / roster.length;
  const teamFirst = roster.reduce((sum, player) => sum + player.personalityProfile.teamFirst, 0) / roster.length;
  const score = clamp(Math.round(50 + leadership * 0.22 + teamFirst * 0.12 + resilience * 0.08 - selfishness * 0.18), 20, 95);
  const summary = score >= 78
    ? 'Strong leadership core'
    : score >= 64
      ? 'Stable clubhouse'
      : score >= 48
        ? 'Mixed chemistry'
        : 'Fragile chemistry';

  return {
    score,
    leadership: Math.round(leadership),
    selfishness: Math.round(selfishness),
    resilience: Math.round(resilience),
    summary,
  };
}

function scoreHitterPerformanceByFamily(player: Player, stats: NonNullable<AggregatedSeasonStats['batting']>, fielding?: AggregatedSeasonStats['fielding']) {
  const singles = stats.hits - stats.doubles - stats.triples - stats.homeRuns;
  const obp = stats.plateAppearances > 0 ? (stats.hits + stats.walks) / stats.plateAppearances : 0.28;
  const slg = stats.atBats > 0 ? (singles + stats.doubles * 2 + stats.triples * 3 + stats.homeRuns * 4) / stats.atBats : 0.34;
  const ops = obp + slg;
  const iso = Math.max(0, slg - (stats.atBats > 0 ? stats.hits / stats.atBats : 0.24));
  const walkRate = stats.plateAppearances > 0 ? stats.walks / stats.plateAppearances : 0.07;
  const strikeoutRate = stats.plateAppearances > 0 ? stats.strikeouts / stats.plateAppearances : 0.22;
  const fieldingRate = fielding && fielding.chances > 0 ? 1 - fielding.errors / fielding.chances : 0.965;
  const family = getArchetypeDefinition(player.archetype).family;

  if (family === 'catchers') {
    return clamp(Math.round(36 + ops * 28 + walkRate * 80 - strikeoutRate * 38 + fieldingRate * 22), 25, 95);
  }
  if (family === 'middle-infielders') {
    return clamp(Math.round(34 + obp * 34 + walkRate * 85 - strikeoutRate * 34 + fieldingRate * 24 + stats.triples * 0.8), 25, 95);
  }
  if (family === 'corner-infielders') {
    return clamp(Math.round(24 + ops * 42 + iso * 36 + Math.min(14, stats.homeRuns * 1.1) + Math.min(12, stats.runsBattedIn * 0.12)), 25, 95);
  }
  if (family === 'outfielders') {
    return clamp(Math.round(28 + ops * 38 + iso * 22 + fieldingRate * 14 + stats.triples * 0.7), 25, 95);
  }
  if (family === 'designated-hitters') {
    return clamp(Math.round(20 + ops * 46 + iso * 42 + Math.min(16, stats.homeRuns * 1.25) + Math.min(12, stats.runsBattedIn * 0.14)), 25, 95);
  }

  return clamp(Math.round(26 + ops * 38 + iso * 24 + fieldingRate * 12), 25, 95);
}

function scorePitcherPerformanceByFamily(player: Player, stats: NonNullable<AggregatedSeasonStats['pitching']>) {
  const innings = stats.outsRecorded / 3;
  const era = innings > 0 ? (stats.earnedRuns * 9) / innings : 5.2;
  const whip = innings > 0 ? (stats.hitsAllowed + stats.walks) / innings : 1.6;
  const strikeoutRate = innings > 0 ? stats.strikeouts / innings : 0;
  const walkRate = innings > 0 ? stats.walks / innings : 0.6;
  const family = getArchetypeDefinition(player.archetype).family;

  if (family === 'starters') {
    return clamp(Math.round(76 + innings * 0.18 + strikeoutRate * 6 - era * 4.4 - whip * 8.5 - walkRate * 3 + stats.gamesStarted * 0.5), 25, 95);
  }
  if (family === 'relievers') {
    return clamp(Math.round(74 + stats.games * 0.55 + strikeoutRate * 7.5 - era * 4.1 - whip * 8.2 - walkRate * 2.6), 25, 95);
  }

  return clamp(Math.round(74 + innings * 0.12 + strikeoutRate * 6.5 - era * 4.2 - whip * 8.3), 25, 95);
}

export function scoreSeasonPerformanceForPlayer(player: Player, stats?: AggregatedSeasonStats) {
  if (!stats) return clamp(player.seasonDevelopmentContext.performanceScore, 35, 75);
  if (player.pitching && stats.pitching && player.offense && stats.batting) {
    const pitchingScore = scorePitcherPerformanceByFamily(player, stats.pitching);
    const hittingScore = scoreHitterPerformanceByFamily(player, stats.batting, stats.fielding);
    return clamp(Math.round(pitchingScore * 0.58 + hittingScore * 0.42), 25, 95);
  }
  if (player.pitching && stats.pitching) {
    return scorePitcherPerformanceByFamily(player, stats.pitching);
  }
  if (player.offense && stats.batting) {
    return scoreHitterPerformanceByFamily(player, stats.batting, stats.fielding);
  }
  return clamp(player.seasonDevelopmentContext.performanceScore, 35, 75);
}

export function scorePlayingTimeForPlayer(player: Player, stats?: AggregatedSeasonStats) {
  const family = getArchetypeDefinition(player.archetype).family;
  if (!stats) return clamp(player.seasonDevelopmentContext.playingTimeScore, 30, 75);

  if (player.pitching && stats.pitching) {
    const innings = stats.pitching.outsRecorded / 3;
    if (family === 'starters') {
      return clamp(Math.round(30 + stats.pitching.gamesStarted * 3.2 + innings * 0.38), 25, 95);
    }
    if (family === 'relievers') {
      return clamp(Math.round(28 + stats.pitching.games * 1.9 + innings * 0.28), 25, 95);
    }
    return clamp(Math.round(30 + stats.pitching.games * 1.4 + innings * 0.32), 25, 95);
  }

  if (player.offense && stats.batting) {
    const pa = stats.batting.plateAppearances;
    if (family === 'catchers') {
      return clamp(Math.round(28 + pa * 0.18 + (stats.fielding?.games ?? 0) * 0.3), 25, 95);
    }
    if (family === 'designated-hitters') {
      return clamp(Math.round(30 + pa * 0.21), 25, 95);
    }
    return clamp(Math.round(28 + pa * 0.19 + (stats.fielding?.games ?? 0) * 0.2), 25, 95);
  }

  return clamp(player.seasonDevelopmentContext.playingTimeScore, 30, 75);
}

function classYearMultiplier(classYear: ClassYear) {
  if (classYear === 'FR') return 1.05;
  if (classYear === 'SO') return 0.88;
  if (classYear === 'JR') return 0.64;
  return 0.42;
}

function weightedAverage(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function scorePlayerOverall(player: Player) {
  if (player.pitching) {
    const p = player.pitching;
    const d = player.defense;
    return clamp(
      Math.round(p.stuff * 0.28 + p.command * 0.2 + p.movement * 0.18 + p.stamina * 0.12 + p.composure * 0.12 + p.groundBall * 0.06 + (d?.defense ?? 50) * 0.02 + (d?.arm ?? 50) * 0.02),
      40,
      95,
    );
  }
  if (player.offense && player.defense) {
    const o = player.offense;
    const d = player.defense;
    return clamp(
      Math.round(o.contact * 0.2 + o.power * 0.18 + o.eye * 0.12 + o.avoidK * 0.12 + o.gap * 0.08 + o.speed * 0.09 + o.baserunning * 0.07 + d.defense * 0.09 + d.arm * 0.05),
      40,
      95,
    );
  }
  return player.overall;
}

export function rebalancePlayerRatings(player: Player) {
  const nextOffense = player.offense
    ? {
      ...player.offense,
      contact: compressHighRating(player.offense.contact, 84, 0.45),
      power: compressHighRating(player.offense.power, 82, 0.42),
      eye: compressHighRating(player.offense.eye, 83, 0.44),
      avoidK: compressHighRating(player.offense.avoidK, 83, 0.44),
      gap: compressHighRating(player.offense.gap, 82, 0.42),
      speed: compressHighRating(player.offense.speed, 80, 0.4),
      baserunning: compressHighRating(player.offense.baserunning, 80, 0.4),
    }
    : undefined;
  const nextPitching = player.pitching
    ? {
      ...player.pitching,
      stuff: compressHighRating(player.pitching.stuff, 84, 0.45),
      command: compressHighRating(player.pitching.command, 83, 0.44),
      movement: compressHighRating(player.pitching.movement, 83, 0.44),
      stamina: compressHighRating(player.pitching.stamina, 82, 0.4),
      composure: compressHighRating(player.pitching.composure, 83, 0.44),
      groundBall: compressHighRating(player.pitching.groundBall, 81, 0.4),
    }
    : undefined;
  const nextDefense = player.defense
    ? {
      ...player.defense,
      defense: compressHighRating(player.defense.defense, 83, 0.42),
      arm: compressHighRating(player.defense.arm, 83, 0.42),
    }
    : undefined;
  const recomputedOverall = scorePlayerOverall({
    ...player,
    offense: nextOffense,
    pitching: nextPitching,
    defense: nextDefense,
  });
  const nextOverall = compressHighRating(recomputedOverall, 84, 0.48, 40, 92);
  const nextPotential = clamp(
    Math.max(nextOverall + 1, compressHighRating(player.potential, 88, 0.5, 45, 94)),
    nextOverall + 1,
    94,
  );

  return {
    ...player,
    offense: nextOffense,
    pitching: nextPitching,
    defense: nextDefense,
    overall: nextOverall,
    potential: nextPotential,
  };
}

function boostMetrics<T extends object>(metrics: T | undefined, weights: Partial<Record<keyof T, number>> | undefined, magnitude: number, ceiling: number): T | undefined {
  if (!metrics || !weights || magnitude <= 0) return metrics;
  const entries = Object.entries(weights) as Array<[keyof T, number]>;
  const totalWeight = entries.reduce((sum, [, value]) => sum + value, 0);
  const next = { ...metrics } as T & Record<string, number>;
  for (const [key, value] of entries) {
    const delta = Math.max(0, Math.round((magnitude * value) / Math.max(1, totalWeight)));
    const field = key as string;
    (next as Record<string, number>)[field] = clamp(Math.round((next as Record<string, number>)[field] + delta), 25, ceiling);
  }
  return next as T;
}

function buildProgressSummary(overallDelta: number, coachFit: number, healthScore: number, performanceScore: number) {
  if (healthScore < 48) return 'Growth slowed by injuries and inconsistent availability.';
  if (coachFit >= 78 && overallDelta >= 3) return 'Improving steadily under strong coach fit.';
  if (performanceScore < 45 && overallDelta <= 1) return 'Tools held steady despite a rough season.';
  if (overallDelta >= 2) return 'Late-bloom upside remains and the year moved him forward.';
  return 'Progress stayed modest, but the long-term ceiling remains intact.';
}

export function progressPlayerForOffseason(player: Player, input: OffseasonProgressionInput): Player {
  const coachFit = calculateCoachFit(player, input.coachingStaff).score;
  const gap = Math.max(0, player.potential - player.overall);
  const growthWindow = gap / 18;
  const classMultiplier = classYearMultiplier(player.classYear);
  const profileBoost = weightedAverage([
    player.developmentCurve,
    player.developmentProfile.workEthic,
    player.developmentProfile.coachability,
    player.developmentProfile.ceilingReliability,
  ]);
  const environmentScore = weightedAverage([
    input.performanceScore * 0.8,
    input.healthScore,
    input.moraleScore,
    input.playingTimeScore,
    input.teamChemistryScore,
    coachFit,
  ]);

  const rawGrowth = classMultiplier * growthWindow * (profileBoost / 65) * (environmentScore / 62);
  const ratingGain = clamp(Math.round(rawGrowth * 3.4), 0, Math.max(1, Math.min(6, gap)));
  const potentialShiftSignal = weightedAverage([
    input.healthScore,
    coachFit,
    player.developmentProfile.workEthic,
    player.developmentProfile.ceilingReliability,
    player.personalityProfile.resilience,
  ]);
  const potentialDelta = potentialShiftSignal >= 82 ? 1 : potentialShiftSignal <= 34 ? -1 : 0;
  const nextPotential = clamp(Math.max(player.overall + ratingGain, player.potential + potentialDelta), player.overall + ratingGain, 95);

  const definition = getArchetypeDefinition(player.archetype);
  const nextOffense = boostMetrics(player.offense, definition.offenseWeights as Partial<Record<keyof OffenseRatings, number>> | undefined, ratingGain, 94);
  const nextPitching = boostMetrics(player.pitching, definition.pitchingWeights as Partial<Record<keyof PitchingRatings, number>> | undefined, ratingGain, 94);
  const nextDefense = boostMetrics(player.defense, definition.defenseWeights as Partial<Record<keyof DefenseRatings, number>> | undefined, Math.max(1, Math.round(ratingGain * 0.8)), 93);
  const nextDurability = clamp(player.durability + Math.max(0, Math.round((input.healthScore - 55) / 18)), 35, 95);
  const nextMorale = clamp(Math.round(player.morale * 0.55 + input.moraleScore * 0.45 + input.teamChemistryScore * 0.08), 35, 95);

  const evolved = enrichPlayerDevelopment({
    ...player,
    offense: nextOffense,
    pitching: nextPitching,
    defense: nextDefense,
    durability: nextDurability,
    morale: nextMorale,
    leadership: {
      ...player.leadership,
      current: clamp(player.leadership.current + Math.max(0, Math.round((player.personalityProfile.teamFirst + input.teamChemistryScore - 110) / 22)), 15, player.leadership.potential),
    },
    potential: nextPotential,
  });

  const recomputedOverall = scorePlayerOverall(evolved);
  const realizedOverallCap = player.overall + ratingGain + Math.max(0, Math.round(player.seasonDevelopmentContext.inSeasonProgress / 4));
  const nextOverall = clamp(Math.min(nextPotential, recomputedOverall, realizedOverallCap), player.overall, 95);
  const historyEntry: DevelopmentHistoryEntry = {
    year: input.year,
    classYear: player.classYear,
    overallBefore: player.overall,
    overallAfter: nextOverall,
    potentialBefore: player.potential,
    potentialAfter: nextPotential,
    coachFit,
    performanceScore: input.performanceScore,
    healthScore: input.healthScore,
    moraleScore: input.moraleScore,
    chemistryScore: input.teamChemistryScore,
    summary: buildProgressSummary(nextOverall - player.overall, coachFit, input.healthScore, input.performanceScore),
  };

  return {
    ...evolved,
    overall: nextOverall,
    potential: nextPotential,
    developmentHistory: [...player.developmentHistory, historyEntry].slice(-6),
    seasonDevelopmentContext: {
      inSeasonProgress: 0,
      coachFit,
      performanceScore: input.performanceScore,
      healthScore: input.healthScore,
      moraleScore: input.moraleScore,
      playingTimeScore: input.playingTimeScore,
      chemistryScore: input.teamChemistryScore,
      note: historyEntry.summary,
    },
  };
}

export function applyInSeasonDevelopmentTick(player: Player, coachingStaff: CoachingStaff, teamChemistryScore: number, performanceBump: number, playingTimeScore: number) {
  const coachFit = calculateCoachFit(player, coachingStaff).score;
  const progressGain = clamp(
    Math.round(
      ((player.developmentProfile.workEthic + player.developmentProfile.coachability + coachFit + teamChemistryScore) / 4
      + performanceBump
      + playingTimeScore
      - player.rosterStatus.injuryRisk * 0.2) / 16,
    ),
    -1,
    3,
  );
  const morale = clamp(player.morale + Math.round((teamChemistryScore - 55) / 20) + Math.round((performanceBump - 50) / 30), 35, 95);

  return {
    ...player,
    morale,
    seasonDevelopmentContext: {
      ...player.seasonDevelopmentContext,
      inSeasonProgress: clamp(player.seasonDevelopmentContext.inSeasonProgress + progressGain, -8, 14),
      coachFit,
      performanceScore: clamp(Math.round((player.seasonDevelopmentContext.performanceScore * 0.7) + (performanceBump * 0.3)), 25, 95),
      healthScore: clamp(100 - player.rosterStatus.injuryRisk - player.rosterStatus.fatigue, 25, 95),
      moraleScore: morale,
      playingTimeScore,
      chemistryScore: teamChemistryScore,
      note: progressGain >= 2
        ? 'Stacking useful in-season growth.'
        : progressGain <= 0
          ? 'Development is mostly holding pattern right now.'
          : 'Incremental in-season growth is showing up.',
    },
  };
}
