// Turning a table on screen into text for a spreadsheet: tab-separated for the clipboard, CSV for a
// file. Plain functions on rows of cell text, so the checks can run them without a browser
// (scripts/check-monitors.mts); reading the table from the page is the only part that needs one.

/** Cell text as it reads on screen: spaces and line breaks folded into single spaces, and the
 *  typographic minus written as the plain one, so spreadsheets read negative numbers. */
export const cleanCell = (s: string) => s.replace(/\u2212/g, '-').replace(/[\u00a0\s]+/g, ' ').trim();

/** A plain number as the boards write it: "-0.08%", "+1.2%", "6,910.39", "$1,234". */
const NUMBER = /^[-+]?\s?[$€£¥]?\s?\d[\d.,\s]*%?$/;
/** Text that a spreadsheet would run as a formula (=, +, -, @ first) is marked as text with a leading
 *  apostrophe: the tables carry text from outside sources, and a cell must never run as a formula
 *  when the file is opened. Plain numbers are left alone. */
export const safeCell = (s: string) => (/^[=+\-@\t\r]/.test(s) && !NUMBER.test(s) ? `'${s}` : s);

/** Tab-separated: pastes into a spreadsheet one cell per column. */
export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => safeCell(cleanCell(c).replace(/\t/g, ' '))).join('\t')).join('\n');
}

const csvCell = (c: string) => { const s = safeCell(cleanCell(c)); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
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
const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BR', 'SECTION', 'H1', 'H2', 'H3', 'H4']);
const LINE = '\u0000';
/** A cell's text with its lines kept apart ("Argentina · #24 by GDP"), not run together. */
function cellText(node: Node): string {
  if (node.nodeType === 3) return node.textContent || '';
  if (node.nodeType !== 1) return '';
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(cellText).join('');
  return BLOCK.has(el.tagName) ? `${LINE}${inner}${LINE}` : inner;
}
/** The rows of a table as cell text. Hidden helpers (icons, screen-reader text, buttons) and
 *  anything marked data-export="skip" are left out: a whole cell so marked (a chart column, marked in
 *  its heading and its rows alike) drops out of every row. A cell spanning several columns is
 *  followed by empty ones, so columns stay aligned. */
export function tableRows(table: HTMLTableElement): string[][] {
  const out: string[][] = [];
  for (const tr of Array.from(table.rows)) {
    if (tr.hidden || tr.closest('[hidden]')) continue;
    const row: string[] = [];
    for (const cell of Array.from(tr.cells)) {
      if (cell.dataset.export === 'skip') continue;
      const copy = cell.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"], .srOnly, svg, button, input, select, [data-export="skip"]').forEach((x) => x.remove());
      const lines = cellText(copy).split(LINE).map(cleanCell).filter(Boolean);
      row.push(lines.join(' · ').replace(SORT_MARKS, ''));
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
