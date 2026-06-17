import { describe, expect, it } from 'vitest';
import { createRosterForProgram, programs } from '../data/programs';
import {
  buildSeasonSnapshotFromDatabase,
  createProgramSchedule,
  createSeasonDatabase,
  getNextScheduledProgramGame,
  getProgramSeasonSchedule,
  simulateGame,
  simulateLeagueSeasonSnapshot,
  simulateSeasonDay,
  simulateSeasonOutlook,
} from './simulator';

const sortedPrograms = [...programs].sort((left, right) => right.prestige.overall - left.prestige.overall);
const eliteProgramId = sortedPrograms[0]!.id;
const strongProgramId = sortedPrograms[1]!.id;
const midMajorProgramId = sortedPrograms[sortedPrograms.length - 1]!.id;
const challengerProgramId = [...sortedPrograms].reverse().find((program) => program.prestige.overall >= 70)?.id ?? programs[programs.length - 1]!.id;

describe('lineup-level franchise simulator', () => {
  it('starts each program with a legal 34-man roster', () => {
    const roster = createRosterForProgram(eliteProgramId);
    expect(roster).toHaveLength(34);
    const scholarshipEquivalencies = roster.reduce((sum, player) => sum + player.rosterStatus.scholarshipPct, 0) / 100;
    expect(scholarshipEquivalencies).toBeLessThanOrEqual(11.7);
  });

  it('keeps undefeated seasons effectively near zero for elite programs', () => {
    const roster = createRosterForProgram(eliteProgramId);
    const outlook = simulateSeasonOutlook(eliteProgramId, roster, 20);
    expect(outlook.undefeatedRate).toBeLessThan(0.12);
    expect(outlook.averageWins).toBeLessThan(50);
  });

  it('builds one real 56-game regular-season schedule per program', () => {
    const season = createSeasonDatabase();
    expect(season.games).toHaveLength((programs.length * 56) / 2);

    for (const program of programs) {
      const programSchedule = createProgramSchedule(program.id);
      expect(programSchedule).toHaveLength(56);

      const gamesByDay = new Map<number, number>();
      for (const game of season.games.filter((entry) => entry.context.homeProgramId === program.id || entry.context.awayProgramId === program.id)) {
        gamesByDay.set(game.dayNumber, (gamesByDay.get(game.dayNumber) ?? 0) + 1);
      }
      expect(Math.max(...gamesByDay.values())).toBe(1);
    }
  });

  it('reads a program schedule from the persisted season database', () => {
    const season = createSeasonDatabase();
    const schedule = getProgramSeasonSchedule(season, eliteProgramId);

    expect(schedule).toHaveLength(56);
    expect(schedule.every((game) => game.context.homeProgramId === eliteProgramId || game.context.awayProgramId === eliteProgramId)).toBe(true);
  });

  it('advances the next scheduled user matchup after a game is finalized', () => {
    const season = createSeasonDatabase();
    const firstScheduled = getNextScheduledProgramGame(season, eliteProgramId);

    expect(firstScheduled).not.toBeNull();

    const updatedSeason = {
      ...season,
      games: season.games.map((game) =>
        game.id === firstScheduled!.id
          ? {
            ...game,
            status: 'final' as const,
            result: simulateGame(
              game.context,
              createRosterForProgram(game.context.homeProgramId),
              createRosterForProgram(game.context.awayProgramId),
              `test-${game.id}`,
            ),
          }
          : game,
      ),
    };

    const nextScheduled = getNextScheduledProgramGame(updatedSeason, eliteProgramId);

    expect(nextScheduled).not.toBeNull();
    expect(nextScheduled?.id).not.toBe(firstScheduled?.id);
  });

  it('accumulates stats only from completed season database games', () => {
    let season = createSeasonDatabase();
    const roster = createRosterForProgram(eliteProgramId);

    for (let day = 0; day < 3; day += 1) {
      const next = simulateSeasonDay(season, eliteProgramId, roster);
      expect(next).not.toBeNull();
      season = next!.season;
    }

    const snapshot = buildSeasonSnapshotFromDatabase(eliteProgramId, season);
    const eliteLine = snapshot.teamStats.find((line) => line.programId === eliteProgramId);
    expect(eliteLine).toBeDefined();
    expect((eliteLine!.wins + eliteLine!.losses)).toBeLessThanOrEqual(3);
    expect(snapshot.userTeamBatting.some((line) => line.plateAppearances > 0)).toBe(true);
  });

  it('rewards stronger rosters across a season sample', () => {
    const elite = simulateSeasonOutlook(eliteProgramId, createRosterForProgram(eliteProgramId), 16);
    const midMajor = simulateSeasonOutlook(midMajorProgramId, createRosterForProgram(midMajorProgramId), 16);
    expect(elite.averageWins).toBeGreaterThan(midMajor.averageWins);
    expect(elite.postseasonRate).toBeGreaterThanOrEqual(midMajor.postseasonRate);
  });

  it('creates more upset room in a midweek game than a weekend opener', () => {
    const eliteRoster = createRosterForProgram(eliteProgramId);
    const challengerRoster = createRosterForProgram(challengerProgramId);
    let midweekEliteWins = 0;
    let weekendEliteWins = 0;

    for (let index = 0; index < 24; index += 1) {
      const midweek = simulateGame(
        {
          dateLabel: `Midweek ${index}`,
          homeProgramId: eliteProgramId,
          awayProgramId: challengerProgramId,
          seriesGameNumber: 1,
          gameType: 'midweek',
          parkFactor: 1.04,
          weatherNote: 'Neutral weather',
          homeTravelDays: 0,
          awayTravelDays: 1,
          postseasonStage: 'regular-season',
        },
        eliteRoster,
        challengerRoster,
        `mid-${index}`,
      );

      const weekend = simulateGame(
        {
          dateLabel: `Weekend ${index}`,
          homeProgramId: eliteProgramId,
          awayProgramId: challengerProgramId,
          seriesGameNumber: 1,
          gameType: 'weekend',
          parkFactor: 1.04,
          weatherNote: 'Neutral weather',
          homeTravelDays: 0,
          awayTravelDays: 1,
          postseasonStage: 'regular-season',
        },
        eliteRoster,
        challengerRoster,
        `weekend-${index}`,
      );

      const midweekHomeRuns = midweek.homeSummary.runsByInning.reduce((sum, value) => sum + value, 0);
      const midweekAwayRuns = midweek.awaySummary.runsByInning.reduce((sum, value) => sum + value, 0);
      const weekendHomeRuns = weekend.homeSummary.runsByInning.reduce((sum, value) => sum + value, 0);
      const weekendAwayRuns = weekend.awaySummary.runsByInning.reduce((sum, value) => sum + value, 0);

      if (midweekHomeRuns > midweekAwayRuns) midweekEliteWins += 1;
      if (weekendHomeRuns > weekendAwayRuns) weekendEliteWins += 1;
    }

    expect(midweekEliteWins).toBeLessThanOrEqual(weekendEliteWins);
  });

  it('produces player box scores and season leaderboards', () => {
    const roster = createRosterForProgram(strongProgramId);
    const box = simulateGame(
      {
        dateLabel: 'Preview',
        homeProgramId: strongProgramId,
        awayProgramId: challengerProgramId,
        seriesGameNumber: 1,
        gameType: 'weekend',
        parkFactor: 1.02,
        weatherNote: 'Clear',
        homeTravelDays: 0,
        awayTravelDays: 1,
        postseasonStage: 'regular-season',
      },
      roster,
      createRosterForProgram(challengerProgramId),
      'stats-preview',
    );

    expect(box.homeBattingLines.length).toBeGreaterThan(0);
    expect(box.homePitchingLines.length).toBeGreaterThan(0);

    const snapshot = simulateLeagueSeasonSnapshot(strongProgramId, roster);
    expect(snapshot.userTeamBatting.length).toBeGreaterThan(0);
    expect(snapshot.teamStats.length).toBeGreaterThan(5);
    expect(snapshot.battingLeaders.length).toBeGreaterThan(0);
    expect(snapshot.pitchingLeaders.length).toBeGreaterThan(0);
  });
});
