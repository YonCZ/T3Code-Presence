import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  RunningItem,
  T3Project,
  T3Run,
  T3Server,
  T3Snapshot,
  T3Thread,
} from "../types.js";

interface ThreadRow {
  thread_id: string;
  project_id: string;
  title: string;
  default_provider: string | null;
  runtime_mode: string | null;
  interaction_mode: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_visited_at: string | null;
  model: string | null;
  provider_instance: string | null;
  provider_instance_id: string | null;
  model_options: string | null;
  branch: string | null;
  worktree_path: string | null;
  parent_thread_id: string | null;
}

interface RunRow {
  thread_id: string;
  run_id: string;
  status: string;
  provider: string | null;
  provider_instance_id: string | null;
  requested_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  model: string | null;
  model_options: string | null;
}

interface RequestRow {
  thread_id: string;
  approvals: number;
  user_inputs: number;
}

interface ItemRow {
  thread_id: string;
  type: string;
  status: string;
  title: string | null;
  payload_json: string;
  started_at: string | null;
}

interface ProjectRow {
  project_id: string;
  title: string;
  workspace_root: string;
}

const ACTIVE_RUN_STATUSES = new Set([
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting",
]);

function parseJson(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function variantFromOptions(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry !== "object" || entry === null) continue;
        const option = entry as Record<string, unknown>;
        if (option.id === "variant" && typeof option.value === "string") return option.value;
      }
      return null;
    }
    if (typeof parsed === "object" && parsed !== null) {
      const variant = (parsed as Record<string, unknown>).variant;
      return typeof variant === "string" ? variant : null;
    }
  } catch {
    // ignore malformed options
  }
  return null;
}

export function providerFromModel(model: string | null, fallback: string | null): string | null {
  if (model) {
    const slash = model.indexOf("/");
    if (slash > 0) return model.slice(0, slash);
  }
  return fallback;
}

export function modelNameFromId(model: string | null): string | null {
  if (!model) return null;
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

/** Best-effort label for the tool or command that is running right now. */
export function runningItemLabel(type: string, payload: Record<string, unknown>): string {
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
  const title = asString(payload.title);

  switch (type) {
    case "command_execution": {
      const input = asString(payload.input);
      if (input) return collapse(input).slice(0, 64);
      return title ?? "Running a command";
    }
    case "file_change": {
      const fileName = asString(payload.fileName);
      if (fileName) {
        const base = fileName.split(/[\\/]/).filter(Boolean).pop();
        return `editing ${base ?? fileName}`.slice(0, 64);
      }
      return title ?? "Editing files";
    }
    case "file_search": {
      const pattern = asString(payload.pattern);
      return pattern ? `searching ${pattern}`.slice(0, 64) : "Searching files";
    }
    case "web_search": {
      const patterns = payload.patterns;
      if (Array.isArray(patterns) && typeof patterns[0] === "string") {
        return `searching the web`.slice(0, 64);
      }
      return "Searching the web";
    }
    case "dynamic_tool": {
      const toolName = asString(payload.toolName);
      return title ?? toolName ?? "Running a tool";
    }
    case "subagent":
      return title ? `agent: ${title}`.slice(0, 64) : "Delegating to an agent";
    case "assistant_message":
      return "writing";
    case "reasoning":
      return "thinking";
    case "todo_list":
    case "plan":
      return "planning";
    default:
      return title ?? type.replaceAll("_", " ");
  }
}

function toRunningItem(row: ItemRow): RunningItem {
  const payload = parseJson(row.payload_json) ?? {};
  return {
    type: row.type,
    status: row.status,
    title: row.title,
    label: runningItemLabel(row.type, payload),
    startedAt: row.started_at,
  };
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { ok?: number } | undefined;
  return row?.ok === 1;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{
    name?: string;
  }>;
  return rows.some((row) => row.name === column);
}

function pidAlive(pid: number | null): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function t3RuntimePath(t3Home: string): string {
  return join(t3Home, "userdata", "server-runtime.json");
}

export function t3DatabasePath(t3Home: string): string {
  return join(t3Home, "userdata", "statev2.sqlite");
}

export function readServerRuntime(t3Home: string): T3Server {
  const path = t3RuntimePath(t3Home);
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof raw !== "object" || raw === null) {
      return { running: false, pid: null, version: null, port: null, startedAt: null };
    }
    const runtime = raw as Record<string, unknown>;
    const pid = typeof runtime.pid === "number" ? runtime.pid : null;
    return {
      running: pidAlive(pid),
      pid,
      version: asString(runtime.serverVersion),
      port: typeof runtime.port === "number" ? runtime.port : null,
      startedAt: asString(runtime.startedAt),
    };
  } catch {
    return { running: false, pid: null, version: null, port: null, startedAt: null };
  }
}

function emptySnapshot(t3Home: string, dbPath: string, server: T3Server, error: string): T3Snapshot {
  return {
    available: false,
    t3Home,
    dbPath,
    capturedAt: Date.now(),
    server,
    projects: [],
    threads: [],
    focusedThreadId: null,
    error,
  };
}

function readThreads(db: Database.Database): T3Thread[] {
  const threadTable = "orchestration_v2_projection_threads";
  const instanceColumn = columnExists(db, threadTable, "provider_instance_id")
    ? "provider_instance_id"
    : "NULL AS provider_instance_id";

  const rows = db
    .prepare(
      `SELECT thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
              created_at, updated_at,
              json_extract(payload_json, '$.lastVisitedAt') AS last_visited_at,
              json_extract(payload_json, '$.modelSelection.model') AS model,
              json_extract(payload_json, '$.modelSelection.instanceId') AS provider_instance,
              json_extract(payload_json, '$.modelSelection.options') AS model_options,
              json_extract(payload_json, '$.branch') AS branch,
              json_extract(payload_json, '$.worktreePath') AS worktree_path,
              json_extract(payload_json, '$.lineage.parentThreadId') AS parent_thread_id,
              ${instanceColumn}
       FROM ${threadTable}
       WHERE deleted_at IS NULL AND archived_at IS NULL`,
    )
    .all() as ThreadRow[];

  return rows.map((row) => {
    const provider =
      row.provider_instance_id ?? row.provider_instance ?? row.default_provider ?? null;
    return {
      id: row.thread_id,
      projectId: row.project_id,
      title: row.title,
      branch: row.branch,
      worktreePath: row.worktree_path,
      runtimeMode: row.runtime_mode ?? "full-access",
      interactionMode: row.interaction_mode ?? "default",
      model: row.model,
      provider,
      vendor: providerFromModel(row.model, provider),
      variant: variantFromOptions(row.model_options),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastVisitedAt: row.last_visited_at,
      parentThreadId: row.parent_thread_id,
      latestRun: null,
      pendingApprovals: 0,
      pendingUserInputs: 0,
      runningItem: null,
    };
  });
}

function attachRuns(db: Database.Database, threads: Map<string, T3Thread>): void {
  const rows = db
    .prepare(
      `SELECT r.thread_id, r.run_id, r.status, r.provider,
              ${columnExists(db, "orchestration_v2_projection_runs", "provider_instance_id") ? "r.provider_instance_id" : "NULL AS provider_instance_id"},
              r.requested_at,
              json_extract(r.payload_json, '$.startedAt') AS started_at,
              r.completed_at,
              json_extract(r.payload_json, '$.modelSelection.model') AS model,
              json_extract(r.payload_json, '$.modelSelection.options') AS model_options
       FROM orchestration_v2_projection_runs r
       JOIN (
         SELECT thread_id, MAX(ordinal) AS max_ordinal
         FROM orchestration_v2_projection_runs
         GROUP BY thread_id
       ) latest ON latest.thread_id = r.thread_id AND latest.max_ordinal = r.ordinal`,
    )
    .all() as RunRow[];

  for (const row of rows) {
    const thread = threads.get(row.thread_id);
    if (!thread) continue;
    const run: T3Run = {
      id: row.run_id,
      status: row.status,
      provider: row.provider_instance_id ?? row.provider,
      model: row.model ?? thread.model,
      variant: variantFromOptions(row.model_options) ?? thread.variant,
      requestedAt: row.requested_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
    thread.latestRun = run;
    if (run.model) {
      thread.model = run.model;
      thread.vendor = providerFromModel(run.model, thread.provider);
    }
    if (run.variant) thread.variant = run.variant;
  }
}

function attachRequests(db: Database.Database, threads: Map<string, T3Thread>): void {
  const rows = db
    .prepare(
      `SELECT thread_id,
              SUM(CASE WHEN kind = 'user_input' THEN 0 ELSE 1 END) AS approvals,
              SUM(CASE WHEN kind = 'user_input' THEN 1 ELSE 0 END) AS user_inputs
       FROM orchestration_v2_projection_runtime_requests
       WHERE status = 'pending'
       GROUP BY thread_id`,
    )
    .all() as RequestRow[];

  for (const row of rows) {
    const thread = threads.get(row.thread_id);
    if (!thread) continue;
    thread.pendingApprovals = Number(row.approvals) || 0;
    thread.pendingUserInputs = Number(row.user_inputs) || 0;
  }
}

function attachRunningItems(db: Database.Database, threads: Map<string, T3Thread>): void {
  const rows = db
    .prepare(
      `SELECT thread_id, type, status, title, payload_json, started_at FROM (
         SELECT thread_id, type, status,
                json_extract(payload_json, '$.title') AS title,
                payload_json,
                json_extract(payload_json, '$.startedAt') AS started_at,
                ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY ordinal DESC) AS rn
         FROM orchestration_v2_projection_turn_items
         WHERE status IN ('pending', 'running', 'waiting')
       ) WHERE rn = 1`,
    )
    .all() as ItemRow[];

  for (const row of rows) {
    const thread = threads.get(row.thread_id);
    if (!thread) continue;
    thread.runningItem = toRunningItem(row);
  }
}

function readProjects(db: Database.Database): T3Project[] {
  const deletedFilter = columnExists(db, "projection_projects", "deleted_at")
    ? "WHERE deleted_at IS NULL"
    : "";
  const rows = db
    .prepare(
      `SELECT project_id, title, workspace_root FROM projection_projects ${deletedFilter}`,
    )
    .all() as ProjectRow[];
  return rows.map((row) => ({
    id: row.project_id,
    title: row.title,
    workspaceRoot: row.workspace_root,
  }));
}

function newestFirst(a: string | null, b: string | null): number {
  return (Date.parse(b ?? "") || 0) - (Date.parse(a ?? "") || 0);
}

export function focusedThread(threads: readonly T3Thread[]): T3Thread | null {
  let best: T3Thread | null = null;
  let bestVisited = -1;
  for (const thread of threads) {
    const visited = Date.parse(thread.lastVisitedAt ?? "") || 0;
    if (visited <= 0) continue;
    if (visited > bestVisited) {
      best = thread;
      bestVisited = visited;
    } else if (visited === bestVisited && newestFirst(thread.updatedAt, best?.updatedAt ?? null) < 0) {
      best = thread;
    }
  }
  return best;
}

/**
 * Read a consistent snapshot of T3 Code's local projection database.
 * The database is opened read-only and never written to.
 */
export function readT3Snapshot(t3Home: string): T3Snapshot {
  const dbPath = t3DatabasePath(t3Home);
  const server = readServerRuntime(t3Home);

  if (!existsSync(dbPath)) {
    return emptySnapshot(t3Home, dbPath, server, `T3 Code database not found at ${dbPath}`);
  }

  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1_500 });
  } catch (error) {
    return emptySnapshot(t3Home, dbPath, server, `Could not open ${dbPath}: ${String(error)}`);
  }

  try {
    db.pragma("query_only = true");
    db.pragma("busy_timeout = 1000");

    if (!tableExists(db, "orchestration_v2_projection_threads")) {
      return emptySnapshot(
        t3Home,
        dbPath,
        server,
        "This T3 Code database has no orchestration v2 tables. Update T3 Code to 0.1 or newer.",
      );
    }

    const threads = readThreads(db);
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    attachRuns(db, byId);
    attachRequests(db, byId);
    attachRunningItems(db, byId);

    const focus = focusedThread(threads);

    return {
      available: true,
      t3Home,
      dbPath,
      capturedAt: Date.now(),
      server,
      projects: readProjects(db),
      threads,
      focusedThreadId: focus?.id ?? null,
      error: null,
    };
  } catch (error) {
    return emptySnapshot(t3Home, dbPath, server, `Could not read T3 Code state: ${String(error)}`);
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

export function isRunActive(status: string | null | undefined): boolean {
  return typeof status === "string" && ACTIVE_RUN_STATUSES.has(status);
}
