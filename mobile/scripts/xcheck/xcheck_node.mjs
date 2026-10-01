// Cross-check step 2: run the ported TS engine (compiled to ./.engine by run.sh)
// on the SAME inputs the web step captured, and diff every output. Exits non-zero
// on mismatch.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoster } from './.engine/rosterCompute.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(fs.readFileSync(path.join(HERE, '.out', 'cases.json'), 'utf8'));
const s = dump.scenario;

const ctx = {
  settings: s.settings,
  staff: s.staff,
  availabilityByStaff: s.availability,
  dayClasses: s.dayClasses,
  assistantAvailByDate: s.assistantAvail,
  availableDowsByUserId: Object.fromEntries(s.profiles.map((p) => [p.id, p.available_dows])),
  publicHolidays: s.publicHolidays,
  today: dump.today,
};

const engine = makeRoster(ctx);

const normRoster = (arr) =>
  (arr || [])
    .map((e) => ({
      staff_id: e.staff_id,
      day_role: e.day_role || null,
      status: e.status || null,
      start_time: e.start_time == null ? null : e.start_time,
      end_time: e.end_time == null ? null : e.end_time,
    }))
    .sort((a, b) => (a.staff_id + a.day_role).localeCompare(b.staff_id + b.day_role));
const normInfo = (ci) => ({
  students_am: ci.students_am || 0,
  students_pm: ci.students_pm || 0,
  capped_am: !!ci.capped_am,
  capped_pm: !!ci.capped_pm,
  from_default: !!ci.from_default,
});
const normEff = (e) =>
  !e
    ? null
    : {
        staff_id: e.staff_id,
        status: e.status || null,
        day_role: e.day_role || null,
        start_time: e.start_time == null ? null : e.start_time,
        end_time: e.end_time == null ? null : e.end_time,
      };

let checks = 0;
let mismatches = 0;
function cmp(label, web, mine) {
  checks++;
  const a = JSON.stringify(web);
  const b = JSON.stringify(mine);
  if (a !== b) {
    mismatches++;
    console.log('MISMATCH ' + label + '\n  web   : ' + a + '\n  engine: ' + b);
  }
}

dump.dates.forEach((d) => {
  cmp('classInfo ' + d, dump.web.byDate[d].classInfo, normInfo(engine.getEffectiveClassInfo(d)));
  cmp('isClassDay ' + d, dump.web.byDate[d].isClassDay, !!engine.isClassDay(d));
  cmp('roster ' + d, dump.web.byDate[d].roster, normRoster(engine.getRosterForDate(d)));
});
dump.effAvailPairs.forEach((p) => {
  const key = p[0] + '|' + p[1];
  cmp('effAvail ' + key, dump.web.effAvail[key], normEff(engine.getEffectiveAvailability(p[0], p[1])));
});

console.log('\n--- cross-check: ' + checks + ' checks, ' + mismatches + ' mismatches ---');
process.exit(mismatches === 0 ? 0 : 1);
