#!/usr/bin/env bash
# Global Intelligence Terminal: start it on Linux (works on macOS too).
#
#   bash start.sh             install what is needed, start the terminal, open it in your browser
#   bash start.sh --desktop   also add "Global Intelligence Terminal" to your applications menu
#   bash start.sh --service   run it in the background from login instead (systemd user service)
#   bash start.sh --no-open   start without opening a browser (for example on a server)
#
# Settings go in front, for example:  PORT=5190 CONTACT_EMAIL=you@example.com bash start.sh
set -euo pipefail

APP="Global Intelligence Terminal"
SLUG="global-intelligence-terminal"
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-5180}"
URL="http://localhost:${PORT}"
OPEN=1; DESKTOP=0; SERVICE=0
for arg in "$@"; do
  case "$arg" in
    --desktop) DESKTOP=1 ;;
    --service) SERVICE=1 ;;
    --no-open) OPEN=0 ;;
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

# Node.js 22.13+ (the first release with the built-in database unflagged; 24 recommended) and npm
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed." >&2; node_help; exit 1; }
recent="$(node -p 'const [a, b] = process.versions.node.split(".").map(Number); a > 22 || (a === 22 && b >= 13) ? 1 : 0')"
if [ "$recent" != 1 ]; then echo "Node.js $(node -v) is too old." >&2; node_help; exit 1; fi
command -v npm >/dev/null 2>&1 || die "npm is missing. It normally comes with Node.js; some distributions package it separately (npm)."

# Dependencies: on the first run, and again whenever package-lock.json changes
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  bold "Installing dependencies (the first time takes a minute or two)…"
  npm install --no-audit --no-fund
fi

# Is the terminal answering on $PORT? (Its API answers /api/auth/me with JSON.)
running() {
  node -e "fetch('http://127.0.0.1:${PORT}/api/auth/me', { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).then(() => process.exit(0), () => process.exit(1))" >/dev/null 2>&1
}
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

install_desktop() {
  local apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  local file="$apps/$SLUG.desktop" exec_path
  # Desktop-entry quoting: backslash, double quote, backtick and dollar are escaped inside quotes.
  exec_path="$(printf '%s' "$DIR/start.sh" | sed -e 's/\\/\\\\\\\\/g' -e 's/"/\\"/g' -e 's/`/\\`/g' -e 's/\$/\\$/g')"
  mkdir -p "$apps"
  cat > "$file" <<EOF
[Desktop Entry]
Type=Application
Name=$APP
Comment=Map-first research terminal for geopolitics, economies, markets and companies
Exec=bash "$exec_path"
Path=$DIR
Terminal=true
Icon=applications-internet
Categories=Office;Finance;
StartupNotify=false
EOF
  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$apps" >/dev/null 2>&1 || true; fi
  bold "Added \"$APP\" to your applications menu ($file)."
}

install_service() {
  command -v systemctl >/dev/null 2>&1 || die "systemd is not available here. Run 'bash start.sh' instead, or run 'npm start' under your own process manager."
  bold "Building the app for background use…"
  npm run build
  local unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  local unit="$unit_dir/$SLUG.service"
  mkdir -p "$unit_dir"
  {
    echo "[Unit]"
    echo "Description=$APP"
    echo "After=network-online.target"
    echo
    echo "[Service]"
    echo "Type=simple"
    echo "WorkingDirectory=$DIR"
    echo "Environment=\"PATH=$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin\""
    echo "Environment=PORT=$PORT"
    for v in HOST CONTACT_EMAIL ALLOW_SIGNUP TERMINAL_VAULT; do
      if [ -n "${!v:-}" ]; then echo "Environment=\"$v=${!v}\""; fi
    done
    echo "ExecStart=\"$(command -v npm)\" start"
    echo "Restart=on-failure"
    echo "RestartSec=10"
    echo
    echo "[Install]"
    echo "WantedBy=default.target"
  } > "$unit"
  systemctl --user daemon-reload
  systemctl --user enable --now "$SLUG.service"
  bold "$APP now runs in the background at $URL and starts when you log in."
  cat <<EOF
  Status:   systemctl --user status $SLUG
  Logs:     journalctl --user -u $SLUG -f
  Stop:     systemctl --user disable --now $SLUG
  Keep it running after you log out:  loginctl enable-linger "\$USER"
  Other settings (e.g. FRED_API_KEY): systemctl --user edit $SLUG, then add Environment=NAME=value
EOF
  for _ in $(seq 1 60); do if running; then break; fi; sleep 1; done
  open_browser
}

if [ "$DESKTOP" = 1 ]; then install_desktop; fi
if [ "$SERVICE" = 1 ]; then install_service; exit 0; fi

if running; then
  bold "$APP is already running at $URL."
  open_browser
  exit 0
fi

bold "Starting $APP at $URL. Keep this window open; press Ctrl+C to stop."
if [ "$OPEN" = 1 ]; then
  ( for _ in $(seq 1 120); do if running; then open_browser; exit 0; fi; sleep 1; done ) &
fi
exec npm run dev
