import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createPortalEntries, createRecruitBoard, createRosterForProgram, findProgram, programs } from '../data/programs';
import { clamp, createSeededRandom } from '../lib/random';
import {
  buildSeasonSnapshotFromDatabase,
  createProgramSchedule,
  createSeasonDatabase,
  simulateGame,
  simulateLeagueSeasonSnapshot,
  simulateSeasonDay,
  simulateSeasonOutlook,
} from '../engine/simulator';
import type {
  ComplianceReview,
  FranchiseSave,
  GameContext,
  GameResult,
  LeagueSeasonSnapshot,
  NILDeal,
  OffseasonWeek,
  Player,
  RatingDisplayMode,
  Recruit,
  RecruitingActionId,
  SeasonDatabase,
  SeasonPhase,
} from '../types/models';

const STORAGE_KEY = 'college-baseball-franchise-sim-save';
const RULES_VERSION = 8;

const recruitingActions: Record<RecruitingActionId, { cost: number; label: string }> = {
  scout: { cost: 2, label: 'Scout' },
  call: { cost: 3, label: 'Call' },
  'campus-visit': { cost: 5, label: 'Visit' },
  'development-pitch': { cost: 4, label: 'Dev Pitch' },
  'nil-presentation': { cost: 4, label: 'NIL Pitch' },
  'playing-time-pitch': { cost: 3, label: 'PT Pitch' },
};

function scholarshipBudgetPct(programId: string) {
  return Math.round((findProgram(programId)?.resources.scholarshipBudget ?? 11.7) * 100);
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

function buildSeasonSnapshot(save: FranchiseSave): LeagueSeasonSnapshot {
  if (save.season) {
    return buildSeasonSnapshotFromDatabase(save.userProgramId, save.season);
  }
  const weeksPlayed = Math.max(0, Math.min(14, save.currentWeek - 8));
  return simulateLeagueSeasonSnapshot(save.userProgramId, save.roster, weeksPlayed);
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
  const nextSave: FranchiseSave = {
    ...save,
    version: RULES_VERSION,
    year: save.year ?? 1,
    settings: {
      ratingDisplay: save.settings?.ratingDisplay ?? '100',
    },
  };

  if (!isValidSeasonDatabase(nextSave.season)) {
    nextSave.season = createSeasonDatabase();
    nextSave.currentWeek = Math.max(8, nextSave.currentWeek);
    nextSave.phase = nextSave.openingDayReady ? 'opening-day' : nextSave.phase;
    nextSave.eventLog = ['Season calendar migrated to the corrected 56-game league database.', ...nextSave.eventLog];
  }

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

function createInitialSave(programId: string): FranchiseSave {
  const program = findProgram(programId);
  const weeklyPlan = createOffseasonPlan();
  const eventLog = [`Took over ${program?.school ?? 'program'} with a mandate to win in Omaha.`];
  const season = createSeasonDatabase();
  const weekBudget = recruitingPointsPerWeek(programId);
  const save: FranchiseSave = {
    version: RULES_VERSION,
    year: 1,
    createdAt: new Date().toISOString(),
    currentWeek: 1,
    phase: 'roster-audit',
    userProgramId: programId,
    seasonStructure: initialSeasonStructure(),
    roster: createRosterForProgram(programId),
    recruits: createRecruitBoard(programId),
    portalEntries: createPortalEntries(programId),
    nilDeals: [],
    complianceReviews: [],
    weeklyPlan,
    eventLog,
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

function seasonDayLabel(save: FranchiseSave) {
  return save.season?.lastSimulatedDayLabel ?? save.season?.games.find((game) => game.status === 'scheduled')?.dayLabel ?? 'Opening Day';
}

function toSignedPlayer(programId: string, recruit: Recruit, index: number): Player {
  return {
    id: `${programId}-signed-${recruit.id}`,
    name: recruit.name,
    hometown: `${recruit.region} pipeline`,
    programId,
    classYear: 'FR',
    eligibilityYears: 4,
    age: 18,
    role: recruit.pitching ? 'pitcher' : 'hitter',
    primaryPosition: recruit.primaryPosition,
    secondaryPositions: recruit.pitching ? ['RP'] : ['DH'],
    bats: 'R',
    throws: recruit.pitching ? 'R' : 'R',
    archetype: recruit.pitching ? 'power-arm' : recruit.stars >= 4 ? 'slugger' : 'contact-bat',
    overall: clamp(48 + recruit.stars * 5 + Math.round(recruit.developmentCurve * 0.15), 45, 90),
    potential: clamp(58 + recruit.stars * 6 + Math.round(recruit.developmentCurve * 0.18), 55, 99),
    signability: recruit.signability,
    marketability: recruit.marketability,
    morale: 72,
    durability: 70,
    developmentCurve: recruit.developmentCurve,
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
  };
}

function evaluateRecruit(programId: string, recruit: Recruit, week: number) {
  const program = findProgram(programId);
  const prestige = program?.prestige.overall ?? 70;
  const offerNil = recruit.userOffer?.nilValue ?? 0;
  const offerScholarship = recruit.userOffer?.scholarshipPct ?? 0;
  const offerScore = offerScholarship * 0.38 + offerNil / 1800;
  const relationshipBoost = (recruit.totalRecruitingPoints ?? 0) * 0.34 + (recruit.targeted ? 6 : 0) + (recruit.scoutingLevel ?? 0) * 2;
  const preferenceScore =
    recruit.preferences.prestige * (prestige / 100) * 0.18 +
    recruit.preferences.nil * (offerNil / 60000) * 0.18 +
    recruit.preferences.playingTime * 0.12 +
    recruit.preferences.development * ((program?.prestige.developmentReputation ?? 70) / 100) * 0.18;
  const chaos = createSeededRandom(`${recruit.id}-${week}-${programId}`).int(-10, 14);
  return prestige * 0.42 + recruit.interest * 0.18 + relationshipBoost + offerScore + preferenceScore + week * 2 + chaos;
}

function actionInterestDelta(save: FranchiseSave, recruit: Recruit, actionId: RecruitingActionId) {
  const program = findProgram(save.userProgramId);
  switch (actionId) {
    case 'scout':
      return 1 + Math.round((recruit.scoutingLevel ?? 0) * 0.5);
    case 'call':
      return 3 + Math.round(recruit.preferences.proximity / 40);
    case 'campus-visit':
      return 4 + Math.round((program?.prestige.competitivePrestige ?? 70) / 35) + Math.round(recruit.preferences.prestige / 45);
    case 'development-pitch':
      return 3 + Math.round((program?.prestige.developmentReputation ?? 70) / 30) + Math.round(recruit.preferences.development / 50);
    case 'nil-presentation':
      return 2 + Math.round((program?.prestige.nilAttractiveness ?? 70) / 35) + Math.round(recruit.preferences.nil / 50);
    case 'playing-time-pitch':
      return 2 + Math.round(recruit.preferences.playingTime / 35);
    default:
      return 0;
  }
}

function resolveRecruiting(save: FranchiseSave) {
  const rosterAdds: Player[] = [];
  const updates = save.recruits.map((recruit, index) => {
    if (recruit.committedProgramId) {
      return recruit;
    }

    const userScore = evaluateRecruit(save.userProgramId, recruit, save.currentWeek);
    const aiScore = 52 + createSeededRandom(`${recruit.id}-ai-${save.currentWeek}`).int(0, 55);
    if (recruit.userOffer && userScore > aiScore + recruit.signability * 0.35) {
      rosterAdds.push(toSignedPlayer(save.userProgramId, recruit, index));
      save.eventLog.unshift(`${recruit.name} committed after a strong NIL + scholarship package.`);
      return { ...recruit, committedProgramId: save.userProgramId, interest: 100 };
    }

    if (aiScore > userScore + 12 && save.currentWeek >= 3) {
      const aiProgram = programs[(index + save.currentWeek) % programs.length];
      if (recruit.targeted) {
        save.eventLog.unshift(`${recruit.name} committed to ${aiProgram.school}.`);
      }
      return { ...recruit, committedProgramId: aiProgram.id, interest: clamp(recruit.interest - 15, 0, 99) };
    }

    return { ...recruit, interest: clamp(recruit.interest + (recruit.userOffer ? 6 : -2), 0, 99) };
  });

  save.roster.push(...rosterAdds);
  save.recruits = updates;
}

function resolvePortal(save: FranchiseSave) {
  const adds: Player[] = [];
  save.portalEntries = save.portalEntries.map((entry, index) => {
    if (entry.destinationProgramId) {
      return entry;
    }

    const program = findProgram(save.userProgramId);
    const offerValue = (entry.userOffer?.scholarshipPct ?? 0) * 0.34 + (entry.userOffer?.nilValue ?? 0) / 1600;
    const fitScore = (program?.prestige.overall ?? 70) * 0.38 + offerValue + entry.interest * 0.18 + (80 - entry.tamperRisk) * 0.14;
    const aiScore = 56 + createSeededRandom(`${entry.id}-portal-${save.currentWeek}`).int(0, 48);

    if (entry.userOffer && fitScore > aiScore + 8) {
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
      save.eventLog.unshift(`${entry.player.name} transferred in from ${findProgram(entry.originProgramId)?.school ?? 'another program'}.`);
      return { ...entry, destinationProgramId: save.userProgramId };
    }

    if (aiScore > fitScore + 14 && save.currentWeek >= 5) {
      const aiProgram = programs[(index + save.currentWeek + 3) % programs.length];
      return { ...entry, destinationProgramId: aiProgram.id };
    }

    return { ...entry, interest: clamp(entry.interest + (entry.userOffer ? 4 : -3), 0, 100) };
  });

  save.roster.push(...adds);
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
    save.eventLog.unshift(`Roster certification blocked: ${save.roster.length} players on hand and only 34 allowed.`);
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
  save.openingDayReady = true;
  save.phase = 'opening-day';
  save.eventLog.unshift('Roster certified at 34 or fewer. Opening Day prep is underway.');
  return true;
}

function buildNextUserPreview(save: FranchiseSave) {
  const nextUserGame = save.season?.games.find(
    (game) =>
      game.status === 'scheduled'
      && (game.context.homeProgramId === save.userProgramId || game.context.awayProgramId === save.userProgramId),
  );
  if (!nextUserGame) {
    return null;
  }

  const opponentId = nextUserGame.context.homeProgramId === save.userProgramId
    ? nextUserGame.context.awayProgramId
    : nextUserGame.context.homeProgramId;
  return simulateGame(
    nextUserGame.context,
    nextUserGame.context.homeProgramId === save.userProgramId ? save.roster : createRosterForProgram(opponentId),
    nextUserGame.context.awayProgramId === save.userProgramId ? save.roster : createRosterForProgram(opponentId),
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

interface FranchiseState {
  save: FranchiseSave | null;
  selectedTab: 'overview' | 'mail' | 'roster' | 'player' | 'recruiting' | 'portal' | 'nil' | 'calendar' | 'settings' | 'preview' | 'stats';
  lastPreviewGame: ReturnType<typeof simulateGame> | null;
  createFranchise: (programId: string) => void;
  restartFranchise: () => void;
  setSelectedTab: (tab: FranchiseState['selectedTab']) => void;
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
  advanceWeek: () => void;
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
      setSelectedTab: (selectedTab) => set({ selectedTab }),
      releasePlayer: (playerId) => set((state) => {
        if (!state.save) return state;
        const player = state.save.roster.find((entry) => entry.id === playerId);
        if (!player) return state;
        return {
          save: {
            ...state.save,
            roster: state.save.roster.filter((entry) => entry.id !== playerId),
            certifiedRosterIds: state.save.certifiedRosterIds.filter((id) => id !== playerId),
            eventLog: [`Released ${player.name} to manage the 34-man cap.`, ...state.save.eventLog],
            seasonSnapshot: buildSeasonSnapshot({
              ...state.save,
              roster: state.save.roster.filter((entry) => entry.id !== playerId),
            }),
          },
        };
      }),
      toggleRecruitTarget: (recruitId) => set((state) => {
        if (!state.save) return state;
        return {
          save: {
            ...state.save,
            recruits: state.save.recruits.map((recruit) =>
              recruit.id === recruitId
                ? { ...recruit, targeted: !recruit.targeted }
                : recruit,
            ),
            eventLog: [`Updated recruiting board target status for ${recruitId}.`, ...state.save.eventLog],
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
            eventLog: [`Spent ${action.cost} recruiting points on ${action.label} for ${recruit.name}.`, ...state.save.eventLog],
          },
        };
      }),
      offerRecruit: (recruitId, scholarshipPct, nilValue) => set((state) => {
        if (!state.save) return state;
        const allowedScholarshipPct = Math.min(
          scholarshipPct,
          availableScholarshipPct(state.save, { excludeRecruitId: recruitId }),
        );
        return {
          save: {
            ...state.save,
            recruits: state.save.recruits.map((recruit) =>
              recruit.id === recruitId
                ? { ...recruit, userOffer: { scholarshipPct: allowedScholarshipPct, nilValue }, interest: clamp(recruit.interest + 8, 0, 100) }
                : recruit,
            ),
            eventLog: [
              `Offered ${allowedScholarshipPct}% plus $${nilValue.toLocaleString()} NIL to recruit target ${recruitId}.`,
              ...state.save.eventLog,
            ],
          },
        };
      }),
      offerPortalPlayer: (entryId, scholarshipPct, nilValue) => set((state) => {
        if (!state.save) return state;
        const allowedScholarshipPct = Math.min(
          scholarshipPct,
          availableScholarshipPct(state.save, { excludePortalId: entryId }),
        );
        return {
          save: {
            ...state.save,
            portalEntries: state.save.portalEntries.map((entry) =>
              entry.id === entryId
                ? { ...entry, userOffer: { scholarshipPct: allowedScholarshipPct, nilValue }, interest: clamp(entry.interest + 6, 0, 100) }
                : entry,
            ),
            eventLog: [
              `Sent a portal package worth ${allowedScholarshipPct}% plus $${nilValue.toLocaleString()}.`,
              ...state.save.eventLog,
            ],
          },
        };
      }),
      changeSchoolSponsor: (brand) => set((state) => state.save ? ({
        save: {
          ...state.save,
          schoolSponsor: brand,
          eventLog: [`Updated school sponsor assumptions to ${brand}.`, ...state.save.eventLog],
        },
      }) : state),
      setRatingDisplay: (mode) => set((state) => state.save ? ({
        save: {
          ...state.save,
          settings: {
            ...state.save.settings,
            ratingDisplay: mode,
          },
          eventLog: [`Switched player ratings display to ${mode}.`, ...state.save.eventLog],
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
          seasonSnapshot: buildSeasonSnapshotFromDatabase(state.save.userProgramId, season),
          eventLog: ['Restarted the season calendar and cleared all played games.', ...state.save.eventLog],
        };
        resetRecruitingWeek(save);
        return {
          save,
          lastPreviewGame: buildNextUserPreview(save),
          selectedTab: 'overview',
        };
      }),
      simulateNextUserGame: () => set((state) => {
        if (!state.save?.season) return state;
        const nextSave = structuredClone(state.save);
        const season = nextSave.season;
        if (!season) return state;
        nextSave.roster = recoverRosterFatigue(nextSave.roster);
        const nextUserGame = season.games.find(
          (game) =>
            game.status === 'scheduled'
            && (game.context.homeProgramId === nextSave.userProgramId || game.context.awayProgramId === nextSave.userProgramId),
        );
        if (!nextUserGame) return state;

        const homeRoster = nextUserGame.context.homeProgramId === nextSave.userProgramId
          ? nextSave.roster
          : createRosterForProgram(nextUserGame.context.homeProgramId);
        const awayRoster = nextUserGame.context.awayProgramId === nextSave.userProgramId
          ? nextSave.roster
          : createRosterForProgram(nextUserGame.context.awayProgramId);
        const result = simulateGame(nextUserGame.context, homeRoster, awayRoster, `single-game-${nextUserGame.id}`);
        nextSave.roster = applyUserGameFatigue(nextSave.roster, result.updatedFatigue);
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

        return {
          save: {
            ...nextSave,
            eventLog: [
              `${nextUserGame.dayLabel}: ${programs.find((program) => program.id === nextSave.userProgramId)?.school ?? 'Your club'} `
              + `${userRuns > oppRuns ? 'beat' : 'lost to'} ${findProgram(opponentId)?.school ?? 'its opponent'} ${userRuns}-${oppRuns}.`,
              ...nextSave.eventLog,
            ],
          },
          lastPreviewGame: result,
          selectedTab: 'preview',
        };
      }),
      advanceWeek: () => set((state) => {
        if (!state.save) return state;
        const nextSave = structuredClone(state.save);

        if (nextSave.phase === 'season-complete') {
          nextSave.year = (nextSave.year || 1) + 1;
          nextSave.currentWeek = 1;
          nextSave.phase = 'roster-audit';
          nextSave.season = undefined;
          nextSave.seasonSnapshot = undefined;
          nextSave.openingDayReady = false;
          nextSave.certifiedRosterIds = [];
          
          nextSave.roster = nextSave.roster.filter((p: Player) => p.classYear !== 'SR');
          nextSave.roster.forEach((p: Player) => {
             if (p.classYear === 'JR') p.classYear = 'SR';
             else if (p.classYear === 'SO') p.classYear = 'JR';
             else if (p.classYear === 'FR') p.classYear = 'SO';
          });
          
          nextSave.recruits = createRecruitBoard(nextSave.userProgramId, nextSave.year);
          nextSave.portalEntries = createPortalEntries(nextSave.userProgramId, nextSave.year);
          nextSave.eventLog.unshift(`Welcome to Year ${nextSave.year}! The new recruiting board is live and graduation has processed.`);
          
          return {
            save: nextSave,
            lastPreviewGame: null,
          };
        }

        if (nextSave.openingDayReady && nextSave.season) {
          nextSave.roster = recoverRosterFatigue(nextSave.roster);
          const simmedDay = simulateSeasonDay(nextSave.season, nextSave.userProgramId, nextSave.roster);
          if (!simmedDay) {
            nextSave.phase = 'season-complete';
            nextSave.eventLog.unshift('Season complete. The database has no remaining scheduled days.');
            return {
              save: {
                ...nextSave,
                seasonSnapshot: buildSeasonSnapshot(nextSave),
              },
              lastPreviewGame: null,
            };
          }

          nextSave.season = simmedDay.season;
          nextSave.phase = simmedDay.season.games.some((game) => game.status === 'scheduled') ? 'in-season' : 'season-complete';
          nextSave.currentWeek = 8 + simmedDay.season.currentDayNumber - 1;
          const userGame: GameResult | null = simmedDay.userGame;
          if (userGame) {
            nextSave.roster = applyUserGameFatigue(nextSave.roster, userGame.updatedFatigue);
            const userRuns = userGame.homeProgramId === nextSave.userProgramId
              ? userGame.homeSummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0)
              : userGame.awaySummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0);
            const oppRuns = userGame.homeProgramId === nextSave.userProgramId
              ? userGame.awaySummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0)
              : userGame.homeSummary.runsByInning.reduce((sum: number, runs: number) => sum + runs, 0);
            const opponentId = userGame.homeProgramId === nextSave.userProgramId
              ? userGame.awayProgramId
              : userGame.homeProgramId;
            nextSave.eventLog.unshift(
              `${simmedDay.season.lastSimulatedDayLabel}: ${programs.find((program) => program.id === nextSave.userProgramId)?.school ?? 'Your club'} `
              + `${userRuns > oppRuns ? 'beat' : 'lost to'} ${findProgram(opponentId)?.school ?? 'its opponent'} ${userRuns}-${oppRuns}.`,
            );
          } else {
            nextSave.eventLog.unshift(`${simmedDay.season.lastSimulatedDayLabel}: league play advanced with no user game on the schedule.`);
          }

          nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
          return {
            save: nextSave,
            lastPreviewGame: simmedDay.userGame ?? buildNextUserPreview(nextSave),
          };
        }

        nextSave.currentWeek += 1;
        nextSave.phase = phaseForWeek(nextSave.currentWeek);
        resetRecruitingWeek(nextSave);
        resolveRecruiting(nextSave);
        resolvePortal(nextSave);
        resolveCompliance(nextSave);

        if (nextSave.currentWeek >= 8 && nextSave.roster.length <= 34 && nextSave.certifiedRosterIds.length === 0) {
          certifyRoster(nextSave);
        }
        nextSave.seasonSnapshot = buildSeasonSnapshot(nextSave);
        const nextUserScheduledContext = nextSave.openingDayReady
          ? createProgramSchedule(nextSave.userProgramId).find((game) => game.dateLabel.includes('Friday'))
          : null;
        const previewContext: GameContext | null = nextUserScheduledContext ?? null;

        return {
          save: nextSave,
          lastPreviewGame: previewContext
            ? simulateGame(
              previewContext,
              previewContext.homeProgramId === nextSave.userProgramId ? nextSave.roster : createRosterForProgram(previewContext.homeProgramId),
              previewContext.awayProgramId === nextSave.userProgramId ? nextSave.roster : createRosterForProgram(previewContext.awayProgramId),
              `preview-${nextSave.currentWeek}-${seasonDayLabel(nextSave)}`,
            )
            : null,
        };
      }),
    }),
    {
      name: STORAGE_KEY,
      version: RULES_VERSION,
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
