#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configDir, loadConfig, resolveT3Home, stateDir, writeDefaultConfig } from "./config.js";
import { deriveCard, type DeriveState } from "./derive.js";
import { runDaemon, type DaemonSample } from "./daemon.js";
import { createLogger } from "./log.js";
import { resolveOptions, type RichOptions } from "./options.js";
import { PresenceClient } from "./presence/client.js";
import { renderPresence } from "./render.js";
import { cliEntryPath, installService, serviceInstalled, uninstallService } from "./service.js";
import { findDiscordIpc, discordSocketHint } from "./system.js";
import { readT3Snapshot } from "./t3/snapshot.js";
import type { CardView, T3Snapshot, T3Thread } from "./types.js";
import { buildActivity } from "./activity.js";

const HELP = `rich-t3code: Discord Rich Presence for T3 Code

Usage:
  rich-t3code [start] [options]      Start the presence daemon in the foreground
  rich-t3code status [--json]        Show the current card and T3 Code state
  rich-t3code preview [--seconds N]  Show a sample card in Discord
  rich-t3code init [--client-id ID]  Write a default config file
  rich-t3code doctor                 Check config, Discord IPC and T3 Code state
  rich-t3code install                Install a launchd or systemd login service
  rich-t3code uninstall              Remove the login service

Options:
  --config <path>       Config file. Default: ${join(configDir(), "config.json")}
  --client-id <id>      Discord Application ID
  --t3-home <path>      T3 Code data directory. Default: $T3CODE_HOME or ~/.t3
  --dry-run             Print the card without connecting to Discord
  --verbose             Log polling details to stderr
  --json                Machine-readable output for status/dry-run
  --force               Overwrite an existing config in init
  -h, --help            Show this help
  --version             Show the version

Docs: https://github.com/YonCZ/T3Code-Presence
`;

class CliError extends Error {
  override name = "CliError";
}

interface Flags {
  config?: string;
  clientId?: string;
  t3Home?: string;
  seconds?: string;
  dryRun: boolean;
  verbose: boolean;
  json: boolean;
  force: boolean;
  help: boolean;
  version: boolean;
  noLock: boolean;
}

const BOOLEAN_FLAGS = new Set(["dry-run", "verbose", "json", "force", "help", "version", "no-lock"]);
const VALUE_FLAGS = new Set(["config", "client-id", "t3-home", "seconds"]);

function parseArgs(argv: string[]): { command: string; flags: Flags; rest: string[] } {
  let command = "start";
  const rest: string[] = [];
  let index = 0;

  if (argv[0] && !argv[0].startsWith("-")) {
    command = argv[0];
    index = 1;
  }

  const flags: Flags = {
    dryRun: false,
    verbose: false,
    json: false,
    force: false,
    help: false,
    version: false,
    noLock: false,
  };

  for (; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }

    const equals = arg.indexOf("=");
    const key = arg.slice(2, equals === -1 ? undefined : equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);

    if (BOOLEAN_FLAGS.has(key)) {
      if (inline !== undefined) throw new CliError(`Flag --${key} does not take a value.`);
      switch (key) {
        case "dry-run":
          flags.dryRun = true;
          break;
        case "verbose":
          flags.verbose = true;
          break;
        case "json":
          flags.json = true;
          break;
        case "force":
          flags.force = true;
          break;
        case "help":
          flags.help = true;
          break;
        case "version":
          flags.version = true;
          break;
        case "no-lock":
          flags.noLock = true;
          break;
      }
      continue;
    }

    if (VALUE_FLAGS.has(key)) {
      const value = inline ?? argv[++index];
      if (value === undefined || value.startsWith("--")) {
        throw new CliError(`Flag --${key} needs a value.`);
      }
      switch (key) {
        case "config":
          flags.config = value;
          break;
        case "client-id":
          flags.clientId = value;
          break;
        case "t3-home":
          flags.t3Home = value;
          break;
        case "seconds":
          flags.seconds = value;
          break;
      }
      continue;
    }

    throw new CliError(`Unknown flag: --${key}`);
  }

  return { command, flags, rest };
}

function packageVersion(): string {
  try {
    const raw: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    if (typeof raw === "object" && raw !== null && typeof (raw as { version?: unknown }).version === "string") {
      return (raw as { version: string }).version;
    }
  } catch {
    // fall through
  }
  return "0.0.0";
}

function overrides(flags: Flags): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (flags.clientId) values.clientId = flags.clientId;
  if (flags.t3Home) values.t3Home = flags.t3Home;
  return values;
}

function load(flags: Flags) {
  return loadConfig({ ...(flags.config ? { configPath: flags.config } : {}), overrides: overrides(flags) });
}

function loggerFor(options: RichOptions, verbose: boolean) {
  return createLogger({
    verbose,
    filePath: join(stateDir(), "rich-t3code.log"),
    debug: options.debug,
  });
}

function requireClientId(options: RichOptions): void {
  if (options.clientId.length > 0) return;
  throw new CliError(
    [
      "No Discord Application ID is configured.",
      "",
      "Create an application at https://discord.com/developers/applications",
      "and add a large image with the asset key `logo` under Rich Presence, then Art Assets.",
      "Then do one of these:",
      "",
      "  rich-t3code init --client-id <application-id>",
      "  export RICH_T3CODE_CLIENT_ID=<application-id>",
      '  add "clientId": "<application-id>" to ' + join(configDir(), "config.json"),
    ].join("\n"),
  );
}

function statusCard(snapshot: T3Snapshot, options: RichOptions): { view: CardView; details: string; state?: string } {
  const state: DeriveState = {
    now: Date.now(),
    sessionStartedAt: null,
    systemIdleMs: null,
    frontmostApp: null,
  };
  const view = deriveCard(snapshot, options, state);
  const rendered = renderPresence(view, options);
  return {
    view,
    details: rendered.details,
    ...(rendered.state ? { state: rendered.state } : {}),
  };
}

function activeThreads(snapshot: T3Snapshot): number {
  return snapshot.threads.filter(
    (thread) =>
      thread.parentThreadId === null &&
      ["queued", "preparing", "starting", "running", "waiting"].includes(
        thread.latestRun?.status ?? "",
      ),
  ).length;
}

function cmdStart(flags: Flags): Promise<void> {
  const loaded = load(flags);
  const options = loaded.options;
  if (!flags.dryRun) requireClientId(options);
  const logger = loggerFor(options, flags.verbose);
  const t3Home = resolveT3Home(options);

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  if (!flags.dryRun) {
    process.stderr.write(
      `rich-t3code ${packageVersion()} watching ${t3Home}\nconfig: ${loaded.path}\n`,
    );
  } else {
    process.stderr.write(`rich-t3code dry run · ${t3Home}\n`);
  }

  const onSample = (sample: DaemonSample): void => {
    if (!flags.dryRun) return;
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify({
          status: sample.view.status,
          details: sample.rendered.details,
          state: sample.rendered.state ?? null,
          thread: sample.view.thread?.title ?? null,
          project: sample.view.project?.title ?? null,
          model: sample.view.model,
          agents: sample.view.runningAgents,
          pendingApprovals: sample.view.pendingApprovals,
          pendingUserInputs: sample.view.pendingUserInputs,
          hidden: sample.hidden,
          hiddenReason: sample.hiddenReason,
        })}\n`,
      );
      return;
    }
    const suffix = sample.hidden
      ? ` [hidden: ${sample.hiddenReason ?? "unknown"}]`
      : ` [${sample.view.status}]`;
    const line = [sample.rendered.details, sample.rendered.state].filter(Boolean).join(" | ");
    process.stdout.write(`${line || "no card"}${suffix}\n`);
  };

  return runDaemon({
    options,
    t3Home,
    logger,
    statePath: stateDir(),
    dryRun: flags.dryRun,
    lock: !flags.noLock,
    signal: controller.signal,
    onSample,
  }).finally(() => {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  });
}

function cmdStatus(flags: Flags): void {
  const loaded = load(flags);
  const options = loaded.options;
  const t3Home = resolveT3Home(options);
  const snapshot = readT3Snapshot(t3Home);
  const card = statusCard(snapshot, options);
  const service = serviceInstalled();

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: packageVersion(),
          config: { path: loaded.path, exists: loaded.exists },
          t3Home,
          server: snapshot.server,
          database: { path: snapshot.dbPath, available: snapshot.available, error: snapshot.error },
          threads: {
            total: snapshot.threads.length,
            active: activeThreads(snapshot),
            focused: snapshot.focusedThreadId,
          },
          card,
          service,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const lines: string[] = [];
  lines.push(`rich-t3code ${packageVersion()}`);
  lines.push(`config        ${loaded.path}${loaded.exists ? "" : ". Not created"}`);
  lines.push(`Discord ID    ${options.clientId || "not set"}`);
  lines.push(`T3 home       ${t3Home}`);
  lines.push(
    `T3 server     ${
      snapshot.server.running
        ? `running, pid ${snapshot.server.pid}, ${snapshot.server.version ?? "unknown version"}, port ${snapshot.server.port ?? "?"}`
        : "not running"
    }`,
  );
  lines.push(
    `database      ${
      snapshot.available ? snapshot.dbPath : `${snapshot.dbPath}. ${snapshot.error ?? "Unreadable."}`
    }`,
  );
  lines.push(
    `threads       ${snapshot.threads.length} total · ${activeThreads(snapshot)} running · ${snapshot.threads.reduce((sum, thread) => sum + thread.pendingApprovals + thread.pendingUserInputs, 0)} pending`,
  );
  const focused = snapshot.threads.find((thread) => thread.id === snapshot.focusedThreadId);
  lines.push(`focused       ${focused?.title ?? "none"}`);
  lines.push(`card          ${card.details}${card.state ? ` | ${card.state}` : ""}`);
  lines.push(`Discord IPC   ${findDiscordIpc() ?? `not found. Expected ${discordSocketHint()}`}`);
  lines.push(`service       ${service.installed ? `installed at ${service.path}` : "not installed"}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function sampleThread(): { snapshot: T3Snapshot; thread: T3Thread } {
  const now = Date.now();
  const startedAt = new Date(now - 42 * 60_000).toISOString();
  const thread: T3Thread = {
    id: "preview-thread",
    projectId: "preview-project",
    title: "Ship the Discord Rich Presence integration",
    branch: "main",
    worktreePath: null,
    runtimeMode: "full-access",
    interactionMode: "default",
    model: "opencode/gpt-5.1-codex",
    provider: "codex",
    vendor: "codex",
    variant: "high",
    createdAt: startedAt,
    updatedAt: new Date(now - 20_000).toISOString(),
    lastVisitedAt: new Date(now - 15_000).toISOString(),
    parentThreadId: null,
    latestRun: {
      id: "preview-run",
      status: "running",
      provider: "codex",
      model: "opencode/gpt-5.1-codex",
      variant: "high",
      requestedAt: startedAt,
      startedAt,
      completedAt: null,
    },
    pendingApprovals: 0,
    pendingUserInputs: 0,
    runningItem: {
      type: "reasoning",
      status: "running",
      title: null,
      label: "thinking",
      startedAt: new Date(now - 4_000).toISOString(),
    },
  };
  return {
    thread,
    snapshot: {
      available: true,
      t3Home: resolveT3Home(resolveOptions({})),
      dbPath: "",
      capturedAt: now,
      server: {
        running: true,
        pid: null,
        version: `${packageVersion()} preview`,
        port: null,
        startedAt,
      },
      projects: [
        {
          id: "preview-project",
          title: "rich-t3code",
          workspaceRoot: "/Users/you/Projects/rich-t3code",
        },
      ],
      threads: [thread],
      focusedThreadId: thread.id,
      error: null,
    },
  };
}

async function cmdPreview(flags: Flags): Promise<void> {
  const loaded = load(flags);
  const options = loaded.options;
  requireClientId(options);

  const seconds = Math.min(Math.max(Number(flags.seconds ?? 10) || 10, 1), 300);
  const t3Home = resolveT3Home(options);
  const live = readT3Snapshot(t3Home);
  const snapshot = live.available && live.server.running ? live : sampleThread().snapshot;
  const now = Date.now();
  const state: DeriveState = {
    now,
    sessionStartedAt: now - 42 * 60_000,
    systemIdleMs: null,
    frontmostApp: null,
  };
  const view = deriveCard(snapshot, options, state);
  const rendered = renderPresence(view, options);
  const activity = buildActivity(view, options, rendered);

  const logger = loggerFor(options, flags.verbose);
  const client = new PresenceClient({ clientId: options.clientId, logger });
  client.start();
  const connected = await client.waitForConnection(5_000);
  if (!connected) {
    client.dispose();
    throw new CliError(
      `Could not connect to Discord's local IPC socket. Is the Discord desktop app running?\nExpected ${discordSocketHint()}`,
    );
  }

  client.update(activity);
  process.stderr.write(
    `Showing: ${rendered.details}${rendered.state ? ` | ${rendered.state}` : ""}\nClearing in ${seconds}s...\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, seconds * 1_000));
  client.clear();
  await new Promise((resolve) => setTimeout(resolve, 300));
  client.dispose();
}

function cmdInit(flags: Flags): void {
  const clientId = flags.clientId ?? "";
  const result = writeDefaultConfig(clientId, flags.config, flags.force);
  if (!result.created) {
    process.stdout.write(`Config already exists: ${result.path}\nUse --force to overwrite it.\n`);
    return;
  }
  process.stdout.write(`Wrote ${result.path}\n`);
  if (!clientId) {
    process.stdout.write(
      "\nThe config uses the shared T3 Code Discord app.\n" +
        "To use your own app, run `rich-t3code init --force --client-id <id>`.\n",
    );
  }
}

function cmdDoctor(flags: Flags): void {
  const checks: Array<{ ok: boolean; fatal: boolean; label: string; detail: string }> = [];
  const add = (ok: boolean, label: string, detail: string, fatal = false) =>
    checks.push({ ok, fatal, label, detail });

  const nodeMajor = Number(process.versions.node.split(".")[0] ?? 0);
  add(nodeMajor >= 20, "Node.js", `v${process.versions.node}. Need 20.11 or newer.`, true);

  let options: RichOptions = resolveOptions({});
  let configPath = "";
  try {
    const loaded = load(flags);
    options = loaded.options;
    configPath = loaded.path;
    add(true, "Config", `${loaded.path}${loaded.exists ? "" : ". Missing, so using defaults."}`);
  } catch (error) {
    add(false, "Config", String(error), true);
  }

  add(options.clientId.length > 0, "Discord app ID", options.clientId || "not set", true);

  const ipc = findDiscordIpc();
  add(Boolean(ipc), "Discord IPC", ipc ?? `not found. Expected ${discordSocketHint()}`);

  const t3Home = resolveT3Home(options);
  add(existsSync(t3Home), "T3 Code home", t3Home, true);

  const snapshot = readT3Snapshot(t3Home);
  add(
    snapshot.server.running,
    "T3 Code server",
    snapshot.server.running
      ? `pid ${snapshot.server.pid}, ${snapshot.server.version ?? "unknown version"}`
      : "not running. The presence stays hidden.",
  );
  add(
    snapshot.available,
    "T3 Code database",
    snapshot.available ? snapshot.dbPath : (snapshot.error ?? "unreadable"),
    true,
  );
  add(
    snapshot.available,
    "T3 Code threads",
    `${snapshot.threads.length} readable, ${activeThreads(snapshot)} running`,
    true,
  );

  if (snapshot.available) {
    const card = statusCard(snapshot, options);
    add(true, "Card", `${card.details}${card.state ? ` | ${card.state}` : ""}`);
  }

  const service = serviceInstalled();
  add(
    service.installed,
    "Login service",
    service.installed ? (service.path ?? "installed") : "not installed. Run `rich-t3code install`.",
  );

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ configPath, t3Home, checks }, null, 2)}\n`,
    );
  } else {
    for (const check of checks) {
      const mark = check.ok ? "OK  " : check.fatal ? "FAIL" : "WARN";
      process.stdout.write(`${mark}  ${check.label.padEnd(18)} ${check.detail}\n`);
    }
  }

  if (checks.some((check) => !check.ok && check.fatal)) process.exitCode = 1;
}

function cmdInstall(flags: Flags): void {
  const loaded = load(flags);
  requireClientId(loaded.options);

  if (!loaded.exists) {
    writeDefaultConfig(loaded.options.clientId, loaded.path);
    process.stdout.write(`Wrote ${loaded.path}\n`);
  }

  const cli = cliEntryPath();
  if (!cli.endsWith(".js") || !existsSync(cli)) {
    throw new CliError("Install the built CLI first: npm run build");
  }

  const message = installService({
    nodePath: process.execPath,
    cliPath: cli,
    configPath: loaded.path,
    logDirectory: stateDir(),
  });
  process.stdout.write(`${message}\n`);
  if (process.platform === "darwin") {
    process.stdout.write("Status: launchctl print gui/$(id -u)/com.yoncz.rich-t3code\n");
  } else if (process.platform === "linux") {
    process.stdout.write("Status: systemctl --user status rich-t3code\n");
  }
}

function cmdUninstall(): void {
  process.stdout.write(`${uninstallService()}\n`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (flags.version) {
    process.stdout.write(`rich-t3code ${packageVersion()}\n`);
    return;
  }

  switch (command) {
    case "start":
      await cmdStart(flags);
      break;
    case "status":
      cmdStatus(flags);
      break;
    case "preview":
      await cmdPreview(flags);
      break;
    case "init":
      cmdInit(flags);
      break;
    case "doctor":
      cmdDoctor(flags);
      break;
    case "install":
      cmdInstall(flags);
      break;
    case "uninstall":
      cmdUninstall();
      break;
    default:
      throw new CliError(`Unknown command: ${command}\n\n${HELP}`);
  }
}

void main().catch((error: unknown) => {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`rich-t3code: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
});
