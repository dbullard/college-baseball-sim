import { describe, expect, it } from 'vitest';
import { programs } from '../data/programs';
import { createRecruitBoard } from '../data/programs';
import { advanceFranchiseSave, calculateRecruitProgramFit, createInitialSave, getProgramRosterFromSave, useFranchiseStore } from './franchiseStore';

describe('franchise roster lifecycle', () => {
  it('persists a full league of team-specific rosters in the save', () => {
    const userProgramId = programs[0]!.id;
    const rivalProgramId = programs[1]!.id;
    const save = createInitialSave(userProgramId);

    expect(Object.keys(save.leagueRosters)).toHaveLength(programs.length);
    expect(save.roster).toEqual(save.leagueRosters[userProgramId]);
    expect(getProgramRosterFromSave(save, rivalProgramId)).toHaveLength(34);
  });

  it('builds a much larger unique freshman board every year', () => {
    const userProgramId = programs[0]!.id;
    const yearOneBoard = createRecruitBoard(userProgramId, 1);
    const yearTwoBoard = createRecruitBoard(userProgramId, 2);

    expect(yearOneBoard.length).toBeGreaterThan(1000);
    expect(new Set(yearOneBoard.map((recruit) => recruit.id)).size).toBe(yearOneBoard.length);
    expect(new Set(yearTwoBoard.map((recruit) => recruit.id)).size).toBe(yearTwoBoard.length);
    expect(yearOneBoard[0]?.id).not.toBe(yearTwoBoard[0]?.id);
  });

  it('scores recruit program fit from roster need and coach fit', () => {
    const userProgramId = programs[0]!.id;
    const save = createInitialSave(userProgramId);
    const recruit = save.recruits.find((entry) => entry.primaryPosition === 'SP') ?? save.recruits[0]!;
    const fit = calculateRecruitProgramFit(userProgramId, recruit, save.roster, save.leagueCoachingStaffs[userProgramId]);

    expect(fit.score).toBeGreaterThanOrEqual(25);
    expect(fit.needFit.score).toBeGreaterThanOrEqual(25);
    expect(fit.coachFit.score).toBeGreaterThanOrEqual(25);
  });

  it('keeps prior recruiting classes on the team after the season rolls over', () => {
    const userProgramId = programs[0]!.id;
    const rivalProgramId = programs[1]!.id;
    const save = createInitialSave(userProgramId);
    const signedFreshman = {
      ...getProgramRosterFromSave(save, rivalProgramId)[0],
      id: `${rivalProgramId}-signed-recruit-1`,
      name: 'Recruit Carryover',
      classYear: 'FR' as const,
      eligibilityYears: 4,
      age: 18,
    };

    save.leagueRosters[rivalProgramId] = [
      ...getProgramRosterFromSave(save, rivalProgramId).slice(1),
      signedFreshman,
    ];
    save.phase = 'season-complete';

    const nextSave = advanceFranchiseSave(save);
    const nextRivalRoster = getProgramRosterFromSave(nextSave, rivalProgramId);
    const carryover = nextRivalRoster.find((player) => player.id === `${rivalProgramId}-signed-recruit-1`);

    expect(nextSave.year).toBe(2);
    expect(carryover).toBeDefined();
    expect(carryover?.classYear).toBe('SO');
    expect(nextSave.recruits[0]?.id).not.toBe(save.recruits[0]?.id);
  });

  it('preserves league coaching staffs and records development history on rollover', () => {
    const userProgramId = programs[0]!.id;
    const save = createInitialSave(userProgramId);
    const trackedPlayerId = save.roster[0]!.id;
    save.phase = 'season-complete';

    const nextSave = advanceFranchiseSave(save);
    const trackedPlayer = getProgramRosterFromSave(nextSave, userProgramId).find((player) => player.id === trackedPlayerId);

    expect(nextSave.leagueCoachingStaffs[userProgramId]?.headCoach).toBeDefined();
    expect(trackedPlayer?.developmentHistory.length).toBeGreaterThan(0);
  });

  it('moves severe transfer-risk players into the portal on rollover', () => {
    const userProgramId = programs[0]!.id;
    const rivalProgramId = programs[1]!.id;
    const save = createInitialSave(userProgramId);
    const atRisk = {
      ...getProgramRosterFromSave(save, rivalProgramId)[0]!,
      id: `${rivalProgramId}-portal-risk`,
      morale: 5,
      classYear: 'SO' as const,
      leadership: {
        ...getProgramRosterFromSave(save, rivalProgramId)[0]!.leadership,
        current: 15,
        potential: 28,
      },
      rosterStatus: {
        ...getProgramRosterFromSave(save, rivalProgramId)[0]!.rosterStatus,
        scholarshipPct: 0,
        schoolNilValue: 0,
      },
      personalityProfile: {
        ...getProgramRosterFromSave(save, rivalProgramId)[0]!.personalityProfile,
        selfishness: 95,
        teamFirst: 10,
      },
    };
    save.leagueRosters[rivalProgramId] = [
      atRisk,
      ...getProgramRosterFromSave(save, rivalProgramId).slice(1),
    ];
    save.phase = 'season-complete';

    const nextSave = advanceFranchiseSave(save);
    const portalEntry = nextSave.portalEntries.find((entry) => entry.player.id === atRisk.id);

    expect(portalEntry).toBeDefined();
    expect(portalEntry?.originProgramId).toBe(rivalProgramId);
    expect(portalEntry?.originStayScore).toBeLessThanOrEqual(40);
  });

  it('allows coaching staffs to evolve between seasons', () => {
    const userProgramId = programs[0]!.id;
    const save = createInitialSave(userProgramId);
    const originalHeadCoachId = save.leagueCoachingStaffs[userProgramId].headCoach.id;
    save.phase = 'season-complete';

    const nextSave = advanceFranchiseSave(save);

    expect(nextSave.leagueCoachingStaffs[userProgramId].headCoach).toBeDefined();
    expect(nextSave.leagueCoachingStaffs[userProgramId].headCoach.id.length).toBeGreaterThan(0);
    expect(nextSave.leagueCoachingStaffs[userProgramId].headCoach.id).not.toBe('');
    expect(nextSave.leagueCoachingStaffs[userProgramId].headCoach.id === originalHeadCoachId || nextSave.eventLog.some((line) => line.includes('Staff'))).toBe(true);
  });

  it('creates clubhouse notes during weekly advancement', () => {
    const userProgramId = programs[0]!.id;
    const save = createInitialSave(userProgramId);
    save.roster = save.roster.map((player) => ({
      ...player,
      morale: 48,
    }));
    save.leagueRosters[userProgramId] = save.roster;
    save.leagueCoachingStaffs[userProgramId] = {
      ...save.leagueCoachingStaffs[userProgramId],
      headCoach: { ...save.leagueCoachingStaffs[userProgramId].headCoach, moraleSupport: 90 },
      assistantDevelopment: { ...save.leagueCoachingStaffs[userProgramId].assistantDevelopment, moraleSupport: 88 },
    };

    const nextSave = advanceFranchiseSave(save);

    expect(nextSave.eventLog.length).toBeGreaterThan(0);
    expect(nextSave.eventLog.some((line) => line.includes('Week 2:'))).toBe(true);
  });

  it('builds portal destination shortlists during portal resolution', () => {
    const userProgramId = programs[0]!.id;
    const save = createInitialSave(userProgramId);
    save.currentWeek = 5;
    save.phase = 'portal';

    const nextSave = advanceFranchiseSave(save);
    const openEntry = nextSave.portalEntries.find((entry) => !entry.destinationProgramId);

    expect(openEntry).toBeDefined();
    expect((openEntry?.topDestinations ?? []).length).toBeGreaterThan(0);
  });

  it('does not simulate or preview a user game before opening day', () => {
    const userProgramId = programs[0]!.id;
    useFranchiseStore.getState().wipeSave();
    useFranchiseStore.getState().createFranchise(userProgramId);

    const before = useFranchiseStore.getState();
    expect(before.save?.openingDayReady).toBe(false);
    expect(before.lastPreviewGame).toBeNull();

    useFranchiseStore.getState().simulateNextUserGame();

    const after = useFranchiseStore.getState();
    expect(after.lastPreviewGame).toBeNull();
    expect(after.save?.season?.currentDayNumber).toBe(0);
    expect(after.save?.season?.games.every((game) => game.status === 'scheduled')).toBe(true);
  });

  it('tracks unread mail and supports batch actions in the mailbox', () => {
    const userProgramId = programs[0]!.id;
    useFranchiseStore.getState().wipeSave();
    useFranchiseStore.getState().createFranchise(userProgramId);

    useFranchiseStore.getState().offerRecruit('test-recruit', 25, 5000);
    useFranchiseStore.getState().changeSchoolSponsor('Louisville Slugger');
    const offeredMail = useFranchiseStore.getState().save?.mail[1];
    const sponsorMail = useFranchiseStore.getState().save?.mail[0];

    expect(offeredMail).toBeDefined();
    expect(sponsorMail).toBeDefined();
    expect(offeredMail?.readAt).toBeNull();
    expect(sponsorMail?.readAt).toBeNull();

    useFranchiseStore.getState().markMailRead([offeredMail!.id, sponsorMail!.id]);
    expect(useFranchiseStore.getState().save?.mail[0]?.readAt).toBeTruthy();
    expect(useFranchiseStore.getState().save?.mail[1]?.readAt).toBeTruthy();

    useFranchiseStore.getState().deleteMail([offeredMail!.id, sponsorMail!.id]);
    expect(useFranchiseStore.getState().save?.mail.some((message) => message.id === offeredMail!.id || message.id === sponsorMail!.id)).toBe(false);
  });

  it('advances only one user game at a time during season day simulation', () => {
    const userProgramId = programs[0]!.id;
    let save = createInitialSave(userProgramId);
    save.openingDayReady = true;
    save.phase = 'opening-day';

    const before = save.seasonSnapshot?.teamStats.find((line) => line.programId === userProgramId);
    save = advanceFranchiseSave(save);
    const after = save.seasonSnapshot?.teamStats.find((line) => line.programId === userProgramId);

    const beforeGames = (before?.wins ?? 0) + (before?.losses ?? 0);
    const afterGames = (after?.wins ?? 0) + (after?.losses ?? 0);

    expect(afterGames - beforeGames).toBeLessThanOrEqual(1);
    expect(save.season?.lastSimulatedDayLabel).toBe('Week 1 Friday');
    expect(save.currentWeek).toBe(9);
  });
});
