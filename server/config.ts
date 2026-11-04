// Runtime settings, all from environment variables. Defaults are safe for running the
// terminal on your own computer. See SECURITY.md before exposing it to a network.

// `npm start` passes --production (works on Windows, macOS and Linux alike).
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

/** Interface to listen on. Default 127.0.0.1 = reachable from this computer only.
 *  Set HOST=0.0.0.0 only behind a reverse proxy with HTTPS. */
export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number(process.env.PORT || 5180);

/** Optional contact address sent in the User-Agent to data providers that ask for one
 *  (SEC EDGAR, Wikipedia, Wikidata). Never sent anywhere else. */
export const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || '').trim();
export const USER_AGENT = `GlobalIntelligenceTerminal/0.1 (open-source research app${CONTACT_EMAIL ? `; ${CONTACT_EMAIL}` : ''})`;

/** Allow new accounts to be created (on by default; set ALLOW_SIGNUP=0 once your account exists). */
export const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== '0';

/** Obsidian vault sync reads and writes files on this computer.
 *  "local" (default): only requests made directly from this computer, never via a proxy.
 *  "off": disabled.  "any": any signed-in user (only for a private, single-user machine). */
export const VAULT_ACCESS = (process.env.TERMINAL_VAULT || (process.env.TERMINAL_ALLOW_VAULT === '1' ? 'any' : 'local')) as 'local' | 'off' | 'any';
