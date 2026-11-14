# T3 Code Presence

Discord Rich Presence for [T3 Code](https://t3.codes). It shows the thread you have open, the model, and the agent state.

```text
Playing T3 Code
Ship the Discord Rich Presence integration
DeepSeek V4.1 Flash (High) · Working
01:23 elapsed
```

Discord adds the app name and timer. The plugin sends the two lines between them.

## Install

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/YonCZ/T3Code-Presence/main/install.sh | bash
```

The script installs to `~/.local/share/t3code-presence`, links `~/.local/bin/rich-t3code`, installs the login service, and starts the daemon. No Discord app setup is needed. The plugin uses a shared T3 Code app.

Check it:

```bash
rich-t3code status
```

If `~/.local/bin` is not on `PATH`:

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

`install` keeps the daemon running at login. If you move the folder or switch Node versions, run `install` again. Logs are in `~/.local/state/rich-t3code/`.

For an AI agent, use [AGENT_INSTALL.md](AGENT_INSTALL.md) or say `install T3 Code Presence for me`.

## Requirements

- T3 Code 0.1 or newer, desktop app or `t3` server.
- Discord desktop on the same machine.
- Node.js 20.11 or newer for the source install.
- Discord Activity Privacy set to "Display current activity as a status message".

## Configuration

The config file is `~/.config/rich-t3code/config.json`, or `$XDG_CONFIG_HOME/rich-t3code/config.json`. Use `--config <path>` to read another file.

```json
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

`details` is the first line and `state` is the second. Fields render in order, empty fields are skipped, and Discord limits each line to 128 bytes.

### Fields

| Field | Example | Notes |
| --- | --- | --- |
| `thread` | `Ship the Discord Rich Presence integration` | title of the thread shown |
| `project` | `rich-t3code` | project title, or the folder name |
| `model` | `deepseek-v4.1-flash` | model id without the vendor prefix |
| `modelName` | `DeepSeek V4.1 Flash` | model id in title case |
| `modelNameVariant` | `DeepSeek V4.1 Flash (High)` | model id with the variant |
| `provider` | `opencode` | provider that runs the thread |
| `vendor` | `einfra` | model vendor |
| `variant` | `high` | model variant or reasoning level |
| `status` | `Working` | activity state |
| `agents` | `3 agents` | running root threads |
| `pending` | `2 approvals + 1 question` | pending requests on the thread shown |
| `mode` | `Full access` | runtime mode |
| `branch` | `main` | thread branch |
| `tool` | `npm run build` | current command, edit, search, or tool |
| `version` | `0.1.10-nightly.20261113.4630` | T3 Code server version |
| `text:<anything>` | `in T3 Code` | literal text |

### Options

| Option | Default | Description |
| --- | --- | --- |
| `clientId` | shared T3 Code app | Discord Application ID |
| `details` | `["thread"]` | fields on the first line |
| `state` | `["modelNameVariant", "status"]` | fields on the second line |
| `separator` | `" · "` | text between fields |
| `timer.enabled` | `true` | show Discord's elapsed timer |
| `timer.source` | `"activity"` | `activity` keeps one session timer, `run` starts one per run |
| `timer.idleResetMinutes` | `30` | idle time that starts a new session timer |
| `hideWhenIdleMinutes` | `60` | hide after this long without a run or visit. Set `0` to never hide. |
| `followFocusedThread` | `true` | show the open thread. Set `false` to show the busiest thread. |
| `pollIntervalMs` | `2000` | database sampling interval |
| `status.labels` | English | names for the eight states |
| `status.approval` | `Needs approval` | label for a pending approval |
| `status.input` | `Needs input` | label for a pending question |
| `prompting.enabled` | `true` | show `Prompting` when you are active and T3 Code is frontmost |
| `prompting.idleSeconds` | `60` | recent input window |
| `prompting.frontmostOnly` | `true` | require an app from `prompting.apps` to be frontmost |
| `prompting.apps` | T3 Code, terminals, browsers | frontmost app allow-list |
| `largeImage.key` | built-in T3 icon | Discord asset key or URL |
| `largeImage.text` | `"T3 Code"` | hover text |
| `smallImage.enabled` | `false` | show a provider icon |
| `smallImage.providerIcons` | `{}` | asset keys or URLs by provider ID |
| `debug` | `false` | add details to `~/.local/state/rich-t3code/rich-t3code.log` |
| `t3Home` | `~/.t3` | T3 Code data directory |

### Examples

Default:

```json
{ "details": ["thread"], "state": ["modelNameVariant", "status"] }
```

Show the current command and project:

```json
{ "details": ["project"], "state": ["tool", "status"] }
```

Hide the thread title:

```json
{ "details": ["status"], "state": ["modelNameVariant"] }
```

### Icon

[`assets/t3code-icon.png`](assets/t3code-icon.png) comes from the T3 Code app icon. The default `largeImage.key` uses it through `images.weserv.nl`.

To use your own Discord app, create one at [discord.com/developers/applications](https://discord.com/developers/applications), copy the Application ID, and run `rich-t3code init --force --client-id <id>`. To use an app-owned image, upload the icon under Rich Presence, then Art Assets, with the key `logo`, and set `"largeImage": { "key": "logo", "text": "T3 Code" }`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `RICH_T3CODE_CLIENT_ID` | Discord Application ID |
| `T3CODE_HOME` | T3 Code data directory |

Flags win over environment variables. Environment variables win over the config file.

## How it works

The daemon reads `<T3 home>/userdata/statev2.sqlite` read-only every two seconds and builds one card.

| Card state | Source |
| --- | --- |
| `Needs approval` | pending tool or permission request |
| `Needs input` | pending `user_input` request |
| `Starting` | run is `queued`, `preparing`, or `starting` |
| `Planning` | plan or todo-list item is running |
| `Thinking` | model is reasoning, or the run is between steps |
| `Working` | command, edit, search, tool, or subagent is running |
| `Prompting` | thread is idle, input happened recently, allowed app is frontmost |
| `Idle` | nothing is running |
| `Failed` | latest run failed in the last five minutes |

The card shows the most recently visited thread (`lastVisitedAt`). T3 Code updates that value at least every ten seconds while a thread is open. A thread waiting for approval or input takes over the card. Set `followFocusedThread` to `false` to show the busiest thread instead.

The timer starts with the first activity of the session. `timer.idleResetMinutes` starts a new session after a long idle stretch. Set `timer.source` to `run` to time the current agent run.

The daemon hides the card while T3 Code is not running, and after `hideWhenIdleMinutes` with no run or visit.

T3 Code does not store token counts or prices in this table, so the card does not show them. The reader uses the orchestration v2 tables and reports an error if the schema changes.

## Troubleshooting

If the card does not appear, check that the Discord desktop app is running, Activity Privacy is on, and `rich-t3code status` finds the IPC socket.

If `T3 Code server` is not running, start T3 Code or run `t3 serve`. For a custom data directory, set `T3CODE_HOME` or `t3Home`.

If the card shows `Idle` while an agent runs, the open thread is idle. Add the `agents` field or set `followFocusedThread` to `false`.

If the provider icon is missing, set `smallImage.enabled` and add `smallImage.providerIcons`.

If the service does nothing, read `~/.local/state/rich-t3code/rich-t3code.log` and `rich-t3code.err.log`.

For a remote T3 Code server, run the daemon on that machine with the same `T3CODE_HOME`.

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

`start --dry-run` prints the card without connecting to Discord. `preview` shows the live card, or a sample when T3 Code is closed.

## License

MIT. See [LICENSE](LICENSE).
