import type {
  ClassYear,
  Player,
  PlayerArchetype,
  Position,
  PrestigeHistorySummary,
  PrestigeProfile,
  Program,
  Recruit,
  TransferPortalEntry,
} from '../types/models';
import { clamp, createSeededRandom } from '../lib/random';

interface ProgramInput {
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
  scholarshipBudget: number;
  schoolNilPool: number;
  donorConfidence: number;
  facilities: number;
  nilAttractiveness: number;
  developmentReputation: number;
  history: PrestigeHistorySummary;
}

const NCAA_D1_EQUIVALENCY_CAP = 11.7;

const programInputs: ProgramInput[] = [
  {
    id: 'vanderbilt',
    school: 'Vanderbilt',
    nickname: 'Commodores',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#d3bc8d', secondary: '#101820' },
    conferenceTier: 95,
    parkFactor: 1.01,
    travelDifficulty: 42,
    scholarshipBudget: 34,
    schoolNilPool: 1100000,
    donorConfidence: 88,
    facilities: 93,
    nilAttractiveness: 91,
    developmentReputation: 96,
    history: {
      avgRpiRank: 8,
      topEightRpiFinishes: 6,
      nationalTitles: 2,
      cwsFinals: 4,
      cwsTrips: 5,
      superRegionalTrips: 7,
      regionalTrips: 9,
      recentTrend: 8,
    },
  },
  {
    id: 'lsu',
    school: 'LSU',
    nickname: 'Tigers',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#461d7c', secondary: '#fdd023' },
    conferenceTier: 95,
    parkFactor: 1.05,
    travelDifficulty: 38,
    scholarshipBudget: 34,
    schoolNilPool: 1250000,
    donorConfidence: 94,
    facilities: 94,
    nilAttractiveness: 95,
    developmentReputation: 92,
    history: {
      avgRpiRank: 10,
      topEightRpiFinishes: 6,
      nationalTitles: 8,
      cwsFinals: 2,
      cwsTrips: 4,
      superRegionalTrips: 7,
      regionalTrips: 9,
      recentTrend: 10,
    },
  },
  {
    id: 'florida',
    school: 'Florida',
    nickname: 'Gators',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#0021a5', secondary: '#fa4616' },
    conferenceTier: 95,
    parkFactor: 1.02,
    travelDifficulty: 40,
    scholarshipBudget: 34,
    schoolNilPool: 1025000,
    donorConfidence: 87,
    facilities: 90,
    nilAttractiveness: 89,
    developmentReputation: 91,
    history: {
      avgRpiRank: 13,
      topEightRpiFinishes: 5,
      nationalTitles: 1,
      cwsFinals: 2,
      cwsTrips: 4,
      superRegionalTrips: 6,
      regionalTrips: 8,
      recentTrend: 6,
    },
  },
  {
    id: 'tennessee',
    school: 'Tennessee',
    nickname: 'Volunteers',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#ff8200', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.04,
    travelDifficulty: 44,
    scholarshipBudget: 34,
    schoolNilPool: 1185000,
    donorConfidence: 91,
    facilities: 90,
    nilAttractiveness: 94,
    developmentReputation: 86,
    history: {
      avgRpiRank: 16,
      topEightRpiFinishes: 4,
      nationalTitles: 1,
      cwsFinals: 1,
      cwsTrips: 3,
      superRegionalTrips: 5,
      regionalTrips: 7,
      recentTrend: 11,
    },
  },
  {
    id: 'arkansas',
    school: 'Arkansas',
    nickname: 'Razorbacks',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#9d2235', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.03,
    travelDifficulty: 46,
    scholarshipBudget: 34,
    schoolNilPool: 980000,
    donorConfidence: 92,
    facilities: 91,
    nilAttractiveness: 88,
    developmentReputation: 88,
    history: {
      avgRpiRank: 11,
      topEightRpiFinishes: 5,
      nationalTitles: 0,
      cwsFinals: 1,
      cwsTrips: 4,
      superRegionalTrips: 7,
      regionalTrips: 8,
      recentTrend: 7,
    },
  },
  {
    id: 'texas',
    school: 'Texas',
    nickname: 'Longhorns',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#bf5700', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1,
    travelDifficulty: 44,
    scholarshipBudget: 34,
    schoolNilPool: 1050000,
    donorConfidence: 90,
    facilities: 91,
    nilAttractiveness: 90,
    developmentReputation: 90,
    history: {
      avgRpiRank: 17,
      topEightRpiFinishes: 4,
      nationalTitles: 6,
      cwsFinals: 0,
      cwsTrips: 2,
      superRegionalTrips: 6,
      regionalTrips: 8,
      recentTrend: 5,
    },
  },
  {
    id: 'virginia',
    school: 'Virginia',
    nickname: 'Cavaliers',
    conference: 'ACC',
    region: 'East',
    colors: { primary: '#232d4b', secondary: '#f84c1e' },
    conferenceTier: 90,
    parkFactor: 0.98,
    travelDifficulty: 49,
    scholarshipBudget: 34,
    schoolNilPool: 910000,
    donorConfidence: 82,
    facilities: 86,
    nilAttractiveness: 81,
    developmentReputation: 89,
    history: {
      avgRpiRank: 20,
      topEightRpiFinishes: 4,
      nationalTitles: 1,
      cwsFinals: 2,
      cwsTrips: 3,
      superRegionalTrips: 5,
      regionalTrips: 8,
      recentTrend: 4,
    },
  },
  {
    id: 'north-carolina',
    school: 'North Carolina',
    nickname: 'Tar Heels',
    conference: 'ACC',
    region: 'East',
    colors: { primary: '#7bafd4', secondary: '#13294b' },
    conferenceTier: 90,
    parkFactor: 1.01,
    travelDifficulty: 48,
    scholarshipBudget: 34,
    schoolNilPool: 860000,
    donorConfidence: 80,
    facilities: 84,
    nilAttractiveness: 79,
    developmentReputation: 84,
    history: {
      avgRpiRank: 19,
      topEightRpiFinishes: 4,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 2,
      superRegionalTrips: 5,
      regionalTrips: 7,
      recentTrend: 6,
    },
  },
  {
    id: 'wake-forest',
    school: 'Wake Forest',
    nickname: 'Demon Deacons',
    conference: 'ACC',
    region: 'East',
    colors: { primary: '#9e7e38', secondary: '#000000' },
    conferenceTier: 90,
    parkFactor: 1.07,
    travelDifficulty: 47,
    scholarshipBudget: 34,
    schoolNilPool: 770000,
    donorConfidence: 83,
    facilities: 86,
    nilAttractiveness: 78,
    developmentReputation: 85,
    history: {
      avgRpiRank: 23,
      topEightRpiFinishes: 3,
      nationalTitles: 1,
      cwsFinals: 0,
      cwsTrips: 1,
      superRegionalTrips: 4,
      regionalTrips: 6,
      recentTrend: 8,
    },
  },
  {
    id: 'florida-state',
    school: 'Florida State',
    nickname: 'Seminoles',
    conference: 'ACC',
    region: 'South',
    colors: { primary: '#782f40', secondary: '#ceb888' },
    conferenceTier: 90,
    parkFactor: 1.02,
    travelDifficulty: 43,
    scholarshipBudget: 34,
    schoolNilPool: 835000,
    donorConfidence: 82,
    facilities: 83,
    nilAttractiveness: 76,
    developmentReputation: 84,
    history: {
      avgRpiRank: 24,
      topEightRpiFinishes: 2,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 1,
      superRegionalTrips: 4,
      regionalTrips: 6,
      recentTrend: 7,
    },
  },
  {
    id: 'clemson',
    school: 'Clemson',
    nickname: 'Tigers',
    conference: 'ACC',
    region: 'South',
    colors: { primary: '#f56600', secondary: '#522d80' },
    conferenceTier: 90,
    parkFactor: 1.03,
    travelDifficulty: 44,
    scholarshipBudget: 34,
    schoolNilPool: 790000,
    donorConfidence: 79,
    facilities: 82,
    nilAttractiveness: 77,
    developmentReputation: 80,
    history: {
      avgRpiRank: 27,
      topEightRpiFinishes: 2,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 0,
      superRegionalTrips: 3,
      regionalTrips: 6,
      recentTrend: 6,
    },
  },
  {
    id: 'oregon-state',
    school: 'Oregon State',
    nickname: 'Beavers',
    conference: 'Independent',
    region: 'West',
    colors: { primary: '#dc4405', secondary: '#000000' },
    conferenceTier: 84,
    parkFactor: 0.96,
    travelDifficulty: 55,
    scholarshipBudget: 34,
    schoolNilPool: 760000,
    donorConfidence: 83,
    facilities: 84,
    nilAttractiveness: 74,
    developmentReputation: 91,
    history: {
      avgRpiRank: 15,
      topEightRpiFinishes: 4,
      nationalTitles: 3,
      cwsFinals: 1,
      cwsTrips: 4,
      superRegionalTrips: 5,
      regionalTrips: 7,
      recentTrend: 4,
    },
  },
  {
    id: 'ucla',
    school: 'UCLA',
    nickname: 'Bruins',
    conference: 'Big Ten',
    region: 'West',
    colors: { primary: '#2774ae', secondary: '#ffd100' },
    conferenceTier: 83,
    parkFactor: 0.97,
    travelDifficulty: 57,
    scholarshipBudget: 34,
    schoolNilPool: 810000,
    donorConfidence: 77,
    facilities: 82,
    nilAttractiveness: 78,
    developmentReputation: 88,
    history: {
      avgRpiRank: 26,
      topEightRpiFinishes: 3,
      nationalTitles: 1,
      cwsFinals: 0,
      cwsTrips: 2,
      superRegionalTrips: 4,
      regionalTrips: 6,
      recentTrend: 5,
    },
  },
  {
    id: 'arizona',
    school: 'Arizona',
    nickname: 'Wildcats',
    conference: 'Big 12',
    region: 'West',
    colors: { primary: '#003366', secondary: '#cc0033' },
    conferenceTier: 86,
    parkFactor: 1.04,
    travelDifficulty: 54,
    scholarshipBudget: 34,
    schoolNilPool: 710000,
    donorConfidence: 74,
    facilities: 80,
    nilAttractiveness: 72,
    developmentReputation: 81,
    history: {
      avgRpiRank: 30,
      topEightRpiFinishes: 2,
      nationalTitles: 4,
      cwsFinals: 1,
      cwsTrips: 2,
      superRegionalTrips: 4,
      regionalTrips: 6,
      recentTrend: 3,
    },
  },
  {
    id: 'oklahoma-state',
    school: 'Oklahoma State',
    nickname: 'Cowboys',
    conference: 'Big 12',
    region: 'Central',
    colors: { primary: '#ff7300', secondary: '#000000' },
    conferenceTier: 86,
    parkFactor: 1.02,
    travelDifficulty: 45,
    scholarshipBudget: 34,
    schoolNilPool: 745000,
    donorConfidence: 75,
    facilities: 81,
    nilAttractiveness: 73,
    developmentReputation: 80,
    history: {
      avgRpiRank: 29,
      topEightRpiFinishes: 2,
      nationalTitles: 1,
      cwsFinals: 0,
      cwsTrips: 1,
      superRegionalTrips: 4,
      regionalTrips: 7,
      recentTrend: 2,
    },
  },
  {
    id: 'tcu',
    school: 'TCU',
    nickname: 'Horned Frogs',
    conference: 'Big 12',
    region: 'Central',
    colors: { primary: '#4d1979', secondary: '#a3a9ac' },
    conferenceTier: 86,
    parkFactor: 1.01,
    travelDifficulty: 43,
    scholarshipBudget: 34,
    schoolNilPool: 720000,
    donorConfidence: 76,
    facilities: 81,
    nilAttractiveness: 71,
    developmentReputation: 79,
    history: {
      avgRpiRank: 27,
      topEightRpiFinishes: 2,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 1,
      superRegionalTrips: 4,
      regionalTrips: 7,
      recentTrend: 1,
    },
  },
  {
    id: 'texas-am',
    school: 'Texas A&M',
    nickname: 'Aggies',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#500000', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.04,
    travelDifficulty: 43,
    scholarshipBudget: 34,
    schoolNilPool: 1000000,
    donorConfidence: 89,
    facilities: 89,
    nilAttractiveness: 89,
    developmentReputation: 84,
    history: {
      avgRpiRank: 21,
      topEightRpiFinishes: 3,
      nationalTitles: 0,
      cwsFinals: 1,
      cwsTrips: 2,
      superRegionalTrips: 5,
      regionalTrips: 7,
      recentTrend: 9,
    },
  },
  {
    id: 'ole-miss',
    school: 'Ole Miss',
    nickname: 'Rebels',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#ce1126', secondary: '#14213d' },
    conferenceTier: 95,
    parkFactor: 1.03,
    travelDifficulty: 42,
    scholarshipBudget: 34,
    schoolNilPool: 910000,
    donorConfidence: 84,
    facilities: 85,
    nilAttractiveness: 84,
    developmentReputation: 79,
    history: {
      avgRpiRank: 28,
      topEightRpiFinishes: 2,
      nationalTitles: 1,
      cwsFinals: 1,
      cwsTrips: 1,
      superRegionalTrips: 3,
      regionalTrips: 6,
      recentTrend: 5,
    },
  },
  {
    id: 'mississippi-state',
    school: 'Mississippi State',
    nickname: 'Bulldogs',
    conference: 'SEC',
    region: 'South',
    colors: { primary: '#660000', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.02,
    travelDifficulty: 42,
    scholarshipBudget: 34,
    schoolNilPool: 880000,
    donorConfidence: 83,
    facilities: 84,
    nilAttractiveness: 82,
    developmentReputation: 80,
    history: {
      avgRpiRank: 31,
      topEightRpiFinishes: 2,
      nationalTitles: 1,
      cwsFinals: 1,
      cwsTrips: 2,
      superRegionalTrips: 3,
      regionalTrips: 6,
      recentTrend: 1,
    },
  },
  {
    id: 'east-carolina',
    school: 'East Carolina',
    nickname: 'Pirates',
    conference: 'American',
    region: 'East',
    colors: { primary: '#592a8a', secondary: '#ffcd00' },
    conferenceTier: 76,
    parkFactor: 1.01,
    travelDifficulty: 46,
    scholarshipBudget: 32,
    schoolNilPool: 520000,
    donorConfidence: 70,
    facilities: 73,
    nilAttractiveness: 64,
    developmentReputation: 74,
    history: {
      avgRpiRank: 33,
      topEightRpiFinishes: 1,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 0,
      superRegionalTrips: 4,
      regionalTrips: 7,
      recentTrend: 4,
    },
  },
  {
    id: 'dallas-baptist',
    school: 'Dallas Baptist',
    nickname: 'Patriots',
    conference: 'Conference USA',
    region: 'Central',
    colors: { primary: '#002e5d', secondary: '#c99700' },
    conferenceTier: 74,
    parkFactor: 1.04,
    travelDifficulty: 40,
    scholarshipBudget: 31,
    schoolNilPool: 510000,
    donorConfidence: 68,
    facilities: 76,
    nilAttractiveness: 63,
    developmentReputation: 76,
    history: {
      avgRpiRank: 36,
      topEightRpiFinishes: 1,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 0,
      superRegionalTrips: 2,
      regionalTrips: 8,
      recentTrend: 2,
    },
  },
  {
    id: 'coastal-carolina',
    school: 'Coastal Carolina',
    nickname: 'Chanticleers',
    conference: 'Sun Belt',
    region: 'South',
    colors: { primary: '#006f71', secondary: '#a27752' },
    conferenceTier: 78,
    parkFactor: 1.02,
    travelDifficulty: 45,
    scholarshipBudget: 32,
    schoolNilPool: 600000,
    donorConfidence: 72,
    facilities: 75,
    nilAttractiveness: 67,
    developmentReputation: 78,
    history: {
      avgRpiRank: 37,
      topEightRpiFinishes: 2,
      nationalTitles: 1,
      cwsFinals: 2,
      cwsTrips: 2,
      superRegionalTrips: 3,
      regionalTrips: 6,
      recentTrend: 8,
    },
  },
  {
    id: 'southern-miss',
    school: 'Southern Miss',
    nickname: 'Golden Eagles',
    conference: 'Sun Belt',
    region: 'South',
    colors: { primary: '#000000', secondary: '#ffcc00' },
    conferenceTier: 78,
    parkFactor: 1.03,
    travelDifficulty: 41,
    scholarshipBudget: 32,
    schoolNilPool: 470000,
    donorConfidence: 66,
    facilities: 71,
    nilAttractiveness: 60,
    developmentReputation: 72,
    history: {
      avgRpiRank: 39,
      topEightRpiFinishes: 1,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 0,
      superRegionalTrips: 2,
      regionalTrips: 7,
      recentTrend: 5,
    },
  },
  {
    id: 'uc-irvine',
    school: 'UC Irvine',
    nickname: 'Anteaters',
    conference: 'Big West',
    region: 'West',
    colors: { primary: '#0064a4', secondary: '#ffc72c' },
    conferenceTier: 73,
    parkFactor: 0.95,
    travelDifficulty: 49,
    scholarshipBudget: 31,
    schoolNilPool: 390000,
    donorConfidence: 62,
    facilities: 68,
    nilAttractiveness: 56,
    developmentReputation: 69,
    history: {
      avgRpiRank: 44,
      topEightRpiFinishes: 0,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 0,
      superRegionalTrips: 1,
      regionalTrips: 5,
      recentTrend: 4,
    },
  },
  {
    id: 'indiana-state',
    school: 'Indiana State',
    nickname: 'Sycamores',
    conference: 'Missouri Valley',
    region: 'Midwest',
    colors: { primary: '#1d4f91', secondary: '#ffffff' },
    conferenceTier: 69,
    parkFactor: 0.99,
    travelDifficulty: 43,
    scholarshipBudget: 30,
    schoolNilPool: 330000,
    donorConfidence: 58,
    facilities: 65,
    nilAttractiveness: 52,
    developmentReputation: 64,
    history: {
      avgRpiRank: 50,
      topEightRpiFinishes: 0,
      nationalTitles: 0,
      cwsFinals: 0,
      cwsTrips: 0,
      superRegionalTrips: 0,
      regionalTrips: 3,
      recentTrend: 3,
    },
  },
];

const firstNames = [
  'Cade', 'Mason', 'Ty', 'Walker', 'Drew', 'Cole', 'Jace', 'Hudson', 'Brett', 'Griffin',
  'Parker', 'Noah', 'Caleb', 'Ethan', 'Landon', 'Logan', 'Luke', 'Carter', 'Kade', 'Aiden',
];
const lastNames = [
  'Mercer', 'Dalton', 'Hayes', 'McBride', 'Sloan', 'Booker', 'Temple', 'Raines', 'Bennett',
  'Hollis', 'Barker', 'Davenport', 'Chandler', 'Whitlock', 'Maddox', 'Pryor', 'Hawkins',
  'Witt', 'Sanders', 'Hale',
];
const hometowns = ['Nashville, TN', 'Tampa, FL', 'Houston, TX', 'Raleigh, NC', 'Baton Rouge, LA', 'Tulsa, OK', 'Scottsdale, AZ', 'Athens, GA', 'Irvine, CA', 'Jackson, MS'];

function derivePrestigeProfile(input: ProgramInput): PrestigeProfile {
  const rpiScore = clamp(100 - input.history.avgRpiRank * 1.7 + input.history.topEightRpiFinishes * 4, 30, 99);
  const championshipScore = clamp(
    input.history.nationalTitles * 16 +
      input.history.cwsFinals * 4 +
      input.history.cwsTrips * 2.5,
    12,
    99,
  );
  const postseasonScore = clamp(
    input.history.nationalTitles * 28 +
      input.history.cwsFinals * 8 +
      input.history.cwsTrips * 5 +
      input.history.superRegionalTrips * 2.5 +
      input.history.regionalTrips * 1.2,
    18,
    99,
  );
  const overall = clamp(
    rpiScore * 0.34 +
      postseasonScore * 0.3 +
      championshipScore * 0.18 +
      input.conferenceTier * 0.08 +
      ((input.nilAttractiveness + input.facilities + input.developmentReputation) / 3) * 0.1,
    35,
    98,
  );

  return {
    overall: Math.round(overall),
    competitivePrestige: Math.round(clamp(rpiScore * 0.34 + postseasonScore * 0.38 + championshipScore * 0.28, 30, 99)),
    developmentReputation: input.developmentReputation,
    nilAttractiveness: input.nilAttractiveness,
    conferenceModifier: input.conferenceTier,
    momentumModifier: input.history.recentTrend,
    history: input.history,
  };
}

function buildPrograms(): Program[] {
  return programInputs.map((input) => ({
    id: input.id,
    school: input.school,
    nickname: input.nickname,
    conference: input.conference,
    region: input.region,
    colors: input.colors,
    conferenceTier: input.conferenceTier,
    parkFactor: input.parkFactor,
    travelDifficulty: input.travelDifficulty,
    resources: {
      scholarshipBudget: NCAA_D1_EQUIVALENCY_CAP,
      schoolNilPool: input.schoolNilPool,
      donorConfidence: input.donorConfidence,
      facilities: input.facilities,
    },
    prestige: derivePrestigeProfile(input),
  }));
}

function createName(randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return `${random.pick(firstNames)} ${random.pick(lastNames)}`;
}

function buildOffense(base: number, randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return {
    contact: clamp(Math.round(base + random.int(-8, 8)), 35, 99),
    power: clamp(Math.round(base + random.int(-15, 15)), 30, 99),
    eye: clamp(Math.round(base + random.int(-10, 12)), 30, 99),
    avoidK: clamp(Math.round(base + random.int(-10, 10)), 30, 99),
    gap: clamp(Math.round(base + random.int(-12, 12)), 30, 99),
    speed: clamp(Math.round(base + random.int(-18, 14)), 28, 99),
    baserunning: clamp(Math.round(base + random.int(-15, 12)), 28, 99),
  };
}

function buildPitching(base: number, randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return {
    stuff: clamp(Math.round(base + random.int(-8, 12)), 35, 99),
    command: clamp(Math.round(base + random.int(-12, 10)), 35, 99),
    movement: clamp(Math.round(base + random.int(-10, 10)), 35, 99),
    stamina: clamp(Math.round(base + random.int(-10, 10)), 35, 99),
    composure: clamp(Math.round(base + random.int(-12, 12)), 35, 99),
    groundBall: clamp(Math.round(base + random.int(-15, 15)), 25, 95),
  };
}

function buildDefense(base: number, randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return {
    defense: clamp(Math.round(base + random.int(-12, 12)), 30, 99),
    arm: clamp(Math.round(base + random.int(-15, 15)), 30, 99),
  };
}

function createPlayer(program: Program, index: number, role: 'hitter' | 'pitcher', slot: Position): Player {
  const seed = `${program.id}-${index}-${role}`;
  const random = createSeededRandom(seed);
  const prestigeBase = program.prestige.overall;
  const overallBase = prestigeBase - 10 + random.int(-12, 12);
  const classYears: ClassYear[] = ['FR', 'SO', 'JR', 'SR'];
  const classYear = classYears[random.int(0, classYears.length - 1)];
  const archetypes: PlayerArchetype[] =
    role === 'pitcher'
      ? ['power-arm', 'command-arm', 'bullpen-fireman']
      : ['table-setter', 'slugger', 'contact-bat', 'glove-first', 'two-way-star'];

  const player: Player = {
    id: `${program.id}-player-${index}`,
    name: createName(seed),
    hometown: random.pick(hometowns),
    programId: program.id,
    classYear,
    eligibilityYears: classYear === 'SR' ? 1 : classYear === 'JR' ? 2 : classYear === 'SO' ? 3 : 4,
    age: classYear === 'SR' ? 22 : classYear === 'JR' ? 21 : classYear === 'SO' ? 20 : 19,
    role,
    primaryPosition: slot,
    secondaryPositions: role === 'pitcher' ? ['RP'] : slot === 'CF' ? ['LF', 'RF'] : slot === 'SS' ? ['2B', '3B'] : ['DH'],
    bats: random.pick<"L" | "R" | "S">(['L', 'R', 'R', 'R', 'S']),
    throws: random.pick<"L" | "R">(['L', 'R', 'R', 'R']),
    archetype: random.pick(archetypes),
    overall: clamp(Math.round(overallBase), 42, 97),
    potential: clamp(Math.round(overallBase + random.int(-4, 12)), 45, 99),
    signability: clamp(40 + random.int(0, 50), 40, 95),
    marketability: clamp(35 + random.int(0, 50) + Math.round(program.prestige.nilAttractiveness * 0.15), 35, 99),
    morale: clamp(55 + random.int(0, 35), 45, 99),
    durability: clamp(50 + random.int(0, 40), 40, 95),
    developmentCurve: clamp(50 + random.int(0, 40), 40, 95),
    preferences: {
      proximity: clamp(35 + random.int(0, 50), 30, 90),
      playingTime: clamp(40 + random.int(0, 45), 35, 95),
      prestige: clamp(50 + random.int(0, 40), 40, 95),
      nil: clamp(40 + random.int(0, 50), 35, 95),
      development: clamp(45 + random.int(0, 45), 35, 95),
    },
    rosterStatus: {
      scholarshipPct: 0,
      schoolNilValue: 2500 + random.int(0, 18000),
      thirdPartyNilValue: random.int(0, 14000),
      fatigue: 0,
      injuryRisk: clamp(15 + random.int(0, 50), 10, 75),
      certified: false,
    },
  };

  if (role !== 'pitcher') {
    player.offense = buildOffense(overallBase, `${seed}-off`);
    player.defense = buildDefense(overallBase - 2, `${seed}-def`);
  }
  if (role === 'pitcher') {
    player.pitching = buildPitching(overallBase + 1, `${seed}-pit`);
    player.defense = buildDefense(overallBase - 6, `${seed}-pdef`);
  }
  return player;
}

function rebalanceRosterScholarships(roster: Player[], scholarshipBudget: number) {
  const targetScholarshipPct = Math.round((scholarshipBudget * 100 * 0.93) / 5) * 5;
  const weights = roster.map((player) => {
    const classBonus = player.classYear === 'SR' ? 12 : player.classYear === 'JR' ? 8 : player.classYear === 'SO' ? 4 : 0;
    const roleBonus = player.pitching ? 6 : 3;
    return Math.max(12, player.overall + classBonus + roleBonus - 35);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const assigned = roster.map((player, index) => ({
    player,
    scholarshipPct: clamp(Math.round(((weights[index] / totalWeight) * targetScholarshipPct) / 5) * 5, 0, 65),
  }));

  let diff = targetScholarshipPct - assigned.reduce((sum, entry) => sum + entry.scholarshipPct, 0);
  const sortedIndexes = assigned
    .map((entry, index) => ({ index, overall: entry.player.overall }))
    .sort((left, right) => right.overall - left.overall)
    .map((entry) => entry.index);

  while (diff !== 0) {
    let changed = false;
    for (const index of sortedIndexes) {
      const entry = assigned[index];
      if (diff > 0 && entry.scholarshipPct <= 60) {
        entry.scholarshipPct += 5;
        diff -= 5;
        changed = true;
      } else if (diff < 0 && entry.scholarshipPct >= 5) {
        entry.scholarshipPct -= 5;
        diff += 5;
        changed = true;
      }

      if (diff === 0) {
        break;
      }
    }

    if (!changed) {
      break;
    }
  }

  return assigned.map(({ player, scholarshipPct }) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
      scholarshipPct,
    },
  }));
}

export const programs = buildPrograms();

export function createRosterForProgram(programId: string): Player[] {
  const program = programs.find((entry) => entry.id === programId);
  if (!program) {
    return [];
  }

  const positions: Position[] = [
    'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
    'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
    'C', 'CF',
  ].map((position) => position === 'OF' ? 'LF' : position as Position);

  const hitters = positions.map((position, index) => createPlayer(program, index + 1, 'hitter', position));
  const pitchers = Array.from({ length: 14 }, (_, index) => createPlayer(program, index + 101, 'pitcher', index < 4 ? 'SP' : 'RP'));

  return rebalanceRosterScholarships([...hitters, ...pitchers], program.resources.scholarshipBudget);
}

export function createRecruitBoard(programId: string, year: number = 1): Recruit[] {
  const program = programs.find((entry) => entry.id === programId);
  const prestige = program?.prestige.overall ?? 70;

  return Array.from({ length: 250 }, (_, index) => {
    const random = createSeededRandom(`${programId}-recruit-year${year}-${index}`);
    const pitcher = random.next() > 0.62;
    const positionPool: Position[] = pitcher ? ['SP', 'RP'] : ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    const stars = random.next() > 0.9 ? 5 : random.next() > 0.65 ? 4 : random.next() > 0.3 ? 3 : 2;
    const base = 55 + stars * 6 + random.int(-6, 8);
    return {
      id: `${programId}-recruit-${index}`,
      name: createName(`${programId}-recruit-name-${index}`),
      primaryPosition: random.pick(positionPool),
      region: random.pick(['South', 'East', 'West', 'Central', 'Midwest']),
      stars,
      interest: clamp(Math.round(prestige * 0.35 + random.int(5, 40)), 20, 95),
      signability: clamp(45 + stars * 9 + random.int(-6, 15), 35, 99),
      developmentCurve: clamp(base + random.int(-5, 8), 45, 99),
      marketability: clamp(base + random.int(-10, 12), 40, 99),
      preferences: {
        proximity: clamp(35 + random.int(0, 55), 30, 95),
        playingTime: clamp(45 + random.int(0, 45), 35, 99),
        prestige: clamp(45 + random.int(0, 50), 35, 99),
        nil: clamp(45 + random.int(0, 50), 35, 99),
        development: clamp(50 + random.int(0, 45), 35, 99),
      },
      offense: pitcher ? undefined : buildOffense(base, `${programId}-recruit-off-${index}`),
      defense: buildDefense(base, `${programId}-recruit-def-${index}`),
      pitching: pitcher ? buildPitching(base, `${programId}-recruit-pit-${index}`) : undefined,
      targeted: false,
      totalRecruitingPoints: 0,
      weeklyPointsSpent: 0,
      weeklyActions: [],
      scoutingLevel: 0,
    };
  });
}

export function createPortalEntries(programId: string, year: number = 1): TransferPortalEntry[] {
  const otherPrograms = programs.filter((entry) => entry.id !== programId);
  return Array.from({ length: 10 }, (_, index) => {
    const random = createSeededRandom(`${programId}-portal-year${year}-${index}`);
    const originProgram = random.pick(otherPrograms);
    const role = random.next() > 0.55 ? 'pitcher' : 'hitter';
    const position = role === 'pitcher' ? random.pick<Position>(['SP', 'RP']) : random.pick<Position>(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']);
    const player = createPlayer(originProgram, 500 + index, role, position);
    player.programId = '';
    player.rosterStatus.fatigue = random.int(0, 16);
    return {
      id: `${programId}-portal-${index}`,
      player,
      originProgramId: originProgram.id,
      askingSchoolNil: 12000 + random.int(0, 42000),
      askingScholarshipPct: clamp(10 + random.int(0, 35), 5, 45),
      interest: clamp(Math.round(originProgram.prestige.overall * 0.25 + random.int(20, 60)), 25, 98),
      tamperRisk: clamp(random.int(5, 70), 5, 80),
    };
  });
}

export function findProgram(programId: string) {
  return programs.find((program) => program.id === programId);
}
