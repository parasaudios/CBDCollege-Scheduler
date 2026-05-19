// Walk the running localhost preview, take desktop + mobile screenshots of every view
// for both trainer (logged-in) and assistant (via View-as-Assistant) perspectives,
// and save them as PNGs under docs/screenshots/.
//
// Run: node tools/capture-screenshots.js
// Requires: SB_TOKEN env var with the Supabase auth-token JSON (copied from the
// already-logged-in preview's localStorage), URL env (defaults to http://localhost:54412),
// and an installed Microsoft Edge.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.PREVIEW_URL || 'http://localhost:54412';
const SB_TOKEN = process.env.SB_TOKEN;
const SB_KEY = 'sb-nqbonrcmbhjutlrpjfpk-auth-token';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

if (!SB_TOKEN) { console.error('SB_TOKEN env var required'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
    desktop: { width: 1280, height: 900 },
    mobile:  { width: 390, height: 844 }
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function shoot(page, name, kind) {
    const fp = path.join(OUT, `${name}-${kind}.png`);
    await page.screenshot({ path: fp, fullPage: false });
    console.log('  saved', path.relative(process.cwd(), fp));
}

async function setViewport(page, kind) {
    const v = VIEWPORTS[kind];
    await page.setViewport(v);
    await wait(400);
}

async function clickByText(page, text) {
    const handle = await page.evaluateHandle((t) => {
        const els = Array.from(document.querySelectorAll('button, .tab, .sub-tab, a'));
        return els.find(e => (e.textContent || '').trim().toLowerCase() === t.toLowerCase()) || null;
    }, text);
    if (handle && handle.asElement) {
        const el = handle.asElement();
        if (el) { await el.click(); return true; }
    }
    return false;
}

async function evalClick(page, selector) {
    await page.evaluate((sel) => { const e = document.querySelector(sel); if (e) e.click(); }, selector);
}

async function captureForRole(page, role) {
    const sectionPrefix = role; // 'trainer' or 'assistant'
    for (const kind of ['desktop', 'mobile']) {
        await setViewport(page, kind);
        console.log(`\n=== ${role} @ ${kind} ===`);

        // App view should already be loaded. Resize sometimes needs a re-render.
        await wait(500);

        if (role === 'trainer') {
            // Schedule → Per-staff (default)
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('roster'); });
            await wait(700);
            await shoot(page, `${sectionPrefix}-schedule-perstaff`, kind);

            // Schedule → Team
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('overview'); });
            await wait(700);
            await shoot(page, `${sectionPrefix}-schedule-team`, kind);

            // Classes → Default Class Times
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('classes'); });
            await wait(900);
            await shoot(page, `${sectionPrefix}-classes-defaults`, kind);

            // Staff → Manage Staff
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('staff'); });
            await wait(900);
            await shoot(page, `${sectionPrefix}-staff-manage`, kind);

            // Staff → Availability sub-tab
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('assistavail'); });
            await wait(900);
            await shoot(page, `${sectionPrefix}-staff-availability`, kind);

            // Notifications tab
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('notifications'); });
            await wait(700);
            await shoot(page, `${sectionPrefix}-notifications`, kind);

            // Admin tab
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('admin'); });
            await wait(900);
            await shoot(page, `${sectionPrefix}-admin`, kind);

            // Day-detail modal (open from overview by clicking today)
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('overview'); });
            await wait(700);
            await page.evaluate(() => {
                const todayCell = document.querySelector('#overviewGrid .calendar-day.today, #overviewGrid .calendar-day:not(.empty)');
                if (todayCell) todayCell.click();
            });
            await wait(800);
            await shoot(page, `${sectionPrefix}-modal-day-detail`, kind);
            await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); });
            await wait(300);

            // Header detail (zoom into the top)
            await page.evaluate(() => window.scrollTo(0, 0));
            await wait(300);
            await page.screenshot({
                path: path.join(OUT, `${sectionPrefix}-header-${kind}.png`),
                clip: { x: 0, y: 0, width: VIEWPORTS[kind].width, height: Math.min(220, VIEWPORTS[kind].height) }
            });
            console.log('  saved', `${sectionPrefix}-header-${kind}.png`);

        } else { // assistant
            // My Roster
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('myroster'); });
            await wait(900);
            await shoot(page, `${sectionPrefix}-my-roster`, kind);

            // My Availability
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('myavail'); });
            await wait(900);
            await shoot(page, `${sectionPrefix}-my-availability`, kind);

            // Day detail on My Roster
            await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('myroster'); });
            await wait(900);
            await page.evaluate(() => {
                const todayCell = document.querySelector('#myRosterGrid .calendar-day.today, #myRosterGrid .calendar-day:not(.empty)');
                if (todayCell) todayCell.click();
            });
            await wait(700);
            await shoot(page, `${sectionPrefix}-modal-day-detail`, kind);
            await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); });
            await wait(300);
        }
    }
}

(async () => {
    const browser = await puppeteer.launch({
        executablePath: EDGE,
        headless: 'new',
        defaultViewport: VIEWPORTS.desktop,
        args: ['--window-size=1280,900']
    });
    const page = await browser.newPage();

    // Inject the Supabase token before navigation so the app boots logged-in
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate((key, val) => { localStorage.setItem(key, val); }, SB_KEY, SB_TOKEN);
    await page.reload({ waitUntil: 'networkidle2' });
    await wait(2500);

    // Cover & login screenshots (signed-out)
    console.log('\n=== login (signed-out) ===');
    // For login shot, sign out first
    await setViewport(page, 'desktop');
    await page.evaluate(() => {
        // Force logout state
        document.getElementById('appScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
    });
    await wait(500);
    await shoot(page, 'login', 'desktop');
    await setViewport(page, 'mobile');
    await shoot(page, 'login', 'mobile');
    // Restore the logged-in state
    await page.evaluate(() => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'block';
    });
    await wait(500);

    // Trainer captures
    await captureForRole(page, 'trainer');

    // Switch to View-as-Assistant
    await page.evaluate(() => { if (typeof toggleViewAsAssistant === 'function') toggleViewAsAssistant(); });
    await wait(1500);
    await captureForRole(page, 'assistant');

    // Back to trainer for cleanup
    await page.evaluate(() => { if (typeof toggleViewAsAssistant === 'function') toggleViewAsAssistant(); });
    await wait(800);

    await browser.close();
    console.log('\nDone.');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
