# Roster engine cross-check

The mobile app re-implements the web app's roster resolution in TypeScript
(`src/lib/rosterCompute.ts`) so the calendar can show the same computed roster the
web app shows — weekend head-trainer rotation, head-trainers-are-full-time,
assistant scaling by student numbers, public holidays, `excluded_dows`,
`priorities_by_dow`, `rotate_dows`, etc.

This harness proves the port matches the original. It:

1. Loads the real `index.html` in headless Chromium and runs its actual
   `getEffectiveClassInfo` / `_isClassDay` / `getRosterForDate` /
   `getEffectiveAvailability` over a battery of dates and scenarios.
2. Runs the ported TS engine on the **same** inputs.
3. Diffs every output and fails on any mismatch.

## Run

```bash
cd mobile/scripts/xcheck
./run.sh
```

Expected tail:

```
--- cross-check: 132 checks, 0 mismatches ---
```

Re-run it after changing `rosterCompute.ts` (or after the web app's roster logic
changes) to confirm they still agree. `.engine/`, `.src/` and `.out/` are
generated and git-ignored.

## Scenario coverage

All of Oct 2026 plus a November boundary run, covering: weekday assistant scaling,
real 0/0 class-day rows, a times-only row falling back to default counts, a public
holiday, the weekend rotation rule (with alternation across the month boundary), a
stale explicit head-trainer corrected by the rule while the manual assistant is
preserved, a head trainer marked unavailable on their rule weekend (manual cover
stands), `excluded_dows`, `priorities_by_dow`, and `rotate_dows`.
