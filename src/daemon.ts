import { statSync } from "node:fs";
import { buildActivity } from "./activity.js";
import type { RichOptions } from "./options.js";
import { deriveCard, type DeriveState } from "./derive.js";
import { renderPresence, type RenderedPresence } from "./render.js";
import { PresenceClient, type ActivityPayload } from "./presence/client.js";
import { InstanceLock } from "./lock.js";
import { readT3Snapshot } from "./t3/snapshot.js";
import { readFrontmostApp, readSystemIdleMs } from "./system.js";
import type { CardView, T3Snapshot } from "./types.js";
import type { Logger } from "./log.js";

const OS_PROBE_MS = 5_000;
const DB_FRESH_MS = 90_000;

export interface DaemonSample {
  snapshot: T3Snapshot;
  view: CardView;
  rendered: RenderedPresence;
  activity: ActivityPayload | null;
  hidden: boolean;
  hiddenReason: string | null;
}

export interface RunDaemonOptions {
  options: RichOptions;
  t3Home: string;
  logger: Logger;
  statePath: string;
  dryRun?: boolean;
  lock?: boolean;
  signal?: AbortSignal;
  onSample?: (sample: DaemonSample) => void;
}

export interface DaemonHandle {
  stop(): Promise<void>;
  done: Promise<void>;
}

function dbFresh(dbPath: string): boolean {
  let latest = 0;
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      latest = Math.max(latest, statSync(candidate).mtimeMs);
    } catch {
      // the file may not exist
    }
  }
  return latest > 0 && Date.now() - latest < DB_FRESH_MS;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export async function runDaemon(run: RunDaemonOptions): Promise<void> {
  const { options, logger } = run;
  const dryRun = run.dryRun ?? false;

  if (!dryRun && options.clientId.length === 0) {
    throw new Error(
      "No Discord Application ID configured. Set clientId in the config file or RICH_T3CODE_CLIENT_ID.",
    );
  }

  const lock = new InstanceLock(run.statePath);
  if (run.lock !== false && !lock.acquire()) {
    throw new Error(`Another rich-t3code instance is already running. Lock: ${lock.path}.`);
  }

  const presence = dryRun ? null : new PresenceClient({ clientId: options.clientId, logger });
  presence?.start();

  const controller = new AbortController();
  const abort = () => controller.abort();
  run.signal?.addEventListener("abort", abort, { once: true });

  let sessionStartedAt: number | null = null;
  let idleSince: number | null = null;
  let systemIdleMs: number | null = null;
  let frontmostApp: string | null = null;
  let nextOsProbe = 0;
  let lastStatus = "";
  let lastHidden: boolean | null = null;
  let stopped = false;

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    run.signal?.removeEventListener("abort", abort);
    if (presence) {
      presence.clear();
      await sleep(250);
      presence.dispose();
    }
    lock.release();
  };

  const done = (async () => {
    while (!controller.signal.aborted) {
      const now = Date.now();
      try {
        if (options.prompting.enabled && now >= nextOsProbe) {
          nextOsProbe = now + OS_PROBE_MS;
          systemIdleMs = await readSystemIdleMs();
          frontmostApp =
            systemIdleMs !== null && systemIdleMs < options.prompting.idleSeconds * 1_000
              ? await readFrontmostApp()
              : null;
        }

        const snapshot = readT3Snapshot(run.t3Home);
        const serverUp =
          snapshot.available && (snapshot.server.running || dbFresh(snapshot.dbPath));

        if (!serverUp) {
          if (lastHidden !== true) {
            logger.info("hidden", {
              reason: snapshot.error ?? "T3 Code is not running",
            });
            presence?.clear();
          }
          lastHidden = true;

          const state: DeriveState = {
            now,
            sessionStartedAt,
            systemIdleMs,
            frontmostApp,
          };
          const view = deriveCard(snapshot, options, state);
          const rendered = renderPresence(view, options);
          run.onSample?.({
            snapshot,
            view,
            rendered,
            activity: null,
            hidden: true,
            hiddenReason: snapshot.error ?? "T3 Code is not running",
          });
          await sleep(options.pollIntervalMs, controller.signal);
          continue;
        }

        const state: DeriveState = { now, sessionStartedAt, systemIdleMs, frontmostApp };
        const view = deriveCard(snapshot, options, state);
        const idle = view.status === "idle" || view.status === "prompting";

        if (idle) {
          if (idleSince === null) idleSince = now;
          if (now - idleSince >= options.timer.idleResetMinutes * 60_000) {
            sessionStartedAt = null;
          }
        } else {
          idleSince = null;
          if (sessionStartedAt === null) sessionStartedAt = now;
        }

        view.activityStartedAt =
          options.timer.source === "run"
            ? view.runStartedAt || sessionStartedAt
            : sessionStartedAt;

        const staleFor =
          options.hideWhenIdleMinutes > 0 && view.lastActivityAt
            ? now - view.lastActivityAt
            : 0;
        const hiddenByAge =
          idle && staleFor > options.hideWhenIdleMinutes * 60_000;

        const rendered = renderPresence(view, options);
        const activity = hiddenByAge ? null : buildActivity(view, options, rendered);

        if (hiddenByAge) {
          if (lastHidden !== true) {
            logger.info("hidden", { reason: "idle timeout" });
            presence?.clear();
          }
          lastHidden = true;
        } else {
          lastHidden = false;
          if (activity) presence?.update(activity);
        }

        if (view.status !== lastStatus) {
          logger.info("status", {
            status: view.status,
            thread: view.thread?.title ?? null,
            agents: view.runningAgents,
            details: rendered.details,
            state: rendered.state ?? null,
          });
          lastStatus = view.status;
        }

        run.onSample?.({
          snapshot,
          view,
          rendered,
          activity,
          hidden: hiddenByAge,
          hiddenReason: hiddenByAge ? "idle timeout" : null,
        });
      } catch (error) {
        logger.error("tick.failed", { error: String(error) });
      }

      await sleep(options.pollIntervalMs, controller.signal);
    }
  })();

  try {
    await done;
  } finally {
    await stop();
  }
}

/** Run until the abort signal fires, returning a handle for callers that need one. */
export function startDaemon(run: RunDaemonOptions): DaemonHandle {
  const controller = new AbortController();
  const forwarded = run.signal;
  const abort = () => controller.abort();
  forwarded?.addEventListener("abort", abort, { once: true });
  const done = runDaemon({ ...run, signal: controller.signal }).finally(() => {
    forwarded?.removeEventListener("abort", abort);
  });
  return {
    stop: async () => {
      controller.abort();
      await done;
    },
    done,
  };
}
