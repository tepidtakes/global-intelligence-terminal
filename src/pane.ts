// A workspace pane is this same app running in an iframe of the workspace page (src/pages/BoardPage.tsx).
// The frame's name survives navigation inside it, so it is how a page knows it is a pane, and which.
export const PANE_NAME = typeof window !== 'undefined' && window.self !== window.top && /^git-pane-\d+$/.test(window.name) ? window.name : '';
export const IS_PANE = PANE_NAME !== '';
/** 1-based pane number, 0 outside a workspace. */
export const PANE_NO = IS_PANE ? Number(PANE_NAME.slice(9)) : 0;
