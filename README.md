# T3 Code Presence

Discord Rich Presence for [T3 Code](https://t3.codes). It shows the thread you have open, the model, and what the agent is doing on your Discord profile. You choose what goes on each line.

```text
Playing T3 Code
Ship the Discord Rich Presence integration
DeepSeek V4.1 Flash (High) · Working
01:23 elapsed
```

Discord adds the app name and the elapsed timer. The plugin sends the two lines between them.

This is an independent project. It is not a fork of T3 Code or another presence plugin. It reads T3 Code's local state without writing to it and sends the activity to Discord over the local IPC socket.

## What it does

- It shows the thread open in T3 Code. T3 Code records which thread the window is showing and updates that record while the thread is mounted.
- It reads the agent state. Thinking, Working, Planning, Starting, Needs approval, Needs input, Idle, and Failed come from T3 Code's run and tool state.
- It switches to a thread that needs you. If a background thread is waiting for approval or an answer, the card shows that thread.
- It shows how many root threads are running. Add the `agents` field to see the count.
- It opens the T3 Code database read-only. The connection uses `readonly` and `query_only`.
- It runs one daemon per machine. A lock file stops a second copy from using the Discord connection.
- It can start at login. The install command writes a launchd agent on macOS or a systemd user unit on Linux.
- It clears the card when T3 Code closes. It can also hide the card after a configured idle time.

## Requirements

- You need T3 Code 0.1 or newer, either the desktop app or the `t3` server. The reader uses the orchestration v2 tables.
- The Discord desktop app must run on the same machine. Discord in a browser cannot reach the local IPC socket.
- The source install needs Node.js 20.11 or newer.
- In Discord, open User Settings, then Activity Privacy, and turn on "Display current activity as a status message".

The plugin comes with a shared Discord application, so you do not need a Discord developer account.

## Install

One command on macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh | bash
```

The script clones the repo into `~/.local/share/t3code-presence`, installs dependencies, and builds. It links `~/.local/bin/rich-t3code`, installs the login service, and starts the daemon. It does not ask for a Discord Application ID.

Check the result:

```bash
rich-t3code status
```

If `~/.local/bin` is not on `PATH`, use the full path:

```bash
~/.local/share/t3code-presence/dist/cli.js status
```

From source:

```bash
git clone https://github.com/YonCZ/T3Code-Presence.git
cd T3Code-Presence
npm install
npm run build
node dist/cli.js install
```

`start` runs in the foreground. `install` keeps the daemon running at login. Logs and state are in `~/.local/state/rich-t3code/`.

The login service points at the checkout and the Node binary that installed it. If you move the folder or switch Node versions, run `install` again.

With an AI agent: point it at [AGENT_INSTALL.md](AGENT_INSTALL.md), or tell it `install T3 Code Presence for me`.

## Custom Discord application

Discord shows the shared app as T3 Code. It uses the icon in this repo. Most people do not need this section. Create your own app if you want a different headline, a different icon, or control over the app.

1. Open [discord.com/developers/applications](https://discord.com/developers/applications) and create an application.
2. Copy the Application ID.
3. Optional: open Rich Presence, then Art Assets, and upload [`assets/t3code-icon.png`](assets/t3code-icon.png) with the asset key `logo`.
4. Point the config at it:

```bash
rich-t3code init --force --client-id <application-id>
```

If you installed from source, use `node dist/cli.js init --force --client-id <application-id>` instead. You can also set `clientId` in `~/.config/rich-t3code/config.json`.

If you upload provider icons, map them under `smallImage.providerIcons`. Otherwise the daemon uses [models.dev](https://models.dev) logos through an image proxy.

## Configuration

The config file is `~/.config/rich-t3code/config.json`, or `$XDG_CONFIG_HOME/rich-t3code/config.json`. Use `--config <path>` to read another file.

```jsonc
{
  "clientId": "1570933832012791858",
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

The shared app is the default. Replace `clientId` if you created your own app.

`details` is the first line and `state` is the second. Fields render in order. The daemon skips empty fields. Discord limits each line to 128 bytes.

### Fields

| Field | Example | Notes |
| --- | --- | --- |
| `thread` | `Ship the Discord Rich Presence integration` | title of the thread shown |
| `project` | `rich-t3code` | T3 Code project title, or the folder name |
| `model` | `deepseek-v4.1-flash` | model id without the vendor prefix |
| `modelName` | `DeepSeek V4.1 Flash` | model id in title case |
| `modelNameVariant` | `DeepSeek V4.1 Flash (High)` | model id with the variant |
| `provider` | `opencode` | provider that runs the thread |
| `vendor` | `einfra` | model vendor from the model id |
| `variant` | `high` | model variant or reasoning level |
| `status` | `Working` | activity state |
| `agents` | `3 agents` | number of running root threads |
| `pending` | `2 approvals + 1 question` | pending requests on the thread shown |
| `mode` | `Full access` | T3 Code runtime mode |
| `branch` | `main` | thread branch |
| `tool` | `npm run build` | current command, edit, search, or tool |
| `version` | `0.1.10-nightly.20261113.4630` | T3 Code server version |
| `text:<anything>` | `in T3 Code` | literal text |

### Options

| Option | Default | Description |
| --- | --- | --- |
| `clientId` | shared T3 Code app | Discord Application ID. Override it for a custom name or icon. |
| `details` | `["thread"]` | fields on the first line |
| `state` | `["modelNameVariant", "status"]` | fields on the second line |
| `separator` | `" · "` | text between fields |
| `timer.enabled` | `true` | show Discord's elapsed timer |
| `timer.source` | `"activity"` | `activity` keeps one session timer, `run` starts one per agent run |
| `timer.idleResetMinutes` | `30` | idle time that starts a new session timer |
| `hideWhenIdleMinutes` | `60` | hide the card after this long without a run or visit. Set `0` to never hide. |
| `followFocusedThread` | `true` | show the thread open in the window. Set `false` to show the busiest thread. |
| `pollIntervalMs` | `2000` | database sampling interval |
| `status.labels` | English | names for the eight states |
| `status.approval` | `Needs approval` | label when a tool is waiting for approval |
| `status.input` | `Needs input` | label when the agent is asking a question |
| `prompting.enabled` | `true` | show `Prompting` when you are active and T3 Code is frontmost |
| `prompting.idleSeconds` | `60` | recent input window |
| `prompting.frontmostOnly` | `true` | require one of `prompting.apps` to be frontmost |
| `prompting.apps` | T3 Code, terminals, browsers | frontmost app allow-list |
| `largeImage.key` | built-in T3 icon URL | Discord asset key or `https://` URL |
| `largeImage.text` | `"T3 Code"` | hover text |
| `smallImage.enabled` | `false` | show a provider icon |
| `smallImage.providerIcons` | `{}` | asset keys or URLs by vendor or provider ID |
| `debug` | `false` | add polling and Discord details to `~/.local/state/rich-t3code/rich-t3code.log` |
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

Use a timer per run and rename the states:

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

Hide the thread title and show only the status and model:

```jsonc
{
  "details": ["status"],
  "state": ["modelNameVariant"]
}
```

### Icon

[`assets/t3code-icon.png`](assets/t3code-icon.png) comes from the T3 Code app icon. The default `largeImage.key` points at it through `images.weserv.nl`, so the card shows the icon without a Discord asset upload.

If you want an app-owned image, upload that file under Rich Presence, then Art Assets, with the key `logo`, and set:

```jsonc
{ "largeImage": { "key": "logo", "text": "T3 Code" } }
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `RICH_T3CODE_CLIENT_ID` | Discord Application ID |
| `T3CODE_HOME` | T3 Code data directory, the folder that contains `userdata/statev2.sqlite` |

Command-line flags win over environment variables. Environment variables win over the config file.

## How it works

T3 Code keeps a local SQLite projection of projects, threads, runs, runtime requests, and turn items in `<T3 home>/userdata/statev2.sqlite`. The daemon opens that file read-only every two seconds and builds one card.

| Card state | Source |
| --- | --- |
| `Needs approval` | pending runtime request for a tool or permission |
| `Needs input` | pending runtime request of kind `user_input` |
| `Starting` | latest run is `queued`, `preparing`, or `starting` |
| `Planning` | a plan or todo-list item is running |
| `Thinking` | the model is reasoning, or the run is between steps |
| `Working` | a command, file edit, search, tool, or subagent is running |
| `Prompting` | the thread is idle, input happened recently, and an allowed app is frontmost |
| `Idle` | nothing is running |
| `Failed` | the latest run failed in the last five minutes |

The card shows the most recently visited thread (`lastVisitedAt`). T3 Code updates that value at least every ten seconds while a thread is open. If another thread is waiting for approval or an answer, the card switches to it. Set `followFocusedThread` to `false` to show the busiest thread instead.

The timer starts with the first activity of the session. A continuous idle stretch of `timer.idleResetMinutes` starts a new session timer. Set `timer.source` to `run` to time the current agent run instead.

The daemon hides the card while T3 Code is not running. If the server stays up as a background service and nothing happens, `hideWhenIdleMinutes` clears the card.

### Why no tokens or cost?

The per-thread projection in T3 Code does not store token counts or prices. The Usage view scans provider histories instead. Reading those numbers would mean reading each provider's private storage, and this project does not do that.

### Compatibility

The reader uses T3 Code 0.1's orchestration v2 tables. It checks for the tables and columns it needs and reports an error instead of crashing when the schema changes. If a future release breaks the reader, run `rich-t3code doctor` and open an issue with the output.

## Troubleshooting

If the card does not appear, check these items in order:

- Is the Discord desktop app running? `rich-t3code status` shows the IPC socket when it finds one.
- In Discord, is Activity Privacy set to display the current activity?
- Is the Discord Application ID valid? The shared default works without setup. A custom app must match the ID you copied.
- If you use a custom app, Discord may cache the old card. Restart Discord after you change the app or its assets.

If `T3 Code server` is not running, start the T3 Code desktop app or run `t3 serve`. If you use a custom data directory, set `T3CODE_HOME` or `t3Home`.

If the card shows `Idle` while an agent runs, the thread shown may be idle while another thread works. Add the `agents` field, or set `followFocusedThread` to `false`.

If the provider icon is missing, set `smallImage.enabled` and add `smallImage.providerIcons` for your provider. Discord needs an uploaded asset key or a reachable image URL.

If the card stays after you quit T3 Code, wait a few seconds for Discord to time out the activity. You can also run `rich-t3code start` and stop it with Ctrl+C. The daemon clears the card on a clean exit.

If the service is installed but nothing appears, read `~/.local/state/rich-t3code/rich-t3code.log` and `rich-t3code.err.log`. A `discord.login.failed` line means Discord was restarting or the socket was busy. The daemon retries. On macOS, run `launchctl print gui/$(id -u)/com.yoncz.rich-t3code`.

Discord shows the activity for the machine where the daemon runs. For a remote T3 Code server, run the daemon on that machine and point it at the same `T3CODE_HOME`.

## Development

```bash
npm install
npm run build        # compile src/ to dist/
npm run typecheck    # type check only
npm test             # unit tests
npm run dev -- status
npm run dev -- start --dry-run --verbose
node dist/cli.js preview --seconds 10
```

`start --dry-run` prints the rendered card and state without connecting to Discord. `preview` shows the live card, or a sample when T3 Code is closed, for a few seconds.

## License

MIT. See [LICENSE](LICENSE).

T3 Code is a separate MIT-licensed project by T3 Tools Inc. This project is not affiliated with T3 Tools or Discord.
