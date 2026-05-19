// Inline the stylesheet and embed every <img src="screenshots/..."> as a base64 data: URL
// so each guide becomes a single self-contained .html file that works in any viewer
// (file://, GitHub preview, email attachment, mobile share sheet, etc.).
//
// Run: node tools/bundle-guide.js
// Outputs: docs/trainer-guide-standalone.html, docs/assistant-guide-standalone.html

const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');

function inlineImages(html, baseDir) {
    return html.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g, (m, before, src, after) => {
        if (src.startsWith('data:') || /^https?:/i.test(src)) return m;
        const filePath = path.join(baseDir, src);
        if (!fs.existsSync(filePath)) {
            console.warn('  missing:', src);
            return m;
        }
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        return `<img ${before}src="data:${mime};base64,${buf.toString('base64')}"${after}>`;
    });
}

function inlineCss(html, baseDir) {
    return html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
        const filePath = path.join(baseDir, href);
        if (!fs.existsSync(filePath)) {
            console.warn('  missing CSS:', href);
            return m;
        }
        const css = fs.readFileSync(filePath, 'utf8');
        return `<style>\n${css}\n</style>`;
    });
}

function bundle(name) {
    const inPath = path.join(DOCS, `${name}.html`);
    const outPath = path.join(DOCS, `${name}-standalone.html`);
    console.log(`Bundling ${name}.html ...`);
    let html = fs.readFileSync(inPath, 'utf8');
    html = inlineCss(html, DOCS);
    html = inlineImages(html, DOCS);
    // Strip the dev-only banner so the standalone copy is print-clean
    html = html.replace(/<div class="no-print-banner no-print">[\s\S]*?<\/div>\s*/g, '');
    fs.writeFileSync(outPath, html);
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  wrote ${path.relative(process.cwd(), outPath)}  (${kb} KB)`);
}

bundle('trainer-guide');
bundle('assistant-guide');
console.log('\nDone. Open the *-standalone.html files in any browser, then Ctrl+P → Save as PDF.');
