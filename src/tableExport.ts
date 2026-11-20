// Turning a table on screen into text for a spreadsheet: tab-separated for the clipboard, CSV for a
// file. Plain functions on rows of cell text, so the checks can run them without a browser
// (scripts/check-monitors.mts); reading the table from the page is the only part that needs one.

/** Cell text as it reads on screen: spaces and line breaks folded into single spaces. */
export const cleanCell = (s: string) => s.replace(/[ \s]+/g, ' ').trim();

/** Tab-separated: pastes into a spreadsheet one cell per column. */
export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => cleanCell(c).replace(/\t/g, ' ')).join('\t')).join('\n');
}

const csvCell = (c: string) => { const s = cleanCell(c); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV (RFC 4180), with where it came from and when, after an empty row. */
export function toCsv(rows: string[][], meta?: { page: string; at: string }): string {
  const out = rows.map((r) => r.map(csvCell).join(','));
  if (meta) out.push('', `${csvCell('Page')},${csvCell(meta.page)}`, `${csvCell('Exported')},${csvCell(meta.at)}`);
  return out.join('\r\n') + '\r\n';
}

/** A file name from a label: "Major currencies" → "major-currencies-2026-11-20.csv". */
export function fileName(label: string, at: Date) {
  const slug = label.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'table';
  return `${slug}-${at.toISOString().slice(0, 10)}.csv`;
}

// ───────── Reading a table from the page ─────────
/** Sort marks added to column headings by the boards. */
const SORT_MARKS = /\s*[▾▴]\s*$/;
/** The rows of a table as cell text. Hidden helpers (icons, screen-reader text, buttons) are left
 *  out, and a cell spanning several columns is followed by empty ones, so columns stay aligned. */
export function tableRows(table: HTMLTableElement): string[][] {
  const out: string[][] = [];
  for (const tr of Array.from(table.rows)) {
    if (tr.hidden || tr.closest('[hidden]')) continue;
    const row: string[] = [];
    for (const cell of Array.from(tr.cells)) {
      const copy = cell.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"], .srOnly, svg, button, input, select').forEach((x) => x.remove());
      row.push(cleanCell(copy.textContent || '').replace(SORT_MARKS, ''));
      for (let i = 1; i < (cell.colSpan || 1); i++) row.push('');
    }
    if (row.some((c) => c)) out.push(row);
  }
  return out;
}
/** What to call a table: the heading of the card it sits in, else its caption. */
export function tableLabel(table: HTMLTableElement, n: number): string {
  const card = table.closest('.card');
  const h = card?.querySelector(':scope > .hd h2')?.textContent || table.caption?.textContent || '';
  return cleanCell(h) || `Table ${n}`;
}
