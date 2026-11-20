// The keyboard shortcuts of the terminal, in one place. The code that handles a key asks this
// registry whether an event is that key (`KEYS.focus.is(e)`), and the keyboard page of the help
// (KEYS, /help?view=keys) lists the same entries: the list cannot drift from what the keys do.

export type KeyArea = 'Anywhere' | 'In the command line' | 'In the workspace' | 'In a note';
export interface KeyDef {
  /** The keys as shown to the reader, one entry per alternative: ['Ctrl K', '/']. */
  keys: string[];
  about: string;
  area: KeyArea;
  /** Whether a key press is this shortcut. */
  is: (e: KeyEvt) => boolean;
  /** Works while typing in a field too (most single keys do not). */
  whileTyping?: boolean;
}
type KeyEvt = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'> & { code?: string };

const plain = (e: KeyEvt) => !e.ctrlKey && !e.metaKey && !e.altKey;
/** How many panes a workspace holds at most (src/board.ts lays them out). */
export const WORKSPACE_PANES = 4;
/** The workspace keys, the same in the workspace page and inside a pane: Ctrl or Alt with 1 … 4 go to
 *  a pane (Alt where the browser keeps Ctrl+digit for its tabs), F6 and Shift+F6 go round them.
 *  Returns the pane number as text, 'next' or 'prev'; null for any other key. */
export function workspaceKey(e: KeyEvt): string | null {
  if (e.metaKey) return null;
  if (e.key === 'F6' && !e.ctrlKey && !e.altKey) return e.shiftKey ? 'prev' : 'next';
  if (e.ctrlKey !== e.altKey && !e.shiftKey) { // one of the two; both together is AltGr on some keyboards
    const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    if (d && +d[1] >= 1 && +d[1] <= WORKSPACE_PANES) return d[1];
  }
  return null;
}
/** Keys that the note editor handles itself: listed so the key page is complete, never matched here. */
const editorKey = () => false;
const def = <T extends Record<string, KeyDef>>(k: T) => k;

export const KEYS = def({
  focus: { keys: ['Ctrl K', '⌘ K', '/'], about: 'Go to the command line', area: 'Anywhere', whileTyping: true,
    is: (e) => (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) || (e.key === '/' && plain(e)) },
  typeAhead: { keys: ['A–Z'], about: 'Start typing a command when nothing else has the keyboard: the letters go to the command line', area: 'Anywhere',
    is: (e) => plain(e) && /^[a-z]$/i.test(e.key) },
  related: { keys: ['1 – 9'], about: 'Run the related function with that number in the function bar, on the loaded entity', area: 'Anywhere',
    is: (e) => plain(e) && !e.shiftKey && /^[1-9]$/.test(e.key) },
  help: { keys: ['F1'], about: 'Help for the function on screen', area: 'Anywhere', whileTyping: true,
    is: (e) => e.key === 'F1' && plain(e) && !e.shiftKey },
  back: { keys: ['Alt ←'], about: 'Back to the previous screen (the browser’s own key; the ‹ arrow in the function bar does the same)', area: 'Anywhere', whileTyping: true,
    is: (e) => e.key === 'ArrowLeft' && e.altKey && !e.ctrlKey && !e.metaKey },
  forward: { keys: ['Alt →'], about: 'Forward again (the › arrow in the function bar)', area: 'Anywhere', whileTyping: true,
    is: (e) => e.key === 'ArrowRight' && e.altKey && !e.ctrlKey && !e.metaKey },

  run: { keys: ['Enter'], about: 'Run the command, or open the highlighted row (an entity opens its profile and becomes the loaded entity)', area: 'In the command line',
    is: (e) => e.key === 'Enter' && !e.shiftKey },
  onMap: { keys: ['Shift Enter'], about: 'Show the highlighted entity on the map instead', area: 'In the command line',
    is: (e) => e.key === 'Enter' && e.shiftKey },
  complete: { keys: ['Tab'], about: 'Complete the highlighted row into the command line, to add a function code or parameters', area: 'In the command line',
    is: (e) => e.key === 'Tab' && plain(e) && !e.shiftKey },
  down: { keys: ['↓'], about: 'Next row of the list. In an empty command line: the next command in your history', area: 'In the command line',
    is: (e) => e.key === 'ArrowDown' && plain(e) },
  up: { keys: ['↑'], about: 'Previous row of the list. In an empty command line: your earlier commands, most recent first', area: 'In the command line',
    is: (e) => e.key === 'ArrowUp' && plain(e) },
  leave: { keys: ['Esc'], about: 'Close the list and give the keyboard back to the page', area: 'In the command line',
    is: (e) => e.key === 'Escape' },

  pane: { keys: ['Alt 1 – 4', 'Ctrl 1 – 4'], about: 'Go to that pane of the workspace and put the cursor in its command line (Ctrl may be kept by the browser for its own tabs)', area: 'In the workspace', whileTyping: true,
    is: (e) => /^\d$/.test(workspaceKey(e) || '') },
  paneNext: { keys: ['F6', 'Shift F6'], about: 'The next pane; with Shift, the one before', area: 'In the workspace', whileTyping: true,
    is: (e) => workspaceKey(e) === 'next' || workspaceKey(e) === 'prev' },

  noteLink: { keys: ['[['], about: 'Link another note or an entity: type part of its name, then Enter', area: 'In a note', whileTyping: true, is: editorKey },
  noteFollow: { keys: ['Ctrl click', '⌘ click'], about: 'Follow a link (a dashed link creates that note)', area: 'In a note', whileTyping: true, is: editorKey },
  noteCheck: { keys: ['[ ] then Space'], about: 'Start a checklist', area: 'In a note', whileTyping: true, is: editorKey },
});
export type KeyId = keyof typeof KEYS;
export const KEY_AREAS: KeyArea[] = ['Anywhere', 'In the command line', 'In the workspace', 'In a note'];

/** Whether the keyboard is busy typing: a form field, a rich-text editor (the note editor), or
 *  anything that takes text. Single-key shortcuts never fire there. */
export function isTyping(target: EventTarget | null = document.activeElement): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.('[contenteditable=""], [contenteditable="true"], .ProseMirror, [role="textbox"]');
}
/** Nothing has the keyboard: a letter typed now is meant for the command line. */
export const nothingFocused = () => !document.activeElement || document.activeElement === document.body || document.activeElement === document.documentElement;
