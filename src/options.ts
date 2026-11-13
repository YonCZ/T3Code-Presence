/** Everything the card can show. Add `text:...` for a literal. */
export type LineField =
  | "thread"
  | "project"
  | "model"
  | "modelName"
  | "provider"
  | "vendor"
  | "variant"
  | "status"
  | "agents"
  | "pending"
  | "mode"
  | "branch"
  | "tool"
  | "version"
  | `text:${string}`;

export type PresenceStatus =
  | "starting"
  | "thinking"
  | "working"
  | "planning"
  | "waiting"
  | "prompting"
  | "idle"
  | "failed";

export interface StatusOptions {
  labels: Record<PresenceStatus, string>;
  /** Label used when the open thread is waiting for an approval. */
  approval: string;
  /** Label used when the open thread is waiting for an answer. */
  input: string;
}

export interface TimerOptions {
  enabled: boolean;
  /**
   * `activity` keeps one timer across a T3 Code session and resets after a long
   * idle stretch. `run` starts the timer when the current agent run started.
   */
  source: "activity" | "run";
  /** A continuous idle stretch this long starts a new activity timer. */
  idleResetMinutes: number;
}

export interface PromptingOptions {
  enabled: boolean;
  /** Keyboard/mouse input within this window counts as "Prompting". */
  idleSeconds: number;
  /** Require one of `apps` to be frontmost (macOS only). */
  frontmostOnly: boolean;
  apps: string[];
}

export interface ImageOptions {
  key: string;
  text: string;
}

export interface SmallImageOptions {
  enabled: boolean;
  /** Discord asset keys or URLs by provider id. */
  providerIcons: Record<string, string>;
}

export interface RichOptions {
  /** Discord application id. Required for the RPC handshake. */
  clientId: string;
  /** First line fields, in order. */
  details: LineField[];
  /** Second line fields, in order. */
  state: LineField[];
  separator: string;
  status: StatusOptions;
  timer: TimerOptions;
  /** Hide the card after this many minutes without a run or a visit. 0 keeps it. */
  hideWhenIdleMinutes: number;
  /** Follow the thread open in the T3 Code window instead of the busiest one. */
  followFocusedThread: boolean;
  /** How often the T3 Code database is sampled. */
  pollIntervalMs: number;
  prompting: PromptingOptions;
  largeImage: ImageOptions;
  smallImage: SmallImageOptions;
  /** Explicit T3 Code data directory. Omit to use T3CODE_HOME or ~/.t3. */
  t3Home?: string;
  debug: boolean;
}

export const DEFAULT_PROMPTING_APPS = [
  "T3 Code",
  "T3 Code (Nightly)",
  "T3 Code (Beta)",
  "Terminal",
  "iTerm2",
  "iTerm",
  "Ghostty",
  "Warp",
  "Alacritty",
  "kitty",
  "WezTerm",
  "Hyper",
  "Tabby",
  "Rio",
  "Code",
  "Cursor",
  "Windsurf",
  "Zed",
  "Safari",
  "Google Chrome",
  "Chrome",
  "Arc",
  "Brave Browser",
  "Microsoft Edge",
  "Firefox",
  "Orion",
  "Zen",
];

export const T3CODE_ICON_URL =
  "https://images.weserv.nl/?url=raw.githubusercontent.com/YonCZ/rich-t3code/main/assets/t3code-icon.png&output=png&w=512&h=512";

export const DEFAULT_OPTIONS: RichOptions = {
  clientId: "",
  details: ["project", "thread"],
  state: ["model", "status"],
  separator: " \u00b7 ",
  status: {
    labels: {
      starting: "Starting",
      thinking: "Thinking",
      working: "Working",
      planning: "Planning",
      waiting: "Needs you",
      prompting: "Prompting",
      idle: "Idle",
      failed: "Failed",
    },
    approval: "Needs approval",
    input: "Needs input",
  },
  timer: { enabled: true, source: "activity", idleResetMinutes: 30 },
  hideWhenIdleMinutes: 60,
  followFocusedThread: true,
  pollIntervalMs: 2_000,
  prompting: {
    enabled: true,
    idleSeconds: 60,
    frontmostOnly: true,
    apps: DEFAULT_PROMPTING_APPS,
  },
  largeImage: { key: T3CODE_ICON_URL, text: "T3 Code" },
  smallImage: { enabled: false, providerIcons: {} },
  debug: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function fields(value: unknown, fallback: LineField[]): LineField[] {
  if (!Array.isArray(value)) return fallback;
  const parsed = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? (parsed as LineField[]) : fallback;
}

function strings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const parsed = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
  return parsed.length > 0 ? parsed : fallback;
}

/** Merge user options over the defaults, ignoring invalid values. */
export function resolveOptions(raw: unknown): RichOptions {
  const input = isRecord(raw) ? raw : {};
  const status = isRecord(input.status) ? input.status : {};
  const labels = isRecord(status.labels) ? status.labels : {};
  const timer = isRecord(input.timer) ? input.timer : {};
  const prompting = isRecord(input.prompting) ? input.prompting : {};
  const largeImage = isRecord(input.largeImage) ? input.largeImage : {};
  const smallImage = isRecord(input.smallImage) ? input.smallImage : {};

  const resolved: RichOptions = {
    clientId: typeof input.clientId === "string" ? input.clientId.trim() : "",
    details: fields(input.details, DEFAULT_OPTIONS.details),
    state: fields(input.state, DEFAULT_OPTIONS.state),
    separator: str(input.separator, DEFAULT_OPTIONS.separator),
    status: {
      labels: {
        starting: str(labels.starting, DEFAULT_OPTIONS.status.labels.starting),
        thinking: str(labels.thinking, DEFAULT_OPTIONS.status.labels.thinking),
        working: str(labels.working, DEFAULT_OPTIONS.status.labels.working),
        planning: str(labels.planning, DEFAULT_OPTIONS.status.labels.planning),
        waiting: str(labels.waiting, DEFAULT_OPTIONS.status.labels.waiting),
        prompting: str(labels.prompting, DEFAULT_OPTIONS.status.labels.prompting),
        idle: str(labels.idle, DEFAULT_OPTIONS.status.labels.idle),
        failed: str(labels.failed, DEFAULT_OPTIONS.status.labels.failed),
      },
      approval: str(status.approval, DEFAULT_OPTIONS.status.approval),
      input: str(status.input, DEFAULT_OPTIONS.status.input),
    },
    timer: {
      enabled: bool(timer.enabled, DEFAULT_OPTIONS.timer.enabled),
      source: timer.source === "run" ? "run" : "activity",
      idleResetMinutes: num(
        timer.idleResetMinutes,
        DEFAULT_OPTIONS.timer.idleResetMinutes,
        1,
        1_440,
      ),
    },
    hideWhenIdleMinutes: num(
      input.hideWhenIdleMinutes,
      DEFAULT_OPTIONS.hideWhenIdleMinutes,
      0,
      10_080,
    ),
    followFocusedThread: bool(input.followFocusedThread, DEFAULT_OPTIONS.followFocusedThread),
    pollIntervalMs: num(input.pollIntervalMs, DEFAULT_OPTIONS.pollIntervalMs, 500, 60_000),
    prompting: {
      enabled: bool(prompting.enabled, DEFAULT_OPTIONS.prompting.enabled),
      idleSeconds: num(prompting.idleSeconds, DEFAULT_OPTIONS.prompting.idleSeconds, 5, 3_600),
      frontmostOnly: bool(prompting.frontmostOnly, DEFAULT_OPTIONS.prompting.frontmostOnly),
      apps: strings(prompting.apps, DEFAULT_OPTIONS.prompting.apps),
    },
    largeImage: {
      key: str(largeImage.key, DEFAULT_OPTIONS.largeImage.key),
      text: str(largeImage.text, DEFAULT_OPTIONS.largeImage.text),
    },
    smallImage: {
      enabled: bool(smallImage.enabled, DEFAULT_OPTIONS.smallImage.enabled),
      providerIcons: isRecord(smallImage.providerIcons)
        ? Object.fromEntries(
            Object.entries(smallImage.providerIcons).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" && entry[1].length > 0,
            ),
          )
        : {},
    },
    debug: bool(input.debug, DEFAULT_OPTIONS.debug),
  };

  const t3Home = typeof input.t3Home === "string" ? input.t3Home.trim() : "";
  if (t3Home.length > 0) resolved.t3Home = t3Home;
  return resolved;
}
