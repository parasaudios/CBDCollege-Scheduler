// Render each standalone guide HTML to a PDF using headless Edge.
// Run: node tools/build-guide-pdf.js
// Outputs: docs/CBD-Scheduler-Trainer-Guide.pdf and docs/CBD-Scheduler-Assistant-Guide.pdf

const fs = require('fs');
const path = require('path');
// Prefer bundled puppeteer (ships Chromium); fall back to puppeteer-core + system Edge if not installed.
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch (e) { puppeteer = require('puppeteer-core'); }

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DOCS = path.join(__dirname, '..', 'docs');

const JOBS = [
    { src: 'trainer-guide-standalone.html',   out: 'CBD-Scheduler-Trainer-Guide.pdf',   title: 'CBD College Scheduler — Trainer & Admin Guide' },
    { src: 'assistant-guide-standalone.html', out: 'CBD-Scheduler-Assistant-Guide.pdf', title: 'CBD College Scheduler — Assistant Guide' }
];

(async () => {
    const os = require('os');
    const tmpDir = path.join(os.tmpdir(), 'cbd-pdf-' + Date.now());
    const launchOpts = {
        headless: 'new',
        args: ['--no-sandbox', '--user-data-dir=' + tmpDir]
    };
    // Only set executablePath if we're on puppeteer-core (bundled puppeteer uses its own Chromium)
    if (!puppeteer.executablePath || typeof puppeteer.executablePath !== 'function') {
        launchOpts.executablePath = EDGE;
    }
    const browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();

    for (const job of JOBS) {
        const srcPath = path.join(DOCS, job.src);
        const outPath = path.join(DOCS, job.out);
        const url = 'file:///' + srcPath.replace(/\\/g, '/');
        console.log(`Rendering ${job.src} -> ${job.out}`);
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('print');
        await page.pdf({
            path: outPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
            displayHeaderFooter: false,
            preferCSSPageSize: true
        });
        const kb = Math.round(fs.statSync(outPath).size / 1024);
        console.log(`  wrote ${path.relative(process.cwd(), outPath)}  (${kb} KB)`);
    }

    await browser.close();
    console.log('\nDone.');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
