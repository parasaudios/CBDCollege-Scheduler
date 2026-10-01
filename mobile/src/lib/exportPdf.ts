// Build a printable HTML roster for a month and hand it to the OS as a PDF
// (print dialog / share sheet). Mirrors the web app's "Export PDF" intent.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { loadRosterContext } from './data';
import { buildMonthGrid, monthLabel } from './format';
import { makeRoster } from './rosterCompute';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function exportMonthPdf(year: number, month0: number, title = 'CBD College Scheduler'): Promise<void> {
  const { ctx } = await loadRosterContext(year, month0);
  const engine = makeRoster(ctx);
  const grid = buildMonthGrid(year, month0);
  const dowHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let cells = '';
  grid.forEach((d, i) => {
    if (i % 7 === 0) cells += '<tr>';
    if (!d) {
      cells += '<td class="empty"></td>';
    } else {
      const holiday = engine.isPublicHoliday(d);
      const info = engine.getEffectiveClassInfo(d);
      const roster = engine.getRosterForDate(d);
      const names = roster
        .map((r) => `<div class="${r.is_head_trainer ? 'ht' : ''}">${esc(r.name.split(' ')[0])}</div>`)
        .join('');
      cells += `<td>
        <div class="dn">${parseInt(d.slice(-2), 10)}</div>
        ${holiday ? '<div class="ph">Public holiday</div>' : `<div class="stu">${info.students_am}/${info.students_pm}</div>${names}`}
      </td>`;
    }
    if (i % 7 === 6) cells += '</tr>';
  });

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: -apple-system, Roboto, sans-serif; color: #1f2937; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .sub { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #2563eb; color: #fff; font-size: 11px; padding: 4px; }
    td { border: 1px solid #d1d5db; vertical-align: top; height: 90px; padding: 3px; font-size: 10px; }
    td.empty { background: #f9fafb; border: none; }
    .dn { font-weight: 700; font-size: 12px; }
    .stu { color: #6b7280; margin: 2px 0; }
    .ht { font-weight: 700; }
    .ph { color: #a855f7; font-weight: 600; }
  </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(monthLabel(year, month0))}</div>
    <table><thead><tr>${dowHeaders.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${cells}</tbody></table>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export roster PDF' });
  } else {
    await Print.printAsync({ uri });
  }
}
