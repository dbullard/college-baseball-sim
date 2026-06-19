# Plausible NCAA-Style Scheduler Design

## Goal

Revamp the regular-season scheduler so generated schedules feel plausibly aligned with modern Division I college baseball patterns instead of a uniform synthetic rotation.

This design prioritizes realism over symmetry:

- Seasons should open on a weekend, not a Tuesday.
- Conference games should not start immediately.
- Tuesday games should usually be non-conference and regionally sensible.
- Teams should land near realistic conference volume, with about 30 conference games.
- Total regular-season games can vary within a realistic band rather than forcing every team to exactly 56.

## Current Problems

The current scheduler creates the same weekly structure for every team:

- every team plays every Tuesday
- every team plays a Friday-Sunday weekend series every week
- Tuesday and weekend pairings are driven by prestige rotation rather than conference or geography
- conference play is not treated as a separate phase of the season
- exact 56-game totals are enforced with deficit showcase games

This produces several immersion breaks:

- teams can open the year on Tuesday
- conference opponents can appear too early and in unrealistic slots
- Tuesday games do not reflect common in-state or regional scheduling patterns
- schedules feel mathematically complete rather than college-baseball shaped

## Design Targets

### Scheduling realism

- Opening day is always a Friday.
- Opening weekend is always a non-conference series.
- Conference weekends do not begin until after an early non-conference phase.
- Tuesday games are optional, not mandatory.
- Tuesday games are normally non-conference.
- Tuesday opponents should prefer in-state matchups first, then nearby regional opponents.
- Tuesday opponents should lean toward mid-major or lower-tier nearby programs when feasible.

### Season composition

- Target about 30 conference games per team.
- The primary model is 10 conference weekend series x 3 games = 30 conference games.
- For the first implementation, "near 30" should usually mean a narrow band around the target, such as 27-33, with 30 as the default aim.
- Teams should usually finish in a realistic regular-season band rather than exactly 56. Initial target band: roughly 52-56 games.
- Weekend series are the backbone of the schedule. Midweeks are fillers that add realism, not guaranteed inventory.

### Product constraints

- The scheduler should remain deterministic from the existing sim setup.
- The system should avoid large conference-specific rule tables for now.
- The implementation should use metadata already available in the sim where possible, especially conference and location.

## Proposed Model

### 1. Phase-based season generation

Replace the single uniform scheduling loop with phased schedule generation.

Proposed regular-season structure:

- Weeks 1-4: non-conference-heavy phase
- Weeks 5-14: conference-heavy phase

Within that structure:

- weekend slots are generated first
- conference weekends are generated as the backbone of weeks 5-14
- non-conference weekends fill the early part of the year and any remaining open weekend needs
- Tuesday games are filled afterward only where they improve realism and do not violate constraints

This produces schedules that feel structurally correct before any cleanup logic runs.

### 2. Conference weekends as the backbone

Each program should target roughly 10 conference series.

Default rule:

- each team receives about 10 conference weekend opponents
- each conference series is a 3-game Friday-Sunday set
- these series are scheduled mostly in weeks 5-14

Because conference sizes vary, exact perfect balancing may not always be possible with a generic algorithm. The scheduler should prefer:

- landing each team at 30 conference games when feasible
- otherwise staying in a narrow band around that target without forcing unrealistic pairings

Conference series should never be placed on Tuesday in the normal path.

### 3. Non-conference weekends

Opening weekend and early-season weekends should be non-conference.

Non-conference weekend opponent selection should prefer:

- geographic proximity
- prestige or quality bands that create believable matchups
- some variation so the same small set of opponents is not overused

Examples of plausible patterns:

- power program hosting a regional mid-major
- in-state or neighboring-state weekend set
- occasional stronger intersectional non-conference matchup

We do not need to simulate invitationals or neutral-site tournaments in this pass unless the existing model makes them easy.

### 4. Regional Tuesday scheduling

Tuesday scheduling should be optional and candidate-driven.

Rules:

- no team is required to play every Tuesday
- no season opener on Tuesday
- no Tuesday conference games in the standard schedule flow
- prefer opponents from the same state
- if no same-state opponent fits, prefer nearby regional opponents
- within those candidates, prefer mid-majors or lower conference-tier schools when possible

This produces more believable patterns such as:

- SEC or ACC teams playing nearby in-state schools midweek
- mid-majors playing regional peers
- occasional off-Tuesday weeks when a clean regional matchup is not available

### 5. Realistic game totals

The current exact-56 constraint should be relaxed.

New target:

- most teams land in a realistic total range, initially 52-56 games
- the scheduler may leave some teams a bit lighter if filling the gap would require unrealistic matchups

The system should optimize in this order:

1. structural realism
2. conference target near 30
3. geographic plausibility
4. total games near the target band
5. exact uniformity

This makes the schedules feel human-made instead of machine-completed.

## Selection Heuristics

The scheduler should use simple scoring rules rather than a full optimizer.

### Weekend opponent scoring

For non-conference weekends, prefer opponents that:

- are not in the same conference
- are in the same region or nearby states
- have not already been scheduled recently
- keep home/away balance in range
- create plausible quality matchups

### Midweek opponent scoring

For Tuesday games, prefer opponents that:

- are not in the same conference
- are in the same state
- otherwise are geographically close
- are available on that Tuesday
- are not already over-scheduled
- trend toward mid-major or lower conference-tier programs

The first version should use straightforward deterministic sorting and tie-break rules, not randomized search.

## Implementation Structure

Refactor `createLeagueSchedule()` into smaller helpers with clear responsibilities.

Proposed helper shape:

- `buildConferenceWeekendSeries()`
- `buildNonConferenceWeekends()`
- `fillRegionalMidweeks()`
- `scoreWeekendOpponent()`
- `scoreMidweekOpponent()`
- `finalizeSeasonDatabaseDays()`

Suggested flow:

1. group programs by conference
2. precompute proximity signals using existing location metadata
3. assign conference weekend series for weeks 5-14
4. assign non-conference weekends, especially weeks 1-4
5. fill optional Tuesday dates with regional non-conference games
6. sort and materialize season game records

## Data Use

The current data already supports a credible first pass:

- `conference`
- `location.state`
- `location.lat`
- `location.lon`
- `conferenceTier`
- prestige ratings

No new data source is required for the first implementation.

Possible future additions, not required now:

- explicit rivalry tags
- explicit travel regions
- conference-specific schedule templates
- neutral-site tournament metadata

## Testing Strategy

Add behavior-first tests around generated schedules before changing production logic.

Required tests:

- season opening games occur on Friday, not Tuesday
- opening weekend is non-conference
- conference games do not appear in the early non-conference phase
- Tuesday games are non-conference in the normal generated schedule
- teams finish with conference totals near 30
- conference totals default toward 30 and remain within the accepted narrow band
- Tuesday opponents are usually same-state or regional when candidates exist
- no team is scheduled for more than one game on the same day
- total regular-season counts stay in the intended realistic band

The tests should verify schedule behavior, not internal implementation details.

## Risks And Tradeoffs

### Conference balancing

Different conference sizes may make generic 10-series balancing imperfect. The first implementation should aim for consistency and plausibility rather than exact conference-specific fidelity.

### Midweek fill pressure

If the scheduler is too strict about Tuesday geography, some teams may end up with too few games. That is acceptable within the realistic band, but the scoring may need tuning.

### Existing dirty worktree

The implementation files already have unrelated in-progress changes in the current worktree. Actual code changes should be made carefully on top of the existing state, with verification focused on schedule behavior.

## Out Of Scope

This pass does not attempt to:

- model every conference's real scheduling rules
- create exact replicas of real 2026 schedules
- add neutral-site tournament systems
- model weather cancellations or rescheduled doubleheaders
- introduce conference tournament scheduling changes

## Recommendation

Implement a conference-skeleton-plus-filler scheduler:

- conference weekends form the backbone
- early weekends are non-conference
- Tuesday games are optional regional non-conference fillers
- realistic total-game ranges replace exact universal totals

This is the smallest design that should materially improve immersion while staying compatible with the current simulation architecture.
