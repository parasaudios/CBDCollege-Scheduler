# CBD College Scheduler — User Guides

Two print-ready HTML guides live in this folder:

- **`trainer-guide.html`** — for trainers and admins. Covers class setup, roster management, staff administration, auto-roster, importing, notifications, and the Admin tab. ~15 sections.
- **`assistant-guide.html`** — for assistants. Covers signing in, installing on phone, enabling push, reading the roster, checking next shift, and setting availability. ~13 sections.

## How to produce the PDF

1. Open the HTML file in Chrome (or any modern browser).
2. Press `Ctrl+P` (or `Cmd+P` on Mac).
3. Set:
   - Destination → **Save as PDF**
   - Layout → **Portrait**
   - Paper size → **A4** (or **Letter**, the CSS supports both)
   - Margins → **Default**
   - **Tick** "Background graphics" so the colored callouts and badges print correctly.
4. Click **Save**. You'll get a polished PDF.

## Screenshots are already embedded

`docs/screenshots/` holds 26 PNGs captured live from the running app — every major view in **both desktop and mobile** sizes, for trainer and assistant perspectives. Both guides reference them via `<img src="screenshots/…">`.

If you want to refresh the screenshots (e.g. after a UI change), the capture script lives at `tools/capture-screenshots.js`:

```bash
# 1. Start the local preview server (or use Claude's preview tool)
# 2. Sign in via the preview to get a Supabase session cookie
# 3. Grab the auth-token JSON from localStorage:
#    localStorage.getItem('sb-nqbonrcmbhjutlrpjfpk-auth-token')
# 4. Run:
SB_TOKEN='<paste-token-here>' PREVIEW_URL=http://localhost:PORT node tools/capture-screenshots.js
```

The script drives Edge (via `puppeteer-core` against the system Microsoft Edge install) through every tab + modal at both desktop and mobile viewports.

## Style

Both guides share `guide-style.css` — a print-tuned stylesheet with:

- A4 page setup with reasonable margins
- A cover page, table of contents, and per-section page breaks
- Color-coded callouts (info / warning / danger / success)
- Inline button + tab mockups so steps are visually scannable
- Tabular "steps" tables
- Side-by-side desktop + mobile screenshot frames (`.dual`) with platform-tagged captions
- Clean typography optimized for legibility at 11pt
