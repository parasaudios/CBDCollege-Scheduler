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

## Adding screenshots

Each guide has placeholder boxes labelled with what should go inside (e.g. *"Login screen"*, *"Day editor modal"*). To replace a placeholder with a real screenshot:

```html
<!-- Before -->
<div class="shot" data-caption="Sign-in screen"></div>

<!-- After -->
<img src="screenshots/login.png" alt="Sign-in screen" style="max-width:100%; border-radius:8px; margin:12px 0;">
```

Drop your screenshot files into `docs/screenshots/` and reference them from the HTML.

If you'd rather keep the placeholders (the boxes look fine when printed and show what the screenshot should depict), just leave the HTML as-is.

## Style

Both guides share `guide-style.css` — a print-tuned stylesheet with:

- A4 page setup with reasonable margins
- A cover page, table of contents, and per-section page breaks
- Color-coded callouts (info / warning / danger / success)
- Inline button + tab mockups so steps are visually scannable
- Tabular "steps" tables
- Clean typography optimized for legibility at 11pt
