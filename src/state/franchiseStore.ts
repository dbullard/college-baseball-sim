import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  createLeagueRosters,
  createLeagueStaffs,
  createIncomingFreshmenForProgram,
  createPortalEntries,
  createRecruitBoard,
  createRosterForProgram,
  finalizeRosterForProgram,
  findProgram,
  programs,
} from '../data/programs';
import {
  type AggregatedSeasonStats,
  applyInSeasonDevelopmentTick,
  calculateArchetypeCoachFit,
  buildTeamChemistryProfile,
  createDevelopmentProfile,
  createLeadershipProfile,
  createPersonalityProfile,
  createSeasonDevelopmentContext,
  evolveCoachingStaff,
  enrichPlayerDevelopment,
  getProgramDevelopmentIdentity,
  rebalancePlayerRatings,
  progressPlayerForOffseason,
  scorePlayingTimeForPlayer,
  scoreSeasonPerformanceForPlayer,
  scorePlayerOverall,
} from '../lib/playerDevelopment';
import { clamp, createSeededRandom } from '../lib/random';
import {
  advanceLeaguePostseason,
  buildSeasonSnapshotFromDatabase,
  createSeasonDatabase,
  getNextScheduledDayNumber,
  getScheduledProgramGameForDay,
  initializeLeaguePostseason,
  simulateGame,
  simulateLeagueSeasonSnapshot,
  simulateSeasonDay,
  simulateSeasonOutlook,
} from '../engine/simulator';
import type {
  ComplianceReview,
  FranchiseSave,
  GameResult,
  LeagueCoachingStaffs,
  LeagueRosters,
  LeagueSeasonSnapshot,
  MailMessage,
  MailType,
  NILDeal,
  OffseasonWeek,
  Player,
  Position,
  ProgramStrategyProfile,
  RatingDisplayMode,
  Recruit,
  RecruitingActionId,
  RecruitingNeed,
  SeasonDatabase,
  SeasonPhase,
  TransferPortalEntry,
} from '../types/models';

const STORAGE_KEY = 'college-baseball-franchise-sim-save';
const STORAGE_DB_NAME = 'college-baseball-franchise-sim-db';
const STORAGE_OBJECT_STORE = 'zustand-store';
const RULES_VERSION = 19;

const memoryStorage = new Map<string, string>();

function hasLocalStorage() {
  return typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage !== undefined;
}

function getFallbackStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (hasLocalStorage()) {
        return globalThis.localStorage.getItem(name);
      }
      return memoryStorage.get(name) ?? null;
    },
    setItem: (name, value) => {
      if (hasLocalStorage()) {
        globalThis.localStorage.setItem(name, value);
        return;
      }
      memoryStorage.set(name, value);
    },
    removeItem: (name) => {
      if (hasLocalStorage()) {
        globalThis.localStorage.removeItem(name);
        return;
      }
      memoryStorage.delete(name);
    },
  };
}

function openPersistDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_OBJECT_STORE)) {
        db.createObjectStore(STORAGE_OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB storage.'));
  });
}

async function runPersistTransaction<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openPersistDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORAGE_OBJECT_STORE, mode);
    const store = transaction.objectStore(STORAGE_OBJECT_STORE);
    const request = execute(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
  });
}

function createFranchisePersistStorage(): StateStorage {
  const fallback = getFallbackStorage();
  if (typeof indexedDB === 'undefined') {
    return fallback;
  }

  return {
    getItem: async (name) => {
      try {
        const value = await runPersistTransaction('readonly', (store) => store.get(name));
        return typeof value === 'string' ? value : null;
      } catch {
        return fallback.getItem(name);
      }
    },
    setItem: async (name, value) => {
      try {
        await runPersistTransaction('readwrite', (store) => store.put(value, name));
        if (hasLocalStorage()) {
          globalThis.localStorage.removeItem(name);
        }
      } catch {
        fallback.setItem(name, value);
      }
    },
    removeItem: async (name) => {
      try {
        await runPersistTransaction('readwrite', (store) => store.delete(name));
      } catch {
        fallback.removeItem(name);
      }
      if (hasLocalStorage()) {
        globalThis.localStorage.removeItem(name);
      }
    },
  };
}

const franchisePersistStorage = createJSONStorage(() => createFranchisePersistStorage());

const recruitingActions: Record<RecruitingActionId, { cost: number; label: string }> = {
  scout: { cost: 2, label: 'Scout' },
  call: { cost: 3, label: 'Call' },
  'campus-visit': { cost: 5, label: 'Visit' },
  'development-pitch': { cost: 4, label: 'Dev Pitch' },
  'nil-presentation': { cost: 4, label: 'NIL Pitch' },
  'playing-time-pitch': { cost: 3, label: 'PT Pitch' },
};

const MAX_LOG_ENTRIES = 120;

function createMailId() {
  return `mail-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferMailType(entry: string): MailType {
  const normalized = entry.toLowerCase();
  if (normalized.includes('clubhouse') || normalized.includes('morale') || normalized.includes('frustration')) return 'clubhouse';
  if (normalized.includes('committed') || normalized.includes('recruit') || normalized.includes('scholarship')) return 'recruiting';
  if (normalized.includes('transferred') || normalized.includes('portal')) return 'portal';
  if (normalized.includes('staff') || normalized.includes('coach')) return 'staff';
  if (normalized.includes('migrated') || normalized.includes('upgraded') || normalized.includes('updated') || normalized.includes('restarted')) return 'system';
  return 'league';
}

function buildMailSubject(entry: string, type: MailType) {
  if (entry.includes(':')) {
    const [prefix, ...rest] = entry.split(':');
    const suffix = rest.join(':').trim();
    if (suffix) {
      return `${prefix.trim()} update`;
    }
  }

  const label = {
    clubhouse: 'Clubhouse update',
    recruiting: 'Recruiting update',
    portal: 'Transfer portal update',
    staff: 'Staff update',
    league: 'League update',
    system: 'System update',
  } satisfies Record<MailType, string>;

  return label[type];
}

function toMailMessage(entry: string, options?: { markRead?: boolean; createdAt?: string; type?: MailType; subject?: string }): MailMessage {
  const type = options?.type ?? inferMailType(entry);
  const createdAt = options?.createdAt ?? new Date().toISOString();
  return {
    id: createMailId(),
    type,
    subject: options?.subject ?? buildMailSubject(entry, type),
    body: entry,
    createdAt,
    readAt: options?.markRead ? createdAt : null,
    eventLogEntry: entry,
  };
}

function prependEventLogEntries(eventLog: string[], entries: string[]) {
  return [...entries, ...eventLog].slice(0, MAX_LOG_ENTRIES);
}

function prependMailEntries(
  mail: MailMessage[] | undefined,
  entries: string[],
  options?: { markRead?: boolean; createdAt?: string; type?: MailType; subject?: string },
) {
  const existingMail = mail ?? [];
  const nextMail = entries.map((entry) => toMailMessage(entry, options));
  return [...nextMail, ...existingMail].slice(0, MAX_LOG_ENTRIES);
}

function logSaveEvent(save: FranchiseSave, entry: string, options?: { markRead?: boolean; createdAt?: string; type?: MailType; subject?: string }) {
  save.eventLog = prependEventLogEntries(save.eventLog, [entry]);
  save.mail = prependMailEntries(save.mail, [entry], options);
}

function logSaveEvents(save: FranchiseSave, entries: string[], options?: { markRead?: boolean; createdAt?: string; type?: MailType; subject?: string }) {
  save.eventLog = prependEventLogEntries(save.eventLog, entries);
  save.mail = prependMailEntries(save.mail, entries, options);
}

function buildMigratedMail(save: FranchiseSave) {
  if (save.mail?.length) {
    return save.mail.slice(0, MAX_LOG_ENTRIES);
  }

  const migratedAt = save.createdAt ?? new Date().toISOString();
  return save.eventLog.slice(0, MAX_LOG_ENTRIES).map((entry) => toMailMessage(entry, { createdAt: migratedAt, markRead: true }));
}

function scholarshipBudgetPct(programId: string) {
  return Math.round((findProgram(programId)?.resources.scholarshipBudget ?? 11.7) * 100);
}

function buildRecruitingNeedsForRoster(roster: Player[]): RecruitingNeed[] {
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
      const transferRisks = players.filter((player) => player.morale < 52).length;
      const urgency = graduatingSeniors * 4 + draftRisks * 3 + transferRisks * 2 + Math.max(0, 2 - players.length) * 4;
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
    .sort((left, right) => right.urgency - left.urgency || right.graduatingSeniors - left.graduatingSeniors);
}

function buildProgramStrategyProfile(programId: string, roster: Player[], staff: LeagueCoachingStaffs[string]): ProgramStrategyProfile {
  const hitters = roster.filter((player) => player.offense);
  const pitchers = roster.filter((player) => player.pitching);
  const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50;
  const contactScore = avg(hitters.map((player) => (player.offense!.contact + player.offense!.eye + player.offense!.avoidK) / 3));
  const powerScore = avg(hitters.map((player) => (player.offense!.power + player.offense!.gap) / 2));
  const speedScore = avg(hitters.map((player) => (player.offense!.speed + player.offense!.baserunning) / 2));
  const stuffScore = avg(pitchers.map((player) => player.pitching!.stuff));
  const commandScore = avg(pitchers.map((player) => player.pitching!.command));
  const bullpenScore = avg(pitchers.filter((player) => player.primaryPosition === 'RP').map((player) => player.pitching!.composure));
  const identity = getProgramDevelopmentIdentity(staff);

  const offenseFocus = powerScore > contactScore + 4 && powerScore > speedScore + 4
    ? 'power'
    : speedScore > contactScore + 4
      ? 'speed'
      : contactScore > powerScore + 2
        ? 'contact'
        : 'balanced';
  const pitchingFocus = bullpenScore > stuffScore + 4
    ? 'bullpen'
    : commandScore > stuffScore + 3
      ? 'command'
      : stuffScore > commandScore + 3
        ? 'power-arms'
        : 'balanced';

  return {
    programId,
    offenseFocus,
    pitchingFocus,
    identitySummary: `${identity.summary} Offense leans ${offenseFocus}; pitching leans ${pitchingFocus}.`,
  };
}

function buildLeagueStrategyProfiles(rosters: LeagueRosters, staffs: LeagueCoachingStaffs) {
  return Object.fromEntries(
    programs.map((program) => [program.id, buildProgramStrategyProfile(program.id, rosters[program.id] ?? [], staffs[program.id])]),
  ) as Record<string, ProgramStrategyProfile>;
}

export function calculateRecruitNeedFit(recruit: Recruit, roster: Player[]) {
  const needs = buildRecruitingNeedsForRoster(roster);
  const exactNeed = needs.find((need) => need.position === recruit.primaryPosition);
  const depthAtPosition = roster.filter((player) => player.primaryPosition === recruit.primaryPosition).length;
  const urgency = exactNeed?.urgency ?? 0;
  const score = clamp(46 + urgency * 6 - depthAtPosition * 4 + recruit.stars * 2, 25, 95);
  const label = score >= 80
    ? 'Major need'
    : score >= 66
      ? 'Strong need'
      : score >= 54
        ? 'Solid fit'
        : 'Depth fit';
  return { score, label, urgency };
}

export function calculateRecruitProgramFit(programId: string, recruit: Recruit, roster: Player[], coachingStaff?: LeagueCoachingStaffs[string]) {
  const staff = coachingStaff ?? createLeagueStaffs()[programId];
  const role = recruit.pitching ? 'pitcher' : 'hitter';
  const coachFit = calculateArchetypeCoachFit(recruit.archetype, role, staff, 58 + Math.round(recruit.developmentCurve * 0.08));
  const needFit = calculateRecruitNeedFit(recruit, roster);
  const identity = getProgramDevelopmentIdentity(staff);
  const family = coachFit.family;
  const identityBonus = family === identity.primaryFamily ? 10 : family === identity.secondaryFamily ? 6 : 0;
  const developmentReputation = findProgram(programId)?.prestige.developmentReputation ?? 70;
  const score = clamp(Math.round(needFit.score * 0.38 + coachFit.score * 0.36 + developmentReputation * 0.16 + identityBonus), 25, 95);
  const label = score >= 80
    ? 'Excellent program fit'
    : score >= 66
      ? 'Strong program fit'
      : score >= 54
        ? 'Viable fit'
        : 'Limited fit';
  return { score, label, needFit, coachFit, identityBonus, identity };
}

function usedRosterScholarshipPct(roster: Player[]) {
  return roster.reduce((sum, player) => sum + player.rosterStatus.scholarshipPct, 0);
}

function pendingScholarshipPct(save: FranchiseSave, options?: { excludeRecruitId?: string; excludePortalId?: string }) {
  const recruitPct = save.recruits.reduce((sum, recruit) => {
    if (recruit.id === options?.excludeRecruitId || recruit.committedProgramId || !recruit.userOffer) {
      return sum;
    }
    return sum + recruit.userOffer.scholarshipPct;
  }, 0);

  const portalPct = save.portalEntries.reduce((sum, entry) => {
    if (entry.id === options?.excludePortalId || entry.destinationProgramId || !entry.userOffer) {
      return sum;
    }
    return sum + entry.userOffer.scholarshipPct;
  }, 0);

  return recruitPct + portalPct;
}

function availableScholarshipPct(save: FranchiseSave, options?: { excludeRecruitId?: string; excludePortalId?: string }) {
  return Math.max(0, scholarshipBudgetPct(save.userProgramId) - usedRosterScholarshipPct(save.roster) - pendingScholarshipPct(save, options));
}

export function availableNilPool(save: FranchiseSave, options?: { excludeRecruitId?: string; excludePortalId?: string }): number {
  const pendingRecruits = save.recruits.reduce((sum, r) => {
    if (r.id === options?.excludeRecruitId || r.committedProgramId || !r.userOffer) return sum;
    return sum + r.userOffer.nilValue;
  }, 0);
  const pendingPortal = save.portalEntries.reduce((sum, e) => {
    if (e.id === options?.excludePortalId || e.destinationProgramId || !e.userOffer) return sum;
    return sum + e.userOffer.nilValue;
  }, 0);
  return Math.max(0, (findProgram(save.userProgramId)?.resources.schoolNilPool ?? 0) - pendingRecruits - pendingPortal);
}

function recruitingPointsPerWeek(programId: string) {
  const program = findProgram(programId);
  return 18 + Math.round((program?.resources.donorConfidence ?? 70) / 6) + Math.round((program?.prestige.competitivePrestige ?? 70) / 18);
}

function resetRecruitingWeek(save: FranchiseSave) {
  save.recruitingPointsPerWeek = recruitingPointsPerWeek(save.userProgramId);
  save.recruitingPointsRemaining = save.recruitingPointsPerWeek;
  save.recruits = save.recruits.map((recruit) => ({
    ...recruit,
    weeklyPointsSpent: 0,
    weeklyActions: [],
  }));
}

export function buildSeasonSnapshot(save: FranchiseSave): LeagueSeasonSnapshot {
  if (save.season) {
    return buildSeasonSnapshotFromDatabase(save.userProgramId, save.season, save.leagueRosters);
  }
  const weeksPlayed = Math.max(0, Math.min(14, save.currentWeek - 8));
  return simulateLeagueSeasonSnapshot(save.userProgramId, save.roster, weeksPlayed, save.leagueRosters);
}

function stripSaveForStorage(save: FranchiseSave): FranchiseSave {
  return {
    ...save,
    eventLog: save.eventLog.slice(0, MAX_LOG_ENTRIES),
    mail: save.mail.slice(0, MAX_LOG_ENTRIES),
    recruits: save.recruits.map((recruit) => ({
      ...recruit,
      topSchools: recruit.topSchools?.slice(0, 3),
    })),
    portalEntries: save.portalEntries.map((entry) => ({
      ...entry,
      topDestinations: entry.topDestinations?.slice(0, 3),
    })),
    season: undefined,
    seasonSnapshot: undefined,
  };
}

export function getProgramRosterFromSave(save: FranchiseSave, programId: string) {
  return save.leagueRosters[programId] ?? createRosterForProgram(programId);
}

export function getProgramStaffFromSave(save: FranchiseSave, programId: string) {
  return save.leagueCoachingStaffs[programId];
}

function syncUserRoster(save: FranchiseSave) {
  save.roster = getProgramRosterFromSave(save, save.userProgramId);
}

function setProgramRoster(save: FranchiseSave, programId: string, roster: Player[]) {
  save.leagueRosters[programId] = roster;
  if (programId === save.userProgramId) {
    save.roster = roster;
  }
}

function buildPostseasonRosterMap(save: FranchiseSave) {
  const rosterMap = new Map<string, Player[]>();
  for (const program of programs) {
    rosterMap.set(program.id, structuredClone(getProgramRosterFromSave(save, program.id)));
  }
  return rosterMap;
}

function mapLeagueRosters(rosters: LeagueRosters, iteratee: (player: Player) => Player): LeagueRosters {
  return Object.fromEntries(
    Object.entries(rosters).map(([programId, roster]) => [programId, roster.map((player) => iteratee(player))]),
  );
}

function hydratePlayerForCurrentRules(player: Player) {
  const seed = player.id;
  const developmentProfile = player.developmentProfile ?? createDevelopmentProfile(seed);
  const personalityProfile = player.personalityProfile ?? createPersonalityProfile(seed);
  const leadership = player.leadership ?? createLeadershipProfile(seed, developmentProfile, personalityProfile);
  const hydrated = enrichPlayerDevelopment({
    ...player,
    developmentProfile,
    personalityProfile,
    leadership,
    developmentHistory: player.developmentHistory ?? [],
    seasonDevelopmentContext: player.seasonDevelopmentContext ?? createSeasonDevelopmentContext(),
  });
  return rebalancePlayerRatings(hydrated);
}

function isValidSeasonDatabase(season: SeasonDatabase | undefined) {
  if (!season) return false;
  const expectedGameCount = (programs.length * 56) / 2;
  if (season.games.length !== expectedGameCount) return false;

  for (const program of programs) {
    const programGames = season.games.filter((game) => game.context.homeProgramId === program.id || game.context.awayProgramId === program.id);
    if (programGames.length !== 56) return false;

    const gamesByDay = new Map<number, number>();
    for (const game of programGames) {
      gamesByDay.set(game.dayNumber, (gamesByDay.get(game.dayNumber) ?? 0) + 1);
    }
    if ([...gamesByDay.values()].some((count) => count > 1)) return false;
  }

  return true;
}

function normalizeSaveForRulesVersion(save: FranchiseSave): FranchiseSave {
  const baseLeagueRosters: LeagueRosters = mapLeagueRosters(
    save.leagueRosters
      ? { ...save.leagueRosters, [save.userProgramId]: save.roster }
      : { ...createLeagueRosters(), [save.userProgramId]: save.roster },
    hydratePlayerForCurrentRules,
  );
  const baseLeagueCoachingStaffs: LeagueCoachingStaffs = save.leagueCoachingStaffs ?? createLeagueStaffs();
  const baseLeagueStrategyProfiles = save.leagueStrategyProfiles ?? buildLeagueStrategyProfiles(baseLeagueRosters, baseLeagueCoachingStaffs);
  const nextSave: FranchiseSave = {
    ...save,
    version: RULES_VERSION,
    year: save.year ?? 1,
    leagueRosters: baseLeagueRosters,
    roster: baseLeagueRosters[save.userProgramId] ?? [],
    leagueCoachingStaffs: baseLeagueCoachingStaffs,
    leagueStrategyProfiles: baseLeagueStrategyProfiles,
    settings: {
      ratingDisplay: save.settings?.ratingDisplay ?? '100',
    },
    mail: buildMigratedMail(save),
  };

  if (!isValidSeasonDatabase(nextSave.season)) {
    nextSave.season = createSeasonDatabase();
    nextSave.currentWeek = Math.max(8, nextSave.currentWeek);
    nextSave.phase = nextSave.openingDayReady ? 'opening-day' : nextSave.phase;
    logSaveEvent(nextSave, 'Season calendar migrated to the corrected 56-game league database.');
  }

  if (save.version < 11) {
    nextSave.recruits = createRecruitBoard(save.userProgramId, save.year);
    logSaveEvent(nextSave, 'Recruiting board has been expanded into a national freshman class.');
  }

  if (save.version < 14 && nextSave.recruits.length < 1000) {
    nextSave.recruits = createRecruitBoard(save.userProgramId, nextSave.year);
    logSaveEvent(nextSave, 'League rosters and the recruit pool were upgraded for persistent national recruiting.');
  }

  if (save.version < 15) {
    logSaveEvent(nextSave, 'Coaching staffs, personality, leadership, and development systems were added league-wide.');
  }

  if (save.version < 16) {
    logSaveEvent(nextSave, 'Player ratings and generated names were rebalanced for a more realistic NCAA talent spread.');
  }

  if (save.version < 17) {
    logSaveEvent(nextSave, 'Transfer portal and coaching continuity logic were upgraded for offseason movement.');
  }

  if (save.version < 18) {
    logSaveEvent(nextSave, 'Program strategy profiles were added to better track long-term roster identity.');
  }

  if (save.version < 19) {
    logSaveEvent(nextSave, 'Mail center upgraded. New messages can now be read, tracked, and deleted.');
  }

  nextSave.complianceReviews = save.complianceReviews ?? [];
  syncUserRoster(nextSave);
  nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
  return nextSave;
}

function createOffseasonPlan(): OffseasonWeek[] {
  return [
    { week: 1, label: 'Program Intake', phase: 'roster-audit', focus: 'roster', tasks: ['Audit inherited roster', 'Map cut candidates', 'Set NIL priorities'] },
    { week: 2, label: 'Recruiting Board', phase: 'recruiting', focus: 'recruiting', tasks: ['Offer top prep bats', 'Target a Friday starter', 'Scout signability risk'] },
    { week: 3, label: 'Recruiting Push', phase: 'recruiting', focus: 'recruiting', tasks: ['Increase pressure on top targets', 'Balance class by position'] },
    { week: 4, label: 'Portal Opens', phase: 'portal', focus: 'portal', tasks: ['Identify rotation upgrades', 'Add left-handed depth', 'Watch tampering risk'] },
    { week: 5, label: 'Portal Surge', phase: 'portal', focus: 'portal', tasks: ['Close on impact transfers', 'Protect roster chemistry'] },
    { week: 6, label: 'NIL Review Window', phase: 'compliance', focus: 'compliance', tasks: ['Clear third-party deals', 'Resolve brand conflicts', 'Trim over-market offers'] },
    { week: 7, label: 'Roster Crunch', phase: 'certification', focus: 'roster', tasks: ['Get to 34 or fewer', 'Finalize scholarship splits'] },
    { week: 8, label: 'Opening Day Prep', phase: 'opening-day', focus: 'opening-day', tasks: ['Certify roster', 'Preview opening weekend', 'Lock pitching roles'] },
  ];
}

function initialSeasonStructure() {
  return {
    regularSeasonGames: 56,
    seriesLength: 3,
    conferenceWeeks: 10,
    regionalsTeams: 64,
    superRegionalSeries: 8,
    mcwsTeams: 8,
  };
}

export function createInitialSave(programId: string): FranchiseSave {
  const program = findProgram(programId);
  const weeklyPlan = createOffseasonPlan();
  const eventLog = [`Took over ${program?.school ?? 'program'} with a mandate to win in Omaha.`];
  const createdAt = new Date().toISOString();
  const season = createSeasonDatabase();
  const weekBudget = recruitingPointsPerWeek(programId);
  const leagueRosters = createLeagueRosters();
  const leagueCoachingStaffs = createLeagueStaffs();
  const leagueStrategyProfiles = buildLeagueStrategyProfiles(leagueRosters, leagueCoachingStaffs);
  const save: FranchiseSave = {
    version: RULES_VERSION,
    year: 1,
    createdAt,
    currentWeek: 1,
    phase: 'roster-audit',
    userProgramId: programId,
    seasonStructure: initialSeasonStructure(),
    roster: leagueRosters[programId] ?? createRosterForProgram(programId),
    leagueRosters,
    leagueCoachingStaffs,
    leagueStrategyProfiles,
    recruits: createRecruitBoard(programId),
    portalEntries: createPortalEntries(programId),
    nilDeals: [],
    complianceReviews: [],
    weeklyPlan,
    eventLog,
    mail: prependMailEntries([], eventLog, { createdAt, markRead: true }),
    recruitingPointsPerWeek: weekBudget,
    recruitingPointsRemaining: weekBudget,
    certifiedRosterIds: [],
    openingDayReady: false,
    schoolSponsor: 'Rawlings',
    settings: {
      ratingDisplay: '100',
    },
    season,
  };
  save.seasonSnapshot = buildSeasonSnapshot(save);
  return save;
}

function toSignedPlayer(programId: string, recruit: Recruit, index: number): Player {
  const seed = `${programId}-signed-${recruit.id}`;
  const developmentProfile = createDevelopmentProfile(seed);
  const personalityProfile = createPersonalityProfile(seed);
  const leadership = createLeadershipProfile(seed, developmentProfile, personalityProfile);
  const signedPlayer = enrichPlayerDevelopment({
    id: `${programId}-signed-${recruit.id}`,
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
    morale: 72,
    durability: 70,
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
      scholarshipPct: recruit.userOffer?.scholarshipPct ?? 50,
      schoolNilValue: recruit.userOffer?.nilValue ?? 0,
      thirdPartyNilValue: 0,
      fatigue: 0,
      injuryRisk: 24 + index,
      certified: false,
    },
  });
  const freshmanOverall = clamp(scorePlayerOverall(signedPlayer) - 4, 42, 78);
  return {
    ...signedPlayer,
    overall: freshmanOverall,
    potential: clamp(
      Math.max(freshmanOverall + 5, 56 + recruit.stars * 5 + Math.round(recruit.developmentCurve * 0.09)),
      freshmanOverall + 5,
      91,
    ),
  };
}


export function getProgramRegion(conference: string) {
  if (conference === 'SEC') return 'South';
  if (conference === 'ACC') return 'East';
  if (conference === 'Big 12') return 'Central';
  if (conference === 'Big Ten') return 'Midwest';
  if (conference === 'Pac 12') return 'West';
  return 'Central';
}

export function scoreToGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 45) return 'D';
  return 'F';
}

export function gradeToMultiplier(grade: string): number {
  if (grade.startsWith('A')) return 1.5;
  if (grade.startsWith('B')) return 1.2;
  if (grade.startsWith('C')) return 0.8;
  if (grade.startsWith('D')) return 0.4;
  return 0.1;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the earth in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateSchoolGrades(programId: string, recruit: Recruit, roster?: Player[]) {
  const program = findProgram(programId);
  if (!program) return { proximity: 'F', prestige: 'F', nil: 'F', development: 'F', playingTime: 'F' };
  
  let proximityScore = 0;
  if (program.location && recruit.hometown) {
    const miles = calculateDistance(program.location.lat, program.location.lon, recruit.hometown.lat, recruit.hometown.lon);
    if (miles < 50) proximityScore = 99;
    else if (miles < 150) proximityScore = 92;
    else if (miles < 300) proximityScore = 80;
    else if (miles < 600) proximityScore = 65;
    else proximityScore = 40;
  } else {
    proximityScore = 50;
  }
  const proximity = scoreToGrade(proximityScore);

  const prestige = scoreToGrade(program.prestige.overall);
  const nil = scoreToGrade(program.prestige.nilAttractiveness);
  const development = scoreToGrade(program.prestige.developmentReputation);
  
  let ptScore = 80;
  if (roster) {
    const depth = roster.filter(p => p.primaryPosition === recruit.primaryPosition).length;
    ptScore = 95 - (depth * 15);
    if (ptScore < 40) ptScore = 40;
  }
  const playingTime = scoreToGrade(ptScore);

  return { proximity, prestige, nil, development, playingTime };
}

function evaluateRecruit(programId: string, recruit: Recruit, week: number, roster?: Player[], coachingStaff?: LeagueCoachingStaffs[string]) {
  const program = findProgram(programId);
  const prestige = program?.prestige.overall ?? 70;
  const offerNil = recruit.userOffer?.nilValue ?? 0;
  const offerScholarship = recruit.userOffer?.scholarshipPct ?? 0;
  const schoolGrades = calculateSchoolGrades(programId, recruit, roster);
  const programFit = roster ? calculateRecruitProgramFit(programId, recruit, roster, coachingStaff) : null;
  const nilAsk = Math.max(1, recruit.askingNil ?? offerNil);
  const nilRatio = offerNil > 0 ? Math.min(1.5, offerNil / nilAsk) : 0;
  const offerScore = offerScholarship * 0.38 + nilRatio * 18;
  const relationshipBoost = (recruit.totalRecruitingPoints ?? 0) * 0.34 + (recruit.targeted ? 6 : 0) + (recruit.scoutingLevel ?? 0) * 2;
  const preferenceScore =
    recruit.preferences.prestige * (prestige / 100) * 0.18 +
    recruit.preferences.nil * (offerNil / 60000) * 0.18 +
    recruit.preferences.playingTime * gradeToMultiplier(schoolGrades.playingTime) * 0.12 +
    recruit.preferences.development * ((program?.prestige.developmentReputation ?? 70) / 100) * 0.18;
  const fitScore = (programFit?.score ?? prestige) * 0.26 + (programFit?.coachFit.score ?? prestige) * 0.12;
  const chaos = createSeededRandom(`${recruit.id}-${week}-${programId}`).int(-10, 14);
  return prestige * 0.3 + recruit.interest * 0.18 + relationshipBoost + offerScore + preferenceScore + fitScore + week * 2 + chaos;
}

function aiProgramsForRecruit(save: FranchiseSave, recruit: Recruit) {
  return programs
    .filter((program) => program.id !== save.userProgramId)
    .map((program) => {
      const roster = getProgramRosterFromSave(save, program.id);
      const staff = getProgramStaffFromSave(save, program.id);
      const fit = calculateRecruitProgramFit(program.id, recruit, roster, staff);
      const identityBias = fit.identityBonus * 2 + fit.needFit.urgency;
      const prestigeBias = (findProgram(program.id)?.prestige.overall ?? 70) * 0.18;
      return {
        programId: program.id,
        score: fit.score + identityBias + prestigeBias,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((entry) => entry.programId);
}

function calculatePortalProgramFit(save: FranchiseSave, programId: string, entry: TransferPortalEntry, offer?: { scholarshipPct: number; nilValue: number }) {
  const program = findProgram(programId);
  const roster = getProgramRosterFromSave(save, programId);
  const staff = getProgramStaffFromSave(save, programId);
  const chemistry = buildTeamChemistryProfile(roster);
  const recruitLike: Recruit = {
    id: entry.id,
    name: entry.player.name,
    primaryPosition: entry.player.primaryPosition,
    archetype: entry.player.archetype,
    hometown: { city: '', state: '', lat: program?.location.lat ?? 0, lon: program?.location.lon ?? 0 },
    stars: entry.player.overall >= 80 ? 5 : entry.player.overall >= 72 ? 4 : entry.player.overall >= 64 ? 3 : 2,
    interest: entry.interest,
    signability: clamp(100 - entry.tamperRisk, 25, 95),
    developmentCurve: entry.player.developmentCurve,
    marketability: entry.player.marketability,
    preferences: entry.player.preferences,
    dealbreaker: 'playingTime',
    offense: entry.player.offense,
    defense: entry.player.defense,
    pitching: entry.player.pitching,
  };
  const fit = calculateRecruitProgramFit(programId, recruitLike, roster, staff);
  const samePosition = roster.filter((player) => player.primaryPosition === entry.player.primaryPosition).sort((left, right) => right.overall - left.overall);
  const projectedRoleScore = samePosition.length === 0
    ? 92
    : entry.player.overall > samePosition[0].overall
      ? 86
      : samePosition.length === 1
        ? 76
        : entry.player.overall >= samePosition[1].overall
          ? 70
          : 54;
  const chemistryLift = chemistry.score * 0.14;
  const prestigeLift = (program?.prestige.overall ?? 70) * 0.16;
  const offerScore = offer
    ? offer.scholarshipPct * 0.42 + offer.nilValue / 1500
    : entry.askingScholarshipPct * 0.18 + entry.askingSchoolNil / 5000;
  const score = clamp(
    Math.round(fit.score * 0.36 + projectedRoleScore * 0.24 + chemistryLift + prestigeLift + offerScore - entry.tamperRisk * 0.08),
    25,
    99,
  );
  return { score, fit, projectedRoleScore, chemistryScore: chemistry.score };
}

function aiProgramsForPortalEntry(save: FranchiseSave, entry: TransferPortalEntry) {
  return programs
    .filter((program) => program.id !== save.userProgramId && program.id !== entry.originProgramId)
    .map((program) => ({
      programId: program.id,
      ...calculatePortalProgramFit(save, program.id, entry),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}

function actionInterestDelta(save: FranchiseSave, recruit: Recruit, actionId: RecruitingActionId) {
  const grades = calculateSchoolGrades(save.userProgramId, recruit, save.roster);
  const dealbreakerGrade = recruit.dealbreaker && recruit.dealbreaker !== 'none' ? (grades as any)[recruit.dealbreaker] : 'A';
  const dealbreakerPenalty = gradeToMultiplier(dealbreakerGrade) < 0.8 ? 0.2 : 1.0;

  let base = 0;
  switch (actionId) {
    case 'scout':
      base = 1 + Math.round((recruit.scoutingLevel ?? 0) * 0.5);
      break;
    case 'call':
      base = 3 * gradeToMultiplier(grades.proximity);
      break;
    case 'campus-visit':
      base = 5 * gradeToMultiplier(grades.prestige);
      break;
    case 'development-pitch':
      base = 4 * gradeToMultiplier(grades.development);
      break;
    case 'nil-presentation':
      base = 4 * gradeToMultiplier(grades.nil);
      break;
    case 'playing-time-pitch':
      base = 3 * gradeToMultiplier(grades.playingTime);
      break;
  }
  return Math.max(1, Math.round(base * dealbreakerPenalty));
}

function resolveRecruiting(save: FranchiseSave) {
  const updates = save.recruits.map((recruit, index) => {
    if (recruit.committedProgramId) return recruit;

    const userScore = evaluateRecruit(save.userProgramId, recruit, save.currentWeek, save.roster, getProgramStaffFromSave(save, save.userProgramId));
    
    const allScores: { programId: string; score: number }[] = [];
    allScores.push({ programId: save.userProgramId, score: userScore });
    
    for (const aiProgramId of aiProgramsForRecruit(save, recruit)) {
      const aiProgram = findProgram(aiProgramId);
      if (!aiProgram) continue;
      const aiRoster = getProgramRosterFromSave(save, aiProgram.id);
      const aiScoreRaw = evaluateRecruit(aiProgram.id, recruit, save.currentWeek, aiRoster, getProgramStaffFromSave(save, aiProgram.id));
      const aiGrades = calculateSchoolGrades(aiProgram.id, recruit, aiRoster);
      const aiPenalty = gradeToMultiplier(recruit.dealbreaker && recruit.dealbreaker !== 'none' ? (aiGrades as any)[recruit.dealbreaker] : 'A') < 0.8 ? 0.5 : 1.0;
      allScores.push({ programId: aiProgram.id, score: aiScoreRaw * aiPenalty });
    }

    allScores.sort((a, b) => b.score - a.score);
    const topSchools = allScores.slice(0, 5);
    const topAiSchool = topSchools.find(s => s.programId !== save.userProgramId);
    const topAiScore = topAiSchool?.score ?? 0;
    const topAiId = topAiSchool?.programId ?? '';

    // Flip warning: targeted recruit where user leads but rival is closing within 8 points
    const userRankIndex = allScores.findIndex((s) => s.programId === save.userProgramId);
    if (
      recruit.targeted &&
      !recruit.committedProgramId &&
      userRankIndex === 0 &&
      topAiScore > 0 &&
      (userScore - topAiScore) < 8 &&
      (userScore - topAiScore) > 0
    ) {
      const rivalName = findProgram(topAiId)?.school ?? 'a rival';
      logSaveEvent(save, `${rivalName} is closing fast on ${recruit.name} — consider upgrading your offer or pitch.`, { type: 'recruiting' as const });
    }

    if (recruit.userOffer && userScore > topAiScore + recruit.signability * 0.35) {
      setProgramRoster(save, save.userProgramId, [...getProgramRosterFromSave(save, save.userProgramId), toSignedPlayer(save.userProgramId, recruit, index)]);
      logSaveEvent(save, `${recruit.name} committed after a strong NIL + scholarship package.`);
      return { ...recruit, committedProgramId: save.userProgramId, interest: 100, userScore, topSchools };
    }

    if (topAiScore > userScore + 12 && save.currentWeek >= 3) {
      const aiProgram = findProgram(topAiId);
      if (recruit.targeted && aiProgram) {
        logSaveEvent(save, `${recruit.name} committed to ${aiProgram.school}.`);
      }
      if (topAiId) {
        setProgramRoster(save, topAiId, [...getProgramRosterFromSave(save, topAiId), toSignedPlayer(topAiId, recruit, index)]);
      }
      return { ...recruit, committedProgramId: topAiId, interest: clamp(recruit.interest - 15, 0, 99), userScore, topSchools };
    }

    return { ...recruit, interest: clamp(recruit.interest + (recruit.userOffer ? 6 : -2), 0, 99), userScore, topSchools };
  });

  save.recruits = updates;
}

function resolvePortal(save: FranchiseSave) {
  const adds: Player[] = [];
  save.portalEntries = save.portalEntries.map((entry) => {
    if (entry.destinationProgramId) {
      return entry;
    }

    const userFit = calculatePortalProgramFit(save, save.userProgramId, entry, entry.userOffer);
    const aiDestinations = aiProgramsForPortalEntry(save, entry);
    const topAi = aiDestinations[0];
    const aiScore = topAi?.score ?? 58;

    if (entry.userOffer && userFit.score > aiScore + 6) {
      const incoming = {
        ...entry.player,
        id: `${save.userProgramId}-${entry.player.id}`,
        programId: save.userProgramId,
        rosterStatus: {
          ...entry.player.rosterStatus,
          scholarshipPct: entry.userOffer.scholarshipPct,
          schoolNilValue: entry.userOffer.nilValue,
          fatigue: 0,
        },
      };
      adds.push(incoming);
      logSaveEvent(save, `${entry.player.name} transferred in from ${findProgram(entry.originProgramId)?.school ?? 'another program'}.`);
      return {
        ...entry,
        destinationProgramId: save.userProgramId,
        topDestinations: [
          { programId: save.userProgramId, score: userFit.score },
          ...aiDestinations.slice(0, 4).map((candidate) => ({ programId: candidate.programId, score: candidate.score })),
        ],
      };
    }

    if (topAi && aiScore > userFit.score + 10 && save.currentWeek >= 5) {
      return {
        ...entry,
        destinationProgramId: topAi.programId,
        topDestinations: aiDestinations.slice(0, 5).map((candidate) => ({ programId: candidate.programId, score: candidate.score })),
      };
    }

    return {
      ...entry,
      interest: clamp(entry.interest + (entry.userOffer ? 4 : -3), 0, 100),
      topDestinations: aiDestinations.slice(0, 5).map((candidate) => ({ programId: candidate.programId, score: candidate.score })),
    };
  });

  if (adds.length) {
    setProgramRoster(save, save.userProgramId, [...getProgramRosterFromSave(save, save.userProgramId), ...adds]);
  }
}

function resolveCompliance(save: FranchiseSave) {
  const reviews: ComplianceReview[] = [];
  const deals: NILDeal[] = [];

  for (const player of save.roster.filter((entry) => entry.marketability >= 72)) {
    const random = createSeededRandom(`${player.id}-${save.currentWeek}-nil`);
    if (random.next() < 0.3) {
      const value = 600 + random.int(0, 55000);
      const fairMarketScore = clamp(player.marketability + random.int(-18, 12), 20, 99);
      const validBusinessPurpose = random.next() > 0.18;
      const brand = random.pick(['Rawlings', 'Mizuno', 'Marucci', 'Easton', 'Victus']);
      const status = fairMarketScore < 45 || !validBusinessPurpose || (brand === save.schoolSponsor && random.next() < 0.45)
        ? 'flagged'
        : 'approved';

      const deal: NILDeal = {
        id: `${player.id}-deal-${save.currentWeek}`,
        playerId: player.id,
        playerName: player.name,
        type: 'third-party',
        value,
        brand,
        validBusinessPurpose,
        fairMarketScore,
        status,
        createdWeek: save.currentWeek,
      };
      deals.push(deal);

      if (status === 'flagged') {
        reviews.push({
          id: `${deal.id}-review`,
          dealId: deal.id,
          playerId: player.id,
          reason: !validBusinessPurpose
            ? 'Deal lacks a clear business purpose.'
            : brand === save.schoolSponsor
              ? 'Player endorsement conflicts with school sponsor.'
              : 'Fair market value review triggered.',
          verdict: fairMarketScore < 38 || !validBusinessPurpose ? 'rejected' : 'warning',
          riskLevel: clamp(35 + random.int(0, 50), 30, 95),
        });
      }
    }
  }

  save.nilDeals.unshift(...deals.slice(0, 8));
  save.complianceReviews.unshift(...reviews);
}

function phaseForWeek(week: number): SeasonPhase {
  if (week <= 1) return 'roster-audit';
  if (week <= 3) return 'recruiting';
  if (week <= 5) return 'portal';
  if (week <= 6) return 'compliance';
  if (week <= 7) return 'certification';
  return 'opening-day';
}

function certifyRoster(save: FranchiseSave) {
  if (save.roster.length > 34) {
    logSaveEvent(save, `Roster certification blocked: ${save.roster.length} players on hand and only 34 allowed.`);
    return false;
  }

  save.certifiedRosterIds = save.roster.map((player) => player.id);
  save.roster = save.roster.map((player) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
      certified: true,
    },
  }));
  save.leagueRosters[save.userProgramId] = save.roster;
  save.openingDayReady = true;
  save.phase = 'opening-day';
  logSaveEvent(save, 'Roster certified at 34 or fewer. Opening Day prep is underway.');
  return true;
}

export function buildNextUserPreview(save: FranchiseSave) {
  if (!save.openingDayReady || !save.season) {
    return null;
  }

  const nextScheduledDayNumber = getNextScheduledDayNumber(save.season);
  const nextUserGame = nextScheduledDayNumber
    ? getScheduledProgramGameForDay(save.season, save.userProgramId, nextScheduledDayNumber)
    : null;
  if (!nextUserGame) {
    return null;
  }

  return simulateGame(
    nextUserGame.context,
    getProgramRosterFromSave(save, nextUserGame.context.homeProgramId),
    getProgramRosterFromSave(save, nextUserGame.context.awayProgramId),
    `preview-${nextUserGame.id}`,
  );
}

function recoverRosterFatigue(roster: Player[]) {
  return roster.map((player) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
      fatigue: Math.max(0, player.rosterStatus.fatigue - 4),
    },
  }));
}

function applyUserGameFatigue(roster: Player[], fatigueMap: Record<string, number>) {
  return roster.map((player) => ({
    ...player,
    rosterStatus: {
      ...player.rosterStatus,
      fatigue: fatigueMap[player.id] ?? player.rosterStatus.fatigue,
    },
  }));
}

function buildLeagueSeasonStatMap(save: FranchiseSave) {
  const statMap = new Map<string, AggregatedSeasonStats>();
  if (!save.season) return statMap;

  for (const game of save.season.games) {
    if (game.status !== 'final' || !game.result) continue;
    for (const line of [...game.result.homeBattingLines, ...game.result.awayBattingLines]) {
      const existing = statMap.get(line.playerId) ?? {};
      existing.batting = {
        games: (existing.batting?.games ?? 0) + line.games,
        plateAppearances: (existing.batting?.plateAppearances ?? 0) + line.plateAppearances,
        atBats: (existing.batting?.atBats ?? 0) + line.atBats,
        hits: (existing.batting?.hits ?? 0) + line.hits,
        doubles: (existing.batting?.doubles ?? 0) + line.doubles,
        triples: (existing.batting?.triples ?? 0) + line.triples,
        homeRuns: (existing.batting?.homeRuns ?? 0) + line.homeRuns,
        walks: (existing.batting?.walks ?? 0) + line.walks,
        strikeouts: (existing.batting?.strikeouts ?? 0) + line.strikeouts,
        runsBattedIn: (existing.batting?.runsBattedIn ?? 0) + line.runsBattedIn,
      };
      statMap.set(line.playerId, existing);
    }

    for (const line of [...game.result.homePitchingLines, ...game.result.awayPitchingLines]) {
      const existing = statMap.get(line.playerId) ?? {};
      existing.pitching = {
        games: (existing.pitching?.games ?? 0) + line.games,
        gamesStarted: (existing.pitching?.gamesStarted ?? 0) + line.gamesStarted,
        outsRecorded: (existing.pitching?.outsRecorded ?? 0) + line.outsRecorded,
        hitsAllowed: (existing.pitching?.hitsAllowed ?? 0) + line.hitsAllowed,
        earnedRuns: (existing.pitching?.earnedRuns ?? 0) + line.earnedRuns,
        walks: (existing.pitching?.walks ?? 0) + line.walks,
        strikeouts: (existing.pitching?.strikeouts ?? 0) + line.strikeouts,
      };
      statMap.set(line.playerId, existing);
    }

    for (const line of [...game.result.homeFieldingLines, ...game.result.awayFieldingLines]) {
      const existing = statMap.get(line.playerId) ?? {};
      existing.fielding = {
        games: (existing.fielding?.games ?? 0) + line.games,
        chances: (existing.fielding?.chances ?? 0) + line.chances,
        errors: (existing.fielding?.errors ?? 0) + line.errors,
      };
      statMap.set(line.playerId, existing);
    }
  }

  return statMap;
}

function healthScoreForPlayer(player: Player) {
  return clamp(100 - player.rosterStatus.injuryRisk - player.rosterStatus.fatigue + Math.round(player.durability * 0.15), 25, 95);
}

function calculateStayScore(player: Player, roster: Player[], chemistryScore: number, coachChangePenalty = 0, programPrestige = 70) {
  const samePosition = roster
    .filter((entry) => entry.primaryPosition === player.primaryPosition)
    .sort((left, right) => right.overall - left.overall);
  const depthRank = Math.max(1, samePosition.findIndex((entry) => entry.id === player.id) + 1);
  const scholarshipBoost = Math.min(14, Math.round(player.rosterStatus.scholarshipPct / 5));
  const nilBoost = Math.min(10, Math.round(player.rosterStatus.schoolNilValue / 4000));
  const depthBoost = depthRank === 1 ? 10 : depthRank === 2 ? 5 : depthRank <= 4 ? 1 : -6;
  const classBoost = player.classYear === 'SR' ? 8 : player.classYear === 'JR' ? 4 : player.classYear === 'FR' ? -3 : 0;
  const dissatisfactionPenalty = player.overall >= 78 && player.rosterStatus.scholarshipPct <= 10 ? 10 : 0;
  const chemistryBoost = Math.round((chemistryScore - 55) / 4) + Math.round((player.leadership.current - player.personalityProfile.selfishness) / 12);
  // Players who outgrow their program prestige are more likely to portal — but only if morale or chemistry is low
  const prestigeGapPenalty = (player.morale < 65 || chemistryScore < 58) && player.overall > programPrestige + 8
    ? Math.round((player.overall - programPrestige - 8) * 0.7)
    : 0;
  return clamp(
    player.morale + scholarshipBoost + nilBoost + depthBoost + classBoost + chemistryBoost
      - dissatisfactionPenalty - coachChangePenalty - prestigeGapPenalty,
    1,
    99,
  );
}

function portalReasonForPlayer(stayScore: number, coachChangePenalty: number, player: Player, depthCount: number) {
  if (coachChangePenalty >= 8 && player.developmentProfile.coachability < 60) return 'Coaching change disrupted his development path.';
  if (depthCount >= 4) return 'Depth-chart squeeze pushed him to seek a clearer role.';
  if (player.rosterStatus.scholarshipPct <= 10 && player.overall >= 75) return 'Scholarship support lagged behind his role expectations.';
  if (stayScore <= 34) return 'Morale and fit both slid into the danger zone.';
  return 'Looking for a better long-term fit.';
}

function buildPortalEntriesForOffseason(
  save: FranchiseSave,
  nextYear: number,
  staffTransitions: Record<string, ReturnType<typeof evolveCoachingStaff>>,
) {
  const entries: TransferPortalEntry[] = [];
  const departuresByProgram = new Map<string, Set<string>>();

  for (const program of programs) {
    const roster = getProgramRosterFromSave(save, program.id);
    const chemistry = buildTeamChemistryProfile(roster);
    const changedRoles = staffTransitions[program.id]?.changedRoles ?? [];
    const coachChangePenalty = changedRoles.length ? 5 + changedRoles.length * 2 : 0;

    for (const player of roster) {
      if (player.classYear === 'SR') continue;
      const samePositionCount = roster.filter((entry) => entry.primaryPosition === player.primaryPosition).length;
      const stayScore = calculateStayScore(
        player,
        roster,
        chemistry.score,
        coachChangePenalty,
        findProgram(program.id)?.prestigeLevel ?? 70,
      );
      const random = createSeededRandom(`${program.id}-${player.id}-portal-${nextYear}`);
      const portalChance = stayScore <= 30
        ? 1
        : stayScore <= 42
          ? 0.52
          : stayScore <= 54
            ? 0.24
            : coachChangePenalty >= 8
              ? 0.12
              : 0.03;
      if (random.next() > portalChance) continue;

      const departure = {
        ...player,
        programId: '',
        morale: clamp(player.morale - 4, 25, 95),
        rosterStatus: {
          ...player.rosterStatus,
          fatigue: 0,
          certified: false,
        },
      };
      entries.push({
        id: `${program.id}-portal-${player.id}-${nextYear}`,
        player: departure,
        originProgramId: program.id,
        reason: portalReasonForPlayer(stayScore, coachChangePenalty, player, samePositionCount),
        originStayScore: stayScore,
        coachChange: coachChangePenalty > 0,
        askingSchoolNil: clamp(player.rosterStatus.schoolNilValue + 4000 + player.marketability * 120, 6000, 60000),
        askingScholarshipPct: clamp(Math.max(10, player.rosterStatus.scholarshipPct + random.int(0, 10)), 5, 50),
        interest: clamp(Math.round(52 + (99 - stayScore) * 0.45 + random.int(-6, 10)), 25, 99),
        tamperRisk: clamp(Math.round(player.personalityProfile.selfishness * 0.5 + (99 - stayScore) * 0.35 + random.int(-8, 8)), 5, 95),
      });
      if (!departuresByProgram.has(program.id)) departuresByProgram.set(program.id, new Set());
      departuresByProgram.get(program.id)!.add(player.id);
    }
  }

  return { entries, departuresByProgram };
}

function applyInSeasonProgressToRoster(roster: Player[], staff: FranchiseSave['leagueCoachingStaffs'][string], performanceBump: number) {
  const chemistry = buildTeamChemistryProfile(roster);
  return roster.map((player) => {
    const samePosition = roster.filter((entry) => entry.primaryPosition === player.primaryPosition).sort((left, right) => right.overall - left.overall);
    const depthRank = Math.max(1, samePosition.findIndex((entry) => entry.id === player.id) + 1);
    const playingTimeScore = depthRank === 1 ? 82 : depthRank === 2 ? 72 : depthRank <= 4 ? 60 : 48;
    return applyInSeasonDevelopmentTick(player, staff, chemistry.score, performanceBump, playingTimeScore);
  });
}

function addMoraleToPlayer(player: Player, delta: number, note: string) {
  return {
    ...player,
    morale: clamp(player.morale + delta, 25, 95),
    seasonDevelopmentContext: {
      ...player.seasonDevelopmentContext,
      moraleScore: clamp(player.seasonDevelopmentContext.moraleScore + delta, 25, 95),
      note,
    },
  };
}

function resolveClubhouseEvents(save: FranchiseSave, contextLabel: string) {
  const nextRosters: LeagueRosters = { ...save.leagueRosters };
  const userMessages: string[] = [];

  for (const program of programs) {
    const roster = getProgramRosterFromSave(save, program.id);
    const staff = getProgramStaffFromSave(save, program.id);
    const chemistry = buildTeamChemistryProfile(roster);
    const random = createSeededRandom(`${save.year}-${save.currentWeek}-${contextLabel}-${program.id}`);
    let updatedRoster = [...roster];

    const leader = [...updatedRoster].sort((left, right) => right.leadership.current - left.leadership.current)[0];
    const volatilePlayer = [...updatedRoster].sort(
      (left, right) => (right.personalityProfile.selfishness - right.personalityProfile.resilience)
        - (left.personalityProfile.selfishness - left.personalityProfile.resilience),
    )[0];
    const frustratedPlayer = [...updatedRoster]
      .filter((player) => player.classYear !== 'SR')
      .sort((left, right) => (right.overall - right.morale) - (left.overall - left.morale))[0];

    if (chemistry.score >= 72 && leader && random.next() < 0.55) {
      updatedRoster = updatedRoster.map((player) =>
        player.id === leader.id || player.classYear === 'FR' || player.classYear === 'SO'
          ? addMoraleToPlayer(player, player.id === leader.id ? 1 : 2, 'Leadership support is lifting the room.')
          : player,
      );
      if (program.id === save.userProgramId) {
        userMessages.push(`${leader.name} helped steady the clubhouse and younger players responded well.`);
      }
    } else if (chemistry.score <= 48 && volatilePlayer && random.next() < 0.5) {
      updatedRoster = updatedRoster.map((player) =>
        player.id === volatilePlayer.id
          ? addMoraleToPlayer(player, -2, 'Tension is starting to affect the room.')
          : player.classYear !== 'SR'
            ? addMoraleToPlayer(player, -1, 'Clubhouse tension clipped morale this week.')
            : player,
      );
      if (program.id === save.userProgramId) {
        userMessages.push(`${volatilePlayer.name}'s frustration spilled into the clubhouse this week.`);
      }
    } else if (((staff.headCoach.moraleSupport + staff.assistantDevelopment.moraleSupport) / 2) >= 78 && updatedRoster.reduce((sum, player) => sum + player.morale, 0) / Math.max(1, updatedRoster.length) <= 62) {
      updatedRoster = updatedRoster.map((player) => addMoraleToPlayer(player, 1, 'The staff helped reset the group this week.'));
      if (program.id === save.userProgramId) {
        userMessages.push(`The coaching staff settled the room and gave morale a small lift.`);
      }
    } else if (frustratedPlayer && frustratedPlayer.overall >= 72 && frustratedPlayer.morale <= 54 && random.next() < 0.4) {
      updatedRoster = updatedRoster.map((player) =>
        player.id === frustratedPlayer.id
          ? addMoraleToPlayer(player, -2, 'Role frustration is starting to show.')
          : player,
      );
      if (program.id === save.userProgramId) {
        userMessages.push(`${frustratedPlayer.name} is showing signs of role frustration.`);
      }
    }

    nextRosters[program.id] = updatedRoster;
  }

  save.leagueRosters = nextRosters;
  syncUserRoster(save);
  if (userMessages.length) {
    logSaveEvents(save, userMessages.map((message) => `${contextLabel}: ${message}`));
  }
}

interface FranchiseState {
  save: FranchiseSave | null;
  selectedTab: 'overview' | 'mail' | 'roster' | 'player' | 'recruiting' | 'portal' | 'nil' | 'calendar' | 'settings' | 'preview' | 'stats' | 'polls' | 'postseason';
  lastPreviewGame: ReturnType<typeof simulateGame> | null;
  createFranchise: (programId: string) => void;
  restartFranchise: () => void;
  wipeSave: () => void;
  setSelectedTab: (tab: FranchiseState['selectedTab']) => void;
  markMailRead: (mailIds: string[]) => void;
  deleteMail: (mailIds: string[]) => void;
  releasePlayer: (playerId: string) => void;
  toggleRecruitTarget: (recruitId: string) => void;
  applyRecruitingAction: (recruitId: string, actionId: RecruitingActionId) => void;
  offerRecruit: (recruitId: string, scholarshipPct: number, nilValue: number) => void;
  offerPortalPlayer: (entryId: string, scholarshipPct: number, nilValue: number) => void;
  changeSchoolSponsor: (brand: string) => void;
  setRatingDisplay: (mode: RatingDisplayMode) => void;
  certifyCurrentRoster: () => boolean;
  restartSeason: () => void;
  simulateNextUserGame: () => void;
  advanceDay: () => void;
  advanceWeek: () => void;
}

function seasonWeekFromLabel(label?: string | null) {
  if (!label) return null;
  const match = label.match(/Week (\d+)/i);
  return match ? Number(match[1]) : null;
}

function franchiseWeekForSeasonLabel(label?: string | null) {
  const seasonWeek = seasonWeekFromLabel(label);
  return seasonWeek === null ? 8 : 8 + seasonWeek;
}

function startNextSeason(save: FranchiseSave) {
  const nextYear = (save.year || 1) + 1;
  const seasonStatMap = buildLeagueSeasonStatMap(save);
  const staffTransitions = Object.fromEntries(programs.map((program) => {
    const teamLine = save.seasonSnapshot?.teamStats.find((line) => line.programId === program.id);
    const winPct = teamLine ? teamLine.wins / Math.max(1, teamLine.wins + teamLine.losses) : 0.5;
    const performanceScore = Math.round(45 + winPct * 45 + (findProgram(program.id)?.prestige.overall ?? 70) * 0.08);
    return [program.id, evolveCoachingStaff(program.id, getProgramStaffFromSave(save, program.id), nextYear, performanceScore)];
  })) as Record<string, ReturnType<typeof evolveCoachingStaff>>;
  const { entries: portalEntries, departuresByProgram } = buildPortalEntriesForOffseason(save, nextYear, staffTransitions);
  const nextLeagueRosters: LeagueRosters = {};
  for (const program of programs) {
    const currentRoster = getProgramRosterFromSave(save, program.id);
    const departingIds = departuresByProgram.get(program.id) ?? new Set<string>();
    const teamChemistry = buildTeamChemistryProfile(currentRoster);
    const coachingStaff = staffTransitions[program.id]?.nextStaff ?? getProgramStaffFromSave(save, program.id);
    const retained = currentRoster
      .filter((player) => player.classYear !== 'SR' && !departingIds.has(player.id))
      .map((player) => {
        const stats = seasonStatMap.get(player.id);
        const progressed = progressPlayerForOffseason(player, {
          year: nextYear,
          coachingStaff,
          teamChemistryScore: teamChemistry.score,
          performanceScore: scoreSeasonPerformanceForPlayer(player, stats),
          healthScore: healthScoreForPlayer(player),
          moraleScore: player.morale,
          playingTimeScore: scorePlayingTimeForPlayer(player, stats),
        });
        return {
          ...progressed,
          programId: program.id,
          classYear: (progressed.classYear === 'FR' ? 'SO' : progressed.classYear === 'SO' ? 'JR' : 'SR') as Player['classYear'],
          eligibilityYears: Math.max(1, progressed.eligibilityYears - 1),
          age: progressed.age + 1,
          rosterStatus: {
            ...progressed.rosterStatus,
            certified: false,
            fatigue: 0,
          },
        };
      });
    const cleanedRetained = retained.filter((player) => !departingIds.has(player.id));
    const replenishment = createIncomingFreshmenForProgram(program.id, nextYear, Math.max(0, 34 - cleanedRetained.length));
    nextLeagueRosters[program.id] = finalizeRosterForProgram(program.id, [...cleanedRetained, ...replenishment].slice(0, 34));
  }
  const nextLeagueCoachingStaffs = Object.fromEntries(
    programs.map((program) => [program.id, staffTransitions[program.id]?.nextStaff ?? getProgramStaffFromSave(save, program.id)]),
  ) as LeagueCoachingStaffs;
  const portalDepartureMap = new Map<string, Set<string>>();
  for (const entry of portalEntries) {
    if (!portalDepartureMap.has(entry.originProgramId)) {
      portalDepartureMap.set(entry.originProgramId, new Set<string>());
    }
    portalDepartureMap.get(entry.originProgramId)!.add(entry.player.id);
  }
  for (const program of programs) {
    const removedIds = portalDepartureMap.get(program.id);
    if (!removedIds?.size) continue;
    const kept = nextLeagueRosters[program.id].filter((player) => !removedIds.has(player.id));
    const refill = createIncomingFreshmenForProgram(program.id, nextYear, Math.max(0, 34 - kept.length));
    nextLeagueRosters[program.id] = finalizeRosterForProgram(program.id, [...kept, ...refill].slice(0, 34));
  }

  const nextSave: FranchiseSave = {
    ...save,
    year: nextYear,
    currentWeek: 1,
    phase: 'roster-audit',
    season: undefined,
    seasonSnapshot: undefined,
    openingDayReady: false,
    certifiedRosterIds: [],
    leagueRosters: nextLeagueRosters,
    leagueCoachingStaffs: nextLeagueCoachingStaffs,
    leagueStrategyProfiles: buildLeagueStrategyProfiles(nextLeagueRosters, nextLeagueCoachingStaffs),
    roster: nextLeagueRosters[save.userProgramId] ?? [],
    recruits: createRecruitBoard(save.userProgramId, nextYear),
    portalEntries: [...portalEntries, ...createPortalEntries(save.userProgramId, nextYear)].slice(0, 24),
  };
  logSaveEvent(nextSave, `Welcome to Year ${nextSave.year}! A new national freshman class has arrived and every roster has rolled forward.`);
  const userTransition = staffTransitions[save.userProgramId];
  if (userTransition) {
    logSaveEvent(nextSave, userTransition.summary);
  }
  if (portalEntries.length) {
    logSaveEvent(nextSave, `${portalEntries.length} players entered the transfer portal across the league after offseason change and roster pressure.`);
  }
  nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
  return nextSave;
}

export function advanceFranchiseSave(save: FranchiseSave) {
  const nextSave = structuredClone(save);

  if (nextSave.phase === 'season-complete') {
    return startNextSeason(nextSave);
  }

  if (nextSave.openingDayReady && nextSave.season) {
    const finalizePostseasonView = () => {
      nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
      return nextSave;
    };

    if (!nextSave.season.games.some((game) => game.status === 'scheduled')) {
      if (!nextSave.season.postseason) {
        const rankedTeams = buildSeasonSnapshot(nextSave).teamStats;
        nextSave.season.postseason = initializeLeaguePostseason(rankedTeams);
        nextSave.phase = 'postseason';
        nextSave.currentWeek = nextSave.season.postseason.currentWeek;
        logSaveEvent(nextSave, 'The 64-team NCAA Tournament field is set. Regionals are up next.');
        return finalizePostseasonView();
      }

      if (nextSave.season.postseason.summary.currentStage !== 'complete') {
        const previousStage = nextSave.season.postseason.summary.currentStage;
        nextSave.season.postseason = advanceLeaguePostseason(
          nextSave.season.postseason,
          buildPostseasonRosterMap(nextSave),
          `save-${nextSave.year}-postseason`,
        );
        nextSave.phase = nextSave.season.postseason.summary.currentStage === 'complete' ? 'season-complete' : 'postseason';
        nextSave.currentWeek = nextSave.season.postseason.currentWeek;

        const championId = nextSave.season.postseason.summary.championProgramId;
        if (championId) {
          logSaveEvent(nextSave, `${findProgram(championId)?.school ?? 'A program'} won the College World Series.`);
        } else {
          const label = nextSave.season.postseason.summary.currentWeekLabel;
          logSaveEvent(
            nextSave,
            previousStage === 'selection'
              ? 'Regional play wrapped up and the super regional matchups are set.'
              : previousStage === 'regionals'
                ? 'Super regionals are complete and the Men\'s College World Series field is locked.'
                : previousStage === 'super-regionals'
                  ? 'Omaha bracket play is complete and the MCWS Finals matchup is set.'
                  : `${label} has been recorded.`,
          );
        }
        return finalizePostseasonView();
      }

      nextSave.phase = 'season-complete';
      logSaveEvent(nextSave, 'Season complete. The tournament bracket has been finalized.');
      return finalizePostseasonView();
    }

    nextSave.roster = recoverRosterFatigue(nextSave.roster);
    setProgramRoster(nextSave, nextSave.userProgramId, nextSave.roster);
    const simmedDay = simulateSeasonDay(nextSave.season, nextSave.userProgramId, nextSave.roster, nextSave.leagueRosters);
    if (!simmedDay) {
      if (!nextSave.season.postseason) {
        const rankedTeams = buildSeasonSnapshot(nextSave).teamStats;
        nextSave.season.postseason = initializeLeaguePostseason(rankedTeams);
        nextSave.phase = 'postseason';
        nextSave.currentWeek = nextSave.season.postseason.currentWeek;
        logSaveEvent(nextSave, 'The 64-team NCAA Tournament field is set. Regionals are up next.');
      } else {
        nextSave.phase = 'season-complete';
        logSaveEvent(nextSave, 'Season complete. The database has no remaining scheduled days.');
      }
      nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
      return nextSave;
    }

    nextSave.season = simmedDay.season;
    nextSave.phase = simmedDay.season.games.some((game) => game.status === 'scheduled') ? 'in-season' : 'postseason';
    nextSave.currentWeek = franchiseWeekForSeasonLabel(simmedDay.season.lastSimulatedDayLabel);
    const userGame: GameResult | null = simmedDay.userGame;
    if (userGame) {
      nextSave.roster = applyUserGameFatigue(nextSave.roster, userGame.updatedFatigue);
      nextSave.roster = applyInSeasonProgressToRoster(nextSave.roster, getProgramStaffFromSave(nextSave, nextSave.userProgramId), 60);
      setProgramRoster(nextSave, nextSave.userProgramId, nextSave.roster);
      const userRuns = userGame.homeProgramId === nextSave.userProgramId
        ? userGame.homeSummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0)
        : userGame.awaySummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0);
      const oppRuns = userGame.homeProgramId === nextSave.userProgramId
        ? userGame.awaySummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0)
        : userGame.homeSummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0);
      const opponentId = userGame.homeProgramId === nextSave.userProgramId
        ? userGame.awayProgramId
        : userGame.homeProgramId;
      logSaveEvent(
        nextSave,
        `${simmedDay.season.lastSimulatedDayLabel}: ${programs.find((program) => program.id === nextSave.userProgramId)?.school ?? 'Your club'} `
        + `${userRuns > oppRuns ? 'beat' : 'lost to'} ${findProgram(opponentId)?.school ?? 'its opponent'} ${userRuns}-${oppRuns}.`,
      );
      resolveClubhouseEvents(nextSave, simmedDay.season.lastSimulatedDayLabel ?? 'Clubhouse update');
    } else {
      nextSave.roster = applyInSeasonProgressToRoster(nextSave.roster, getProgramStaffFromSave(nextSave, nextSave.userProgramId), 52);
      setProgramRoster(nextSave, nextSave.userProgramId, nextSave.roster);
      logSaveEvent(nextSave, `${simmedDay.season.lastSimulatedDayLabel}: league play advanced with no user game on the schedule.`);
      resolveClubhouseEvents(nextSave, simmedDay.season.lastSimulatedDayLabel ?? 'Clubhouse update');
    }

    if (!nextSave.season.games.some((game) => game.status === 'scheduled') && !nextSave.season.postseason) {
      const rankedTeams = buildSeasonSnapshot(nextSave).teamStats;
      nextSave.season.postseason = initializeLeaguePostseason(rankedTeams);
      nextSave.phase = 'postseason';
      nextSave.currentWeek = nextSave.season.postseason.currentWeek;
      logSaveEvent(nextSave, 'The regular season is complete. The NCAA Tournament field is set.');
    }

    nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
    return nextSave;
  }

  nextSave.currentWeek += 1;
  nextSave.phase = phaseForWeek(nextSave.currentWeek);
  resetRecruitingWeek(nextSave);
  resolveRecruiting(nextSave);
  resolvePortal(nextSave);
  resolveCompliance(nextSave);
  resolveClubhouseEvents(nextSave, `Week ${nextSave.currentWeek}`);

  if (nextSave.currentWeek >= 8 && nextSave.roster.length <= 34 && nextSave.certifiedRosterIds.length === 0) {
    certifyRoster(nextSave);
  }
  nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
  return nextSave;
}

export const useFranchiseStore = create<FranchiseState>()(
  persist(
    (set) => ({
      save: null,
      selectedTab: 'overview',
      lastPreviewGame: null,
      createFranchise: (programId) => {
        set({
          save: createInitialSave(programId),
          selectedTab: 'overview',
          lastPreviewGame: null,
        });
      },
      restartFranchise: () => set((state) => {
        if (!state.save) return state;
        return {
          save: createInitialSave(state.save.userProgramId),
          selectedTab: 'overview',
          lastPreviewGame: null,
        };
      }),
      wipeSave: () => {
        set({
          save: null,
          selectedTab: 'overview',
          lastPreviewGame: null,
        });
      },
      setSelectedTab: (selectedTab) => set({ selectedTab }),
      markMailRead: (mailIds) => set((state) => {
        if (!state.save) return state;
        const unreadIds = new Set(
          mailIds.filter((mailId) => state.save!.mail.some((message) => message.id === mailId && !message.readAt)),
        );
        if (!unreadIds.size) return state;
        const readAt = new Date().toISOString();
        return {
          save: {
            ...state.save,
            mail: state.save.mail.map((message) => (
              unreadIds.has(message.id) ? { ...message, readAt } : message
            )),
          },
        };
      }),
      deleteMail: (mailIds) => set((state) => {
        if (!state.save) return state;
        const deletedIds = new Set(mailIds);
        if (!deletedIds.size) return state;
        return {
          save: {
            ...state.save,
            mail: state.save.mail.filter((message) => !deletedIds.has(message.id)),
          },
        };
      }),
      releasePlayer: (playerId) => set((state) => {
        if (!state.save) return state;
        const player = state.save.roster.find((entry) => entry.id === playerId);
        if (!player) return state;
        const nextRoster = state.save.roster.filter((entry) => entry.id !== playerId);
        const eventEntry = `Released ${player.name} to manage the 34-man cap.`;
        return {
          save: {
            ...state.save,
            roster: nextRoster,
            leagueRosters: {
              ...state.save.leagueRosters,
              [state.save.userProgramId]: nextRoster,
            },
            certifiedRosterIds: state.save.certifiedRosterIds.filter((id) => id !== playerId),
            eventLog: prependEventLogEntries(state.save.eventLog, [eventEntry]),
            mail: prependMailEntries(state.save.mail, [eventEntry]),
            seasonSnapshot: buildSeasonSnapshot({
              ...state.save,
              roster: nextRoster,
              leagueRosters: {
                ...state.save.leagueRosters,
                [state.save.userProgramId]: nextRoster,
              },
            }),
          },
        };
      }),
      toggleRecruitTarget: (recruitId) => set((state) => {
        if (!state.save) return state;
        const eventEntry = `Updated recruiting board target status for ${recruitId}.`;
        return {
          save: {
            ...state.save,
            recruits: state.save.recruits.map((recruit) =>
              recruit.id === recruitId
                ? { ...recruit, targeted: !recruit.targeted }
                : recruit,
            ),
            eventLog: prependEventLogEntries(state.save.eventLog, [eventEntry]),
            mail: prependMailEntries(state.save.mail, [eventEntry]),
          },
        };
      }),
      applyRecruitingAction: (recruitId, actionId) => set((state) => {
        if (!state.save) return state;
        const action = recruitingActions[actionId];
        if (!action || state.save.recruitingPointsRemaining < action.cost) {
          return state;
        }

        const recruit = state.save.recruits.find((entry) => entry.id === recruitId);
        if (!recruit || recruit.committedProgramId || recruit.weeklyActions?.includes(actionId)) {
          return state;
        }

        const interestGain = actionInterestDelta(state.save, recruit, actionId);
        const eventEntry = `Spent ${action.cost} recruiting points on ${action.label} for ${recruit.name}.`;
        return {
          save: {
            ...state.save,
            recruitingPointsRemaining: state.save.recruitingPointsRemaining - action.cost,
            recruits: state.save.recruits.map((entry) =>
              entry.id === recruitId
                ? {
                  ...entry,
                  targeted: true,
                  scoutingLevel: actionId === 'scout' ? Math.min(3, (entry.scoutingLevel ?? 0) + 1) : entry.scoutingLevel ?? 0,
                  totalRecruitingPoints: (entry.totalRecruitingPoints ?? 0) + action.cost,
                  weeklyPointsSpent: (entry.weeklyPointsSpent ?? 0) + action.cost,
                  weeklyActions: [...(entry.weeklyActions ?? []), actionId],
                  interest: clamp(entry.interest + interestGain, 0, 100),
                }
                : entry,
            ),
            eventLog: prependEventLogEntries(state.save.eventLog, [eventEntry]),
            mail: prependMailEntries(state.save.mail, [eventEntry]),
          },
        };
      }),
      offerRecruit: (recruitId, scholarshipPct, nilValue) => set((state) => {
        if (!state.save) return state;
        const recruit = state.save.recruits.find((r) => r.id === recruitId);
        if (!recruit) return state;
        const allowedScholarshipPct = Math.min(
          scholarshipPct,
          availableScholarshipPct(state.save, { excludeRecruitId: recruitId }),
        );
        const allowedNilValue = Math.min(
          nilValue,
          availableNilPool(state.save, { excludeRecruitId: recruitId }),
        );
        const eventEntry = `Offered ${allowedScholarshipPct}% plus $${allowedNilValue.toLocaleString()} NIL to ${recruit.name}.`;
        return {
          save: {
            ...state.save,
            recruits: state.save.recruits.map((r) =>
              r.id === recruitId
                ? { ...r, userOffer: { scholarshipPct: allowedScholarshipPct, nilValue: allowedNilValue }, interest: clamp(r.interest + 8, 0, 100) }
                : r,
            ),
            eventLog: prependEventLogEntries(state.save.eventLog, [eventEntry]),
            mail: prependMailEntries(state.save.mail, [eventEntry]),
          },
        };
      }),
      offerPortalPlayer: (entryId, scholarshipPct, nilValue) => set((state) => {
        if (!state.save) return state;
        const allowedScholarshipPct = Math.min(
          scholarshipPct,
          availableScholarshipPct(state.save, { excludePortalId: entryId }),
        );
        const eventEntry = `Sent a portal package worth ${allowedScholarshipPct}% plus $${nilValue.toLocaleString()}.`;
        return {
          save: {
            ...state.save,
            portalEntries: state.save.portalEntries.map((entry) =>
              entry.id === entryId
                ? { ...entry, userOffer: { scholarshipPct: allowedScholarshipPct, nilValue }, interest: clamp(entry.interest + 6, 0, 100) }
                : entry,
            ),
            eventLog: prependEventLogEntries(state.save.eventLog, [eventEntry]),
            mail: prependMailEntries(state.save.mail, [eventEntry]),
          },
        };
      }),
      changeSchoolSponsor: (brand) => set((state) => state.save ? ({
        save: {
          ...state.save,
          schoolSponsor: brand,
          eventLog: prependEventLogEntries(state.save.eventLog, [`Updated school sponsor assumptions to ${brand}.`]),
          mail: prependMailEntries(state.save.mail, [`Updated school sponsor assumptions to ${brand}.`], { type: 'system' }),
        },
      }) : state),
      setRatingDisplay: (mode) => set((state) => state.save ? ({
        save: {
          ...state.save,
          settings: {
            ...state.save.settings,
            ratingDisplay: mode,
          },
          eventLog: prependEventLogEntries(state.save.eventLog, [`Switched player ratings display to ${mode}.`]),
          mail: prependMailEntries(state.save.mail, [`Switched player ratings display to ${mode}.`], { type: 'system' }),
        },
      }) : state),
      certifyCurrentRoster: () => {
        let didCertify = false;
        set((state) => {
          if (!state.save) return state;
          const nextSave = structuredClone(state.save);
          didCertify = certifyRoster(nextSave);
          nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
          return {
            save: nextSave,
            selectedTab: didCertify ? 'preview' : state.selectedTab,
          };
        });
        return didCertify;
      },
      restartSeason: () => set((state) => {
        if (!state.save) return state;
        const season = createSeasonDatabase();
        const save = {
          ...state.save,
          currentWeek: Math.max(8, state.save.currentWeek),
          phase: state.save.openingDayReady ? 'opening-day' : state.save.phase,
          season,
          seasonSnapshot: buildSeasonSnapshotFromDatabase(state.save.userProgramId, season, state.save.leagueRosters),
          eventLog: prependEventLogEntries(state.save.eventLog, ['Restarted the season calendar and cleared all played games.']),
          mail: prependMailEntries(state.save.mail, ['Restarted the season calendar and cleared all played games.'], { type: 'system' }),
        };
        resetRecruitingWeek(save);
        return {
          save,
          lastPreviewGame: buildNextUserPreview(save),
          selectedTab: 'overview',
        };
      }),
      simulateNextUserGame: () => set((state) => {
        if (!state.save?.season || !state.save.openingDayReady) return state;
        const nextSave = structuredClone(state.save);
        const season = nextSave.season;
        if (!season) return state;
        nextSave.roster = recoverRosterFatigue(nextSave.roster);
        const nextScheduledDayNumber = getNextScheduledDayNumber(season);
        const nextUserGame = nextScheduledDayNumber
          ? getScheduledProgramGameForDay(season, nextSave.userProgramId, nextScheduledDayNumber)
          : null;
        if (!nextUserGame) return state;

        const homeRoster = nextUserGame.context.homeProgramId === nextSave.userProgramId
          ? nextSave.roster
          : getProgramRosterFromSave(nextSave, nextUserGame.context.homeProgramId);
        const awayRoster = nextUserGame.context.awayProgramId === nextSave.userProgramId
          ? nextSave.roster
          : getProgramRosterFromSave(nextSave, nextUserGame.context.awayProgramId);
        const result = simulateGame(nextUserGame.context, homeRoster, awayRoster, `single-game-${nextUserGame.id}`);
        nextSave.roster = applyUserGameFatigue(nextSave.roster, result.updatedFatigue);
        nextSave.roster = applyInSeasonProgressToRoster(nextSave.roster, getProgramStaffFromSave(nextSave, nextSave.userProgramId), 63);
        setProgramRoster(nextSave, nextSave.userProgramId, nextSave.roster);
        season.games = season.games.map((game) =>
          game.id === nextUserGame.id
            ? {
              ...game,
              status: 'final' as const,
              result,
            }
            : game,
        );
        season.lastSimulatedDayLabel = nextUserGame.dayLabel;
        nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);

        const userRuns = result.homeProgramId === nextSave.userProgramId
          ? result.homeSummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0)
          : result.awaySummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0);
        const oppRuns = result.homeProgramId === nextSave.userProgramId
          ? result.awaySummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0)
          : result.homeSummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0);
        const opponentId = result.homeProgramId === nextSave.userProgramId ? result.awayProgramId : result.homeProgramId;
        resolveClubhouseEvents(nextSave, nextUserGame.dayLabel);
        const eventEntry = `${nextUserGame.dayLabel}: ${programs.find((program) => program.id === nextSave.userProgramId)?.school ?? 'Your club'} `
          + `${userRuns > oppRuns ? 'beat' : 'lost to'} ${findProgram(opponentId)?.school ?? 'its opponent'} ${userRuns}-${oppRuns}.`;

        return {
          save: {
            ...nextSave,
            eventLog: prependEventLogEntries(nextSave.eventLog, [eventEntry]),
            mail: prependMailEntries(nextSave.mail, [eventEntry]),
          },
          lastPreviewGame: result,
          selectedTab: 'preview',
        };
      }),
      advanceDay: () => set((state) => {
        if (!state.save) return state;
        const nextSave = advanceFranchiseSave(state.save);

        return {
          save: nextSave,
          lastPreviewGame: buildNextUserPreview(nextSave),
        };
      }),
      advanceWeek: () => set((state) => {
        if (!state.save) return state;
        let nextSave = state.save;

        if (nextSave.phase === 'postseason') {
          nextSave = advanceFranchiseSave(nextSave);
        } else if (nextSave.openingDayReady && nextSave.season) {
          const startingWeek = seasonWeekFromLabel(
            nextSave.season.lastSimulatedDayLabel
              ?? nextSave.season.games.find((game) => game.status === 'scheduled')?.dayLabel
              ?? null,
          );
          const startingPhase = nextSave.phase;

          for (let index = 0; index < 7; index += 1) {
            const advancedSave = advanceFranchiseSave(nextSave);
            if (advancedSave === nextSave) break;
            nextSave = advancedSave;

            if (!nextSave.season || nextSave.phase === 'season-complete' || nextSave.phase === 'postseason') {
              break;
            }

            if (startingPhase === 'in-season' && nextSave.phase !== 'in-season') {
              break;
            }

            const upcomingWeek = seasonWeekFromLabel(
              nextSave.season.games.find((game) => game.status === 'scheduled')?.dayLabel
                ?? nextSave.season.lastSimulatedDayLabel
                ?? null,
            );

            if (startingWeek !== null && upcomingWeek !== null && upcomingWeek !== startingWeek) {
              break;
            }
          }
        } else {
          nextSave = advanceFranchiseSave(nextSave);
        }

        return {
          save: nextSave,
          lastPreviewGame: buildNextUserPreview(nextSave),
        };
      }),
    }),
    {
      name: STORAGE_KEY,
      storage: franchisePersistStorage,
      version: RULES_VERSION,
      partialize: (state) => ({
        ...state,
        save: state.save ? stripSaveForStorage(state.save) : null,
        lastPreviewGame: null,
      }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<FranchiseState>;
        if (!state.save) return state;
        return {
          ...state,
          save: normalizeSaveForRulesVersion(state.save),
          lastPreviewGame: null,
        };
      },
    },
  ),
);

export function selectSeasonOutlook(save: FranchiseSave | null) {
  if (!save) {
    return null;
  }
  return simulateSeasonOutlook(save.userProgramId, save.roster, 18);
}
