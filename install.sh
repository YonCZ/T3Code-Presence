#!/usr/bin/env bash
# Install T3 Code Presence without prompts.
#
#   curl -fsSL https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh | bash
#
# Overrides:
#   T3CODE_PRESENCE_DIR        checkout directory. Default: ~/.local/share/t3code-presence
#   T3CODE_PRESENCE_REPO       git remote. Default: the public GitHub repo
#   T3CODE_PRESENCE_NO_SERVICE set to 1 to build without installing the login service
set -euo pipefail

REPO_URL="${T3CODE_PRESENCE_REPO:-https://github.com/YonCZ/T3Code-Presence.git}"
INSTALL_DIR="${T3CODE_PRESENCE_DIR:-$HOME/.local/share/t3code-presence}"
SKIP_SERVICE="${T3CODE_PRESENCE_NO_SERVICE:-0}"

info() { printf 'info: %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin | Linux) ;;
  *)
    fail "Automatic install supports macOS and Linux. On Windows, clone the repo, run npm install and npm run build, then add 'node dist/cli.js start' to Task Scheduler so it runs at login."
    ;;
esac

command -v git >/dev/null 2>&1 || fail "git is required."
command -v node >/dev/null 2>&1 || fail "Node.js 20.11 or newer is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 11)) process.exit(1);
' || fail "Node.js 20.11 or newer is required. Found $(node --version)."

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
elif [ -e "$INSTALL_DIR" ]; then
  fail "$INSTALL_DIR exists but is not a git checkout. Move it away or set T3CODE_PRESENCE_DIR."
else
  info "Cloning into $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

info "Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

info "Building"
npm run build

if [ "$SKIP_SERVICE" = "1" ]; then
  info "Build complete at $INSTALL_DIR. The service install was skipped."
  exit 0
fi

BIN_DIR="${T3CODE_PRESENCE_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"
chmod +x "$INSTALL_DIR/dist/cli.js"
ln -sf "$INSTALL_DIR/dist/cli.js" "$BIN_DIR/rich-t3code"
info "Linked $BIN_DIR/rich-t3code"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) info "Add $BIN_DIR to PATH to run 'rich-t3code' from anywhere." ;;
esac

info "Installing the login service"
node dist/cli.js install

info "Checking the install"
node dist/cli.js status
info "Done. Logs are in $HOME/.local/state/rich-t3code/"
info "Commands: ${BIN_DIR}/rich-t3code status, or ${BIN_DIR}/rich-t3code uninstall"
