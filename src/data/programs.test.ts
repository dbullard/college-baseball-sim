import { describe, expect, it } from 'vitest';
import { buildTeamChemistryProfile, createLeagueCoachingStaffs, getArchetypeDefinition } from '../lib/playerDevelopment';
import { createRecruitBoard, createRosterForProgram, programs } from './programs';

const sortedPrograms = [...programs].sort((left, right) => right.prestige.overall - left.prestige.overall);
const eliteProgramId = sortedPrograms[0]!.id;

describe('player generation', () => {
  it('keeps generated player names free of random trailing initials', () => {
    const roster = createRosterForProgram(eliteProgramId);

    expect(roster.some((player) => /\s[A-Z]\.$/.test(player.name))).toBe(false);
  });

  it('keeps player names unique within a roster and recruit board', () => {
    const roster = createRosterForProgram(eliteProgramId);
    const recruitBoard = createRecruitBoard(eliteProgramId, 1);

    expect(new Set(roster.map((player) => player.name)).size).toBe(roster.length);
    expect(new Set(recruitBoard.map((recruit) => recruit.name)).size).toBe(recruitBoard.length);
  });

  it('keeps elite rosters out of the near-perfect ratings range', () => {
    const roster = createRosterForProgram(eliteProgramId);
    const high90s = roster.filter((player) => player.overall >= 90);
    const averageOverall = roster.reduce((sum, player) => sum + player.overall, 0) / roster.length;
    const maxOverall = Math.max(...roster.map((player) => player.overall));

    expect(high90s.length).toBeLessThanOrEqual(1);
    expect(maxOverall).toBeLessThanOrEqual(89);
    expect(averageOverall).toBeLessThan(78);
  });

  it('assigns only position-compatible archetypes and generated personality data', () => {
    const roster = createRosterForProgram(eliteProgramId);

    for (const player of roster) {
      const archetype = getArchetypeDefinition(player.archetype);
      expect(archetype.eligiblePositions).toContain(player.primaryPosition);
      expect(player.developmentProfile.workEthic).toBeGreaterThanOrEqual(1);
      expect(player.personalityProfile.selfishness).toBeGreaterThanOrEqual(1);
      expect(player.leadership.current).toBeGreaterThanOrEqual(1);
    }
  });

  it('assigns recruit archetypes that match their listed position', () => {
    const board = createRecruitBoard(eliteProgramId, 1).slice(0, 100);

    for (const recruit of board) {
      const archetype = getArchetypeDefinition(recruit.archetype);
      expect(archetype.eligiblePositions).toContain(recruit.primaryPosition);
    }
  });

  it('generates one coaching staff per program', () => {
    const staffs = createLeagueCoachingStaffs(programs);

    expect(Object.keys(staffs)).toHaveLength(programs.length);
    expect(staffs[eliteProgramId]?.headCoach.overall).toBeGreaterThanOrEqual(1);
    expect(staffs[eliteProgramId]?.assistantDevelopment.role).toBe('assistantDevelopment');
  });

  it('lets leadership-heavy rosters offset selfish personalities in chemistry', () => {
    const baseRoster = createRosterForProgram(eliteProgramId);
    const chemistryWithoutLeaders = buildTeamChemistryProfile(baseRoster.map((player, index) => ({
      ...player,
      leadership: { ...player.leadership, current: 20 + (index % 10), potential: 30 + (index % 10) },
      personalityProfile: { ...player.personalityProfile, selfishness: 78, teamFirst: 30 },
    })));
    const chemistryWithLeaders = buildTeamChemistryProfile(baseRoster.map((player, index) => ({
      ...player,
      leadership: { ...player.leadership, current: 75 + (index % 10), potential: 85 + (index % 10) },
      personalityProfile: { ...player.personalityProfile, selfishness: 78, teamFirst: 30 },
    })));

    expect(chemistryWithLeaders.score).toBeGreaterThan(chemistryWithoutLeaders.score);
  });
});

describe('NIL system', () => {
  it('gives every recruit an askingNil within their star tier range', () => {
    const board = createRecruitBoard(eliteProgramId, 1);
    const twoStar = board.filter((r) => r.stars === 2);
    const threeStar = board.filter((r) => r.stars === 3);
    const fourStar = board.filter((r) => r.stars === 4);
    const fiveStar = board.filter((r) => r.stars === 5);

    expect(twoStar.every((r) => r.askingNil >= 5_000 && r.askingNil <= 25_000)).toBe(true);
    expect(threeStar.every((r) => r.askingNil >= 25_000 && r.askingNil <= 75_000)).toBe(true);
    expect(fourStar.every((r) => r.askingNil >= 75_000 && r.askingNil <= 200_000)).toBe(true);
    expect(fiveStar.every((r) => r.askingNil >= 200_000 && r.askingNil <= 600_000)).toBe(true);
  });

  it('gives elite programs (prestige 95+) at least $1.8M NIL pool', () => {
    const elitePrograms = programs.filter((p) => p.prestige.overall >= 95);
    expect(elitePrograms.every((p) => p.resources.schoolNilPool >= 1_800_000)).toBe(true);
  });

  it('gives mid-major programs (prestige < 65) at most $75K NIL pool', () => {
    const lowPrestige = programs.filter((p) => p.prestige.overall < 65);
    expect(lowPrestige.every((p) => p.resources.schoolNilPool <= 75_000)).toBe(true);
  });

  it('gives programs with higher prestige meaningfully larger NIL pools than lower prestige', () => {
    const elite = programs.find((p) => p.prestige.overall >= 95)!;
    const mid = programs.find((p) => p.prestige.overall >= 75 && p.prestige.overall < 85)!;
    const low = programs.find((p) => p.prestige.overall < 65)!;
    expect(elite.resources.schoolNilPool).toBeGreaterThan(mid.resources.schoolNilPool);
    expect(mid.resources.schoolNilPool).toBeGreaterThan(low.resources.schoolNilPool);
  });
});
