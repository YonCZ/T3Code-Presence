# Install T3 Code Presence with an agent

This file is written for an AI coding agent. If the user says **“install T3 Code Presence for me”**, follow the quick path. Do not modify T3 Code or its database.

The plugin ships with a shared Discord application, so **you do not need to ask the user for a Discord Application ID**. Only ask if they explicitly want a custom app name or icon (see step 5).

## 1. Check the machine

```bash
node --version           # need v20.11 or newer
uname -s                 # Darwin, Linux, or Windows
test -d "$HOME/.t3" && echo "T3 home found" || echo "T3 home missing"
```

If Node is older than 20.11, install a newer Node before continuing.

The T3 Code data directory is `$T3CODE_HOME` if set, otherwise `~/.t3`. The presence database is `<T3 home>/userdata/statev2.sqlite`.

## 2. One-command install (macOS and Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh | bash
```

This script is non-interactive. It:

- clones the repo into `~/.local/share/t3code-presence` (or updates it)
- installs dependencies and builds
- links `~/.local/bin/rich-t3code`
- installs the launchd agent (macOS) or systemd user unit (Linux)
- starts the daemon

No Discord developer setup is needed. The shared app is named **T3 Code** and uses the repo icon.

If `curl | bash` is not acceptable, download and run the script instead:

```bash
curl -fsSL -o /tmp/install-t3code-presence.sh https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh
bash /tmp/install-t3code-presence.sh
```

## 3. Manual install (Windows or if the script fails)

```bash
git clone https://github.com/YonCZ/T3Code-Presence.git
cd T3Code-Presence
npm install
npm run build
node dist/cli.js install     # macOS/Linux only
```

On Windows, `install` is unavailable. Run `node dist/cli.js start` at login with Task Scheduler. The daemon can run in the foreground for a quick test.

## 4. Verify

```bash
~/.local/share/t3code-presence/dist/cli.js status
~/.local/share/t3code-presence/dist/cli.js doctor
```

If `~/.local/bin` is on `PATH`, `rich-t3code status` works too.

Expected:

- `T3 server running` — T3 Code is open, or its background service is running.
- `T3 Code database` — readable.
- `Discord IPC` — a socket is found. Ask the user to open the Discord desktop app if it is missing.
- `Discord app id` — passes with the shared app.
- `Card` — renders a line like `Thread title | Model (variant) · Working`.

If T3 Code has never run on this machine, ask the user to open it once so the database exists, then run `status` again.

Optional live check:

```bash
~/.local/share/t3code-presence/dist/cli.js preview --seconds 10
```

## 5. Custom Discord app (only if the user asks)

The shared app is enough for normal use. If the user wants their own headline or icon:

1. Open <https://discord.com/developers/applications>.
2. Create an application named **T3 Code** (or their preferred name).
3. Copy the Application ID.
4. Optional: in **Rich Presence → Art Assets**, upload [`assets/t3code-icon.png`](assets/t3code-icon.png) with the asset key `logo`.
5. Run:

```bash
~/.local/share/t3code-presence/dist/cli.js init --force --client-id <APPLICATION_ID>
```

Or set `clientId` in `~/.config/rich-t3code/config.json`.

## 6. Service checks

```bash
# macOS
launchctl print gui/$(id -u)/com.yoncz.rich-t3code | head -20

# Linux
systemctl --user status rich-t3code
```

Logs:

```text
~/.local/state/rich-t3code/rich-t3code.log
~/.local/state/rich-t3code/rich-t3code.err.log
```

## 7. Common failures

- `Discord IPC: not found` — the Discord desktop app is not running. The daemon retries; nothing appears until the socket exists. Discord in a browser will not work.
- `T3 Code database: ... not found` — T3 Code has never started, or `T3CODE_HOME` points at the wrong directory.
- `Could not read T3 Code state: no such column` — T3 Code changed its schema. Run `doctor`, collect the error, and report it; do not patch T3 Code's database.
- `Another rich-t3code instance is already running` — the previous daemon is still alive. Check `pgrep -fl "dist/cli.js start"`; do not delete the lock while that process exists.
- The card stays `Idle` while agents run — the followed thread is the one open in the window. Add `agents` to `state`, or set `followFocusedThread` to `false`.
- The service is installed but nothing appears — check `rich-t3code.log` for `discord.login.failed`; the daemon retries when Discord starts.

## Rules

- Never write to `<T3 home>/userdata/statev2.sqlite`.
- Never modify files inside the T3 Code application bundle.
- Do not ask for a Discord Application ID unless the user wants a custom app.
- The shared Application ID is public and safe to publish. Never ask for or publish a **client secret** or **bot token**.
- Keep changes to the user's config minimal and show them the diff.
