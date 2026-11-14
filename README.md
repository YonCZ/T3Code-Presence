# T3 Code Presence

Discord Rich Presence for [T3 Code](https://t3.codes). It shows the thread you have open, the model, the project, and what the agent is doing right now on your Discord profile. You choose what goes on each line.

```
Playing T3 Code
Ship the Discord Rich Presence integration
DeepSeek V4.1 Flash (High) · Working
01:23 elapsed
```

This is an independent project. It is not a fork of T3 Code, or of any other presence plugin. It reads T3 Code's local state read-only and talks to Discord over the local IPC socket.

## What it does

- **Follows the open thread.** T3 Code records which thread the window is showing, and the client refreshes that watermark while a thread is mounted. The card follows it, not whichever agent happened to run last.
- **Understands agents.** `Thinking`, `Working`, `Planning`, `Starting`, `Needs approval`, `Needs input`, `Idle` and `Failed` are derived from T3 Code's own run and tool state.
- **Surfaces work that needs you.** If a background thread is waiting for approval or an answer, the card switches to it so you notice.
- **Counts parallel agents.** Add the `agents` field to see how many root threads are running at once.
- **Never writes to T3 Code.** The SQLite database is opened with `readonly` and `query_only`.
- **One daemon per machine.** A lock file prevents two instances from fighting over the Discord connection.
- **Runs at login.** `install` writes a launchd agent on macOS or a systemd user unit on Linux.
- **Stays out of the way.** The card clears when T3 Code is closed, and can hide after a configurable idle stretch.

## Requirements

- T3 Code 0.1 or newer (desktop app or `t3` server). The reader targets the orchestration v2 projection tables.
- Discord desktop running on the same machine. Discord in a browser cannot reach the local IPC socket.
- Node.js 20.11 or newer.
- In Discord: **User Settings → Activity Privacy → Display current activity as a status message**.

## Install

macOS and Linux, one command:

```bash
curl -fsSL https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh | bash
```

The script clones into `~/.local/share/t3code-presence`, builds it, links `~/.local/bin/rich-t3code`, installs the login service, and starts it. **No Discord setup is required** — the plugin ships with the project’s shared T3 Code Discord application.

Then check it:

```bash
rich-t3code status
```

If `~/.local/bin` is not on your `PATH`, use the full path:

```bash
~/.local/share/t3code-presence/dist/cli.js status
```

From source instead:

```bash
git clone https://github.com/YonCZ/T3Code-Presence.git
cd T3Code-Presence
npm install
npm run build
node dist/cli.js install
```

`start` runs in the foreground; `install` keeps it running at login (launchd on macOS, systemd user unit on Linux). Logs and state live in `~/.local/state/rich-t3code/`.

The login service points at the checkout and the Node binary that installed it. Keep the folder where it is; if you move it or switch Node versions, run `install` again.

With an AI agent, point it at [AGENT_INSTALL.md](AGENT_INSTALL.md) or say **“install T3 Code Presence for me”**.

## Custom Discord application (optional)

The built-in shared app is named **T3 Code** and uses the icon in this repo, so most people never need this section. Create your own app if you want a different headline, a different icon, or independent control:

1. Open [discord.com/developers/applications](https://discord.com/developers/applications) and create an application.
2. Copy the **Application ID**.
3. Optional: open **Rich Presence → Art Assets** and upload [`assets/t3code-icon.png`](assets/t3code-icon.png) with the asset key `logo`.
4. Point the config at it:

```bash
rich-t3code init --force --client-id <application-id>
```

Or set `clientId` in `~/.config/rich-t3code/config.json`. If you upload provider icons, map them under `smallImage.providerIcons`; otherwise the daemon uses [models.dev](https://models.dev) logos through an image proxy.

## Configuration

The config file lives at `~/.config/rich-t3code/config.json` (or `$XDG_CONFIG_HOME/rich-t3code/config.json`). Override it with `--config <path>`.

```jsonc
{
  "clientId": "1570933832012791858", // shared app; replace with your own
  "details": ["thread"],
  "state": ["modelNameVariant", "status"],
  "separator": " · ",
  "timer": { "enabled": true, "source": "activity", "idleResetMinutes": 30 },
  "hideWhenIdleMinutes": 60,
  "followFocusedThread": true,
  "pollIntervalMs": 2000,
  "prompting": { "enabled": true, "idleSeconds": 60, "frontmostOnly": true },
  "largeImage": {
    "key": "https://images.weserv.nl/?url=raw.githubusercontent.com/YonCZ/T3Code-Presence/main/assets/t3code-icon.png&output=png&w=512&h=512",
    "text": "T3 Code"
  },
  "smallImage": { "enabled": false, "providerIcons": {} },
  "debug": false
}
```

`details` is the first line, `state` is the second. Fields render in order; empty fields are skipped; each line is truncated to Discord's 128-byte limit.

### Fields

| Field | Example | Notes |
| --- | --- | --- |
| `thread` | `Ship the Discord Rich Presence integration` | title of the followed thread |
| `project` | `rich-t3code` | T3 Code project title, falling back to the folder name |
| `model` | `deepseek-v4.1-flash` | model id without the vendor prefix |
| `modelName` | `DeepSeek V4.1 Flash` | prettified model id |
| `modelNameVariant` | `DeepSeek V4.1 Flash (High)` | prettified model id with the variant |
| `provider` | `opencode` | the agent harness running the thread |
| `vendor` | `einfra` | model vendor from the model id |
| `variant` | `high` | model variant / reasoning level |
| `status` | `Working` | derived activity state |
| `agents` | `3 agents` | running root threads |
| `pending` | `2 approvals + 1 question` | pending requests on the followed thread |
| `mode` | `Full access` | T3 Code runtime mode |
| `branch` | `main` | thread branch |
| `tool` | `npm run build` | current command, edit, search, or tool |
| `version` | `0.1.10-nightly.20261113.4630` | T3 Code server version |
| `text:<anything>` | `in T3 Code` | literal text |

### Options

| Option | Default | Description |
| --- | --- | --- |
| `clientId` | shared T3 Code app | Discord Application ID; override for a custom name or icon |
| `details` | `["thread"]` | fields on the first line |
| `state` | `["modelNameVariant", "status"]` | fields on the second line |
| `separator` | `" · "` | joins non-empty fields |
| `timer.enabled` | `true` | show Discord's elapsed timer |
| `timer.source` | `"activity"` | `activity` keeps one session timer, `run` starts per agent run |
| `timer.idleResetMinutes` | `30` | a continuous idle stretch this long starts a new session timer |
| `hideWhenIdleMinutes` | `60` | hide the card after this long without a run or visit; `0` never hides |
| `followFocusedThread` | `true` | follow the thread open in the window; `false` prefers the busiest thread |
| `pollIntervalMs` | `2000` | database sampling interval |
| `status.labels` | English | rename the eight states |
| `status.approval` | `Needs approval` | label when a tool is waiting for approval |
| `status.input` | `Needs input` | label when the agent is asking a question |
| `prompting.enabled` | `true` | show `Prompting` when you are active and T3 Code is frontmost |
| `prompting.idleSeconds` | `60` | recent input window |
| `prompting.frontmostOnly` | `true` | require one of `prompting.apps` to be frontmost |
| `prompting.apps` | T3 Code, terminals, browsers | frontmost app allow-list |
| `largeImage.key` | built-in T3 icon URL | Discord asset key, or an `https://` URL |
| `largeImage.text` | `"T3 Code"` | hover text |
| `smallImage.enabled` | `false` | show a provider icon |
| `smallImage.providerIcons` | `{}` | asset keys or URLs by vendor/provider id |
| `debug` | `false` | add polling and Discord activity details to `~/.local/state/rich-t3code/rich-t3code.log` |
| `t3Home` | `~/.t3` | T3 Code data directory |

### Examples

The default profile:

```jsonc
{
  "details": ["thread"],
  "state": ["modelNameVariant", "status"]
}
```

Show the current command and the project instead of the thread title:

```jsonc
{
  "details": ["project"],
  "state": ["tool", "status"]
}
```

Per-run timer, custom labels, no provider icon:

```jsonc
{
  "timer": { "source": "run" },
  "status": {
    "labels": { "thinking": "Thinking hard", "working": "Cooking", "idle": "Around" },
    "approval": "Your call",
    "input": "Your answer"
  }
}
```

Hide what you are working on. The thread title is on by default; remove it and keep only the status and model:

```jsonc
{
  "details": ["status"],
  "state": ["modelNameVariant"]
}
```

### Icon

[`assets/t3code-icon.png`](assets/t3code-icon.png) is extracted from the T3 Code app icon. The default `largeImage.key` points at it through `images.weserv.nl`, so the card shows the T3 mark without uploading a Discord asset.

If you prefer an app-owned image, upload that file under **Rich Presence → Art Assets** with the key `logo`, then set:

```jsonc
{ "largeImage": { "key": "logo", "text": "T3 Code" } }
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `RICH_T3CODE_CLIENT_ID` | Discord Application ID |
| `T3CODE_HOME` | T3 Code data directory (the folder containing `userdata/statev2.sqlite`) |

CLI flags win over environment variables, which win over the config file.

## How it works

T3 Code keeps a local SQLite projection of every project, thread, run, runtime request and turn item in `<T3 home>/userdata/statev2.sqlite`. The daemon opens that file read-only every couple of seconds and derives one card.

| Card state | Source |
| --- | --- |
| `Needs approval` | pending runtime request of a tool/permission kind |
| `Needs input` | pending runtime request of kind `user_input` |
| `Starting` | latest run is `queued`, `preparing` or `starting` |
| `Planning` | a plan or todo-list item is running |
| `Thinking` | the model is reasoning, or the run is between steps |
| `Working` | a command, file edit, search, tool or subagent is running |
| `Prompting` | the thread is idle, input happened recently, and an allowed app is frontmost |
| `Idle` | nothing is running |
| `Failed` | the latest run failed in the last five minutes |

The followed thread is the most recently visited one (`lastVisitedAt`). T3 Code's client updates that watermark at least every ten seconds while a thread is mounted. If another thread is waiting for approval or an answer, the card moves to it. With `followFocusedThread: false`, the busiest thread wins instead.

The timer uses the first activity of the current session by default. A continuous idle stretch of `timer.idleResetMinutes` starts a new session timer, so an old thread does not show a 40-hour timer. Set `timer.source` to `run` to time the current agent run instead.

The card is hidden while T3 Code is not running. If the server stays up as a background service but nothing is happening, `hideWhenIdleMinutes` eventually clears the card.

### Why not tokens or cost?

T3 Code's per-thread projection does not store token counts or prices. Its Usage view scans provider histories instead. Adding those numbers would mean reading each provider's private storage, which this project deliberately does not do.

### Compatibility

The reader targets T3 Code 0.1's orchestration v2 tables. It checks for the tables and columns it needs and reports a readable error instead of crashing when T3 Code changes its schema. If a future release breaks the reader, run `rich-t3code doctor` and open an issue with the output.

## Troubleshooting

**The card does not appear.**
- Is the Discord desktop app running? Check `rich-t3code status` for the IPC socket.
- Is `clientId` valid? The shared default works out of the box; a custom app must match the Application ID you copied.
- In Discord, enable **Activity Privacy → Display current activity as a status message**.
- If you use a custom Discord app, the daemon does not need to be restarted after uploading assets, but Discord may cache the old card. Clear it by restarting Discord.

**`T3 Code server: not running`.** Start the T3 Code desktop app or `t3 serve`. If you use a custom data directory, set `T3CODE_HOME` or `t3Home`.

**The card shows `Idle` while an agent is running.** The followed thread may be idle while another thread works. Add the `agents` field, or set `followFocusedThread` to `false`.

**The provider icon is missing.** Discord needs either an uploaded asset key or a reachable image URL. Set `smallImage.enabled` and add `smallImage.providerIcons` for your provider.

**The card stays after quitting T3 Code.** Give Discord a few seconds to time out the activity, or run `rich-t3code start` once and stop it with Ctrl+C; the daemon clears the card on a clean exit.

**The service is installed but nothing happens.** Check `~/.local/state/rich-t3code/rich-t3code.log` and `rich-t3code.err.log`. A `discord.login.failed` line means the socket was busy or Discord was restarting; the daemon retries. On macOS, also check `launchctl print gui/$(id -u)/com.yoncz.rich-t3code`.

**Multiple machines.** Discord shows the activity for the machine where the daemon runs. On a remote T3 Code server, run the daemon on that machine and point it at the same `T3CODE_HOME`.

## Development

```bash
npm install
npm run build        # compile src/ to dist/
npm run typecheck    # type check only
npm test             # unit tests (node:test via tsx)
npm run dev -- status
npm run dev -- start --dry-run --verbose
node dist/cli.js preview --seconds 10
```

`start --dry-run` prints the rendered card and status without touching Discord. `preview` shows the live card (or a sample when T3 Code is closed) for a few seconds.

## License

MIT. See [LICENSE](LICENSE).

T3 Code is a separate MIT-licensed project by T3 Tools Inc. This project is not affiliated with T3 Tools or Discord.
