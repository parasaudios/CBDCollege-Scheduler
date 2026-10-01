// Cross-check step 1: drive the REAL web-app roster functions (index.html) in a
// headless page over a battery of scenarios/dates, and dump both the exact inputs
// and the web outputs to .out/cases.json. Step 2 (xcheck_node.mjs) runs the ported
// TS engine on the same inputs and diffs the outputs.
//
// Requires Playwright. In the Claude Code web sandbox it's global:
//   NODE_PATH=/opt/node22/lib/node_modules node xcheck_web.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const INDEX_HTML = path.resolve(HERE, '../../../index.html'); // repo root index.html
const OUT_DIR = path.resolve(HERE, '.out');
const OUT = path.join(OUT_DIR, 'cases.json');

function seedDow(students_am, students_pm) {
  return { am_start:'08:30', am_end:'12:00', pm_start:'13:00', pm_end:'15:30',
           students_am, students_pm, capped_am:false, capped_pm:false };
}
const settings = {
  min_students_for_one_assistant: 8,
  min_students_for_two_assistants: 16,
  default_class_times: {
    '0': seedDow(10,10), '1': seedDow(20,20), '2': seedDow(20,20), '3': seedDow(20,20),
    '4': seedDow(20,20), '5': seedDow(20,20), '6': seedDow(10,10),
  },
  assistant_slot_times: { '1':'08:30', '2':'09:00', '3':'09:30', '4':'10:00' },
  assistant_slot_times_by_start: {},
  weekend_first_sat_ht_id: 'cam',
  rotate_dows: [0],
};
const staff = [
  { id:'cam', name:'Cameron Lee', color:'#2563eb', is_head_trainer:true,  priority:1, user_id:'uCam' },
  { id:'chi', name:'Chi Chi Wong', color:'#db2777', is_head_trainer:true,  priority:2, user_id:'uChi' },
  { id:'amy', name:'Amy Adams',   color:'#16a34a', is_head_trainer:false, priority:5, user_id:'uAmy' },
  { id:'ben', name:'Ben Brown',   color:'#f59e0b', is_head_trainer:false, priority:6, user_id:'uBen', excluded_dows:[2] },
  { id:'cara',name:'Cara Cole',   color:'#8b5cf6', is_head_trainer:false, priority:7, user_id:'uCara', priorities_by_dow:{ '0':1 } },
];
const availability = {
  cam: { '2026-10-17': { staff_id:'cam', date:'2026-10-17', day_role:'head_trainer', status:'available', start_time:'08:30', end_time:'15:30' } },
  amy: { '2026-10-17': { staff_id:'amy', date:'2026-10-17', day_role:'assistant', status:'available', start_time:'09:00', end_time:'15:30' } },
  ben: { '2026-10-05': { staff_id:'ben', date:'2026-10-05', day_role:'assistant', status:'unavailable', start_time:null, end_time:null } },
};
const dayClasses = {
  '2026-10-06': { date:'2026-10-06', students_am:0,  students_pm:0,  times_manually_set:false },
  '2026-10-08': { date:'2026-10-08', students_am:25, students_pm:25, times_manually_set:false },
  '2026-10-09': { date:'2026-10-09', students_am:0,  students_pm:0,  times_manually_set:true, am_start_time:'09:00', am_end_time:'12:30', pm_start_time:'13:30', pm_end_time:'16:00' },
  '2026-10-10': { date:'2026-10-10', students_am:12, students_pm:12, times_manually_set:false },
  '2026-10-12': { date:'2026-10-12', students_am:10, students_pm:30, times_manually_set:false },
};
const assistantAvail = {
  '2026-10-08': [ { user_id:'uAmy', is_available:false } ],
  '2026-10-18': [ { user_id:'uCam', is_available:false } ],
};
const profiles = [
  { id:'uCam', full_name:'Cameron Lee', role:'trainer', available_dows:[0,1,2,3,4,5,6] },
  { id:'uChi', full_name:'Chi Chi Wong', role:'trainer', available_dows:[0,1,2,3,4,5,6] },
  { id:'uAmy', full_name:'Amy Adams', role:'assistant', available_dows:[1,2,3,4,5] },
  { id:'uBen', full_name:'Ben Brown', role:'assistant', available_dows:[0,1,2,3,4,5,6] },
  { id:'uCara', full_name:'Cara Cole', role:'assistant', available_dows:[0,6] },
];
const publicHolidays = { '2026-10-13': { date:'2026-10-13', label:'Test Holiday' } };

const dates = [];
for (let d = 1; d <= 31; d++) dates.push('2026-10-' + String(d).padStart(2,'0'));
['2026-11-01','2026-11-07','2026-11-08','2026-11-14','2026-11-15'].forEach(d => dates.push(d));

const effAvailPairs = [];
['2026-10-03','2026-10-04','2026-10-10','2026-10-11','2026-10-17','2026-10-18','2026-10-24','2026-10-25','2026-11-01'].forEach(d => {
  effAvailPairs.push(['cam', d]); effAvailPairs.push(['chi', d]);
});
['2026-10-08','2026-10-12','2026-10-06'].forEach(d => { effAvailPairs.push(['amy', d]); effAvailPairs.push(['ben', d]); });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.clock.install({ time: new Date('2026-09-30T08:00:00') });
  await page.addInitScript(() => {
    function makeQB(){const qb={};['select','insert','upsert','update','delete','eq','in','gte','lte','order','limit','maybeSingle','single'].forEach(fn=>qb[fn]=()=>qb);qb.then=(r)=>Promise.resolve({data:[],error:null}).then(r);return qb;}
    const ch={on:()=>ch,subscribe:(cb)=>{if(cb)try{cb('SUBSCRIBED')}catch(e){}return ch;},unsubscribe:()=>{}};
    window.supabase={createClient:()=>({from:()=>makeQB(),channel:()=>ch,removeChannel:()=>{},auth:{getSession:()=>Promise.resolve({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}}),getUser:()=>Promise.resolve({data:{user:null},error:null})},functions:{invoke:()=>Promise.resolve({data:{ok:true},error:null})}})};
  });
  await page.goto('file://' + INDEX_HTML, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);

  const result = await page.evaluate((inp) => {
    window.staffList = inp.staff;
    window.settingsCache = inp.settings;
    window.availabilityCache = inp.availability;
    window.dayClassesCache = inp.dayClasses;
    window.assistantAvailCache = JSON.parse(JSON.stringify(inp.assistantAvail));
    window.profilesCache = inp.profiles;
    window.publicHolidaysCache = inp.publicHolidays;
    const today = window.formatDate(new Date());
    function normRoster(arr){return (arr||[]).map(function(e){return {staff_id:e.staff_id,day_role:e.day_role||null,status:e.status||null,start_time:e.start_time==null?null:e.start_time,end_time:e.end_time==null?null:e.end_time};}).sort(function(a,b){return (a.staff_id+a.day_role).localeCompare(b.staff_id+b.day_role);});}
    function normInfo(ci){return {students_am:ci.students_am||0,students_pm:ci.students_pm||0,capped_am:!!ci.capped_am,capped_pm:!!ci.capped_pm,from_default:!!ci.from_default};}
    function normEff(e){if(!e)return null;return {staff_id:e.staff_id,status:e.status||null,day_role:e.day_role||null,start_time:e.start_time==null?null:e.start_time,end_time:e.end_time==null?null:e.end_time};}
    const byDate={};
    inp.dates.forEach(function(d){byDate[d]={classInfo:normInfo(window.getEffectiveClassInfo(d)),isClassDay:!!window._isClassDay(d),roster:normRoster(window.getRosterForDate(d))};});
    const effAvail={};
    inp.effAvailPairs.forEach(function(p){effAvail[p[0]+'|'+p[1]]=normEff(window.getEffectiveAvailability(p[0],p[1]));});
    return { today: today, byDate: byDate, effAvail: effAvail };
  }, { staff, settings, availability, dayClasses, assistantAvail, profiles, publicHolidays, dates, effAvailPairs });

  if (errs.length) console.error('PAGE ERRORS:\n' + errs.join('\n'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    today: result.today,
    scenario: { staff, settings, availability, dayClasses, assistantAvail, profiles, publicHolidays },
    dates, effAvailPairs,
    web: { byDate: result.byDate, effAvail: result.effAvail },
  }, null, 2));
  console.log('wrote', OUT, '| today=', result.today, '| dates=', dates.length, '| pairs=', effAvailPairs.length);
  await browser.close();
})();
