import type { PresenceStatus, RichOptions } from "./options.js";
import type { CardView, T3Snapshot, T3Thread } from "./types.js";
import { isRunActive } from "./t3/snapshot.js";

const FAILED_WINDOW_MS = 5 * 60_000;

const WORKING_ITEM_TYPES = new Set([
  "command_execution",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
  "tool_call",
  "mcp_tool_call",
  "subagent",
  "assistant_message",
]);

function time(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function threadNeedsAttention(thread: T3Thread): boolean {
  return thread.pendingApprovals > 0 || thread.pendingUserInputs > 0;
}

function runningAgents(threads: readonly T3Thread[]): number {
  return threads.filter((thread) => thread.parentThreadId === null && isRunActive(thread.latestRun?.status))
    .length;
}

function byRecency(a: T3Thread, b: T3Thread): number {
  return time(b.updatedAt) - time(a.updatedAt) || time(b.lastVisitedAt) - time(a.lastVisitedAt);
}

/**
 * Pick the thread the card shows:
 * 1. a thread that needs an approval or an answer, so it appears even in the background;
 * 2. the thread open in the T3 Code window;
 * 3. the most recently updated running thread;
 * 4. the most recently updated thread.
 */
export function chooseThread(
  snapshot: T3Snapshot,
  options: RichOptions,
): T3Thread | null {
  const threads = [...snapshot.threads];
  if (threads.length === 0) return null;

  const attention = threads
    .filter(threadNeedsAttention)
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  const firstAttention = attention[0];
  if (firstAttention) return firstAttention;

  const focused = snapshot.focusedThreadId
    ? (threads.find((thread) => thread.id === snapshot.focusedThreadId) ?? null)
    : null;

  if (options.followFocusedThread && focused) return focused;

  const running = threads
    .filter((thread) => isRunActive(thread.latestRun?.status))
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  const firstRunning = running[0];
  if (firstRunning) return firstRunning;

  if (focused) return focused;

  return threads.sort(byRecency)[0] ?? null;
}

export function deriveThreadStatus(thread: T3Thread, now: number): PresenceStatus {
  if (threadNeedsAttention(thread)) return "waiting";

  const run = thread.latestRun;
  if (!run) return "idle";

  if (run.status === "queued" || run.status === "preparing" || run.status === "starting") {
    return "starting";
  }

  if (run.status === "failed") {
    const failedAt = time(run.completedAt);
    if (failedAt === 0 || now - failedAt < FAILED_WINDOW_MS) return "failed";
    return "idle";
  }

  if (run.status === "running" || run.status === "waiting") {
    const item = thread.runningItem;
    if (!item) return "thinking";
    if (item.type === "reasoning") return "thinking";
    if (item.type === "plan" || item.type === "todo_list") return "planning";
    if (item.type === "approval_request" || item.type === "user_input_request") return "waiting";
    if (WORKING_ITEM_TYPES.has(item.type)) return "working";
    return "working";
  }

  return "idle";
}

export interface DeriveState {
  now: number;
  /** Start of the activity timer, managed by the daemon. */
  sessionStartedAt: number | null;
  /** Seconds since the last keyboard/mouse input, macOS only. */
  systemIdleMs: number | null;
  frontmostApp: string | null;
}

function latestActivity(snapshot: T3Snapshot): number {
  let latest = 0;
  for (const thread of snapshot.threads) {
    latest = Math.max(
      latest,
      time(thread.updatedAt),
      time(thread.lastVisitedAt),
      time(thread.latestRun?.startedAt),
      time(thread.latestRun?.completedAt),
      time(thread.runningItem?.startedAt),
    );
  }
  return latest;
}

export function shouldPrompt(options: RichOptions, state: DeriveState): boolean {
  if (!options.prompting.enabled) return false;
  if (state.systemIdleMs === null) return false;
  if (state.systemIdleMs >= options.prompting.idleSeconds * 1_000) return false;
  if (!options.prompting.frontmostOnly) return true;
  if (state.frontmostApp === null) return false;
  return options.prompting.apps.includes(state.frontmostApp);
}

export function deriveCard(snapshot: T3Snapshot, options: RichOptions, state: DeriveState): CardView {
  const thread = chooseThread(snapshot, options);
  const project = thread
    ? (snapshot.projects.find((entry) => entry.id === thread.projectId) ?? null)
    : null;

  let status: PresenceStatus = thread ? deriveThreadStatus(thread, state.now) : "idle";
  if (status === "idle" && shouldPrompt(options, state)) status = "prompting";

  const runStartedAt = time(thread?.latestRun?.startedAt ?? thread?.latestRun?.requestedAt);
  const activityStartedAt =
    options.timer.source === "run"
      ? runStartedAt || state.sessionStartedAt
      : state.sessionStartedAt;

  return {
    thread,
    project,
    status,
    model: thread?.model ?? null,
    provider: thread?.provider ?? null,
    vendor: thread?.vendor ?? null,
    variant: thread?.variant ?? null,
    runningAgents: runningAgents(snapshot.threads),
    pendingApprovals: thread?.pendingApprovals ?? 0,
    pendingUserInputs: thread?.pendingUserInputs ?? 0,
    tool: thread?.runningItem?.label ?? null,
    activityStartedAt,
    runStartedAt: runStartedAt || null,
    lastActivityAt: latestActivity(snapshot) || null,
    server: snapshot.server,
    t3Home: snapshot.t3Home,
  };
}
