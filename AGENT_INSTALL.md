# Install Rich T3 Code with an agent

This file is written for an AI coding agent. Follow the steps in order. Do not modify T3 Code or its database. If a step needs a value only the user can provide (the Discord Application ID), stop and ask for it.

## 1. Check the machine

```bash
node --version           # need v20.11 or newer
uname -s                 # Darwin, Linux, or Windows
test -d "$HOME/.t3" && echo "T3 home found" || echo "T3 home missing"
```

The T3 Code data directory is `$T3CODE_HOME` if set, otherwise `~/.t3`. The presence database is `<T3 home>/userdata/statev2.sqlite`.

If Node is older than 20.11, install a newer Node before continuing.

## 2. Ask for the Discord Application ID

The application name appears as the "Playing …" headline. Ask the user to:

1. Open <https://discord.com/developers/applications>.
2. Create an application named **T3 Code** (or whatever headline they want).
3. Copy the Application ID.
4. Optional: in **Rich Presence → Art Assets**, upload `assets/t3code-icon.png` with the asset key `logo`. The default config already uses the T3 icon through an image proxy, so this is only for an app-owned asset.

Do not use an id from another project. Do not invent one.

## 3. Install from source

```bash
git clone https://github.com/YonCZ/T3Code-Presence.git
cd rich-t3code
npm install
npm run build
```

## 4. Write the config

Replace `<APPLICATION_ID>` with the id from step 2:

```bash
node dist/cli.js init --client-id <APPLICATION_ID>
```

The file is `~/.config/rich-t3code/config.json`. The default first line is `["thread"]`; the second is `["modelNameVariant", "status"]`. If the user does not want their work visible, set `"details": ["status"]` and keep `state`. If they want a different layout, edit `details` and `state` using the field names in the README. Keep `clientId`.

## 5. Verify

```bash
node dist/cli.js status
node dist/cli.js doctor
```

Expected: `T3 server running`, the database path is readable, the `Discord app id` check passes, and the `Discord IPC` check finds a socket. A `WARN` for the login service is normal before step 6.

If T3 Code is closed, start it once so the server creates its state database, then run `status` again.

## 6. Show the card for a few seconds

```bash
node dist/cli.js preview --seconds 10
```

If it fails, Discord is not running or the IPC socket is in an unexpected place. Ask the user to start the Discord desktop app. Discord in a browser will not work.

## 7. Run at login

```bash
node dist/cli.js install
```

macOS uses a LaunchAgent at `~/Library/LaunchAgents/com.yoncz.rich-t3code.plist`; Linux uses a systemd user unit. The service runs:

```text
<node> <repo>/dist/cli.js start --config ~/.config/rich-t3code/config.json
```

Logs go to `~/.local/state/rich-t3code/`.

Check it:

```bash
# macOS
launchctl print gui/$(id -u)/com.yoncz.rich-t3code | head -20

# Linux
systemctl --user status rich-t3code
```

On Windows, `install` is not available. Add `rich-t3code start` to Task Scheduler at login instead.

## 8. Handle the common failures

- `Discord app id: not set` — run `init --client-id` again or set `RICH_T3CODE_CLIENT_ID`.
- `Discord IPC: not found` — the Discord desktop app is not running. The daemon retries, but nothing appears until the socket exists.
- `T3 Code database: ... not found` — T3 Code has never started on this machine, or `T3CODE_HOME` points at the wrong directory.
- `Could not read T3 Code state: no such column` — T3 Code changed its schema. Run `doctor`, collect the error, and report it; do not patch T3 Code's database.
- The card stays `Idle` while agents run — the followed thread is the one open in the window. Add `agents` to `state`, or set `followFocusedThread` to `false`.
- Two daemons — the second exits with a lock error. Remove the stale lock at `~/.local/state/rich-t3code/rich-t3code.lock` only after checking that no `rich-t3code start` process is alive.

## Rules

- Never write to `<T3 home>/userdata/statev2.sqlite`.
- Never modify files inside the T3 Code application bundle.
- Do not add a `clientId` that belongs to an unrelated Discord application.
- Keep changes to the user's config minimal and show them the diff.
