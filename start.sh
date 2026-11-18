#!/usr/bin/env bash
# Global Intelligence Terminal: start it on Linux (works on macOS too).
#
#   bash start.sh             install what is needed, start the terminal, open it in your browser
#   bash start.sh --desktop   also add "Global Intelligence Terminal" to your applications menu
#   bash start.sh --service   run it in the background from login instead (systemd user service)
#   bash start.sh --no-open   start without opening a browser (for example on a server)
#
# Settings go in front, for example:  PORT=5190 CONTACT_EMAIL=you@example.com bash start.sh
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@" # started as "sh start.sh": carry on in bash
set -euo pipefail

APP="Global Intelligence Terminal"
SLUG="global-intelligence-terminal"
# The folder this script is in, also when it was started through a link (from ~/bin or the desktop)
SRC="${BASH_SOURCE[0]}"
while [ -L "$SRC" ]; do
  T="$(readlink "$SRC")"
  case "$T" in /*) SRC="$T" ;; *) SRC="$(dirname -- "$SRC")/$T" ;; esac
done
DIR="$(cd -- "$(dirname -- "$SRC")" && pwd -P)" # the real folder, however it was reached (a symlinked /home, say)
PORT="${PORT:-5180}"
URL="http://localhost:${PORT}"
USER_HOME="${HOME:-}" # not set under some service managers and with env -i: only --desktop and --service need it
UNIT_FILE="${XDG_CONFIG_HOME:-$USER_HOME/.config}/systemd/user/$SLUG.service"
MENU_FILE="${XDG_DATA_HOME:-$USER_HOME/.local/share}/applications/$SLUG.desktop"
OPEN=1; DESKTOP=0; SERVICE=0; HOLD=0; POLLER=""
for arg in "$@"; do
  case "$arg" in
    --desktop) DESKTOP=1 ;;
    --service) SERVICE=1 ;;
    --no-open) OPEN=0 ;;
    --hold) HOLD=1 ;; # used by the menu entry: keep the window open when the start fails
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see: bash start.sh --help)" >&2; exit 2 ;;
  esac
done
cd "$DIR"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }
node_help() {
  cat >&2 <<'EOF'
The terminal needs Node.js 22.13 or newer (24 recommended):
  - with nvm (any distribution, no root needed): install nvm as described at
    https://github.com/nvm-sh/nvm#installing-and-updating, open a new terminal, then: nvm install 24
  - or your distribution's package, if it is version 24 or newer (check with: node -v)
  - or the installers at https://nodejs.org/en/download
Then run this script again.
EOF
}
case "$PORT" in ''|*[!0-9]*) die "PORT must be a number, for example: PORT=5190 bash start.sh" ;; esac

# A window opened from the applications menu closes when this script ends, so after an error wait for
# Enter: otherwise the message is gone before it can be read. (Ctrl+C, code 130, is not an error.)
on_exit() {
  local code=$?
  if [ -n "$POLLER" ]; then kill "$POLLER" 2>/dev/null || true; fi
  if [ "$HOLD" = 1 ] && [ "$code" != 0 ] && [ "$code" != 130 ]; then printf '\nPress Enter to close this window. '; read -r _ || true; fi
}
trap on_exit EXIT

# Behind a proxy (HTTPS_PROXY or HTTP_PROXY set): Node.js sends its own requests through it only when
# told to (NODE_USE_ENV_PROXY=1), so the terminal's data requests would otherwise bypass the proxy and
# fail. The switch is given only to the terminal itself (last lines of this script, and the service).
# This script's own checks ask this computer, never the proxy: they use node_local.
PROXY_SET="${HTTPS_PROXY:-}${https_proxy:-}${HTTP_PROXY:-}${http_proxy:-}"
USE_PROXY="${NODE_USE_ENV_PROXY:-}"
if [ -n "$PROXY_SET" ] && [ -z "$USE_PROXY" ]; then USE_PROXY=1; fi
# They ask the address the terminal listens on: this computer's own, unless HOST names one of its other addresses.
PROBE_HOST=127.0.0.1
case "${HOST:-}" in ''|0.0.0.0|::|localhost) ;; *) PROBE_HOST="$HOST" ;; esac
case "$PROBE_HOST" in *:*) PROBE_URL_HOST="[$PROBE_HOST]" ;; *) PROBE_URL_HOST="$PROBE_HOST" ;; esac
node_local() { env -u NODE_USE_ENV_PROXY NO_PROXY="127.0.0.1,localhost,$PROBE_HOST" no_proxy="127.0.0.1,localhost,$PROBE_HOST" node "$@"; }

# nvm puts Node.js on the PATH from ~/.bashrc, which a menu entry does not read: load nvm here instead.
if ! command -v node >/dev/null 2>&1 && [ -s "${NVM_DIR:-$USER_HOME/.nvm}/nvm.sh" ]; then
  set +euo pipefail # nvm.sh is not written for these
  . "${NVM_DIR:-$USER_HOME/.nvm}/nvm.sh" >/dev/null 2>&1
  set -euo pipefail
fi

# Node.js 22.13+ (the first release with the built-in database unflagged; 24 recommended) and npm
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed." >&2; node_help; exit 1; }
recent="$(node_local -p 'const [a, b] = process.versions.node.split(".").map(Number); a > 22 || (a === 22 && b >= 13) ? 1 : 0')"
if [ "$recent" != 1 ]; then echo "Node.js $(node -v) is too old." >&2; node_help; exit 1; fi
if [ -n "$PROXY_SET" ] && [ "$(node_local -p 'const [a, b] = process.versions.node.split(".").map(Number); a > 22 || (a === 22 && b >= 21) ? 1 : 0')" != 1 ]; then
  echo "Note: a proxy is set, but Node.js $(node -v) does not use it for the terminal's own requests (22.21 and newer do). Data will only load if this computer can also reach the sources directly." >&2
fi
command -v npm >/dev/null 2>&1 || die "npm is missing. It normally comes with Node.js; some distributions package it separately (npm)."

# Dependencies: on the first run, and again whenever package-lock.json changes
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  bold "Installing dependencies (the first time takes a minute or two)…"
  npm install --no-audit --no-fund
fi

# Is the terminal answering on $PORT? Its API answers /api/auth/me with "null" (signed out) or the
# account; another program that happens to use the port answers something else.
running() {
  node_local -e "fetch('http://${PROBE_URL_HOST}:${PORT}/api/auth/me', { signal: AbortSignal.timeout(1500) }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => process.exit(j === null || typeof j?.email === 'string' ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1
}
# Is anything at all listening on $PORT?
port_taken() {
  node_local -e "const s = require('net').connect(${PORT}, '${PROBE_HOST}'); s.on('connect', () => process.exit(0)); s.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 1500)" >/dev/null 2>&1
}
port_busy() { die "Port $PORT is used by another program. Choose another one, for example: PORT=$((PORT + 10)) bash start.sh"; }
open_browser() {
  [ "$OPEN" = 1 ] || return 0
  if [ "$(uname -s)" = Darwin ]; then open "$URL" >/dev/null 2>&1 && return 0; fi
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    for cmd in xdg-open gio sensible-browser; do
      command -v "$cmd" >/dev/null 2>&1 || continue
      if [ "$cmd" = gio ]; then nohup gio open "$URL" >/dev/null 2>&1 & else nohup "$cmd" "$URL" >/dev/null 2>&1 & fi
      return 0
    done
  fi
  echo "Open $URL in your browser."
}

# Folder names may hold characters that mean something in the files written below.
# Menu entry (Desktop Entry format): a backslash is written twice in every value. In Exec=, inside
# double quotes, backslash, quote, backtick and dollar also get a backslash in front (so two or four
# end up in the file), and % starts a field code unless doubled.
desktop_val() { printf '%s' "$1" | sed 's/\\/\\\\/g'; }
desktop_arg() { printf '%s' "$1" | sed -e 's/[\\"`$]/\\&/g' -e 's/\\/\\\\/g' -e 's/%/%%/g'; }
# Service (systemd unit): % starts a specifier unless doubled; inside double quotes, backslash and
# quote get a backslash in front. WorkingDirectory= is written without quotes (unit_path).
unit_path() { printf '%s' "$1" | sed 's/%/%%/g'; }
unit_val() { unit_path "$1" | sed 's/[\\"]/\\&/g'; }

install_desktop() {
  [ -n "${XDG_DATA_HOME:-$USER_HOME}" ] || die "HOME is not set, so there is no applications folder to add the menu entry to."
  mkdir -p "$(dirname "$MENU_FILE")"
  cat > "$MENU_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=$APP
Comment=Map-first research terminal for geopolitics, economies, markets and companies
Exec=bash "$(desktop_arg "$DIR/start.sh")" --hold
Path=$(desktop_val "$DIR")
Terminal=true
Icon=applications-internet
Categories=Office;Finance;
StartupNotify=false
EOF
  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$(dirname "$MENU_FILE")" >/dev/null 2>&1 || true; fi
  bold "Added \"$APP\" to your applications menu ($MENU_FILE)."
}

install_service() {
  [ -n "${XDG_CONFIG_HOME:-$USER_HOME}" ] || die "HOME is not set, so there is nowhere to put the service file."
  local v up=0 npm_path
  npm_path="$(command -v npm)"
  # Check first that a service can work here, before spending a minute on the build.
  if [ "$(id -u)" = 0 ] && [ -n "${SUDO_USER:-}" ]; then die "Run this without sudo: the background service belongs to your own account."; fi
  systemctl --user show-environment >/dev/null 2>&1 || die "A systemd user session is not available here (no systemd, WSL without systemd, a container, or a sudo/su shell). Run 'bash start.sh' instead, or run 'npm start' under your own process manager."
  if ! systemctl --user is-active --quiet "$SLUG.service"; then
    if running; then die "$APP is already running at $URL in another window. Stop that copy first (Ctrl+C in its window), then run this again."; fi
    if port_taken; then port_busy; fi
  fi
  case "$npm_path" in *[\"\'\\]*) die "systemd does not start a program whose path contains a quote or a backslash ($npm_path). Install Node.js in a folder without them, or run 'npm start' under your own process manager." ;; esac
  bold "Building the app for background use…"
  npm run build
  mkdir -p "$(dirname "$UNIT_FILE")"
  {
    echo "[Unit]"
    echo "Description=$APP"
    echo "After=network-online.target"
    echo
    echo "[Service]"
    echo "Type=simple"
    echo "WorkingDirectory=$(unit_path "$DIR")"
    echo "Environment=\"PATH=$(unit_val "$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin")\""
    echo "Environment=PORT=$PORT"
    for v in HOST CONTACT_EMAIL ALLOW_SIGNUP TERMINAL_VAULT TERMINAL_DATA_DIR TERMINAL_DATA_MODE HTTPS_PROXY HTTP_PROXY NO_PROXY https_proxy http_proxy no_proxy NODE_EXTRA_CA_CERTS; do
      if [ -n "${!v:-}" ]; then echo "Environment=\"$v=$(unit_val "${!v}")\""; fi
    done
    if [ -n "$USE_PROXY" ]; then echo "Environment=\"NODE_USE_ENV_PROXY=$(unit_val "$USE_PROXY")\""; fi
    echo "ExecStart=\"$(unit_val "$npm_path")\" start"
    echo "Restart=on-failure"
    echo "RestartSec=10"
    echo
    echo "[Install]"
    echo "WantedBy=default.target"
  } > "$UNIT_FILE"
  chmod 600 "$UNIT_FILE" # settings such as a proxy address are nobody else's business
  systemctl --user daemon-reload
  systemctl --user enable "$SLUG.service"
  systemctl --user restart "$SLUG.service" # restart, not start: after an update the old copy may still be running
  for _ in $(seq 1 60); do if running; then up=1; break; fi; sleep 1; done
  if [ "$up" != 1 ]; then
    cat >&2 <<EOF
The service is installed, but the terminal does not answer at $URL.
  What happened:  systemctl --user status $SLUG
  Its messages:   journalctl --user -u $SLUG -e
  Remove it:      systemctl --user disable --now $SLUG
EOF
    exit 1
  fi
  bold "$APP now runs in the background at $URL and starts when you log in."
  cat <<EOF
  Status:   systemctl --user status $SLUG
  Logs:     journalctl --user -u $SLUG -f
  Stop:     systemctl --user disable --now $SLUG
  Keep it running after you log out:  loginctl enable-linger "\$USER"
  Other settings (e.g. FRED_API_KEY): systemctl --user edit $SLUG, then add Environment=NAME=value
  After an update, run this command again (from the new folder, if the folder changed).
EOF
  open_browser
}

# After an update into a new folder, the service and the menu entry still start the old copy.
# Arguments: the file, the line that names this folder, what it is, the option that rewrites it.
moved_note() {
  if [ -f "$1" ] && ! grep -qxF -- "$2" "$1"; then
    echo "Note: $3 still uses another folder ($(sed -n "s/^${2%%=*}=//p" "$1" | head -n 1)). To move it here: bash start.sh $4"
  fi
}

if [ "$DESKTOP" = 1 ]; then install_desktop; fi
if [ "$SERVICE" = 1 ]; then install_service; exit 0; fi

moved_note "$UNIT_FILE" "WorkingDirectory=$(unit_path "$DIR")" "the background service" --service
moved_note "$MENU_FILE" "Path=$(desktop_val "$DIR")" "the applications menu entry" --desktop
if running; then
  bold "$APP is already running at $URL."
  open_browser
  exit 0
fi
if port_taken; then port_busy; fi

bold "Starting $APP at $URL. Keep this window open; press Ctrl+C to stop."
if [ "$OPEN" = 1 ]; then
  # Open the browser once the terminal answers; give up when this script's process is gone.
  ( for _ in $(seq 1 120); do if running; then open_browser; exit 0; fi; kill -0 $$ 2>/dev/null || exit 0; sleep 1; done ) &
  POLLER=$!
fi
if [ -n "$USE_PROXY" ]; then export NODE_USE_ENV_PROXY="$USE_PROXY"; fi
if [ "$HOLD" = 1 ]; then npm run dev; else exec npm run dev; fi
