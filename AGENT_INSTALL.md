# Install T3 Code Presence with an agent

This file is for an AI coding agent. If the user says `install T3 Code Presence for me`, follow the quick path. Do not modify T3 Code or its database.

The plugin comes with a shared Discord application, so you do not need to ask for a Discord Application ID. Ask only if the user wants a custom app name or icon, as described in step 5.

## 1. Check the machine

```bash
node --version           # need v20.11 or newer
uname -s                 # Darwin, Linux, or Windows
test -d "$HOME/.t3" && echo "T3 home found" || echo "T3 home missing"
```

The T3 Code data directory is `$T3CODE_HOME` if it is set, and `~/.t3` otherwise. The presence database is `<T3 home>/userdata/statev2.sqlite`.

If Node is older than 20.11, install a newer Node before you continue.

## 2. One-command install on macOS and Linux

```bash
curl -fsSL https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh | bash
```

The script does not prompt. It does these steps:

- It clones the repo into `~/.local/share/t3code-presence`, or it updates an existing checkout.
- It installs dependencies and builds the CLI.
- It links `~/.local/bin/rich-t3code`.
- It installs the launchd agent on macOS or the systemd user unit on Linux.
- It starts the daemon.

You do not need a Discord developer account. Discord shows the shared app as T3 Code and uses the repo icon.

If the user does not want to pipe a remote script into bash, download it first:

```bash
curl -fsSL -o /tmp/install-t3code-presence.sh https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh
bash /tmp/install-t3code-presence.sh
```

## 3. Manual install on Windows or when the script fails

```bash
git clone https://github.com/YonCZ/T3Code-Presence.git
cd T3Code-Presence
npm install
npm run build
node dist/cli.js install
```

The `install` command works on macOS and Linux. On Windows it is not available. Run `node dist/cli.js start` at login with Task Scheduler, or keep it in a terminal for a quick test.

## 4. Verify

```bash
~/.local/share/t3code-presence/dist/cli.js status
~/.local/share/t3code-presence/dist/cli.js doctor
```

If `~/.local/bin` is on `PATH`, `rich-t3code status` works too.

The output should show these items:

- `T3 server running`: T3 Code is open, or its background service is running.
- `T3 Code database`: the file is readable.
- `Discord IPC`: the daemon found a socket. Ask the user to open the Discord desktop app if it is missing.
- `Discord app ID`: the shared app passes without setup.
- `Card`: a line such as `Thread title | Model (variant) · Working`.

If T3 Code has never run on the machine, ask the user to open it once so the database exists. Then run `status` again.

Optional live check:

```bash
~/.local/share/t3code-presence/dist/cli.js preview --seconds 10
```

## 5. Custom Discord app, only if the user asks

The shared app is enough for normal use. If the user wants a different headline or icon:

1. Open <https://discord.com/developers/applications>.
2. Create an application named T3 Code, or the name the user wants.
3. Copy the Application ID.
4. Optional: open Rich Presence, then Art Assets, and upload `assets/t3code-icon.png` with the asset key `logo`.
5. Run:

```bash
~/.local/share/t3code-presence/dist/cli.js init --force --client-id <APPLICATION_ID>
```

You can also set `clientId` in `~/.config/rich-t3code/config.json`.

## 6. Check the service

```bash
# macOS
launchctl print gui/$(id -u)/com.yoncz.rich-t3code | head -20

# Linux
systemctl --user status rich-t3code
```

Logs are in:

```text
~/.local/state/rich-t3code/rich-t3code.log
~/.local/state/rich-t3code/rich-t3code.err.log
```

## 7. Common failures

If `Discord IPC: not found`, the Discord desktop app is not running. The daemon retries, and nothing appears until the socket exists. Discord in a browser will not work.

If `T3 Code database: ... not found`, T3 Code has never started, or `T3CODE_HOME` points at the wrong directory.

If `Could not read T3 Code state: no such column`, T3 Code changed its schema. Run `doctor`, collect the error, and report it. Do not patch the T3 Code database.

If `Another rich-t3code instance is already running`, the previous daemon is still alive. Check `pgrep -fl "dist/cli.js start"`. Do not delete the lock while that process exists.

If the card stays `Idle` while agents run, the thread shown is the one open in the window. Add `agents` to `state`, or set `followFocusedThread` to `false`.

If the service is installed but nothing appears, check `rich-t3code.log` for `discord.login.failed`. The daemon retries when Discord starts.

## Rules

- Never write to `<T3 home>/userdata/statev2.sqlite`.
- Never modify files inside the T3 Code application bundle.
- Do not ask for a Discord Application ID unless the user wants a custom app.
- The shared Application ID is public. Never ask for or publish a client secret or bot token.
- Keep changes to the user's config small, and show the user the diff.
