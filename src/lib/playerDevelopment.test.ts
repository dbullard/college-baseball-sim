import { describe, expect, it } from 'vitest';
import { createCoachingStaffForProgram, evolveCoachingStaff, getProgramDevelopmentIdentity, progressPlayerForOffseason, scorePlayingTimeForPlayer, scoreSeasonPerformanceForPlayer } from './playerDevelopment';
import { createRosterForProgram, programs } from '../data/programs';

const sortedPrograms = [...programs].sort((left, right) => right.prestige.overall - left.prestige.overall);
const eliteProgram = sortedPrograms[0]!;
const midProgram = sortedPrograms[Math.floor(sortedPrograms.length / 2)]!;
const eliteProgramId = eliteProgram.id;
const midProgramId = midProgram.id;

describe('player development engine', () => {
  it('develops freshmen more aggressively than comparable seniors', () => {
    const template = createRosterForProgram(eliteProgramId).find((player) => player.offense) ?? createRosterForProgram(eliteProgramId)[0]!;
    const staff = createCoachingStaffForProgram(eliteProgram);
    const freshman = {
      ...template,
      id: 'freshman-test',
      classYear: 'FR' as const,
      age: 18,
      overall: 58,
      potential: 88,
      developmentCurve: 88,
    };
    const senior = {
      ...template,
      id: 'senior-test',
      classYear: 'SR' as const,
      age: 22,
      overall: 58,
      potential: 88,
      developmentCurve: 88,
    };

    const progressedFreshman = progressPlayerForOffseason(freshman, {
      year: 2,
      coachingStaff: staff,
      teamChemistryScore: 84,
      performanceScore: 82,
      healthScore: 80,
      moraleScore: 78,
      playingTimeScore: 76,
    });
    const progressedSenior = progressPlayerForOffseason(senior, {
      year: 2,
      coachingStaff: staff,
      teamChemistryScore: 84,
      performanceScore: 82,
      healthScore: 80,
      moraleScore: 78,
      playingTimeScore: 76,
    });

    expect(progressedFreshman.overall - freshman.overall).toBeGreaterThan(progressedSenior.overall - senior.overall);
  });

  it('does not crater potential after one poor season', () => {
    const player = createRosterForProgram(midProgramId)[0]!;
    const staff = createCoachingStaffForProgram(midProgram);

    const progressed = progressPlayerForOffseason(
      {
        ...player,
        overall: 67,
        potential: 83,
      },
      {
        year: 2,
        coachingStaff: staff,
        teamChemistryScore: 58,
        performanceScore: 30,
        healthScore: 48,
        moraleScore: 44,
        playingTimeScore: 38,
      },
    );

    expect(progressed.potential).toBeGreaterThanOrEqual(82);
  });

  it('rewards strong coach fit more than weak coach fit', () => {
    const player = createRosterForProgram(eliteProgramId)[0]!;
    const goodStaff = createCoachingStaffForProgram(eliteProgram);
    const badStaff = createCoachingStaffForProgram(midProgram);
    const weakFitStaff = {
      ...badStaff,
      headCoach: { ...badStaff.headCoach, developmentRatings: Object.fromEntries(Object.keys(badStaff.headCoach.developmentRatings).map((key) => [key, 35])) as typeof badStaff.headCoach.developmentRatings },
      assistantHitting: { ...badStaff.assistantHitting, developmentRatings: Object.fromEntries(Object.keys(badStaff.assistantHitting.developmentRatings).map((key) => [key, 35])) as typeof badStaff.assistantHitting.developmentRatings },
      assistantPitching: { ...badStaff.assistantPitching, developmentRatings: Object.fromEntries(Object.keys(badStaff.assistantPitching.developmentRatings).map((key) => [key, 35])) as typeof badStaff.assistantPitching.developmentRatings },
      assistantDevelopment: { ...badStaff.assistantDevelopment, developmentRatings: Object.fromEntries(Object.keys(badStaff.assistantDevelopment.developmentRatings).map((key) => [key, 35])) as typeof badStaff.assistantDevelopment.developmentRatings },
    };

    const strongFit = progressPlayerForOffseason(player, {
      year: 2,
      coachingStaff: goodStaff,
      teamChemistryScore: 70,
      performanceScore: 60,
      healthScore: 70,
      moraleScore: 68,
      playingTimeScore: 60,
    });
    const weakFit = progressPlayerForOffseason(player, {
      year: 2,
      coachingStaff: weakFitStaff,
      teamChemistryScore: 70,
      performanceScore: 60,
      healthScore: 70,
      moraleScore: 68,
      playingTimeScore: 60,
    });

    expect(strongFit.overall).toBeGreaterThanOrEqual(weakFit.overall);
  });

  it('scores hitter seasons differently by archetype family', () => {
    const roster = createRosterForProgram(eliteProgramId);
    const cornerBat = roster.find((player) => player.archetype === 'corner-power-bat') ?? roster.find((player) => player.offense)!;
    const gloveShortstop = roster.find((player) => player.archetype === 'middle-glove-wizard') ?? roster.find((player) => player.primaryPosition === 'SS')!;
    const statLine = {
      batting: {
        games: 50,
        plateAppearances: 210,
        atBats: 180,
        hits: 54,
        doubles: 10,
        triples: 2,
        homeRuns: 8,
        walks: 24,
        strikeouts: 36,
        runsBattedIn: 48,
      },
      fielding: {
        games: 48,
        chances: 140,
        errors: 2,
      },
    };

    const cornerScore = scoreSeasonPerformanceForPlayer(cornerBat, statLine);
    const gloveScore = scoreSeasonPerformanceForPlayer(gloveShortstop, statLine);

    expect(cornerScore).not.toBe(gloveScore);
  });

  it('scores pitcher usage differently for starters and relievers', () => {
    const roster = createRosterForProgram(eliteProgramId);
    const starter = roster.find((player) => player.primaryPosition === 'SP')!;
    const reliever = roster.find((player) => player.primaryPosition === 'RP')!;
    const starterUsage = {
      pitching: {
        games: 14,
        gamesStarted: 14,
        outsRecorded: 252,
        hitsAllowed: 70,
        earnedRuns: 24,
        walks: 20,
        strikeouts: 88,
      },
    };
    const relieverUsage = {
      pitching: {
        games: 26,
        gamesStarted: 0,
        outsRecorded: 99,
        hitsAllowed: 28,
        earnedRuns: 9,
        walks: 10,
        strikeouts: 42,
      },
    };

    expect(scorePlayingTimeForPlayer(starter, starterUsage)).toBeGreaterThan(scorePlayingTimeForPlayer(reliever, relieverUsage) - 10);
    expect(scoreSeasonPerformanceForPlayer(starter, starterUsage)).not.toBe(scoreSeasonPerformanceForPlayer(reliever, relieverUsage));
  });

  it('derives a visible development identity from staff strengths', () => {
    const staff = createCoachingStaffForProgram(eliteProgram);
    const identity = getProgramDevelopmentIdentity(staff);

    expect(identity.primaryFamily).toBeDefined();
    expect(identity.secondaryFamily).toBeDefined();
    expect(identity.summary.length).toBeGreaterThan(10);
  });

  it('supports coach succession with readable transition summaries', () => {
    const staff = createCoachingStaffForProgram(eliteProgram);
    const transition = evolveCoachingStaff(eliteProgramId, staff, 2, 82);

    expect(transition.nextStaff.headCoach).toBeDefined();
    expect(transition.summary.length).toBeGreaterThan(10);
  });
});
