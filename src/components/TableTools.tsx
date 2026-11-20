// Export, in the function bar of every page: any data table on screen can be copied (it pastes into a
// spreadsheet one cell per column) or saved as a CSV file that says where and when it was taken.
// The tables are found when the menu opens, so it works on every page without the page doing anything.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import { fileName, tableLabel, tableRows, toCsv, toTsv } from '../tableExport';

/** Copy text: the clipboard API where the page may use it, else the older way (plain http from
 *  another machine is not a "secure context", and the clipboard API is missing there). */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
  ta.remove(); return ok;
}
function download(name: string, text: string) {
  // A byte-order mark so spreadsheet programs read accents and symbols (€, ▲) correctly.
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Found { label: string; table: HTMLTableElement; rows: number; }
/** The data tables of the page on screen, each with a label, in page order. */
function findTables(): Found[] {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('.main table.data')).filter((t) => t.offsetParent !== null || t.getClientRects().length);
  const seen = new Map<string, number>();
  return tables.map((table, i) => {
    let label = tableLabel(table, i + 1);
    const n = (seen.get(label) || 0) + 1; seen.set(label, n);
    if (n > 1) label = `${label} (${n})`;
    return { label, table, rows: Math.max(0, table.rows.length - (table.tHead?.rows.length || 0)) };
  });
}

/** A button with a menu: copy or download (CSV) any table of the current page, or copy the link. */
export function ExportMenu() {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  // The function bar clips what overflows it, so the menu is placed against the window, under the button.
  const [at, setAt] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', away); window.addEventListener('keydown', esc);
    // The first item takes the keyboard, so the menu can be used without the mouse.
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const meta = () => ({ page: location.href, at: new Date().toISOString() });
  const copy = async (f: Found) => { const ok = await copyText(toTsv(tableRows(f.table))); toast(ok ? `Copied “${f.label}”: paste it into a spreadsheet` : 'The browser did not allow copying'); setOpen(false); };
  const csv = (f: Found) => { const m = meta(); download(fileName(f.label, new Date(m.at)), toCsv(tableRows(f.table), m)); toast(`Saved “${f.label}” as CSV`); setOpen(false); };
  const link = async () => { const ok = await copyText(location.href); toast(ok ? 'Copied the link to this view' : 'The browser did not allow copying'); setOpen(false); };
  const arrows = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <div className="exportMenu" ref={box}>
      <button ref={button} type="button" className="fnHelp" aria-haspopup="menu" aria-expanded={open} title="Copy or save the tables on this page"
        onClick={() => { if (!open) { setFound(findTables()); const r = button.current!.getBoundingClientRect(); setAt({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }); } setOpen(!open); }}>⇩ Export</button>
      {open && (
        <div className="exportList" role="menu" aria-label="Export" onKeyDown={arrows} style={{ top: at.top, right: at.right }}>
          {found.length ? found.map((f) => (
            <div key={f.label} className="exportRow">
              <span className="lbl" title={f.label}>{f.label}<span className="tiny muted"> · {f.rows} {f.rows === 1 ? 'row' : 'rows'}</span></span>
              <button type="button" role="menuitem" className="btn sm" onClick={() => void copy(f)} aria-label={`Copy ${f.label} for a spreadsheet`}>Copy</button>
              <button type="button" role="menuitem" className="btn sm" onClick={() => csv(f)} aria-label={`Save ${f.label} as CSV`}>CSV</button>
            </div>
          )) : <div className="exportEmpty small muted">No table on this page.</div>}
          <div className="exportRow foot"><button type="button" role="menuitem" className="btn ghost sm" onClick={() => void link()}>Copy the link to this view</button></div>
        </div>
      )}
    </div>
  );
}
