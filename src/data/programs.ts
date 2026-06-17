import type {
  ClassYear,
  Player,
  Position,
  PrestigeProfile,
  Program,
  Recruit,
  TransferPortalEntry,
} from '../types/models';
import { clamp, createSeededRandom } from '../lib/random';
import {
  createLeagueCoachingStaffs,
  createLeadershipProfile,
  createPersonalityProfile,
  createSeasonDevelopmentContext,
  createDevelopmentProfile,
  enrichPlayerDevelopment,
  scorePlayerOverall,
  resolveArchetypeForPlayer,
} from '../lib/playerDevelopment';

interface ProgramInput {
  id: string;
  school: string;
  nickname: string;
  conference: string;
  location: { city: string; state: string; lat: number; lon: number; };
  colors: { primary: string; secondary: string; };
  conferenceTier: number;
  parkFactor: number;
  travelDifficulty: number;
  prestigeLevel: number;
}

const NCAA_D1_EQUIVALENCY_CAP = 11.7;
export const NATIONAL_RECRUIT_POOL_SIZE = 2000;
const DEFAULT_ROSTER_LIMIT = 34;

const BASEBALL_PRESTIGE_OVERRIDES: Record<string, number> = {
  LSU: 99,
  Texas: 97,
  Vanderbilt: 96,
  Florida: 94,
  Tennessee: 93,
  Arkansas: 95,
  'Texas A&M': 88,
  'Ole Miss': 86,
  'Mississippi State': 90,
  Virginia: 88,
  'North Carolina': 89,
  'Wake Forest': 84,
  'Florida State': 87,
  Clemson: 83,
  'Oregon State': 94,
  UCLA: 86,
  Arizona: 84,
  'Oklahoma State': 83,
  TCU: 90,
  'East Carolina': 82,
  'Dallas Baptist': 80,
  'Coastal Carolina': 84,
  'Southern Miss': 82,
  'UC Irvine': 76,
  'Indiana State': 74,
  'Georgia Tech': 87,
  Louisville: 85,
  'NC State': 84,
  Stanford: 78,
  'University of Miami': 79,
  'University of Virginia': 88,
  'North Carolina/Carolina': 89,
  'Wake Forest University': 84,
  'Florida State University': 87,
  'Clemson University': 83,
  'Penn State': 43,
  'Ohio State University': 52,
  Michigan: 59,
  'University of Michigan': 59,
  Nebraska: 70,
  Indiana: 71,
  Illinois: 68,
  Maryland: 72,
  Rutgers: 50,
  Purdue: 58,
  'Purdue University': 58,
  Minnesota: 60,
  'University of Minnesota': 60,
  'University of Oregon': 67,
  'University of Washington': 63,
  USC: 66,
  'USC/Southern Cal': 66,
  'University of Alabama': 63,
  'University of Georgia': 80,
  'Auburn University': 82,
  Kentucky: 74,
  'University of Kentucky': 74,
  'University of Oklahoma': 73,
  Oklahoma: 73,
  Alabama: 63,
  Troy: 74,
  UTSA: 77,
  Charlotte: 73,
  Tulane: 68,
  Rice: 64,
  'Rice University': 64,
  Duke: 61,
  'Duke University': 61,
  'West Virginia University': 72,
  Cincinnati: 62,
  'University of Cincinnati': 62,
};


// Hardcoded major teams with real data
const manualTeams = [
  { id: 'vanderbilt', school: 'Vanderbilt', nickname: 'Commodores', conference: 'SEC', location: { city: 'Nashville', state: 'TN', lat: 36.14, lon: -86.80 }, colors: { primary: '#d3bc8d', secondary: '#101820' }, conferenceTier: 95, parkFactor: 1.01, travelDifficulty: 42, prestigeLevel: 98 },
  { id: 'lsu', school: 'LSU', nickname: 'Tigers', conference: 'SEC', location: { city: 'Baton Rouge', state: 'LA', lat: 30.41, lon: -91.18 }, colors: { primary: '#461d7c', secondary: '#fdd023' }, conferenceTier: 95, parkFactor: 1.05, travelDifficulty: 38, prestigeLevel: 99 },
  { id: 'florida', school: 'Florida', nickname: 'Gators', conference: 'SEC', location: { city: 'Gainesville', state: 'FL', lat: 29.65, lon: -82.32 }, colors: { primary: '#0021a5', secondary: '#fa4616' }, conferenceTier: 95, parkFactor: 1.0, travelDifficulty: 40, prestigeLevel: 97 },
  { id: 'tennessee', school: 'Tennessee', nickname: 'Volunteers', conference: 'SEC', location: { city: 'Knoxville', state: 'TN', lat: 35.96, lon: -83.92 }, colors: { primary: '#ff8200', secondary: '#58595b' }, conferenceTier: 95, parkFactor: 1.03, travelDifficulty: 45, prestigeLevel: 96 },
  { id: 'arkansas', school: 'Arkansas', nickname: 'Razorbacks', conference: 'SEC', location: { city: 'Fayetteville', state: 'AR', lat: 36.06, lon: -94.17 }, colors: { primary: '#9d2235', secondary: '#ffffff' }, conferenceTier: 95, parkFactor: 1.02, travelDifficulty: 48, prestigeLevel: 96 },
  { id: 'texas', school: 'Texas', nickname: 'Longhorns', conference: 'SEC', location: { city: 'Austin', state: 'TX', lat: 30.26, lon: -97.74 }, colors: { primary: '#bf5700', secondary: '#333f48' }, conferenceTier: 95, parkFactor: 1.0, travelDifficulty: 40, prestigeLevel: 95 },
  { id: 'texas-am', school: 'Texas A&M', nickname: 'Aggies', conference: 'SEC', location: { city: 'College Station', state: 'TX', lat: 30.62, lon: -96.33 }, colors: { primary: '#500000', secondary: '#ffffff' }, conferenceTier: 95, parkFactor: 1.01, travelDifficulty: 42, prestigeLevel: 94 },
  { id: 'ole-miss', school: 'Ole Miss', nickname: 'Rebels', conference: 'SEC', location: { city: 'Oxford', state: 'MS', lat: 34.36, lon: -89.51 }, colors: { primary: '#13294b', secondary: '#c8102e' }, conferenceTier: 95, parkFactor: 1.02, travelDifficulty: 50, prestigeLevel: 92 },
  { id: 'mississippi-state', school: 'Mississippi State', nickname: 'Bulldogs', conference: 'SEC', location: { city: 'Starkville', state: 'MS', lat: 33.45, lon: -88.81 }, colors: { primary: '#660000', secondary: '#ffffff' }, conferenceTier: 95, parkFactor: 1.01, travelDifficulty: 48, prestigeLevel: 91 },
  { id: 'virginia', school: 'Virginia', nickname: 'Cavaliers', conference: 'ACC', location: { city: 'Charlottesville', state: 'VA', lat: 38.02, lon: -78.47 }, colors: { primary: '#232d4b', secondary: '#f84c1e' }, conferenceTier: 92, parkFactor: 0.98, travelDifficulty: 45, prestigeLevel: 93 },
  { id: 'north-carolina', school: 'North Carolina', nickname: 'Tar Heels', conference: 'ACC', location: { city: 'Chapel Hill', state: 'NC', lat: 35.91, lon: -79.05 }, colors: { primary: '#7bafd4', secondary: '#ffffff' }, conferenceTier: 92, parkFactor: 0.99, travelDifficulty: 40, prestigeLevel: 92 },
  { id: 'wake-forest', school: 'Wake Forest', nickname: 'Demon Deacons', conference: 'ACC', location: { city: 'Winston-Salem', state: 'NC', lat: 36.09, lon: -80.24 }, colors: { primary: '#9e7e38', secondary: '#000000' }, conferenceTier: 92, parkFactor: 1.04, travelDifficulty: 46, prestigeLevel: 94 },
  { id: 'florida-state', school: 'Florida State', nickname: 'Seminoles', conference: 'ACC', location: { city: 'Tallahassee', state: 'FL', lat: 30.43, lon: -84.28 }, colors: { primary: '#782f40', secondary: '#ceb888' }, conferenceTier: 92, parkFactor: 1.01, travelDifficulty: 44, prestigeLevel: 91 },
  { id: 'clemson', school: 'Clemson', nickname: 'Tigers', conference: 'ACC', location: { city: 'Clemson', state: 'SC', lat: 34.68, lon: -82.83 }, colors: { primary: '#f56600', secondary: '#522d80' }, conferenceTier: 92, parkFactor: 1.02, travelDifficulty: 48, prestigeLevel: 89 },
  { id: 'oregon-state', school: 'Oregon State', nickname: 'Beavers', conference: 'Pac-12', location: { city: 'Corvallis', state: 'OR', lat: 44.56, lon: -123.26 }, colors: { primary: '#dc4405', secondary: '#000000' }, conferenceTier: 88, parkFactor: 0.97, travelDifficulty: 55, prestigeLevel: 95 },
  { id: 'ucla', school: 'UCLA', nickname: 'Bruins', conference: 'Big Ten', location: { city: 'Los Angeles', state: 'CA', lat: 34.05, lon: -118.24 }, colors: { primary: '#2774ae', secondary: '#ffd100' }, conferenceTier: 90, parkFactor: 0.99, travelDifficulty: 40, prestigeLevel: 90 },
  { id: 'arizona', school: 'Arizona', nickname: 'Wildcats', conference: 'Big 12', location: { city: 'Tucson', state: 'AZ', lat: 32.22, lon: -110.92 }, colors: { primary: '#cc0033', secondary: '#003366' }, conferenceTier: 90, parkFactor: 1.05, travelDifficulty: 45, prestigeLevel: 89 },
  { id: 'oklahoma-state', school: 'Oklahoma State', nickname: 'Cowboys', conference: 'Big 12', location: { city: 'Stillwater', state: 'OK', lat: 36.11, lon: -97.05 }, colors: { primary: '#ff6600', secondary: '#000000' }, conferenceTier: 90, parkFactor: 1.01, travelDifficulty: 48, prestigeLevel: 88 },
  { id: 'tcu', school: 'TCU', nickname: 'Horned Frogs', conference: 'Big 12', location: { city: 'Fort Worth', state: 'TX', lat: 32.72, lon: -97.32 }, colors: { primary: '#4d1979', secondary: '#ffffff' }, conferenceTier: 90, parkFactor: 1.0, travelDifficulty: 42, prestigeLevel: 93 },
  { id: 'east-carolina', school: 'East Carolina', nickname: 'Pirates', conference: 'AAC', location: { city: 'Greenville', state: 'NC', lat: 35.61, lon: -77.36 }, colors: { primary: '#592a8a', secondary: '#fdb913' }, conferenceTier: 80, parkFactor: 1.02, travelDifficulty: 50, prestigeLevel: 86 },
  { id: 'dallas-baptist', school: 'Dallas Baptist', nickname: 'Patriots', conference: 'CUSA', location: { city: 'Dallas', state: 'TX', lat: 32.77, lon: -96.79 }, colors: { primary: '#00205b', secondary: '#ba0c2f' }, conferenceTier: 75, parkFactor: 1.03, travelDifficulty: 40, prestigeLevel: 84 },
  { id: 'coastal-carolina', school: 'Coastal Carolina', nickname: 'Chanticleers', conference: 'Sun Belt', location: { city: 'Conway', state: 'SC', lat: 33.83, lon: -79.04 }, colors: { primary: '#006f71', secondary: '#a27752' }, conferenceTier: 78, parkFactor: 1.01, travelDifficulty: 55, prestigeLevel: 85 },
  { id: 'southern-miss', school: 'Southern Miss', nickname: 'Golden Eagles', conference: 'Sun Belt', location: { city: 'Hattiesburg', state: 'MS', lat: 31.32, lon: -89.29 }, colors: { primary: '#ffab00', secondary: '#000000' }, conferenceTier: 78, parkFactor: 1.0, travelDifficulty: 50, prestigeLevel: 84 },
  { id: 'uc-irvine', school: 'UC Irvine', nickname: 'Anteaters', conference: 'Big West', location: { city: 'Irvine', state: 'CA', lat: 33.68, lon: -117.82 }, colors: { primary: '#0064a4', secondary: '#ffd200' }, conferenceTier: 75, parkFactor: 0.98, travelDifficulty: 45, prestigeLevel: 82 },
  { id: 'indiana-state', school: 'Indiana State', nickname: 'Sycamores', conference: 'MVC', location: { city: 'Terre Haute', state: 'IN', lat: 39.46, lon: -87.41 }, colors: { primary: '#0033aa', secondary: '#ffffff' }, conferenceTier: 72, parkFactor: 1.0, travelDifficulty: 50, prestigeLevel: 81 }
];

const conferences = {
  'SEC': { tier: 95, count: 16, prestigeRange: [75, 99], states: ['AL', 'AR', 'FL', 'GA', 'KY', 'LA', 'MS', 'MO', 'OK', 'SC', 'TN', 'TX'] },
  'ACC': { tier: 92, count: 15, prestigeRange: [70, 95], states: ['CA', 'FL', 'GA', 'IN', 'KY', 'MA', 'NC', 'NY', 'PA', 'SC', 'TX', 'VA'] },
  'Big 12': { tier: 90, count: 16, prestigeRange: [65, 93], states: ['AZ', 'CO', 'FL', 'IA', 'KS', 'OH', 'OK', 'TX', 'UT', 'WV'] },
  'Big Ten': { tier: 90, count: 18, prestigeRange: [60, 90], states: ['CA', 'IL', 'IN', 'IA', 'MD', 'MI', 'MN', 'NE', 'NJ', 'OH', 'OR', 'PA', 'WA'] },
  'Pac-12': { tier: 88, count: 2, prestigeRange: [80, 95], states: ['OR', 'WA'] },
  'Sun Belt': { tier: 78, count: 14, prestigeRange: [60, 85], states: ['AL', 'AR', 'GA', 'LA', 'MS', 'NC', 'SC', 'TX', 'VA'] },
  'AAC': { tier: 80, count: 10, prestigeRange: [55, 86], states: ['AL', 'FL', 'KS', 'LA', 'NC', 'OH', 'PA', 'TN', 'TX'] },
  'CUSA': { tier: 75, count: 10, prestigeRange: [50, 84], states: ['AL', 'FL', 'LA', 'NM', 'TN', 'TX', 'VA'] },
  'MVC': { tier: 72, count: 10, prestigeRange: [50, 81], states: ['IL', 'IN', 'IA', 'KY', 'MO', 'TN'] },
  'Big West': { tier: 75, count: 11, prestigeRange: [55, 82], states: ['CA', 'HI'] },
  'WCC': { tier: 72, count: 9, prestigeRange: [50, 80], states: ['CA', 'OR', 'WA'] },
  'Mountain West': { tier: 72, count: 7, prestigeRange: [50, 75], states: ['CA', 'CO', 'NV', 'NM'] },
  'A-10': { tier: 68, count: 12, prestigeRange: [45, 70], states: ['DC', 'IL', 'MA', 'NY', 'NC', 'OH', 'PA', 'RI', 'VA'] },
  'Big East': { tier: 70, count: 8, prestigeRange: [45, 72], states: ['CT', 'DC', 'IL', 'IN', 'NE', 'NY', 'OH', 'PA'] },
  'MAC': { tier: 65, count: 11, prestigeRange: [40, 65], states: ['IL', 'IN', 'MI', 'OH'] },
  'OVC': { tier: 60, count: 10, prestigeRange: [35, 60], states: ['IL', 'IN', 'KY', 'MO', 'TN'] },
  'Southland': { tier: 62, count: 9, prestigeRange: [35, 65], states: ['LA', 'TX'] },
  'ASUN': { tier: 65, count: 12, prestigeRange: [40, 68], states: ['AL', 'AR', 'FL', 'GA', 'KY', 'TN'] },
  'SoCon': { tier: 68, count: 8, prestigeRange: [45, 75], states: ['AL', 'NC', 'SC', 'TN', 'VA'] },
  'Big South': { tier: 60, count: 9, prestigeRange: [35, 60], states: ['NC', 'SC', 'VA'] },
  'CAA': { tier: 65, count: 12, prestigeRange: [40, 65], states: ['DE', 'MA', 'MD', 'NJ', 'NY', 'NC', 'PA', 'SC', 'VA'] },
  'Horizon': { tier: 58, count: 6, prestigeRange: [30, 55], states: ['IN', 'KY', 'MI', 'OH', 'WI'] },
  'Ivy': { tier: 55, count: 8, prestigeRange: [35, 55], states: ['CT', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI'] },
  'MAAC': { tier: 55, count: 11, prestigeRange: [30, 55], states: ['CT', 'MD', 'NJ', 'NY'] },
  'MEAC': { tier: 50, count: 4, prestigeRange: [25, 45], states: ['DE', 'MD', 'VA'] },
  'SWAC': { tier: 50, count: 12, prestigeRange: [25, 50], states: ['AL', 'AR', 'FL', 'LA', 'MS', 'TX'] },
  'Summit': { tier: 58, count: 6, prestigeRange: [35, 60], states: ['CO', 'MN', 'NE', 'ND', 'SD'] },
  'WAC': { tier: 65, count: 11, prestigeRange: [40, 68], states: ['CA', 'TX', 'UT', 'WA'] },
  'America East': { tier: 55, count: 7, prestigeRange: [35, 60], states: ['ME', 'MD', 'MA', 'NY'] }
};

const stateCentroids: Record<string, { lat: number, lon: number }> = {
  'AL': { lat: 32.8, lon: -86.8 }, 'AR': { lat: 34.9, lon: -92.3 }, 'AZ': { lat: 33.7, lon: -111.4 }, 'CA': { lat: 36.1, lon: -119.6 },
  'CO': { lat: 39.0, lon: -105.3 }, 'CT': { lat: 41.6, lon: -72.7 }, 'DC': { lat: 38.9, lon: -77.0 }, 'DE': { lat: 39.3, lon: -75.5 },
  'FL': { lat: 27.7, lon: -81.6 }, 'GA': { lat: 33.0, lon: -83.6 }, 'HI': { lat: 21.0, lon: -157.5 }, 'IA': { lat: 42.0, lon: -93.6 },
  'IL': { lat: 40.3, lon: -89.0 }, 'IN': { lat: 39.8, lon: -86.2 }, 'KS': { lat: 38.5, lon: -98.1 }, 'KY': { lat: 37.6, lon: -84.6 },
  'LA': { lat: 31.1, lon: -91.8 }, 'MA': { lat: 42.2, lon: -71.8 }, 'MD': { lat: 39.0, lon: -76.8 }, 'ME': { lat: 44.6, lon: -69.3 },
  'MI': { lat: 43.3, lon: -84.5 }, 'MN': { lat: 45.6, lon: -93.9 }, 'MO': { lat: 38.4, lon: -92.2 }, 'MS': { lat: 32.7, lon: -89.6 },
  'NC': { lat: 35.6, lon: -79.8 }, 'ND': { lat: 47.5, lon: -99.9 }, 'NE': { lat: 41.1, lon: -98.2 }, 'NH': { lat: 43.7, lon: -71.5 },
  'NJ': { lat: 40.2, lon: -74.5 }, 'NM': { lat: 34.8, lon: -106.2 }, 'NV': { lat: 38.3, lon: -117.0 }, 'NY': { lat: 42.1, lon: -74.9 },
  'OH': { lat: 40.3, lon: -82.9 }, 'OK': { lat: 35.5, lon: -96.9 }, 'OR': { lat: 44.5, lon: -122.0 }, 'PA': { lat: 40.5, lon: -77.2 },
  'RI': { lat: 41.6, lon: -71.4 }, 'SC': { lat: 33.8, lon: -81.1 }, 'SD': { lat: 44.2, lon: -99.9 }, 'TN': { lat: 35.8, lon: -86.2 },
  'TX': { lat: 31.0, lon: -97.5 }, 'UT': { lat: 40.1, lon: -111.9 }, 'VA': { lat: 37.7, lon: -78.1 }, 'WA': { lat: 47.3, lon: -121.6 },
  'WI': { lat: 44.2, lon: -89.6 }, 'WV': { lat: 38.4, lon: -80.9 }
};

const generatedTeams: ProgramInput[] = [];

let counter = 1;
for (const [conf, data] of Object.entries(conferences)) {
  for (let i = 0; i < data.count; i++) {
    // If a manual team matches this conf and isn't counted yet, skip generating one? 
    // Actually, let's just generate strictly to fill the count
    const st = data.states[i % data.states.length];
    const cent = stateCentroids[st] || { lat: 38, lon: -97 }; // fallback
    const pLevel = Math.round(data.prestigeRange[0] + (data.prestigeRange[1] - data.prestigeRange[0]) * Math.random());
    
    generatedTeams.push({
      id: `${conf.toLowerCase().replace(/[^a-z0-9]/g, '')}-team-${counter}`,
      school: `${st} State ${counter}`,
      nickname: 'Bulldogs', // Generic
      conference: conf,
      location: { city: 'City ' + counter, state: st, lat: cent.lat, lon: cent.lon },
      colors: { primary: '#282a36', secondary: '#f8f8f2' },
      conferenceTier: data.tier,
      parkFactor: 1.0,
      travelDifficulty: 50,
      prestigeLevel: pLevel
    });
    counter++;
  }
}

// Remove duplicates where manualTeams cover the conference count. 
// Just combine them! We will have exactly 300 teams.
export const programInputs: ProgramInput[] = [
  {
    id: 'albany-0',
    school: 'Albany',
    nickname: 'Great Danes',
    conference: 'America East',
    location: { city: 'Albany', state: 'New York', lat: 42.149, lon: -75.549 },
    colors: { primary: '#1c2536', secondary: '#e3dac9' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 54
  },
  {
    id: 'binghamton-university-1',
    school: 'Binghamton University',
    nickname: 'Bearcats',
    conference: 'America East',
    location: { city: 'Binghamton University', state: 'New York', lat: 42.795, lon: -75.132 },
    colors: { primary: '#b9af9c', secondary: '#465063' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'bryant-university-2',
    school: 'Bryant University',
    nickname: 'Bulldogs',
    conference: 'America East',
    location: { city: 'Bryant University', state: 'Rhode Island', lat: 41.207, lon: -71.611 },
    colors: { primary: '#818595', secondary: '#7e7a6a' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'university-of-maine-3',
    school: 'University of Maine',
    nickname: 'Black Bears',
    conference: 'America East',
    location: { city: 'University of Maine', state: 'Maine', lat: 43.942, lon: -69.802 },
    colors: { primary: '#372b96', secondary: '#c8d469' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  },
  {
    id: 'njit-4',
    school: 'NJIT',
    nickname: 'Highlanders',
    conference: 'America East',
    location: { city: 'NJIT', state: 'New Jersey', lat: 40.476, lon: -73.755 },
    colors: { primary: '#348d17', secondary: '#cb72e8' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'umass-lowell-5',
    school: 'UMass Lowell',
    nickname: 'River Hawks',
    conference: 'America East',
    location: { city: 'UMass Lowell', state: 'Massachusetts', lat: 42.802, lon: -71.224 },
    colors: { primary: '#3f3155', secondary: '#c0ceaa' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'umbc-6',
    school: 'UMBC',
    nickname: 'Retrievers',
    conference: 'America East',
    location: { city: 'UMBC', state: 'Maryland', lat: 38.520, lon: -76.130 },
    colors: { primary: '#bb3320', secondary: '#44ccdf' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 47
  },
  {
    id: 'charlotte-7',
    school: 'Charlotte',
    nickname: '49ers',
    conference: 'American',
    location: { city: 'Charlotte', state: 'North Carolina', lat: 35.116, lon: -80.058 },
    colors: { primary: '#8a5bc6', secondary: '#75a439' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 82
  },
  {
    id: 'east-carolina-university-8',
    school: 'East Carolina University',
    nickname: 'Pirates',
    conference: 'American',
    location: { city: 'East Carolina University', state: 'North Carolina', lat: 35.132, lon: -79.532 },
    colors: { primary: '#592a8a', secondary: '#fdb913' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'fau-9',
    school: 'FAU',
    nickname: 'Owls',
    conference: 'American',
    location: { city: 'FAU', state: 'Florida', lat: 27.075, lon: -81.627 },
    colors: { primary: '#ac2a7b', secondary: '#53d584' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'university-of-memphis-10',
    school: 'University of Memphis',
    nickname: 'Tigers',
    conference: 'American',
    location: { city: 'University of Memphis', state: 'Tennessee', lat: 35.760, lon: -86.123 },
    colors: { primary: '#49225b', secondary: '#b6dda4' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 72
  },
  {
    id: 'rice-university-11',
    school: 'Rice University',
    nickname: 'Owls',
    conference: 'American',
    location: { city: 'Rice University', state: 'Texas', lat: 31.403, lon: -96.865 },
    colors: { primary: '#709a37', secondary: '#8f65c8' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'usf-12',
    school: 'USF',
    nickname: 'Bulls',
    conference: 'American',
    location: { city: 'USF', state: 'Florida', lat: 27.609, lon: -81.325 },
    colors: { primary: '#b425a3', secondary: '#4bda5c' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 72
  },
  {
    id: 'tulane-university-13',
    school: 'Tulane University',
    nickname: 'Green Wave',
    conference: 'American',
    location: { city: 'Tulane University', state: 'Louisiana', lat: 30.826, lon: -91.977 },
    colors: { primary: '#2b39c0', secondary: '#d4c63f' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'uab-14',
    school: 'UAB',
    nickname: 'Blazers',
    conference: 'American',
    location: { city: 'UAB', state: 'Alabama', lat: 32.721, lon: -87.327 },
    colors: { primary: '#4a2ea4', secondary: '#b5d15b' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 83
  },
  {
    id: 'utsa-15',
    school: 'UTSA',
    nickname: 'Roadrunners',
    conference: 'American',
    location: { city: 'UTSA', state: 'Texas', lat: 31.150, lon: -97.008 },
    colors: { primary: '#3d7c3c', secondary: '#c283c3' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 78
  },
  {
    id: 'wichita-state-university-16',
    school: 'Wichita State University',
    nickname: 'Shockers',
    conference: 'American',
    location: { city: 'Wichita State University', state: 'Kansas', lat: 38.332, lon: -98.526 },
    colors: { primary: '#b4a471', secondary: '#4b5b8e' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'boston-college-17',
    school: 'Boston College',
    nickname: 'Eagles',
    conference: 'Atlantic Coast',
    location: { city: 'Boston College', state: 'Massachusetts', lat: 42.561, lon: -71.879 },
    colors: { primary: '#60281e', secondary: '#9fd7e1' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 86
  },
  {
    id: 'california-cal-18',
    school: 'California/Cal',
    nickname: 'Golden Bears',
    conference: 'Atlantic Coast',
    location: { city: 'California/Cal', state: 'California', lat: 36.309, lon: -119.977 },
    colors: { primary: '#8a4b1a', secondary: '#75b4e5' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'clemson-university-19',
    school: 'Clemson University',
    nickname: 'Tigers',
    conference: 'Atlantic Coast',
    location: { city: 'Clemson University', state: 'South Carolina', lat: 33.892, lon: -81.446 },
    colors: { primary: '#f56600', secondary: '#522d80' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 93
  },
  {
    id: 'duke-university-20',
    school: 'Duke University',
    nickname: 'Blue Devils',
    conference: 'Atlantic Coast',
    location: { city: 'Duke University', state: 'North Carolina', lat: 36.093, lon: -79.968 },
    colors: { primary: '#5b1f2d', secondary: '#a4e0d2' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'florida-state-university-21',
    school: 'Florida State University',
    nickname: 'Seminoles',
    conference: 'Atlantic Coast',
    location: { city: 'Florida State University', state: 'Florida', lat: 27.440, lon: -81.914 },
    colors: { primary: '#782f40', secondary: '#ceb888' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 96
  },
  {
    id: 'georgia-tech-22',
    school: 'Georgia Tech',
    nickname: 'Yellow Jackets',
    conference: 'Atlantic Coast',
    location: { city: 'Georgia Tech', state: 'Georgia', lat: 32.942, lon: -83.396 },
    colors: { primary: '#8b80cd', secondary: '#747f32' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 85
  },
  {
    id: 'university-of-louisville-23',
    school: 'University of Louisville',
    nickname: 'Cardinals',
    conference: 'Atlantic Coast',
    location: { city: 'University of Louisville', state: 'Kentucky', lat: 38.206, lon: -83.976 },
    colors: { primary: '#21236b', secondary: '#dedc94' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 88
  },
  {
    id: 'university-of-miami-24',
    school: 'University of Miami',
    nickname: 'Hurricanes',
    conference: 'Atlantic Coast',
    location: { city: 'University of Miami', state: 'Florida', lat: 26.986, lon: -81.271 },
    colors: { primary: '#8fce1a', secondary: '#7031e5' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 88
  },
  {
    id: 'north-carolina-carolina-25',
    school: 'North Carolina/Carolina',
    nickname: 'Tar Heels',
    conference: 'Atlantic Coast',
    location: { city: 'North Carolina/Carolina', state: 'North Carolina', lat: 35.784, lon: -79.581 },
    colors: { primary: '#b318a3', secondary: '#4ce75c' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 99
  },
  {
    id: 'nc-state-26',
    school: 'NC State',
    nickname: 'Wolfpack',
    conference: 'Atlantic Coast',
    location: { city: 'NC State', state: 'North Carolina', lat: 36.062, lon: -79.887 },
    colors: { primary: '#225a48', secondary: '#dda5b7' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 96
  },
  {
    id: 'university-of-notre-dame-27',
    school: 'University of Notre Dame',
    nickname: 'Fighting Irish',
    conference: 'Atlantic Coast',
    location: { city: 'University of Notre Dame', state: 'Indiana', lat: 40.160, lon: -85.824 },
    colors: { primary: '#c92320', secondary: '#36dcdf' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'pitt-28',
    school: 'Pitt',
    nickname: 'Panthers',
    conference: 'Atlantic Coast',
    location: { city: 'Pitt', state: 'Pennsylvania', lat: 39.994, lon: -77.341 },
    colors: { primary: '#ad7fba', secondary: '#528045' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 87
  },
  {
    id: 'stanford-university-29',
    school: 'Stanford University',
    nickname: 'Cardinal',
    conference: 'Atlantic Coast',
    location: { city: 'Stanford University', state: 'California', lat: 35.650, lon: -119.450 },
    colors: { primary: '#3ab3da', secondary: '#c54c25' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'university-of-virginia-30',
    school: 'University of Virginia',
    nickname: 'Cavaliers',
    conference: 'Atlantic Coast',
    location: { city: 'University of Virginia', state: 'Virginia', lat: 37.501, lon: -78.201 },
    colors: { primary: '#232d4b', secondary: '#f84c1e' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 85
  },
  {
    id: 'virginia-tech-31',
    school: 'Virginia Tech',
    nickname: 'Hokies',
    conference: 'Atlantic Coast',
    location: { city: 'Virginia Tech', state: 'Virginia', lat: 37.061, lon: -77.692 },
    colors: { primary: '#222a4c', secondary: '#ddd5b3' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 87
  },
  {
    id: 'wake-forest-university-32',
    school: 'Wake Forest University',
    nickname: 'Demon Deacons',
    conference: 'Atlantic Coast',
    location: { city: 'Wake Forest University', state: 'North Carolina', lat: 35.205, lon: -80.166 },
    colors: { primary: '#9e7e38', secondary: '#000000' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 96
  },
  {
    id: 'austin-peay-33',
    school: 'Austin Peay',
    nickname: 'Governors',
    conference: 'ASUN',
    location: { city: 'Austin Peay', state: 'Tennessee', lat: 35.996, lon: -85.775 },
    colors: { primary: '#462d60', secondary: '#b9d29f' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'bellarmine-university-34',
    school: 'Bellarmine University',
    nickname: 'Knights',
    conference: 'ASUN',
    location: { city: 'Bellarmine University', state: 'Kentucky', lat: 37.537, lon: -85.267 },
    colors: { primary: '#92b88b', secondary: '#6d4774' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'university-of-central-arkansas-35',
    school: 'University of Central Arkansas',
    nickname: 'Bears',
    conference: 'ASUN',
    location: { city: 'University of Central Arkansas', state: 'Arkansas', lat: 35.115, lon: -91.626 },
    colors: { primary: '#372c18', secondary: '#c8d3e7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 99
  },
  {
    id: 'eku-36',
    school: 'EKU',
    nickname: 'Colonels',
    conference: 'ASUN',
    location: { city: 'EKU', state: 'Kentucky', lat: 37.509, lon: -84.506 },
    colors: { primary: '#319ac4', secondary: '#ce653b' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'fgcu-37',
    school: 'FGCU',
    nickname: 'Eagles',
    conference: 'ASUN',
    location: { city: 'FGCU', state: 'Florida', lat: 27.756, lon: -81.073 },
    colors: { primary: '#6946c9', secondary: '#96b936' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'jacksonville-university-38',
    school: 'Jacksonville University',
    nickname: 'Dolphins',
    conference: 'ASUN',
    location: { city: 'Jacksonville University', state: 'Florida', lat: 27.488, lon: -81.748 },
    colors: { primary: '#94d644', secondary: '#6b29bb' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'lipscomb-university-39',
    school: 'Lipscomb University',
    nickname: 'Bisons',
    conference: 'ASUN',
    location: { city: 'Lipscomb University', state: 'Tennessee', lat: 35.154, lon: -85.482 },
    colors: { primary: '#37899f', secondary: '#c87660' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 65
  },
  {
    id: 'university-of-north-alabama-40',
    school: 'University of North Alabama',
    nickname: 'Lions',
    conference: 'ASUN',
    location: { city: 'University of North Alabama', state: 'Alabama', lat: 33.262, lon: -87.211 },
    colors: { primary: '#56d6b2', secondary: '#a9294d' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 66
  },
  {
    id: 'university-of-north-florida-41',
    school: 'University of North Florida',
    nickname: 'Ospreys',
    conference: 'ASUN',
    location: { city: 'University of North Florida', state: 'Florida', lat: 27.497, lon: -81.897 },
    colors: { primary: '#1f203a', secondary: '#e0dfc5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 99
  },
  {
    id: 'queens-university-of-charlotte-42',
    school: 'Queens University of Charlotte',
    nickname: 'Royals',
    conference: 'ASUN',
    location: { city: 'Queens University of Charlotte', state: 'North Carolina', lat: 35.036, lon: -79.762 },
    colors: { primary: '#413d2a', secondary: '#bec2d5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'stetson-university-43',
    school: 'Stetson University',
    nickname: 'Hatters',
    conference: 'ASUN',
    location: { city: 'Stetson University', state: 'Florida', lat: 27.870, lon: -82.140 },
    colors: { primary: '#4c43b8', secondary: '#b3bc47' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'davidson-college-44',
    school: 'Davidson College',
    nickname: 'Wildcats',
    conference: 'Atlantic 10',
    location: { city: 'Davidson College', state: 'North Carolina', lat: 36.097, lon: -79.205 },
    colors: { primary: '#411b4b', secondary: '#bee4b4' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 69
  },
  {
    id: 'university-of-dayton-45',
    school: 'University of Dayton',
    nickname: 'Flyers',
    conference: 'Atlantic 10',
    location: { city: 'University of Dayton', state: 'Ohio', lat: 40.546, lon: -83.346 },
    colors: { primary: '#cd2564', secondary: '#32da9b' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 56
  },
  {
    id: 'fordham-university-46',
    school: 'Fordham University',
    nickname: 'Rams',
    conference: 'Atlantic 10',
    location: { city: 'Fordham University', state: 'New York', lat: 42.149, lon: -75.530 },
    colors: { primary: '#3d3734', secondary: '#c2c8cb' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'george-mason-university-47',
    school: 'George Mason University',
    nickname: 'Patriots',
    conference: 'Atlantic 10',
    location: { city: 'George Mason University', state: 'Virginia', lat: 38.363, lon: -78.770 },
    colors: { primary: '#a5ce17', secondary: '#5a31e8' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'george-washington-university-48',
    school: 'George Washington University',
    nickname: 'Revolutionaries',
    conference: 'Atlantic 10',
    location: { city: 'George Washington University', state: 'Washington, D.C.', lat: 37.369, lon: -97.378 },
    colors: { primary: '#172a49', secondary: '#e8d5b6' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'la-salle-university-a-2--49',
    school: 'La Salle University[a 2]',
    nickname: 'Explorers',
    conference: 'Atlantic 10',
    location: { city: 'La Salle University[a 2]', state: 'Pennsylvania', lat: 40.763, lon: -77.659 },
    colors: { primary: '#9f8948', secondary: '#6076b7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 64
  },
  {
    id: 'university-of-rhode-island-50',
    school: 'University of Rhode Island',
    nickname: 'Rams',
    conference: 'Atlantic 10',
    location: { city: 'University of Rhode Island', state: 'Rhode Island', lat: 41.882, lon: -71.679 },
    colors: { primary: '#69196d', secondary: '#96e692' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'university-of-richmond-51',
    school: 'University of Richmond',
    nickname: 'Spiders',
    conference: 'Atlantic 10',
    location: { city: 'University of Richmond', state: 'Virginia', lat: 36.986, lon: -78.692 },
    colors: { primary: '#30425f', secondary: '#cfbda0' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 61
  },
  {
    id: 'st--bonaventure-university-52',
    school: 'St. Bonaventure University',
    nickname: 'Bonnies',
    conference: 'Atlantic 10',
    location: { city: 'St. Bonaventure University', state: 'New York', lat: 42.049, lon: -74.839 },
    colors: { primary: '#166f36', secondary: '#e990c9' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'saint-joseph-s-university-53',
    school: 'Saint Joseph\'s University',
    nickname: 'Hawks',
    conference: 'Atlantic 10',
    location: { city: 'Saint Joseph\'s University', state: 'Pennsylvania', lat: 40.933, lon: -76.466 },
    colors: { primary: '#1a35ad', secondary: '#e5ca52' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 56
  },
  {
    id: 'saint-louis-university-54',
    school: 'Saint Louis University',
    nickname: 'Billikens',
    conference: 'Atlantic 10',
    location: { city: 'Saint Louis University', state: 'Missouri', lat: 37.771, lon: -92.068 },
    colors: { primary: '#3f3f14', secondary: '#c0c0eb' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'vcu-55',
    school: 'VCU',
    nickname: 'Rams',
    conference: 'Atlantic 10',
    location: { city: 'VCU', state: 'Virginia', lat: 37.562, lon: -78.168 },
    colors: { primary: '#317646', secondary: '#ce89b9' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 61
  },
  {
    id: 'butler-university-56',
    school: 'Butler University',
    nickname: 'Bulldogs',
    conference: 'Big East',
    location: { city: 'Butler University', state: 'Indiana', lat: 39.416, lon: -86.902 },
    colors: { primary: '#32235e', secondary: '#cddca1' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'creighton-university-57',
    school: 'Creighton University',
    nickname: 'Bluejays',
    conference: 'Big East',
    location: { city: 'Creighton University', state: 'Nebraska', lat: 41.259, lon: -98.601 },
    colors: { primary: '#17d82e', secondary: '#e827d1' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'georgetown-university-58',
    school: 'Georgetown University',
    nickname: 'Hoyas',
    conference: 'Big East',
    location: { city: 'Georgetown University', state: 'Washington, D.C.', lat: 37.415, lon: -96.544 },
    colors: { primary: '#2863c6', secondary: '#d79c39' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'st--john-s-university-59',
    school: 'St. John\'s University',
    nickname: 'Red Storm',
    conference: 'Big East',
    location: { city: 'St. John\'s University', state: 'New York', lat: 42.752, lon: -74.406 },
    colors: { primary: '#1d1a87', secondary: '#e2e578' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 56
  },
  {
    id: 'seton-hall-university-60',
    school: 'Seton Hall University',
    nickname: 'Pirates',
    conference: 'Big East',
    location: { city: 'Seton Hall University', state: 'New Jersey', lat: 39.677, lon: -74.863 },
    colors: { primary: '#b7a03c', secondary: '#485fc3' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'uconn-61',
    school: 'UConn',
    nickname: 'Huskies',
    conference: 'Big East',
    location: { city: 'UConn', state: 'Connecticut', lat: 42.014, lon: -72.926 },
    colors: { primary: '#4a3b3d', secondary: '#b5c4c2' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'villanova-university-62',
    school: 'Villanova University',
    nickname: 'Wildcats',
    conference: 'Big East',
    location: { city: 'Villanova University', state: 'Pennsylvania', lat: 39.943, lon: -77.092 },
    colors: { primary: '#d93d42', secondary: '#26c2bd' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 64
  },
  {
    id: 'xavier-university-63',
    school: 'Xavier University',
    nickname: 'Musketeers',
    conference: 'Big East',
    location: { city: 'Xavier University', state: 'Ohio', lat: 39.863, lon: -82.391 },
    colors: { primary: '#332719', secondary: '#ccd8e6' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'charleston-southern-university-64',
    school: 'Charleston Southern University',
    nickname: 'Buccaneers',
    conference: 'Big South',
    location: { city: 'Charleston Southern University', state: 'South Carolina', lat: 33.146, lon: -81.793 },
    colors: { primary: '#71b83b', secondary: '#8e47c4' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 57
  },
  {
    id: 'gardner-webb-university-65',
    school: 'Gardner–Webb University',
    nickname: 'Bulldogs (Diamond ‘Dogs)',
    conference: 'Big South',
    location: { city: 'Gardner–Webb University', state: 'North Carolina', lat: 36.329, lon: -80.236 },
    colors: { primary: '#1b1a75', secondary: '#e4e58a' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 56
  },
  {
    id: 'high-point-university-66',
    school: 'High Point University',
    nickname: 'Panthers',
    conference: 'Big South',
    location: { city: 'High Point University', state: 'North Carolina', lat: 36.088, lon: -79.760 },
    colors: { primary: '#2f3224', secondary: '#d0cddb' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'longwood-university-67',
    school: 'Longwood University',
    nickname: 'Lancers',
    conference: 'Big South',
    location: { city: 'Longwood University', state: 'Virginia', lat: 38.386, lon: -78.789 },
    colors: { primary: '#ae958e', secondary: '#516a71' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 65
  },
  {
    id: 'presbyterian-college-68',
    school: 'Presbyterian College',
    nickname: 'Blue Hose',
    conference: 'Big South',
    location: { city: 'Presbyterian College', state: 'South Carolina', lat: 34.103, lon: -80.644 },
    colors: { primary: '#90192a', secondary: '#6fe6d5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 61
  },
  {
    id: 'radford-university-69',
    school: 'Radford University',
    nickname: 'Highlanders',
    conference: 'Big South',
    location: { city: 'Radford University', state: 'Virginia', lat: 38.122, lon: -78.266 },
    colors: { primary: '#b2bf20', secondary: '#4d40df' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 58
  },
  {
    id: 'unc-asheville-70',
    school: 'UNC Asheville',
    nickname: 'Bulldogs',
    conference: 'Big South',
    location: { city: 'UNC Asheville', state: 'North Carolina', lat: 36.325, lon: -79.936 },
    colors: { primary: '#4ba0a4', secondary: '#b45f5b' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 66
  },
  {
    id: 'usc-upstate-71',
    school: 'USC Upstate',
    nickname: 'Spartans',
    conference: 'Big South',
    location: { city: 'USC Upstate', state: 'South Carolina', lat: 34.433, lon: -81.644 },
    colors: { primary: '#422379', secondary: '#bddc86' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 69
  },
  {
    id: 'winthrop-university-72',
    school: 'Winthrop University',
    nickname: 'Eagles',
    conference: 'Big South',
    location: { city: 'Winthrop University', state: 'South Carolina', lat: 34.188, lon: -81.723 },
    colors: { primary: '#474fbd', secondary: '#b8b042' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'illinois-73',
    school: 'Illinois',
    nickname: 'Fighting Illini',
    conference: 'Big Ten',
    location: { city: 'Illinois', state: 'Illinois', lat: 39.580, lon: -89.580 },
    colors: { primary: '#7ad6c7', secondary: '#852938' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'indiana-74',
    school: 'Indiana',
    nickname: 'Hoosiers',
    conference: 'Big Ten',
    location: { city: 'Indiana', state: 'Indiana', lat: 39.154, lon: -85.610 },
    colors: { primary: '#d94b81', secondary: '#26b47e' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'university-of-iowa-75',
    school: 'University of Iowa',
    nickname: 'Hawkeyes',
    conference: 'Big Ten',
    location: { city: 'University of Iowa', state: 'Iowa', lat: 42.194, lon: -93.395 },
    colors: { primary: '#653f19', secondary: '#9ac0e6' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 85
  },
  {
    id: 'maryland-76',
    school: 'Maryland',
    nickname: 'Terrapins',
    conference: 'Big Ten',
    location: { city: 'Maryland', state: 'Maryland', lat: 39.085, lon: -77.049 },
    colors: { primary: '#253685', secondary: '#dac97a' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'university-of-michigan-77',
    school: 'University of Michigan',
    nickname: 'Wolverines',
    conference: 'Big Ten',
    location: { city: 'University of Michigan', state: 'Michigan', lat: 43.454, lon: -84.770 },
    colors: { primary: '#18544b', secondary: '#e7abb4' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 86
  },
  {
    id: 'michigan-state-university-78',
    school: 'Michigan State University',
    nickname: 'Spartans',
    conference: 'Big Ten',
    location: { city: 'Michigan State University', state: 'Michigan', lat: 43.418, lon: -84.823 },
    colors: { primary: '#4ac637', secondary: '#b539c8' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 95
  },
  {
    id: 'university-of-minnesota-79',
    school: 'University of Minnesota',
    nickname: 'Golden Gophers',
    conference: 'Big Ten',
    location: { city: 'University of Minnesota', state: 'Minnesota', lat: 45.912, lon: -94.031 },
    colors: { primary: '#9849cd', secondary: '#67b632' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'nebraska-80',
    school: 'Nebraska',
    nickname: 'Cornhuskers',
    conference: 'Big Ten',
    location: { city: 'Nebraska', state: 'Nebraska', lat: 40.560, lon: -97.920 },
    colors: { primary: '#3477af', secondary: '#cb8850' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 86
  },
  {
    id: 'northwestern-university-81',
    school: 'Northwestern University',
    nickname: 'Wildcats',
    conference: 'Big Ten',
    location: { city: 'Northwestern University', state: 'Illinois', lat: 40.462, lon: -88.640 },
    colors: { primary: '#4fab1d', secondary: '#b054e2' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 87
  },
  {
    id: 'ohio-state-university-82',
    school: 'Ohio State University',
    nickname: 'Buckeyes',
    conference: 'Big Ten',
    location: { city: 'Ohio State University', state: 'Ohio', lat: 39.957, lon: -83.225 },
    colors: { primary: '#6cbec1', secondary: '#93413e' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 94
  },
  {
    id: 'university-of-oregon-83',
    school: 'University of Oregon',
    nickname: 'Ducks',
    conference: 'Big Ten',
    location: { city: 'University of Oregon', state: 'Oregon', lat: 44.904, lon: -122.735 },
    colors: { primary: '#33466c', secondary: '#ccb993' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 91
  },
  {
    id: 'penn-state-84',
    school: 'Penn State',
    nickname: 'Nittany Lions',
    conference: 'Big Ten',
    location: { city: 'Penn State', state: 'Pennsylvania', lat: 41.215, lon: -77.946 },
    colors: { primary: '#3dd9d8', secondary: '#c22627' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 99
  },
  {
    id: 'purdue-university-85',
    school: 'Purdue University',
    nickname: 'Boilermakers',
    conference: 'Big Ten',
    location: { city: 'Purdue University', state: 'Indiana', lat: 39.929, lon: -86.697 },
    colors: { primary: '#a01c9a', secondary: '#5fe365' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 89
  },
  {
    id: 'rutgers-university-86',
    school: 'Rutgers University',
    nickname: 'Scarlet Knights',
    conference: 'Big Ten',
    location: { city: 'Rutgers University', state: 'New Jersey', lat: 40.424, lon: -73.755 },
    colors: { primary: '#3a9979', secondary: '#c56686' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 90
  },
  {
    id: 'ucla-87',
    school: 'UCLA',
    nickname: 'Bruins',
    conference: 'Big Ten',
    location: { city: 'UCLA', state: 'California', lat: 36.502, lon: -119.584 },
    colors: { primary: '#2774ae', secondary: '#ffd100' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 90
  },
  {
    id: 'usc-southern-cal-88',
    school: 'USC/Southern Cal',
    nickname: 'Trojans',
    conference: 'Big Ten',
    location: { city: 'USC/Southern Cal', state: 'California', lat: 35.954, lon: -119.005 },
    colors: { primary: '#8d39b2', secondary: '#72c64d' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 93
  },
  {
    id: 'university-of-washington-89',
    school: 'University of Washington',
    nickname: 'Huskies',
    conference: 'Big Ten',
    location: { city: 'University of Washington', state: 'Washington', lat: 47.976, lon: -122.333 },
    colors: { primary: '#432a1f', secondary: '#bcd5e0' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 92
  },
  {
    id: 'university-of-arizona-90',
    school: 'University of Arizona',
    nickname: 'Wildcats',
    conference: 'Big 12',
    location: { city: 'University of Arizona', state: 'Arizona', lat: 33.388, lon: -111.432 },
    colors: { primary: '#cc0033', secondary: '#003366' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 91
  },
  {
    id: 'arizona-state-university-91',
    school: 'Arizona State University',
    nickname: 'Sun Devils',
    conference: 'Big 12',
    location: { city: 'Arizona State University', state: 'Arizona', lat: 34.021, lon: -111.601 },
    colors: { primary: '#93af8d', secondary: '#6c5072' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 97
  },
  {
    id: 'baylor-university-92',
    school: 'Baylor University',
    nickname: 'Bears',
    conference: 'Big 12',
    location: { city: 'Baylor University', state: 'Texas', lat: 30.956, lon: -97.058 },
    colors: { primary: '#83cf98', secondary: '#7c3067' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 96
  },
  {
    id: 'byu-93',
    school: 'BYU',
    nickname: 'Cougars',
    conference: 'Big 12',
    location: { city: 'BYU', state: 'Utah', lat: 39.446, lon: -111.927 },
    colors: { primary: '#3a64bd', secondary: '#c59b42' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 92
  },
  {
    id: 'university-of-cincinnati-94',
    school: 'University of Cincinnati',
    nickname: 'Bearcats',
    conference: 'Big 12',
    location: { city: 'University of Cincinnati', state: 'Ohio', lat: 40.340, lon: -82.812 },
    colors: { primary: '#263936', secondary: '#d9c6c9' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 97
  },
  {
    id: 'university-of-houston-95',
    school: 'University of Houston',
    nickname: 'Cougars',
    conference: 'Big 12',
    location: { city: 'University of Houston', state: 'Texas', lat: 31.532, lon: -97.805 },
    colors: { primary: '#4650d8', secondary: '#b9af27' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 87
  },
  {
    id: 'university-of-kansas-96',
    school: 'University of Kansas',
    nickname: 'Jayhawks',
    conference: 'Big 12',
    location: { city: 'University of Kansas', state: 'Kansas', lat: 38.802, lon: -98.726 },
    colors: { primary: '#1ccb4e', secondary: '#e334b1' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 87
  },
  {
    id: 'kansas-state-university-97',
    school: 'Kansas State University',
    nickname: 'Wildcats',
    conference: 'Big 12',
    location: { city: 'Kansas State University', state: 'Kansas', lat: 38.789, lon: -97.475 },
    colors: { primary: '#18451b', secondary: '#e7bae4' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 85
  },
  {
    id: 'oklahoma-state-university-98',
    school: 'Oklahoma State University',
    nickname: 'Cowboys',
    conference: 'Big 12',
    location: { city: 'Oklahoma State University', state: 'Oklahoma', lat: 34.753, lon: -96.770 },
    colors: { primary: '#ff6600', secondary: '#000000' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 88
  },
  {
    id: 'tcu-99',
    school: 'TCU',
    nickname: 'Horned Frogs',
    conference: 'Big 12',
    location: { city: 'TCU', state: 'Texas', lat: 30.274, lon: -96.784 },
    colors: { primary: '#4d1979', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 89
  },
  {
    id: 'texas-tech-university-100',
    school: 'Texas Tech University',
    nickname: 'Red Raiders',
    conference: 'Big 12',
    location: { city: 'Texas Tech University', state: 'Texas', lat: 30.675, lon: -97.065 },
    colors: { primary: '#b94125', secondary: '#46beda' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 89
  },
  {
    id: 'ucf-101',
    school: 'UCF',
    nickname: 'Knights',
    conference: 'Big 12',
    location: { city: 'UCF', state: 'Florida', lat: 27.768, lon: -81.543 },
    colors: { primary: '#1a4b45', secondary: '#e5b4ba' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 90
  },
  {
    id: 'university-of-utah-102',
    school: 'University of Utah',
    nickname: 'Utes',
    conference: 'Big 12',
    location: { city: 'University of Utah', state: 'Utah', lat: 39.944, lon: -112.283 },
    colors: { primary: '#233655', secondary: '#dcc9aa' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 91
  },
  {
    id: 'west-virginia-university-103',
    school: 'West Virginia University',
    nickname: 'Mountaineers',
    conference: 'Big 12',
    location: { city: 'West Virginia University', state: 'West Virginia', lat: 39.107, lon: -80.242 },
    colors: { primary: '#26d2b2', secondary: '#d92d4d' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 88
  },
  {
    id: 'cal-poly-104',
    school: 'Cal Poly',
    nickname: 'Mustangs',
    conference: 'Big West',
    location: { city: 'Cal Poly', state: 'California', lat: 35.628, lon: -119.528 },
    colors: { primary: '#9f18d3', secondary: '#60e72c' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'cal-state-fullerton-105',
    school: 'Cal State Fullerton',
    nickname: 'Titans',
    conference: 'Big West',
    location: { city: 'Cal State Fullerton', state: 'California', lat: 36.050, lon: -118.879 },
    colors: { primary: '#289543', secondary: '#d76abc' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 71
  },
  {
    id: 'csun-cal-state-northridge-106',
    school: 'CSUN/Cal State Northridge',
    nickname: 'Matadors',
    conference: 'Big West',
    location: { city: 'CSUN/Cal State Northridge', state: 'California', lat: 36.203, lon: -119.935 },
    colors: { primary: '#c4d336', secondary: '#3b2cc9' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 70
  },
  {
    id: 'bakersfield-csu-bakersfield-107',
    school: 'Bakersfield/CSU Bakersfield',
    nickname: 'Roadrunners',
    conference: 'Big West',
    location: { city: 'Bakersfield/CSU Bakersfield', state: 'California', lat: 36.277, lon: -119.428 },
    colors: { primary: '#3d311d', secondary: '#c2cee2' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'hawai-i-108',
    school: 'Hawaiʻi',
    nickname: 'Rainbow Warriors',
    conference: 'Big West',
    location: { city: 'Hawaiʻi', state: 'Hawaii', lat: 21.178, lon: -157.896 },
    colors: { primary: '#95a4d8', secondary: '#6a5b27' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'long-beach-state-109',
    school: 'Long Beach State',
    nickname: 'Dirtbags',
    conference: 'Big West',
    location: { city: 'Long Beach State', state: 'California', lat: 36.746, lon: -119.209 },
    colors: { primary: '#604bc6', secondary: '#9fb439' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 78
  },
  {
    id: 'uc-davis-110',
    school: 'UC Davis',
    nickname: 'Aggies',
    conference: 'Big West',
    location: { city: 'UC Davis', state: 'California', lat: 36.516, lon: -119.165 },
    colors: { primary: '#748628', secondary: '#8b79d7' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'uc-irvine-111',
    school: 'UC Irvine',
    nickname: 'Anteaters',
    conference: 'Big West',
    location: { city: 'UC Irvine', state: 'California', lat: 36.630, lon: -118.934 },
    colors: { primary: '#0064a4', secondary: '#ffd200' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'uc-riverside-112',
    school: 'UC Riverside',
    nickname: 'Highlanders',
    conference: 'Big West',
    location: { city: 'UC Riverside', state: 'California', lat: 35.930, lon: -119.972 },
    colors: { primary: '#363c39', secondary: '#c9c3c6' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 72
  },
  {
    id: 'uc-san-diego-113',
    school: 'UC San Diego',
    nickname: 'Tritons',
    conference: 'Big West',
    location: { city: 'UC San Diego', state: 'California', lat: 35.533, lon: -119.649 },
    colors: { primary: '#d0681f', secondary: '#2f97e0' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'uc-santa-barbara-114',
    school: 'UC Santa Barbara',
    nickname: 'Gauchos',
    conference: 'Big West',
    location: { city: 'UC Santa Barbara', state: 'California', lat: 36.153, lon: -119.407 },
    colors: { primary: '#606d2a', secondary: '#9f92d5' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 82
  },
  {
    id: 'campbell-university-115',
    school: 'Campbell University',
    nickname: 'Fighting Camels',
    conference: 'Coastal Athletic',
    location: { city: 'Campbell University', state: 'North Carolina', lat: 35.962, lon: -79.116 },
    colors: { primary: '#d339cf', secondary: '#2cc630' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 65
  },
  {
    id: 'charleston-116',
    school: 'Charleston',
    nickname: 'Cougars',
    conference: 'Coastal Athletic',
    location: { city: 'Charleston', state: 'South Carolina', lat: 34.526, lon: -81.446 },
    colors: { primary: '#d86238', secondary: '#279dc7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 69
  },
  {
    id: 'elon-university-117',
    school: 'Elon University',
    nickname: 'Phoenix',
    conference: 'Coastal Athletic',
    location: { city: 'Elon University', state: 'North Carolina', lat: 35.902, lon: -80.543 },
    colors: { primary: '#182139', secondary: '#e7dec6' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 61
  },
  {
    id: 'hofstra-university-118',
    school: 'Hofstra University',
    nickname: 'Pride',
    conference: 'Coastal Athletic',
    location: { city: 'Hofstra University', state: 'New York', lat: 42.679, lon: -75.308 },
    colors: { primary: '#4914b2', secondary: '#b6eb4d' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'monmouth-university-119',
    school: 'Monmouth University',
    nickname: 'Hawks',
    conference: 'Coastal Athletic',
    location: { city: 'Monmouth University', state: 'New Jersey', lat: 39.783, lon: -73.983 },
    colors: { primary: '#40336f', secondary: '#bfcc90' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'north-carolina-a-t-120',
    school: 'North Carolina A&T',
    nickname: 'Aggies',
    conference: 'Coastal Athletic',
    location: { city: 'North Carolina A&T', state: 'North Carolina', lat: 35.637, lon: -80.426 },
    colors: { primary: '#c24833', secondary: '#3db7cc' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'northeastern-university-121',
    school: 'Northeastern University',
    nickname: 'Huskies',
    conference: 'Coastal Athletic',
    location: { city: 'Northeastern University', state: 'Massachusetts', lat: 41.460, lon: -71.618 },
    colors: { primary: '#424849', secondary: '#bdb7b6' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'stony-brook-university-122',
    school: 'Stony Brook University',
    nickname: 'Seawolves',
    conference: 'Coastal Athletic',
    location: { city: 'Stony Brook University', state: 'New York', lat: 42.633, lon: -74.306 },
    colors: { primary: '#6a3023', secondary: '#95cfdc' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'towson-university-123',
    school: 'Towson University',
    nickname: 'Tigers',
    conference: 'Coastal Athletic',
    location: { city: 'Towson University', state: 'Maryland', lat: 39.455, lon: -76.247 },
    colors: { primary: '#736a1a', secondary: '#8c95e5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 65
  },
  {
    id: 'unc-wilmington-uncw-124',
    school: 'UNC Wilmington/UNCW',
    nickname: 'Seahawks',
    conference: 'Coastal Athletic',
    location: { city: 'UNC Wilmington/UNCW', state: 'North Carolina', lat: 35.717, lon: -80.477 },
    colors: { primary: '#48929d', secondary: '#b76d62' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'college-of-william---mary-125',
    school: 'College of William & Mary',
    nickname: 'Tribe',
    conference: 'Coastal Athletic',
    location: { city: 'College of William & Mary', state: 'Virginia', lat: 37.414, lon: -78.139 },
    colors: { primary: '#4a4a38', secondary: '#b5b5c7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 57
  },
  {
    id: 'dallas-baptist-university-126',
    school: 'Dallas Baptist University',
    nickname: 'Patriots',
    conference: 'Conference USA',
    location: { city: 'Dallas Baptist University', state: 'Texas', lat: 30.794, lon: -97.130 },
    colors: { primary: '#00205b', secondary: '#ba0c2f' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'university-of-delaware-127',
    school: 'University of Delaware',
    nickname: 'Fightin\' Blue Hens',
    conference: 'Conference USA',
    location: { city: 'University of Delaware', state: 'Delaware', lat: 38.800, lon: -75.544 },
    colors: { primary: '#1a3d1d', secondary: '#e5c2e2' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'fiu-128',
    school: 'FIU',
    nickname: 'Panthers',
    conference: 'Conference USA',
    location: { city: 'FIU', state: 'Florida', lat: 27.034, lon: -81.883 },
    colors: { primary: '#8a3e17', secondary: '#75c1e8' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'jacksonville-state-university-129',
    school: 'Jacksonville State University',
    nickname: 'Gamecocks',
    conference: 'Conference USA',
    location: { city: 'Jacksonville State University', state: 'Alabama', lat: 33.116, lon: -86.813 },
    colors: { primary: '#462f7d', secondary: '#b9d082' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 83
  },
  {
    id: 'kennesaw-state-university-130',
    school: 'Kennesaw State University',
    nickname: 'Owls',
    conference: 'Conference USA',
    location: { city: 'Kennesaw State University', state: 'Georgia', lat: 33.594, lon: -84.212 },
    colors: { primary: '#772a3b', secondary: '#88d5c4' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 74
  },
  {
    id: 'liberty-university-131',
    school: 'Liberty University',
    nickname: 'Flames',
    conference: 'Conference USA',
    location: { city: 'Liberty University', state: 'Virginia', lat: 38.030, lon: -77.867 },
    colors: { primary: '#3dbe57', secondary: '#c241a8' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'louisiana-tech-university-132',
    school: 'Louisiana Tech University',
    nickname: 'Bulldogs',
    conference: 'Conference USA',
    location: { city: 'Louisiana Tech University', state: 'Louisiana', lat: 31.437, lon: -92.281 },
    colors: { primary: '#2521c7', secondary: '#dade38' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'middle-tennessee-133',
    school: 'Middle Tennessee',
    nickname: 'Blue Raiders',
    conference: 'Conference USA',
    location: { city: 'Middle Tennessee', state: 'Tennessee', lat: 35.303, lon: -86.347 },
    colors: { primary: '#c26825', secondary: '#3d97da' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'missouri-state-university-134',
    school: 'Missouri State University',
    nickname: 'Bears',
    conference: 'Conference USA',
    location: { city: 'Missouri State University', state: 'Missouri', lat: 38.869, lon: -92.355 },
    colors: { primary: '#a9389c', secondary: '#56c763' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'new-mexico-state-university-135',
    school: 'New Mexico State University',
    nickname: 'Aggies',
    conference: 'Conference USA',
    location: { city: 'New Mexico State University', state: 'New Mexico', lat: 34.226, lon: -106.921 },
    colors: { primary: '#2918cf', secondary: '#d6e730' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'sam-houston-136',
    school: 'Sam Houston',
    nickname: 'Bearkats',
    conference: 'Conference USA',
    location: { city: 'Sam Houston', state: 'Texas', lat: 30.482, lon: -98.126 },
    colors: { primary: '#747d1c', secondary: '#8b82e3' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'wku-137',
    school: 'WKU',
    nickname: 'Hilltoppers',
    conference: 'Conference USA',
    location: { city: 'WKU', state: 'Kentucky', lat: 37.614, lon: -83.937 },
    colors: { primary: '#a0ba42', secondary: '#5f45bd' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 83
  },
  {
    id: 'milwaukee-138',
    school: 'Milwaukee',
    nickname: 'Panthers',
    conference: 'Horizon League',
    location: { city: 'Milwaukee', state: 'Wisconsin', lat: 43.714, lon: -89.783 },
    colors: { primary: '#3b485f', secondary: '#c4b7a0' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'northern-kentucky-university-139',
    school: 'Northern Kentucky University',
    nickname: 'Norse',
    conference: 'Horizon League',
    location: { city: 'Northern Kentucky University', state: 'Kentucky', lat: 38.250, lon: -84.383 },
    colors: { primary: '#db67b8', secondary: '#249847' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  },
  {
    id: 'oakland-university-140',
    school: 'Oakland University',
    nickname: 'Golden Grizzlies',
    conference: 'Horizon League',
    location: { city: 'Oakland University', state: 'Michigan', lat: 43.464, lon: -84.276 },
    colors: { primary: '#922c67', secondary: '#6dd398' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 43
  },
  {
    id: 'wright-state-university-141',
    school: 'Wright State University',
    nickname: 'Raiders',
    conference: 'Horizon League',
    location: { city: 'Wright State University', state: 'Ohio', lat: 40.282, lon: -82.651 },
    colors: { primary: '#33373e', secondary: '#ccc8c1' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 46
  },
  {
    id: 'youngstown-state-university-142',
    school: 'Youngstown State University',
    nickname: 'Penguins',
    conference: 'Horizon League',
    location: { city: 'Youngstown State University', state: 'Ohio', lat: 39.786, lon: -83.609 },
    colors: { primary: '#cb8714', secondary: '#3478eb' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 43
  },
  {
    id: 'oregon-state-university-143',
    school: 'Oregon State University',
    nickname: 'Beavers',
    conference: 'Independent',
    location: { city: 'Oregon State University', state: 'Oregon', lat: 44.297, lon: -122.585 },
    colors: { primary: '#dc4405', secondary: '#000000' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'brown-university-144',
    school: 'Brown University',
    nickname: 'Bears',
    conference: 'Ivy League',
    location: { city: 'Brown University', state: 'Rhode Island', lat: 42.074, lon: -71.603 },
    colors: { primary: '#41dad4', secondary: '#be252b' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 54
  },
  {
    id: 'columbia-university-145',
    school: 'Columbia University',
    nickname: 'Lions',
    conference: 'Ivy League',
    location: { city: 'Columbia University', state: 'New York', lat: 42.076, lon: -74.396 },
    colors: { primary: '#464848', secondary: '#b9b7b7' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 54
  },
  {
    id: 'cornell-university-146',
    school: 'Cornell University',
    nickname: 'Big Red',
    conference: 'Ivy League',
    location: { city: 'Cornell University', state: 'New York', lat: 41.889, lon: -75.414 },
    colors: { primary: '#82875b', secondary: '#7d78a4' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 40
  },
  {
    id: 'dartmouth-college-147',
    school: 'Dartmouth College',
    nickname: 'Big Green',
    conference: 'Ivy League',
    location: { city: 'Dartmouth College', state: 'New Hampshire', lat: 44.123, lon: -71.139 },
    colors: { primary: '#a3d78a', secondary: '#5c2875' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 48
  },
  {
    id: 'harvard-university-148',
    school: 'Harvard University',
    nickname: 'Crimson',
    conference: 'Ivy League',
    location: { city: 'Harvard University', state: 'Massachusetts', lat: 41.569, lon: -72.105 },
    colors: { primary: '#191d78', secondary: '#e6e287' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 48
  },
  {
    id: 'penn-149',
    school: 'Penn',
    nickname: 'Quakers',
    conference: 'Ivy League',
    location: { city: 'Penn', state: 'Pennsylvania', lat: 39.825, lon: -77.016 },
    colors: { primary: '#3a205f', secondary: '#c5dfa0' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 43
  },
  {
    id: 'princeton-university-150',
    school: 'Princeton University',
    nickname: 'Tigers',
    conference: 'Ivy League',
    location: { city: 'Princeton University', state: 'New Jersey', lat: 39.489, lon: -74.146 },
    colors: { primary: '#6f4097', secondary: '#90bf68' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 41
  },
  {
    id: 'yale-university-151',
    school: 'Yale University',
    nickname: 'Bulldogs',
    conference: 'Ivy League',
    location: { city: 'Yale University', state: 'Connecticut', lat: 42.302, lon: -73.297 },
    colors: { primary: '#c344c0', secondary: '#3cbb3f' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 45
  },
  {
    id: 'canisius-university-152',
    school: 'Canisius University',
    nickname: 'Golden Griffins',
    conference: 'MAAC',
    location: { city: 'Canisius University', state: 'New York', lat: 42.248, lon: -74.606 },
    colors: { primary: '#72db60', secondary: '#8d249f' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 50
  },
  {
    id: 'fairfield-university-153',
    school: 'Fairfield University',
    nickname: 'Stags',
    conference: 'MAAC',
    location: { city: 'Fairfield University', state: 'Connecticut', lat: 41.496, lon: -72.762 },
    colors: { primary: '#1dc446', secondary: '#e23bb9' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 44
  },
  {
    id: 'iona-university-154',
    school: 'Iona University',
    nickname: 'Gaels',
    conference: 'MAAC',
    location: { city: 'Iona University', state: 'New York', lat: 41.907, lon: -75.379 },
    colors: { primary: '#cf8337', secondary: '#307cc8' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'manhattan-university-155',
    school: 'Manhattan University',
    nickname: 'Jaspers',
    conference: 'MAAC',
    location: { city: 'Manhattan University', state: 'New York', lat: 42.670, lon: -74.840 },
    colors: { primary: '#4e5b32', secondary: '#b1a4cd' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'marist-university-156',
    school: 'Marist University',
    nickname: 'Red Foxes',
    conference: 'MAAC',
    location: { city: 'Marist University', state: 'New York', lat: 42.306, lon: -75.595 },
    colors: { primary: '#972e14', secondary: '#68d1eb' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 44
  },
  {
    id: 'merrimack-college-157',
    school: 'Merrimack College',
    nickname: 'Warriors',
    conference: 'MAAC',
    location: { city: 'Merrimack College', state: 'Massachusetts', lat: 42.052, lon: -72.197 },
    colors: { primary: '#9cb722', secondary: '#6348dd' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  },
  {
    id: 'mount-st--mary-s-university-158',
    school: 'Mount St. Mary\'s University',
    nickname: 'Mountaineers',
    conference: 'MAAC',
    location: { city: 'Mount St. Mary\'s University', state: 'Maryland', lat: 38.753, lon: -76.768 },
    colors: { primary: '#1db828', secondary: '#e247d7' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  },
  {
    id: 'niagara-university-159',
    school: 'Niagara University',
    nickname: 'Purple Eagles',
    conference: 'MAAC',
    location: { city: 'Niagara University', state: 'New York', lat: 41.589, lon: -74.890 },
    colors: { primary: '#65aa47', secondary: '#9a55b8' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 48
  },
  {
    id: 'quinnipiac-university-160',
    school: 'Quinnipiac University',
    nickname: 'Bobcats',
    conference: 'MAAC',
    location: { city: 'Quinnipiac University', state: 'Connecticut', lat: 41.277, lon: -73.273 },
    colors: { primary: '#1c282d', secondary: '#e3d7d2' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'rider-university-161',
    school: 'Rider University',
    nickname: 'Broncs',
    conference: 'MAAC',
    location: { city: 'Rider University', state: 'New Jersey', lat: 40.576, lon: -74.445 },
    colors: { primary: '#53771c', secondary: '#ac88e3' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'sacred-heart-university-162',
    school: 'Sacred Heart University',
    nickname: 'Pioneers',
    conference: 'MAAC',
    location: { city: 'Sacred Heart University', state: 'Connecticut', lat: 42.241, lon: -73.180 },
    colors: { primary: '#37b9bc', secondary: '#c84643' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 45
  },
  {
    id: 'saint-peter-s-university-163',
    school: 'Saint Peter\'s University',
    nickname: 'Peacocks',
    conference: 'MAAC',
    location: { city: 'Saint Peter\'s University', state: 'New Jersey', lat: 39.557, lon: -75.068 },
    colors: { primary: '#a4a938', secondary: '#5b56c7' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 45
  },
  {
    id: 'siena-university-164',
    school: 'Siena University',
    nickname: 'Saints',
    conference: 'MAAC',
    location: { city: 'Siena University', state: 'New York', lat: 42.413, lon: -74.438 },
    colors: { primary: '#881c34', secondary: '#77e3cb' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'university-of-akron-165',
    school: 'University of Akron',
    nickname: 'Zips',
    conference: 'Mid-American',
    location: { city: 'University of Akron', state: 'Ohio', lat: 40.269, lon: -82.769 },
    colors: { primary: '#153b48', secondary: '#eac4b7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 58
  },
  {
    id: 'ball-state-university-166',
    school: 'Ball State University',
    nickname: 'Cardinals',
    conference: 'Mid-American',
    location: { city: 'Ball State University', state: 'Indiana', lat: 40.502, lon: -86.784 },
    colors: { primary: '#9d58a8', secondary: '#62a757' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'bowling-green-167',
    school: 'Bowling Green',
    nickname: 'Falcons',
    conference: 'Mid-American',
    location: { city: 'Bowling Green', state: 'Ohio', lat: 40.776, lon: -83.067 },
    colors: { primary: '#599cd5', secondary: '#a6632a' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'central-michigan-university-168',
    school: 'Central Michigan University',
    nickname: 'Chippewas',
    conference: 'Mid-American',
    location: { city: 'Central Michigan University', state: 'Michigan', lat: 42.751, lon: -84.172 },
    colors: { primary: '#4d7772', secondary: '#b2888d' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 66
  },
  {
    id: 'eastern-michigan-university-169',
    school: 'Eastern Michigan University',
    nickname: 'Eagles',
    conference: 'Mid-American',
    location: { city: 'Eastern Michigan University', state: 'Michigan', lat: 42.704, lon: -85.040 },
    colors: { primary: '#4f8c83', secondary: '#b0737c' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 66
  },
  {
    id: 'kent-state-university-170',
    school: 'Kent State University',
    nickname: 'Golden Flashes',
    conference: 'Mid-American',
    location: { city: 'Kent State University', state: 'Ohio', lat: 40.711, lon: -82.711 },
    colors: { primary: '#1b86c0', secondary: '#e4793f' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'massachusetts-umass-171',
    school: 'Massachusetts/UMass',
    nickname: 'Minutemen',
    conference: 'Mid-American',
    location: { city: 'Massachusetts/UMass', state: 'Massachusetts', lat: 41.691, lon: -72.210 },
    colors: { primary: '#446383', secondary: '#bb9c7c' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 55
  },
  {
    id: 'miami-of-ohio-172',
    school: 'Miami of Ohio',
    nickname: 'RedHawks',
    conference: 'Mid-American',
    location: { city: 'Miami of Ohio', state: 'Ohio', lat: 40.580, lon: -83.517 },
    colors: { primary: '#3d4998', secondary: '#c2b667' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'niu-173',
    school: 'NIU',
    nickname: 'Huskies',
    conference: 'Mid-American',
    location: { city: 'NIU', state: 'Illinois', lat: 39.759, lon: -88.925 },
    colors: { primary: '#1e1534', secondary: '#e1eacb' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'ohio-university-174',
    school: 'Ohio University',
    nickname: 'Bobcats',
    conference: 'Mid-American',
    location: { city: 'Ohio University', state: 'Ohio', lat: 39.793, lon: -83.179 },
    colors: { primary: '#657e2f', secondary: '#9a81d0' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'university-of-toledo-175',
    school: 'University of Toledo',
    nickname: 'Rockets',
    conference: 'Mid-American',
    location: { city: 'University of Toledo', state: 'Ohio', lat: 39.775, lon: -82.514 },
    colors: { primary: '#9669b8', secondary: '#699647' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 65
  },
  {
    id: 'western-michigan-university-176',
    school: 'Western Michigan University',
    nickname: 'Broncos',
    conference: 'Mid-American',
    location: { city: 'Western Michigan University', state: 'Michigan', lat: 43.414, lon: -84.554 },
    colors: { primary: '#37b434', secondary: '#c84bcb' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'belmont-university-177',
    school: 'Belmont University',
    nickname: 'Bruins',
    conference: 'Missouri Valley',
    location: { city: 'Belmont University', state: 'Tennessee', lat: 36.309, lon: -85.842 },
    colors: { primary: '#b31f24', secondary: '#4ce0db' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'bradley-university-178',
    school: 'Bradley University',
    nickname: 'Braves',
    conference: 'Missouri Valley',
    location: { city: 'Bradley University', state: 'Illinois', lat: 39.909, lon: -89.315 },
    colors: { primary: '#833627', secondary: '#7cc9d8' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 82
  },
  {
    id: 'university-of-evansville-179',
    school: 'University of Evansville',
    nickname: 'Purple Aces',
    conference: 'Missouri Valley',
    location: { city: 'University of Evansville', state: 'Indiana', lat: 39.303, lon: -85.772 },
    colors: { primary: '#c0892f', secondary: '#3f76d0' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'illinois-state-university-180',
    school: 'Illinois State University',
    nickname: 'Redbirds',
    conference: 'Missouri Valley',
    location: { city: 'Illinois State University', state: 'Illinois', lat: 40.692, lon: -89.649 },
    colors: { primary: '#cdaaaa', secondary: '#325555' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'indiana-state-university-181',
    school: 'Indiana State University',
    nickname: 'Sycamores',
    conference: 'Missouri Valley',
    location: { city: 'Indiana State University', state: 'Indiana', lat: 39.520, lon: -86.393 },
    colors: { primary: '#0033aa', secondary: '#ffffff' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'murray-state-university-182',
    school: 'Murray State University',
    nickname: 'Racers',
    conference: 'Missouri Valley',
    location: { city: 'Murray State University', state: 'Kentucky', lat: 38.033, lon: -84.093 },
    colors: { primary: '#85a838', secondary: '#7a57c7' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'southern-illinois-siu-183',
    school: 'Southern Illinois/SIU',
    nickname: 'Salukis',
    conference: 'Missouri Valley',
    location: { city: 'Southern Illinois/SIU', state: 'Illinois', lat: 40.341, lon: -89.429 },
    colors: { primary: '#cd997a', secondary: '#326685' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 72
  },
  {
    id: 'uic-184',
    school: 'UIC',
    nickname: 'Flames',
    conference: 'Missouri Valley',
    location: { city: 'UIC', state: 'Illinois', lat: 40.496, lon: -89.271 },
    colors: { primary: '#a7bc16', secondary: '#5843e9' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'valparaiso-university-185',
    school: 'Valparaiso University',
    nickname: 'Beacons',
    conference: 'Missouri Valley',
    location: { city: 'Valparaiso University', state: 'Indiana', lat: 40.275, lon: -86.709 },
    colors: { primary: '#c86bda', secondary: '#379425' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'air-force-186',
    school: 'Air Force',
    nickname: 'Falcons',
    conference: 'Mountain West',
    location: { city: 'Air Force', state: 'Colorado', lat: 39.311, lon: -105.017 },
    colors: { primary: '#aa2c1f', secondary: '#55d3e0' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'fresno-state-187',
    school: 'Fresno State',
    nickname: 'Bulldogs',
    conference: 'Mountain West',
    location: { city: 'Fresno State', state: 'California', lat: 35.926, lon: -119.246 },
    colors: { primary: '#459a56', secondary: '#ba65a9' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 72
  },
  {
    id: 'grand-canyon-university-188',
    school: 'Grand Canyon University',
    nickname: 'Antelopes',
    conference: 'Mountain West',
    location: { city: 'Grand Canyon University', state: 'Arizona', lat: 33.252, lon: -111.755 },
    colors: { primary: '#6cbf31', secondary: '#9340ce' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'nevada-189',
    school: 'Nevada',
    nickname: 'Wolf Pack',
    conference: 'Mountain West',
    location: { city: 'Nevada', state: 'Nevada', lat: 38.380, lon: -117.005 },
    colors: { primary: '#a31ad2', secondary: '#5ce52d' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 74
  },
  {
    id: 'university-of-new-mexico-190',
    school: 'University of New Mexico',
    nickname: 'Lobos',
    conference: 'Mountain West',
    location: { city: 'University of New Mexico', state: 'New Mexico', lat: 34.181, lon: -106.834 },
    colors: { primary: '#c62c1c', secondary: '#39d3e3' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'san-diego-state-university-191',
    school: 'San Diego State University',
    nickname: 'Aztecs',
    conference: 'Mountain West',
    location: { city: 'San Diego State University', state: 'California', lat: 36.025, lon: -119.021 },
    colors: { primary: '#26204b', secondary: '#d9dfb4' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'san-jose-state-university-192',
    school: 'San Jose State University',
    nickname: 'Spartans',
    conference: 'Mountain West',
    location: { city: 'San Jose State University', state: 'California', lat: 35.582, lon: -120.038 },
    colors: { primary: '#4aab15', secondary: '#b554ea' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 77
  },
  {
    id: 'unlv-193',
    school: 'UNLV',
    nickname: 'Rebels',
    conference: 'Mountain West',
    location: { city: 'UNLV', state: 'Nevada', lat: 38.591, lon: -117.304 },
    colors: { primary: '#2e1ad5', secondary: '#d1e52a' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'washington-state-university-194',
    school: 'Washington State University',
    nickname: 'Cougars',
    conference: 'Mountain West',
    location: { city: 'Washington State University', state: 'Washington', lat: 47.344, lon: -121.418 },
    colors: { primary: '#651a2c', secondary: '#9ae5d3' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 83
  },
  {
    id: 'central-connecticut-ccsu-195',
    school: 'Central Connecticut/CCSU',
    nickname: 'Blue Devils',
    conference: 'NEC',
    location: { city: 'Central Connecticut/CCSU', state: 'Connecticut', lat: 41.791, lon: -72.214 },
    colors: { primary: '#a5391a', secondary: '#5ac6e5' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  },
  {
    id: 'coppin-state-university-196',
    school: 'Coppin State University',
    nickname: 'Eagles',
    conference: 'NEC',
    location: { city: 'Coppin State University', state: 'Maryland', lat: 38.613, lon: -77.261 },
    colors: { primary: '#3b512b', secondary: '#c4aed4' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 52
  },
  {
    id: 'delaware-state-university-197',
    school: 'Delaware State University',
    nickname: 'Hornets',
    conference: 'NEC',
    location: { city: 'Delaware State University', state: 'Delaware', lat: 39.947, lon: -75.012 },
    colors: { primary: '#8d4722', secondary: '#72b8dd' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 46
  },
  {
    id: 'fairleigh-dickinson-university-198',
    school: 'Fairleigh Dickinson University',
    nickname: 'Knights',
    conference: 'NEC',
    location: { city: 'Fairleigh Dickinson University', state: 'New Jersey', lat: 40.865, lon: -73.781 },
    colors: { primary: '#45d260', secondary: '#ba2d9f' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 42
  },
  {
    id: 'liu-199',
    school: 'LIU',
    nickname: 'Sharks',
    conference: 'NEC',
    location: { city: 'LIU', state: 'New York', lat: 42.331, lon: -75.303 },
    colors: { primary: '#d83b41', secondary: '#27c4be' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 47
  },
  {
    id: 'umes-200',
    school: 'UMES',
    nickname: 'Hawks',
    conference: 'NEC',
    location: { city: 'UMES', state: 'Maryland', lat: 39.604, lon: -76.388 },
    colors: { primary: '#401615', secondary: '#bfe9ea' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 44
  },
  {
    id: 'norfolk-state-university-201',
    school: 'Norfolk State University',
    nickname: 'Spartans',
    conference: 'NEC',
    location: { city: 'Norfolk State University', state: 'Virginia', lat: 37.815, lon: -78.086 },
    colors: { primary: '#4230d8', secondary: '#bdcf27' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'stonehill-college-202',
    school: 'Stonehill College',
    nickname: 'Skyhawks',
    conference: 'NEC',
    location: { city: 'Stonehill College', state: 'Massachusetts', lat: 42.302, lon: -72.290 },
    colors: { primary: '#d39fce', secondary: '#2c6031' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 50
  },
  {
    id: 'wagner-college-203',
    school: 'Wagner College',
    nickname: 'Seahawks',
    conference: 'NEC',
    location: { city: 'Wagner College', state: 'New York', lat: 41.931, lon: -75.527 },
    colors: { primary: '#b93a50', secondary: '#46c5af' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 45
  },
  {
    id: 'eastern-illinois-university-204',
    school: 'Eastern Illinois University',
    nickname: 'Panthers',
    conference: 'Ohio Valley',
    location: { city: 'Eastern Illinois University', state: 'Illinois', lat: 40.593, lon: -89.159 },
    colors: { primary: '#47393f', secondary: '#b8c6c0' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 59
  },
  {
    id: 'lindenwood-university-205',
    school: 'Lindenwood University',
    nickname: 'Lions',
    conference: 'Ohio Valley',
    location: { city: 'Lindenwood University', state: 'Missouri', lat: 38.377, lon: -92.621 },
    colors: { primary: '#7b4a22', secondary: '#84b5dd' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 55
  },
  {
    id: 'little-rock-206',
    school: 'Little Rock',
    nickname: 'Trojans',
    conference: 'Ohio Valley',
    location: { city: 'Little Rock', state: 'Arkansas', lat: 35.610, lon: -91.993 },
    colors: { primary: '#bec445', secondary: '#413bba' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 64
  },
  {
    id: 'morehead-state-university-207',
    school: 'Morehead State University',
    nickname: 'Eagles',
    conference: 'Ohio Valley',
    location: { city: 'Morehead State University', state: 'Kentucky', lat: 38.344, lon: -84.213 },
    colors: { primary: '#a87ecd', secondary: '#578132' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 62
  },
  {
    id: 'southeast-missouri-semo-208',
    school: 'Southeast Missouri/SEMO',
    nickname: 'Redhawks',
    conference: 'Ohio Valley',
    location: { city: 'Southeast Missouri/SEMO', state: 'Missouri', lat: 38.801, lon: -91.799 },
    colors: { primary: '#267e60', secondary: '#d9819f' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 69
  },
  {
    id: 'siu-edwardsville-siue-209',
    school: 'SIU Edwardsville/SIUE',
    nickname: 'Cougars',
    conference: 'Ohio Valley',
    location: { city: 'SIU Edwardsville/SIUE', state: 'Illinois', lat: 40.831, lon: -89.455 },
    colors: { primary: '#89a74a', secondary: '#7658b5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 67
  },
  {
    id: 'university-of-southern-indiana-210',
    school: 'University of Southern Indiana',
    nickname: 'Screaming Eagles',
    conference: 'Ohio Valley',
    location: { city: 'University of Southern Indiana', state: 'Indiana', lat: 40.489, lon: -86.476 },
    colors: { primary: '#6b20a8', secondary: '#94df57' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 66
  },
  {
    id: 'ut-martin-211',
    school: 'UT Martin',
    nickname: 'Skyhawks',
    conference: 'Ohio Valley',
    location: { city: 'UT Martin', state: 'Tennessee', lat: 35.495, lon: -85.865 },
    colors: { primary: '#645e71', secondary: '#9ba18e' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'tennessee-tech-university-212',
    school: 'Tennessee Tech University',
    nickname: 'Golden Eagles',
    conference: 'Ohio Valley',
    location: { city: 'Tennessee Tech University', state: 'Tennessee', lat: 35.854, lon: -86.215 },
    colors: { primary: '#8b3315', secondary: '#74ccea' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'western-illinois-university-213',
    school: 'Western Illinois University',
    nickname: 'Leathernecks',
    conference: 'Ohio Valley',
    location: { city: 'Western Illinois University', state: 'Illinois', lat: 40.400, lon: -89.730 },
    colors: { primary: '#231f73', secondary: '#dce08c' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 69
  },
  {
    id: 'army-214',
    school: 'Army',
    nickname: 'Black Knights',
    conference: 'Patriot League',
    location: { city: 'Army', state: 'New York', lat: 41.564, lon: -74.619 },
    colors: { primary: '#c47a76', secondary: '#3b8589' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 41
  },
  {
    id: 'bucknell-university-215',
    school: 'Bucknell University',
    nickname: 'Bison',
    conference: 'Patriot League',
    location: { city: 'Bucknell University', state: 'Pennsylvania', lat: 41.121, lon: -77.459 },
    colors: { primary: '#a89a51', secondary: '#5765ae' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'college-of-the-holy-cross-216',
    school: 'College of the Holy Cross',
    nickname: 'Crusaders',
    conference: 'Patriot League',
    location: { city: 'College of the Holy Cross', state: 'Massachusetts', lat: 42.725, lon: -71.243 },
    colors: { primary: '#db9dda', secondary: '#246225' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 45
  },
  {
    id: 'lafayette-college-217',
    school: 'Lafayette College',
    nickname: 'Leopards',
    conference: 'Patriot League',
    location: { city: 'Lafayette College', state: 'Pennsylvania', lat: 39.805, lon: -77.947 },
    colors: { primary: '#d08b4a', secondary: '#2f74b5' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 40
  },
  {
    id: 'lehigh-university-218',
    school: 'Lehigh University',
    nickname: 'Mountain Hawks',
    conference: 'Patriot League',
    location: { city: 'Lehigh University', state: 'Pennsylvania', lat: 40.573, lon: -76.650 },
    colors: { primary: '#4535a0', secondary: '#baca5f' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'navy-219',
    school: 'Navy',
    nickname: 'Midshipmen',
    conference: 'Patriot League',
    location: { city: 'Navy', state: 'Maryland', lat: 39.390, lon: -76.272 },
    colors: { primary: '#27c16e', secondary: '#d83e91' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 52
  },
  {
    id: 'university-of-alabama-220',
    school: 'University of Alabama',
    nickname: 'Crimson Tide',
    conference: 'Southeastern',
    location: { city: 'University of Alabama', state: 'Alabama', lat: 32.834, lon: -86.896 },
    colors: { primary: '#9e1b32', secondary: '#828a8f' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 89
  },
  {
    id: 'university-of-arkansas-221',
    school: 'University of Arkansas',
    nickname: 'Razorbacks',
    conference: 'Southeastern',
    location: { city: 'University of Arkansas', state: 'Arkansas', lat: 34.733, lon: -92.947 },
    colors: { primary: '#9d2235', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'auburn-university-222',
    school: 'Auburn University',
    nickname: 'Tigers',
    conference: 'Southeastern',
    location: { city: 'Auburn University', state: 'Alabama', lat: 32.271, lon: -87.494 },
    colors: { primary: '#0c2340', secondary: '#e87722' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'university-of-florida-223',
    school: 'University of Florida',
    nickname: 'Gators',
    conference: 'Southeastern',
    location: { city: 'University of Florida', state: 'Florida', lat: 27.634, lon: -81.823 },
    colors: { primary: '#0021a5', secondary: '#fa4616' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 95
  },
  {
    id: 'university-of-georgia-224',
    school: 'University of Georgia',
    nickname: 'Bulldogs',
    conference: 'Southeastern',
    location: { city: 'University of Georgia', state: 'Georgia', lat: 32.821, lon: -84.253 },
    colors: { primary: '#ba0c2f', secondary: '#000000' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'university-of-kentucky-225',
    school: 'University of Kentucky',
    nickname: 'Wildcats',
    conference: 'Southeastern',
    location: { city: 'University of Kentucky', state: 'Kentucky', lat: 38.348, lon: -85.212 },
    colors: { primary: '#0033a0', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 97
  },
  {
    id: 'lsu-226',
    school: 'LSU',
    nickname: 'Tigers',
    conference: 'Southeastern',
    location: { city: 'LSU', state: 'Louisiana', lat: 31.496, lon: -91.940 },
    colors: { primary: '#461d7c', secondary: '#fdd023' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 97
  },
  {
    id: 'ole-miss-227',
    school: 'Ole Miss',
    nickname: 'Rebels',
    conference: 'Southeastern',
    location: { city: 'Ole Miss', state: 'Mississippi', lat: 32.611, lon: -89.193 },
    colors: { primary: '#13294b', secondary: '#c8102e' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 97
  },
  {
    id: 'mississippi-state-university-228',
    school: 'Mississippi State University',
    nickname: 'Bulldogs',
    conference: 'Southeastern',
    location: { city: 'Mississippi State University', state: 'Mississippi', lat: 33.108, lon: -88.938 },
    colors: { primary: '#660000', secondary: '#ffffff' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 88
  },
  {
    id: 'alternately-mizzou-229',
    school: 'alternately Mizzou',
    nickname: 'Tigers',
    conference: 'Southeastern',
    location: { city: 'alternately Mizzou', state: 'Missouri', lat: 39.039, lon: -92.707 },
    colors: { primary: '#3f1e8a', secondary: '#c0e175' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 88
  },
  {
    id: 'university-of-oklahoma-230',
    school: 'University of Oklahoma',
    nickname: 'Sooners',
    conference: 'Southeastern',
    location: { city: 'University of Oklahoma', state: 'Oklahoma', lat: 35.768, lon: -97.472 },
    colors: { primary: '#5f7625', secondary: '#a089da' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'university-of-south-carolina-231',
    school: 'University of South Carolina',
    nickname: 'Gamecocks',
    conference: 'Southeastern',
    location: { city: 'University of South Carolina', state: 'South Carolina', lat: 33.780, lon: -80.754 },
    colors: { primary: '#73000a', secondary: '#000000' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 92
  },
  {
    id: 'university-of-tennessee-232',
    school: 'University of Tennessee',
    nickname: 'Volunteers',
    conference: 'Southeastern',
    location: { city: 'University of Tennessee', state: 'Tennessee', lat: 35.810, lon: -86.916 },
    colors: { primary: '#ff8200', secondary: '#58595b' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 93
  },
  {
    id: 'texas-233',
    school: 'Texas',
    nickname: 'Longhorns',
    conference: 'Southeastern',
    location: { city: 'Texas', state: 'Texas', lat: 31.300, lon: -97.991 },
    colors: { primary: '#bf5700', secondary: '#333f48' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 96
  },
  {
    id: 'tamu-234',
    school: 'TAMU',
    nickname: 'Aggies',
    conference: 'Southeastern',
    location: { city: 'TAMU', state: 'Texas', lat: 31.750, lon: -97.737 },
    colors: { primary: '#2c199c', secondary: '#d3e663' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 85
  },
  {
    id: 'vanderbilt-university-235',
    school: 'Vanderbilt University',
    nickname: 'Commodores',
    conference: 'Southeastern',
    location: { city: 'Vanderbilt University', state: 'Tennessee', lat: 35.662, lon: -85.896 },
    colors: { primary: '#d3bc8d', secondary: '#101820' },
    conferenceTier: 95,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 96
  },
  {
    id: 'the-citadel-236',
    school: 'The Citadel',
    nickname: 'Bulldogs',
    conference: 'Southern',
    location: { city: 'The Citadel', state: 'South Carolina', lat: 34.291, lon: -81.039 },
    colors: { primary: '#1f9d17', secondary: '#e062e8' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'etsu-237',
    school: 'ETSU',
    nickname: 'Buccaneers',
    conference: 'Southern',
    location: { city: 'ETSU', state: 'Tennessee', lat: 36.460, lon: -86.481 },
    colors: { primary: '#a69d92', secondary: '#59626d' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'mercer-university-238',
    school: 'Mercer University',
    nickname: 'Bears',
    conference: 'Southern',
    location: { city: 'Mercer University', state: 'Georgia', lat: 32.661, lon: -82.922 },
    colors: { primary: '#20d127', secondary: '#df2ed8' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 67
  },
  {
    id: 'samford-university-239',
    school: 'Samford University',
    nickname: 'Bulldogs',
    conference: 'Southern',
    location: { city: 'Samford University', state: 'Alabama', lat: 32.257, lon: -86.502 },
    colors: { primary: '#9f1a2c', secondary: '#60e5d3' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 63
  },
  {
    id: 'unc-greensboro-uncg-240',
    school: 'UNC Greensboro/UNCG',
    nickname: 'Spartans',
    conference: 'Southern',
    location: { city: 'UNC Greensboro/UNCG', state: 'North Carolina', lat: 35.865, lon: -79.335 },
    colors: { primary: '#b1a132', secondary: '#4e5ecd' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 55
  },
  {
    id: 'vmi-241',
    school: 'VMI',
    nickname: 'Keydets',
    conference: 'Southern',
    location: { city: 'VMI', state: 'Virginia', lat: 36.995, lon: -77.987 },
    colors: { primary: '#52ae90', secondary: '#ad516f' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 67
  },
  {
    id: 'western-carolina-university-242',
    school: 'Western Carolina University',
    nickname: 'Catamounts',
    conference: 'Southern',
    location: { city: 'Western Carolina University', state: 'North Carolina', lat: 35.426, lon: -80.537 },
    colors: { primary: '#9c526e', secondary: '#63ad91' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'wofford-college-243',
    school: 'Wofford College',
    nickname: 'Terriers',
    conference: 'Southern',
    location: { city: 'Wofford College', state: 'South Carolina', lat: 34.072, lon: -81.478 },
    colors: { primary: '#155248', secondary: '#eaadb7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 55
  },
  {
    id: 'houston-christian-university-244',
    school: 'Houston Christian University',
    nickname: 'Huskies',
    conference: 'Southland',
    location: { city: 'Houston Christian University', state: 'Texas', lat: 30.621, lon: -96.785 },
    colors: { primary: '#2db5aa', secondary: '#d24a55' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'alternately-uiw-245',
    school: 'alternately UIW',
    nickname: 'Cardinals',
    conference: 'Southland',
    location: { city: 'alternately UIW', state: 'Texas', lat: 31.286, lon: -97.060 },
    colors: { primary: '#1a3ab8', secondary: '#e5c547' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 69
  },
  {
    id: 'lamar-university-246',
    school: 'Lamar University',
    nickname: 'Cardinals',
    conference: 'Southland',
    location: { city: 'Lamar University', state: 'Texas', lat: 30.458, lon: -97.593 },
    colors: { primary: '#44743a', secondary: '#bb8bc5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 68
  },
  {
    id: 'mcneese-247',
    school: 'McNeese',
    nickname: 'Cowboys',
    conference: 'Southland',
    location: { city: 'McNeese', state: 'Louisiana', lat: 31.848, lon: -91.610 },
    colors: { primary: '#cf514e', secondary: '#30aeb1' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 58
  },
  {
    id: 'university-of-new-orleans-248',
    school: 'University of New Orleans',
    nickname: 'Privateers',
    conference: 'Southland',
    location: { city: 'University of New Orleans', state: 'Louisiana', lat: 30.440, lon: -91.689 },
    colors: { primary: '#9886c0', secondary: '#67793f' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 61
  },
  {
    id: 'nicholls-249',
    school: 'Nicholls',
    nickname: 'Colonels',
    conference: 'Southland',
    location: { city: 'Nicholls', state: 'Louisiana', lat: 30.467, lon: -92.159 },
    colors: { primary: '#5018be', secondary: '#afe741' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 67
  },
  {
    id: 'northwestern-state-university-250',
    school: 'Northwestern State University',
    nickname: 'Demons',
    conference: 'Southland',
    location: { city: 'Northwestern State University', state: 'Louisiana', lat: 31.568, lon: -91.368 },
    colors: { primary: '#3a8f1a', secondary: '#c570e5' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 65
  },
  {
    id: 'southeastern-louisiana-university-251',
    school: 'Southeastern Louisiana University',
    nickname: 'Lions',
    conference: 'Southland',
    location: { city: 'Southeastern Louisiana University', state: 'Louisiana', lat: 31.165, lon: -91.829 },
    colors: { primary: '#8da258', secondary: '#725da7' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 67
  },
  {
    id: 'stephen-f--austin-sfa-252',
    school: 'Stephen F. Austin/SFA',
    nickname: 'Lumberjacks',
    conference: 'Southland',
    location: { city: 'Stephen F. Austin/SFA', state: 'Texas', lat: 30.587, lon: -97.193 },
    colors: { primary: '#37b583', secondary: '#c84a7c' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 60
  },
  {
    id: 'texas-a-m-university-corpus-christi-253',
    school: 'Texas A&M University–Corpus Christi',
    nickname: 'Islanders',
    conference: 'Southland',
    location: { city: 'Texas A&M University–Corpus Christi', state: 'Texas', lat: 31.323, lon: -97.086 },
    colors: { primary: '#6e1c31', secondary: '#91e3ce' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 55
  },
  {
    id: 'utrgv-254',
    school: 'UTRGV',
    nickname: 'Vaqueros',
    conference: 'Southland',
    location: { city: 'UTRGV', state: 'Texas', lat: 31.345, lon: -97.093 },
    colors: { primary: '#7e169b', secondary: '#81e964' },
    conferenceTier: 65,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 66
  },
  {
    id: 'alabama-a-m-university-255',
    school: 'Alabama A&M University',
    nickname: 'Bulldogs',
    conference: 'SWAC',
    location: { city: 'Alabama A&M University', state: 'Alabama', lat: 32.095, lon: -87.455 },
    colors: { primary: '#3f3d3d', secondary: '#c0c2c2' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 43
  },
  {
    id: 'alabama-state-university-256',
    school: 'Alabama State University',
    nickname: 'Hornets',
    conference: 'SWAC',
    location: { city: 'Alabama State University', state: 'Alabama', lat: 33.473, lon: -86.165 },
    colors: { primary: '#7c6174', secondary: '#839e8b' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 48
  },
  {
    id: 'alcorn-state-university-257',
    school: 'Alcorn State University',
    nickname: 'Braves',
    conference: 'SWAC',
    location: { city: 'Alcorn State University', state: 'Mississippi', lat: 32.971, lon: -89.031 },
    colors: { primary: '#316e7f', secondary: '#ce9180' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 48
  },
  {
    id: 'arkansas-pine-bluff-258',
    school: 'Arkansas–Pine Bluff',
    nickname: 'Golden Lions',
    conference: 'SWAC',
    location: { city: 'Arkansas–Pine Bluff', state: 'Arkansas', lat: 35.559, lon: -92.336 },
    colors: { primary: '#d64c34', secondary: '#29b3cb' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 98
  },
  {
    id: 'bethune-cookman-university-259',
    school: 'Bethune–Cookman University',
    nickname: 'Wildcats',
    conference: 'SWAC',
    location: { city: 'Bethune–Cookman University', state: 'Florida', lat: 28.078, lon: -81.548 },
    colors: { primary: '#1a3549', secondary: '#e5cab6' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  },
  {
    id: 'florida-a-m-260',
    school: 'Florida A&M',
    nickname: 'Rattlers',
    conference: 'SWAC',
    location: { city: 'Florida A&M', state: 'Florida', lat: 27.120, lon: -80.998 },
    colors: { primary: '#338dc4', secondary: '#cc723b' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 95
  },
  {
    id: 'grambling-state-university-261',
    school: 'Grambling State University',
    nickname: 'Tigers',
    conference: 'SWAC',
    location: { city: 'Grambling State University', state: 'Louisiana', lat: 30.528, lon: -91.235 },
    colors: { primary: '#a79493', secondary: '#586b6c' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 47
  },
  {
    id: 'jackson-state-university-262',
    school: 'Jackson State University',
    nickname: 'Tigers',
    conference: 'SWAC',
    location: { city: 'Jackson State University', state: 'Mississippi', lat: 32.545, lon: -89.636 },
    colors: { primary: '#c02e1a', secondary: '#3fd1e5' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 48
  },
  {
    id: 'mississippi-valley-state-university-263',
    school: 'Mississippi Valley State University',
    nickname: 'Delta Devils',
    conference: 'SWAC',
    location: { city: 'Mississippi Valley State University', state: 'Mississippi', lat: 33.180, lon: -88.942 },
    colors: { primary: '#ba6c14', secondary: '#4593eb' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'prairie-view-a-m-university-264',
    school: 'Prairie View A&M University',
    nickname: 'Panthers',
    conference: 'SWAC',
    location: { city: 'Prairie View A&M University', state: 'Texas', lat: 31.435, lon: -96.798 },
    colors: { primary: '#99327d', secondary: '#66cd82' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 53
  },
  {
    id: 'southern-university-265',
    school: 'Southern University',
    nickname: 'Jaguars',
    conference: 'SWAC',
    location: { city: 'Southern University', state: 'Louisiana', lat: 31.401, lon: -91.504 },
    colors: { primary: '#2a5822', secondary: '#d5a7dd' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 50
  },
  {
    id: 'texas-southern-university-266',
    school: 'Texas Southern University',
    nickname: 'Tigers',
    conference: 'SWAC',
    location: { city: 'Texas Southern University', state: 'Texas', lat: 31.139, lon: -97.853 },
    colors: { primary: '#593823', secondary: '#a6c7dc' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 45
  },
  {
    id: 'north-dakota-state-university-267',
    school: 'North Dakota State University',
    nickname: 'Bison',
    conference: 'The Summit',
    location: { city: 'North Dakota State University', state: 'North Dakota', lat: 47.829, lon: -100.247 },
    colors: { primary: '#20911e', secondary: '#df6ee1' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 51
  },
  {
    id: 'university-of-northern-colorado-268',
    school: 'University of Northern Colorado',
    nickname: 'Bears',
    conference: 'The Summit',
    location: { city: 'University of Northern Colorado', state: 'Colorado', lat: 39.705, lon: -104.860 },
    colors: { primary: '#738582', secondary: '#8c7a7d' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 47
  },
  {
    id: 'omaha-269',
    school: 'Omaha',
    nickname: 'Mavericks',
    conference: 'The Summit',
    location: { city: 'Omaha', state: 'Nebraska', lat: 41.065, lon: -97.537 },
    colors: { primary: '#30bc58', secondary: '#cf43a7' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 54
  },
  {
    id: 'oral-roberts-university-270',
    school: 'Oral Roberts University',
    nickname: 'Golden Eagles',
    conference: 'The Summit',
    location: { city: 'Oral Roberts University', state: 'Oklahoma', lat: 36.015, lon: -96.256 },
    colors: { primary: '#3c1c42', secondary: '#c3e3bd' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 42
  },
  {
    id: 'university-of-st--thomas-271',
    school: 'University of St. Thomas',
    nickname: 'Tommies',
    conference: 'The Summit',
    location: { city: 'University of St. Thomas', state: 'Minnesota', lat: 45.168, lon: -94.306 },
    colors: { primary: '#d95524', secondary: '#26aadb' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 50
  },
  {
    id: 'south-dakota-state-university-272',
    school: 'South Dakota State University',
    nickname: 'Jackrabbits',
    conference: 'The Summit',
    location: { city: 'South Dakota State University', state: 'South Dakota', lat: 44.506, lon: -100.494 },
    colors: { primary: '#8ec525', secondary: '#713ada' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 40
  },
  {
    id: 'appalachian-state-university-273',
    school: 'Appalachian State University',
    nickname: 'Mountaineers',
    conference: 'Sun Belt',
    location: { city: 'Appalachian State University', state: 'North Carolina', lat: 35.421, lon: -79.483 },
    colors: { primary: '#d550bd', secondary: '#2aaf42' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'arkansas-state-university-274',
    school: 'Arkansas State University',
    nickname: 'Red Wolves',
    conference: 'Sun Belt',
    location: { city: 'Arkansas State University', state: 'Arkansas', lat: 35.198, lon: -92.422 },
    colors: { primary: '#bd3e81', secondary: '#42c17e' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 95
  },
  {
    id: 'coastal-carolina-university-275',
    school: 'Coastal Carolina University',
    nickname: 'Chanticleers',
    conference: 'Sun Belt',
    location: { city: 'Coastal Carolina University', state: 'South Carolina', lat: 34.309, lon: -81.448 },
    colors: { primary: '#006f71', secondary: '#a27752' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'georgia-southern-university-276',
    school: 'Georgia Southern University',
    nickname: 'Eagles',
    conference: 'Sun Belt',
    location: { city: 'Georgia Southern University', state: 'Georgia', lat: 33.701, lon: -84.136 },
    colors: { primary: '#564a1a', secondary: '#a9b5e5' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 80
  },
  {
    id: 'georgia-state-university-277',
    school: 'Georgia State University',
    nickname: 'Panthers',
    conference: 'Sun Belt',
    location: { city: 'Georgia State University', state: 'Georgia', lat: 32.325, lon: -83.182 },
    colors: { primary: '#9b3a1e', secondary: '#64c5e1' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 74
  },
  {
    id: 'james-madison-university-278',
    school: 'James Madison University',
    nickname: 'Dukes',
    conference: 'Sun Belt',
    location: { city: 'James Madison University', state: 'Virginia', lat: 38.195, lon: -78.470 },
    colors: { primary: '#d74167', secondary: '#28be98' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'louisiana-279',
    school: 'Louisiana',
    nickname: 'Ragin\' Cajuns',
    conference: 'Sun Belt',
    location: { city: 'Louisiana', state: 'Louisiana', lat: 30.996, lon: -92.353 },
    colors: { primary: '#4d267f', secondary: '#b2d980' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'louisiana-monroe-ulm-280',
    school: 'Louisiana–Monroe/ULM',
    nickname: 'Warhawks',
    conference: 'Sun Belt',
    location: { city: 'Louisiana–Monroe/ULM', state: 'Louisiana', lat: 31.404, lon: -92.409 },
    colors: { primary: '#239db5', secondary: '#dc624a' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'marshall-university-281',
    school: 'Marshall University',
    nickname: 'Thundering Herd',
    conference: 'Sun Belt',
    location: { city: 'Marshall University', state: 'West Virginia', lat: 38.007, lon: -80.605 },
    colors: { primary: '#c02351', secondary: '#3fdcae' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 82
  },
  {
    id: 'old-dominion-university-282',
    school: 'Old Dominion University',
    nickname: 'Monarchs',
    conference: 'Sun Belt',
    location: { city: 'Old Dominion University', state: 'Virginia', lat: 37.086, lon: -78.264 },
    colors: { primary: '#59b537', secondary: '#a64ac8' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 83
  },
  {
    id: 'university-of-south-alabama-283',
    school: 'University of South Alabama',
    nickname: 'Jaguars',
    conference: 'Sun Belt',
    location: { city: 'University of South Alabama', state: 'Alabama', lat: 33.201, lon: -86.728 },
    colors: { primary: '#227252', secondary: '#dd8dad' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 84
  },
  {
    id: 'southern-miss-284',
    school: 'Southern Miss',
    nickname: 'Golden Eagles',
    conference: 'Sun Belt',
    location: { city: 'Southern Miss', state: 'Mississippi', lat: 33.335, lon: -89.016 },
    colors: { primary: '#ffab00', secondary: '#000000' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 71
  },
  {
    id: 'texas-state-university-285',
    school: 'Texas State University',
    nickname: 'Bobcats',
    conference: 'Sun Belt',
    location: { city: 'Texas State University', state: 'Texas', lat: 31.121, lon: -98.180 },
    colors: { primary: '#aea641', secondary: '#5159be' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 73
  },
  {
    id: 'troy-university-286',
    school: 'Troy University',
    nickname: 'Trojans',
    conference: 'Sun Belt',
    location: { city: 'Troy University', state: 'Alabama', lat: 33.152, lon: -87.086 },
    colors: { primary: '#273122', secondary: '#d8cedd' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 79
  },
  {
    id: 'gonzaga-university-287',
    school: 'Gonzaga University',
    nickname: 'Bulldogs',
    conference: 'West Coast',
    location: { city: 'Gonzaga University', state: 'Washington', lat: 46.972, lon: -121.272 },
    colors: { primary: '#d99b45', secondary: '#2664ba' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'alternately-lmu-288',
    school: 'alternately LMU',
    nickname: 'Lions',
    conference: 'West Coast',
    location: { city: 'alternately LMU', state: 'California', lat: 36.180, lon: -119.949 },
    colors: { primary: '#397e52', secondary: '#c681ad' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 83
  },
  {
    id: 'university-of-the-pacific-289',
    school: 'University of the Pacific',
    nickname: 'Tigers',
    conference: 'West Coast',
    location: { city: 'University of the Pacific', state: 'California', lat: 36.770, lon: -120.077 },
    colors: { primary: '#58404e', secondary: '#a7bfb1' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'pepperdine-university-290',
    school: 'Pepperdine University',
    nickname: 'Waves',
    conference: 'West Coast',
    location: { city: 'Pepperdine University', state: 'California', lat: 36.681, lon: -119.447 },
    colors: { primary: '#965171', secondary: '#69ae8e' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 81
  },
  {
    id: 'university-of-portland-291',
    school: 'University of Portland',
    nickname: 'Pilots',
    conference: 'West Coast',
    location: { city: 'University of Portland', state: 'Oregon', lat: 44.273, lon: -122.535 },
    colors: { primary: '#d43b44', secondary: '#2bc4bb' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 71
  },
  {
    id: 'saint-mary-s-smc-292',
    school: 'Saint Mary\'s/SMC',
    nickname: 'Gaels',
    conference: 'West Coast',
    location: { city: 'Saint Mary\'s/SMC', state: 'California', lat: 35.379, lon: -118.866 },
    colors: { primary: '#2188a5', secondary: '#de775a' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 76
  },
  {
    id: 'university-of-san-diego-293',
    school: 'University of San Diego',
    nickname: 'Toreros',
    conference: 'West Coast',
    location: { city: 'University of San Diego', state: 'California', lat: 36.492, lon: -119.212 },
    colors: { primary: '#2a3e73', secondary: '#d5c18c' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 71
  },
  {
    id: 'university-of-san-francisco-294',
    school: 'University of San Francisco',
    nickname: 'Dons',
    conference: 'West Coast',
    location: { city: 'University of San Francisco', state: 'California', lat: 36.769, lon: -119.753 },
    colors: { primary: '#4f9d7a', secondary: '#b06285' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 72
  },
  {
    id: 'santa-clara-university-295',
    school: 'Santa Clara University',
    nickname: 'Broncos',
    conference: 'West Coast',
    location: { city: 'Santa Clara University', state: 'California', lat: 36.192, lon: -119.618 },
    colors: { primary: '#ae70a9', secondary: '#518f56' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 75
  },
  {
    id: 'seattle-university-296',
    school: 'Seattle University',
    nickname: 'Redhawks',
    conference: 'West Coast',
    location: { city: 'Seattle University', state: 'Washington', lat: 46.678, lon: -121.064 },
    colors: { primary: '#685a3b', secondary: '#97a5c4' },
    conferenceTier: 80,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 82
  },
  {
    id: 'abilene-christian-university-297',
    school: 'Abilene Christian University',
    nickname: 'Wildcats',
    conference: 'Western Athletic',
    location: { city: 'Abilene Christian University', state: 'Texas', lat: 31.187, lon: -98.146 },
    colors: { primary: '#841e26', secondary: '#7be1d9' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 54
  },
  {
    id: 'california-baptist-university-298',
    school: 'California Baptist University',
    nickname: 'Lancers',
    conference: 'Western Athletic',
    location: { city: 'California Baptist University', state: 'California', lat: 35.482, lon: -119.329 },
    colors: { primary: '#dbc918', secondary: '#2436e7' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 42
  },
  {
    id: 'sacramento-state-299',
    school: 'Sacramento State',
    nickname: 'Hornets',
    conference: 'Western Athletic',
    location: { city: 'Sacramento State', state: 'California', lat: 36.524, lon: -119.759 },
    colors: { primary: '#988e1e', secondary: '#6771e1' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 44
  },
  {
    id: 'tarleton-state-university-300',
    school: 'Tarleton State University',
    nickname: 'Texans',
    conference: 'Western Athletic',
    location: { city: 'Tarleton State University', state: 'Texas', lat: 30.675, lon: -97.445 },
    colors: { primary: '#219caf', secondary: '#de6350' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 46
  },
  {
    id: 'ut-arlington-uta-301',
    school: 'UT Arlington/UTA',
    nickname: 'Mavericks',
    conference: 'Western Athletic',
    location: { city: 'UT Arlington/UTA', state: 'Texas', lat: 30.994, lon: -97.238 },
    colors: { primary: '#16be77', secondary: '#e94188' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 52
  },
  {
    id: 'utah-tech-university-302',
    school: 'Utah Tech University',
    nickname: 'Trailblazers',
    conference: 'Western Athletic',
    location: { city: 'Utah Tech University', state: 'Utah', lat: 40.564, lon: -111.418 },
    colors: { primary: '#423d97', secondary: '#bdc268' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 40
  },
  {
    id: 'utah-valley-university-303',
    school: 'Utah Valley University',
    nickname: 'Wolverines',
    conference: 'Western Athletic',
    location: { city: 'Utah Valley University', state: 'Utah', lat: 40.742, lon: -111.855 },
    colors: { primary: '#6a553c', secondary: '#95aac3' },
    conferenceTier: 50,
    parkFactor: 1.0,
    travelDifficulty: 50,
    prestigeLevel: 49
  }
];

const lastNames = [
  'Mercer', 'Dalton', 'Hayes', 'McBride', 'Sloan', 'Booker', 'Temple', 'Raines', 'Bennett',
  'Hollis', 'Barker', 'Davenport', 'Chandler', 'Whitlock', 'Maddox', 'Pryor', 'Hawkins',
  'Witt', 'Sanders', 'Hale', 'Beck', 'Roman', 'Carrington', 'Fowler', 'Thatcher', 'Graves',
  'Delgado', 'Foster', 'Quinn', 'Serrano', 'Wallace', 'Norris', 'Caldwell', 'Monroe', 'Bishop',
  'Gentry', 'Morrow', 'Blevins', 'Parks', 'Delaney', 'Rutledge', 'Avery', 'Keller', 'Moran',
  'Vaughn', 'McCall', 'Pitts', 'Brock', 'Conley', 'Abbott', 'Roach', 'Hensley', 'Kirkland',
  'Jeffers', 'Ramsey', 'Compton', 'Benton', 'Mays', 'Pope', 'Byrd', 'Figueroa', 'Pruitt',
];
const hometowns = ['Nashville, TN', 'Tampa, FL', 'Houston, TX', 'Raleigh, NC', 'Baton Rouge, LA', 'Tulsa, OK', 'Scottsdale, AZ', 'Athens, GA', 'Irvine, CA', 'Jackson, MS'];

function normalizeSchoolKey(name: string) {
  return name
    .replace(/^University of /, '')
    .replace(/^The /, '')
    .replace(/ University$/, '')
    .trim();
}

function conferencePrestigeBase(conference: string) {
  if (conference === 'SEC') return 76;
  if (conference === 'ACC' || conference === 'Atlantic Coast') return 72;
  if (conference === 'Big 12') return 68;
  if (conference === 'Big Ten') return 52;
  if (conference === 'Pac-12') return 70;
  if (conference === 'Sun Belt') return 60;
  if (conference === 'AAC' || conference === 'American') return 58;
  if (conference === 'CUSA' || conference === 'Conference USA') return 55;
  if (conference === 'Big West') return 54;
  if (conference === 'MVC' || conference === 'Missouri Valley') return 53;
  if (conference === 'WCC' || conference === 'West Coast') return 50;
  if (conference === 'Mountain West') return 49;
  if (conference === 'CAA' || conference === 'Coastal Athletic') return 49;
  if (conference === 'SoCon' || conference === 'Southern') return 48;
  if (conference === 'ASUN') return 47;
  if (conference === 'OVC' || conference === 'Ohio Valley') return 45;
  if (conference === 'Ivy' || conference === 'Ivy League') return 43;
  if (conference === 'MAAC') return 42;
  if (conference === 'Summit' || conference === 'The Summit') return 41;
  if (conference === 'Southland') return 40;
  if (conference === 'SWAC') return 38;
  if (conference === 'MEAC') return 37;
  return 44;
}

function derivePrestigeProfile(input: ProgramInput): PrestigeProfile {
  const normalizedSchool = normalizeSchoolKey(input.school);
  const override = BASEBALL_PRESTIGE_OVERRIDES[input.school] ?? BASEBALL_PRESTIGE_OVERRIDES[normalizedSchool];
  const conferenceBase = conferencePrestigeBase(input.conference);
  const compressedInputSignal = Math.round((input.prestigeLevel - 50) * 0.1);
  const overall = clamp(override ?? (conferenceBase + compressedInputSignal), 35, 99);
  const competitivePrestige = clamp(Math.round(overall * 0.78 + input.conferenceTier * 0.22), 35, 99);
  const developmentReputation = clamp(Math.round(overall * 0.9 + (input.parkFactor < 1 ? 2 : 0)), 35, 99);
  const nilAttractiveness = clamp(Math.round(overall * 0.72 + input.conferenceTier * 0.2 + Math.max(0, input.travelDifficulty < 45 ? 4 : 0)), 35, 99);

  return {
    overall,
    competitivePrestige,
    developmentReputation,
    nilAttractiveness,
    conferenceModifier: input.conferenceTier,
    momentumModifier: 0,
  };
}

function deriveProgramResources(prestige: PrestigeProfile) {
  const baseNil = 50000;
  const scalingNil = Math.max(0, (prestige.nilAttractiveness - 50) * 25000);
  
  return {
    scholarshipBudget: NCAA_D1_EQUIVALENCY_CAP,
    schoolNilPool: baseNil + scalingNil,
    donorConfidence: prestige.competitivePrestige,
    facilities: prestige.developmentReputation,
  };
}

function deriveProgramRegion(conference: string) {
  if (conference.includes('SEC') || conference.includes('Sun Belt') || conference.includes('CUSA') || conference.includes('SoCon') || conference.includes('ASUN') || conference.includes('SWAC')) {
    return 'South';
  }
  if (conference.includes('ACC') || conference.includes('East') || conference.includes('CAA') || conference.includes('A-10') || conference.includes('Ivy') || conference.includes('MAAC') || conference.includes('MEAC')) {
    return 'East';
  }
  if (conference.includes('Big Ten') || conference.includes('MAC') || conference.includes('MVC') || conference.includes('Horizon') || conference.includes('OVC') || conference.includes('Summit')) {
    return 'Midwest';
  }
  if (conference.includes('Pac') || conference.includes('West') || conference.includes('WAC') || conference.includes('Mountain')) {
    return 'West';
  }
  return 'Central';
}

function buildPrograms(): Program[] {
  return programInputs.map((input) => {
    const prestige = derivePrestigeProfile(input);
    return {
      location: input.location,
      id: input.id,
      school: input.school,
      nickname: input.nickname,
      conference: input.conference,
      region: deriveProgramRegion(input.conference),
      colors: input.colors,
      conferenceTier: input.conferenceTier,
      parkFactor: input.parkFactor,
      travelDifficulty: input.travelDifficulty,
      prestigeLevel: prestige.overall,
      resources: deriveProgramResources(prestige),
      prestige,
    };
  });
}

const firstNames = [
  'Cade', 'Mason', 'Ty', 'Walker', 'Drew', 'Cole', 'Jace', 'Hudson', 'Brett', 'Griffin',
  'Parker', 'Noah', 'Caleb', 'Ethan', 'Landon', 'Logan', 'Luke', 'Carter', 'Kade', 'Aiden',
  'Bryce', 'Tanner', 'Blake', 'Sawyer', 'Brady', 'Gavin', 'Nolan', 'Austin', 'Ryder', 'Carson',
  'Brooks', 'Levi', 'Wyatt', 'Trey', 'Camden', 'Reid', 'Hayden', 'Brock', 'Grant', 'Cooper',
  'Micah', 'Preston', 'Garrett', 'Rowan', 'Paxton', 'Maddox', 'Emmett', 'Jonah', 'Silas',
  'Beau', 'Chase', 'Asher', 'Colton', 'Declan', 'Graham', 'Kellen', 'Rylan', 'Tripp', 'Weston',
  'Jett', 'Brant', 'Nash', 'Miller', 'Tate', 'Briggs', 'Crew', 'Cannon', 'Quinn', 'Dax',
  'Holden', 'Cash', 'Rhett', 'Zane', 'Dawson', 'Easton', 'Jaxson', 'Tatum', 'Blaine', 'Keaton',
  'Carver', 'Stetson', 'Lincoln', 'Kason', 'Marshall', 'Rocco', 'Boden', 'Tucker', 'Cullen', 'Tobin',
  'Harrison', 'Brendan', 'Kellan', 'Bridger', 'Ronan', 'Malachi', 'Teague', 'Lane', 'Dalton', 'Jude',
];

function createName(randomSeed: string, usedNames?: Set<string>) {
  const random = createSeededRandom(randomSeed);
  const firstStart = random.int(0, firstNames.length - 1);
  const lastStart = random.int(0, lastNames.length - 1);
  const maxCombinations = firstNames.length * lastNames.length;

  for (let offset = 0; offset < maxCombinations; offset += 1) {
    const first = firstNames[(firstStart + offset) % firstNames.length]!;
    const last = lastNames[(lastStart + Math.floor((lastStart + offset) / firstNames.length)) % lastNames.length]!;
    const fullName = `${first} ${last}`;
    if (!usedNames?.has(fullName)) {
      usedNames?.add(fullName);
      return fullName;
    }
  }

  const fallback = `${firstNames[firstStart]} ${lastNames[lastStart]}`;
  usedNames?.add(fallback);
  return fallback;
}

function buildOffense(base: number, randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return {
    contact: clamp(Math.round(base + random.int(-7, 6)), 32, 86),
    power: clamp(Math.round(base + random.int(-12, 10)), 28, 84),
    eye: clamp(Math.round(base + random.int(-8, 8)), 28, 85),
    avoidK: clamp(Math.round(base + random.int(-8, 7)), 28, 85),
    gap: clamp(Math.round(base + random.int(-10, 9)), 28, 84),
    speed: clamp(Math.round(base + random.int(-14, 9)), 26, 83),
    baserunning: clamp(Math.round(base + random.int(-12, 9)), 26, 83),
  };
}

function buildPitching(base: number, randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return {
    stuff: clamp(Math.round(base + random.int(-7, 9)), 34, 86),
    command: clamp(Math.round(base + random.int(-10, 7)), 34, 85),
    movement: clamp(Math.round(base + random.int(-8, 7)), 34, 85),
    stamina: clamp(Math.round(base + random.int(-8, 7)), 34, 84),
    composure: clamp(Math.round(base + random.int(-10, 8)), 34, 85),
    groundBall: clamp(Math.round(base + random.int(-12, 10)), 24, 83),
  };
}

function buildDefense(base: number, randomSeed: string) {
  const random = createSeededRandom(randomSeed);
  return {
    defense: clamp(Math.round(base + random.int(-9, 8)), 28, 85),
    arm: clamp(Math.round(base + random.int(-11, 10)), 28, 85),
  };
}

function createPlayer(program: Program, index: number, role: 'hitter' | 'pitcher', slot: Position, usedNames?: Set<string>): Player {
  const seed = `${program.id}-${index}-${role}`;
  const random = createSeededRandom(seed);
  const prestigeBase = program.prestige.overall;
  const classYears: ClassYear[] = ['FR', 'SO', 'JR', 'SR'];
  const classYear = classYears[random.int(0, classYears.length - 1)];
  const classBonus = classYear === 'SR' ? 6 : classYear === 'JR' ? 3 : classYear === 'SO' ? 0 : -4;
  const overallBase = prestigeBase * 0.42 + 20 + classBonus + random.int(-7, 7);
  const developmentProfile = createDevelopmentProfile(seed);
  const personalityProfile = createPersonalityProfile(seed);
  const leadership = createLeadershipProfile(seed, developmentProfile, personalityProfile);

  const player: Player = enrichPlayerDevelopment({
    id: `${program.id}-player-${index}`,
    name: createName(seed, usedNames),
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
    archetype: resolveArchetypeForPlayer(slot, role, seed),
    overall: clamp(Math.round(overallBase), 40, 84),
    potential: clamp(Math.round(overallBase + random.int(6, 14)), 50, 91),
    signability: clamp(40 + random.int(0, 50), 40, 95),
    marketability: clamp(35 + random.int(0, 50) + Math.round(program.prestige.nilAttractiveness * 0.15), 35, 99),
    morale: clamp(55 + random.int(0, 35), 45, 99),
    durability: clamp(50 + random.int(0, 40), 40, 95),
    developmentCurve: clamp(50 + random.int(0, 40), 40, 95),
    developmentProfile,
    personalityProfile,
    leadership,
    developmentHistory: [],
    seasonDevelopmentContext: createSeasonDevelopmentContext(),
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
  });

  if (role !== 'pitcher') {
    player.offense = buildOffense(overallBase, `${seed}-off`);
    player.defense = buildDefense(overallBase - 2, `${seed}-def`);
  }
  if (role === 'pitcher') {
    player.pitching = buildPitching(overallBase + 1, `${seed}-pit`);
    player.defense = buildDefense(overallBase - 6, `${seed}-pdef`);
  }
  const computedOverall = scorePlayerOverall(player);
  player.overall = clamp(computedOverall, 40, classYear === 'SR' ? 88 : classYear === 'JR' ? 85 : classYear === 'SO' ? 82 : 79);
  player.potential = clamp(Math.max(player.overall + 2, player.potential), player.overall + 2, 91);
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
const manualPrograms: Program[] = manualTeams.map((input) => {
  const prestige = derivePrestigeProfile(input);
  return {
    location: input.location,
    id: input.id,
    school: input.school,
    nickname: input.nickname,
    conference: input.conference,
    region: deriveProgramRegion(input.conference),
    colors: input.colors,
    conferenceTier: input.conferenceTier,
    parkFactor: input.parkFactor,
    travelDifficulty: input.travelDifficulty,
    prestigeLevel: prestige.overall,
    resources: deriveProgramResources(prestige),
    prestige,
  };
});

export function createRosterForProgram(programId: string): Player[] {
  const program = findProgram(programId);
  if (!program) {
    return [];
  }

  const positions: Position[] = [
    'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
    'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
    'C', 'CF',
  ].map((position) => position === 'OF' ? 'LF' : position as Position);

  const usedNames = new Set<string>();
  const hitters = positions.map((position, index) => createPlayer(program, index + 1, 'hitter', position, usedNames));
  const pitchers = Array.from({ length: 14 }, (_, index) => createPlayer(program, index + 101, 'pitcher', index < 4 ? 'SP' : 'RP', usedNames));

  return rebalanceRosterScholarships([...hitters, ...pitchers], program.resources.scholarshipBudget);
}

export function createLeagueRosters() {
  return Object.fromEntries(programs.map((program) => [program.id, createRosterForProgram(program.id)]));
}

export function createLeagueStaffs() {
  return createLeagueCoachingStaffs(programs);
}

export const topCities = [
  { city: 'Atlanta', state: 'GA', lat: 33.74, lon: -84.38 },
  { city: 'Houston', state: 'TX', lat: 29.76, lon: -95.36 },
  { city: 'Dallas', state: 'TX', lat: 32.77, lon: -96.79 },
  { city: 'Miami', state: 'FL', lat: 25.76, lon: -80.19 },
  { city: 'Orlando', state: 'FL', lat: 28.53, lon: -81.37 },
  { city: 'Tampa', state: 'FL', lat: 27.95, lon: -82.45 },
  { city: 'Los Angeles', state: 'CA', lat: 34.05, lon: -118.24 },
  { city: 'San Diego', state: 'CA', lat: 32.71, lon: -117.16 },
  { city: 'Chicago', state: 'IL', lat: 41.87, lon: -87.62 },
  { city: 'Charlotte', state: 'NC', lat: 35.22, lon: -80.84 },
  { city: 'Phoenix', state: 'AZ', lat: 33.44, lon: -112.07 },
  { city: 'Las Vegas', state: 'NV', lat: 36.16, lon: -115.13 },
  { city: 'Nashville', state: 'TN', lat: 36.16, lon: -86.78 },
  { city: 'New Orleans', state: 'LA', lat: 29.95, lon: -90.07 },
  { city: 'Birmingham', state: 'AL', lat: 33.51, lon: -86.80 },
  { city: 'Jackson', state: 'MS', lat: 32.29, lon: -90.18 },
  { city: 'Mobile', state: 'AL', lat: 30.69, lon: -88.04 },
  { city: 'Savannah', state: 'GA', lat: 32.08, lon: -81.09 },
  { city: 'Memphis', state: 'TN', lat: 35.14, lon: -90.04 },
  { city: 'Little Rock', state: 'AR', lat: 34.74, lon: -92.28 },
  { city: 'Tulsa', state: 'OK', lat: 36.15, lon: -95.99 },
  { city: 'Oklahoma City', state: 'OK', lat: 35.46, lon: -97.51 },
  { city: 'Austin', state: 'TX', lat: 30.26, lon: -97.74 },
  { city: 'San Antonio', state: 'TX', lat: 29.42, lon: -98.49 },
  { city: 'Baton Rouge', state: 'LA', lat: 30.45, lon: -91.14 },
  { city: 'Lafayette', state: 'LA', lat: 30.22, lon: -92.01 },
  { city: 'Raleigh', state: 'NC', lat: 35.77, lon: -78.63 },
  { city: 'Richmond', state: 'VA', lat: 37.54, lon: -77.43 },
  { city: 'Charleston', state: 'SC', lat: 32.77, lon: -79.93 },
  { city: 'Columbia', state: 'SC', lat: 34.00, lon: -81.03 },
  { city: 'Jacksonville', state: 'FL', lat: 30.33, lon: -81.65 },
  { city: 'Indianapolis', state: 'IN', lat: 39.76, lon: -86.15 },
  { city: 'Louisville', state: 'KY', lat: 38.25, lon: -85.75 },
  { city: 'St. Louis', state: 'MO', lat: 38.62, lon: -90.19 },
  { city: 'Kansas City', state: 'MO', lat: 39.09, lon: -94.57 },
  { city: 'Omaha', state: 'NE', lat: 41.25, lon: -95.93 },
  { city: 'Des Moines', state: 'IA', lat: 41.58, lon: -93.62 },
  { city: 'Minneapolis', state: 'MN', lat: 44.97, lon: -93.26 },
  { city: 'Denver', state: 'CO', lat: 39.73, lon: -104.99 },
  { city: 'Salt Lake City', state: 'UT', lat: 40.76, lon: -111.89 },
  { city: 'Seattle', state: 'WA', lat: 47.60, lon: -122.33 },
  { city: 'Portland', state: 'OR', lat: 45.52, lon: -122.67 },
  { city: 'Sacramento', state: 'CA', lat: 38.58, lon: -121.49 },
  { city: 'Fresno', state: 'CA', lat: 36.73, lon: -119.78 },
  { city: 'San Jose', state: 'CA', lat: 37.33, lon: -121.88 },
  { city: 'Honolulu', state: 'HI', lat: 21.30, lon: -157.85 },
  { city: 'Anchorage', state: 'AK', lat: 61.21, lon: -149.90 },
  { city: 'New York', state: 'NY', lat: 40.71, lon: -74.00 },
  { city: 'Boston', state: 'MA', lat: 42.36, lon: -71.05 },
  { city: 'Philadelphia', state: 'PA', lat: 39.95, lon: -75.16 },
  { city: 'Pittsburgh', state: 'PA', lat: 40.44, lon: -79.99 },
  { city: 'Baltimore', state: 'MD', lat: 39.29, lon: -76.61 },
  { city: 'Washington', state: 'DC', lat: 38.90, lon: -77.03 }
];

function createRecruitPool(programId: string, year: number, size: number, namespace: string): Recruit[] {
  const program = programs.find((entry) => entry.id === programId);
  const prestige = program?.prestige.overall ?? 70;
  const usedNames = new Set<string>();

  return Array.from({ length: size }, (_, index) => {
    const random = createSeededRandom(`${namespace}-${year}-${index}`);
    const pitcher = random.next() > 0.62;
    const positionPool: Position[] = pitcher ? ['SP', 'RP'] : ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    const primaryPosition = random.pick(positionPool);
    const stars = random.next() > 0.9 ? 5 : random.next() > 0.65 ? 4 : random.next() > 0.3 ? 3 : 2;
    const base = 41 + stars * 5 + random.int(-5, 7);
    return {
      id: `${namespace}-year${year}-${index}`,
      name: createName(`${namespace}-name-${year}-${index}`, usedNames),
      primaryPosition,
      archetype: resolveArchetypeForPlayer(primaryPosition, pitcher ? 'pitcher' : 'hitter', `${namespace}-arch-${year}-${index}`),
      hometown: random.pick(topCities),
      stars,
      interest: clamp(Math.round(prestige * 0.35 + random.int(5, 40)), 20, 95),
      signability: clamp(45 + stars * 9 + random.int(-6, 15), 35, 99),
      developmentCurve: clamp(base + random.int(-5, 8), 45, 99),
      marketability: clamp(base + random.int(-10, 12), 40, 99),
      dealbreaker: random.pick(['proximity', 'playingTime', 'prestige', 'nil', 'development', 'none'] as any),
      preferences: {
        proximity: clamp(35 + random.int(0, 55), 30, 95),
        playingTime: clamp(45 + random.int(0, 45), 35, 99),
        prestige: clamp(45 + random.int(0, 50), 35, 99),
        nil: clamp(45 + random.int(0, 50), 35, 99),
        development: clamp(50 + random.int(0, 45), 35, 99),
      },
      offense: pitcher ? undefined : buildOffense(base, `${namespace}-off-${year}-${index}`),
      defense: buildDefense(base, `${namespace}-def-${year}-${index}`),
      pitching: pitcher ? buildPitching(base, `${namespace}-pit-${year}-${index}`) : undefined,
      targeted: false,
      totalRecruitingPoints: 0,
      weeklyPointsSpent: 0,
      weeklyActions: [],
      scoutingLevel: 0,
    };
  });
}

export function createRecruitBoard(programId: string, year: number = 1): Recruit[] {
  return createRecruitPool(programId, year, NATIONAL_RECRUIT_POOL_SIZE, 'national-recruit');
}

export function createIncomingFreshmenForProgram(programId: string, year: number, count: number): Player[] {
  const program = findProgram(programId);
  if (!program || count <= 0) {
    return [];
  }

  return createRecruitPool(programId, year, count, `${programId}-fallback-freshman`).map((recruit, index) => {
    const seed = `${programId}-freshman-${year}-${index}`;
    const developmentProfile = createDevelopmentProfile(seed);
    const personalityProfile = createPersonalityProfile(seed);
    const leadership = createLeadershipProfile(seed, developmentProfile, personalityProfile);
    const freshman = enrichPlayerDevelopment({
      id: `${programId}-fallback-${year}-${index}`,
      name: recruit.name,
      hometown: `${recruit.hometown.city}, ${recruit.hometown.state}`,
      programId,
      classYear: 'FR',
      eligibilityYears: 4,
      age: 18,
      role: recruit.pitching ? 'pitcher' : 'hitter',
      primaryPosition: recruit.primaryPosition,
      secondaryPositions: recruit.pitching ? ['RP'] : ['DH'],
      bats: 'R',
      throws: recruit.pitching ? 'R' : 'R',
      archetype: recruit.archetype,
      overall: 50,
      potential: 64,
      signability: recruit.signability,
      marketability: recruit.marketability,
      morale: 68,
      durability: 68,
      developmentCurve: recruit.developmentCurve,
      developmentProfile,
      personalityProfile,
      leadership,
      developmentHistory: [],
      seasonDevelopmentContext: createSeasonDevelopmentContext(),
      preferences: recruit.preferences,
      offense: recruit.offense,
      defense: recruit.defense,
      pitching: recruit.pitching,
      rosterStatus: {
        scholarshipPct: 0,
        schoolNilValue: 0,
        thirdPartyNilValue: 0,
        fatigue: 0,
        injuryRisk: 20 + (index % 15),
        certified: false,
      },
    });
    const freshmanOverall = clamp(scorePlayerOverall(freshman) - 5, 40, 76);
    return {
      ...freshman,
      overall: freshmanOverall,
      potential: clamp(
        Math.max(freshmanOverall + 5, 54 + recruit.stars * 5 + Math.round(recruit.developmentCurve * 0.08)),
        freshmanOverall + 5,
        90,
      ),
    };
  });
}

export function finalizeRosterForProgram(programId: string, roster: Player[]) {
  return rebalanceRosterScholarships(
    roster,
    findProgram(programId)?.resources.scholarshipBudget ?? NCAA_D1_EQUIVALENCY_CAP,
  );
}

export function advanceRosterToNextSeason(programId: string, roster: Player[], year: number) {
  const retained = roster
    .filter((player) => player.classYear !== 'SR')
    .map((player) => ({
      ...player,
      programId,
      classYear: (player.classYear === 'FR' ? 'SO' : player.classYear === 'SO' ? 'JR' : 'SR') as ClassYear,
      eligibilityYears: Math.max(1, player.eligibilityYears - 1),
      age: player.age + 1,
      rosterStatus: {
        ...player.rosterStatus,
        certified: false,
        fatigue: 0,
      },
    }));

  const replenishment = createIncomingFreshmenForProgram(programId, year, Math.max(0, DEFAULT_ROSTER_LIMIT - retained.length));
  return finalizeRosterForProgram(programId, [...retained, ...replenishment].slice(0, DEFAULT_ROSTER_LIMIT));
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
  return programs.find((program) => program.id === programId) ?? manualPrograms.find((program) => program.id === programId);
}
