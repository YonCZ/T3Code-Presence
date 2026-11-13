import assert from "node:assert/strict";
import test from "node:test";
import { chooseThread, deriveCard, deriveThreadStatus, threadNeedsAttention } from "../src/derive.js";
import { resolveOptions } from "../src/options.js";
import type { T3Snapshot, T3Thread } from "../src/types.js";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");

function iso(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function thread(overrides: Partial<T3Thread> = {}): T3Thread {
  return {
    id: "t1",
    projectId: "p1",
    title: "Thread",
    branch: null,
    worktreePath: null,
    runtimeMode: "full-access",
    interactionMode: "default",
    model: "einfra/deepseek-v4.1-flash",
    provider: "opencode",
    vendor: "einfra",
    variant: "high",
    createdAt: iso(100),
    updatedAt: iso(1),
    lastVisitedAt: iso(1),
    parentThreadId: null,
    latestRun: {
      id: "r1",
      status: "running",
      provider: "opencode",
      model: null,
      variant: null,
      requestedAt: iso(2),
      startedAt: iso(2),
      completedAt: null,
    },
    pendingApprovals: 0,
    pendingUserInputs: 0,
    runningItem: {
      type: "reasoning",
      status: "running",
      title: null,
      label: "thinking",
      startedAt: iso(1),
    },
    ...overrides,
  };
}

function snapshot(threads: T3Thread[], focusedThreadId: string | null = null): T3Snapshot {
  return {
    available: true,
    t3Home: "/tmp/t3",
    dbPath: "/tmp/t3/userdata/statev2.sqlite",
    capturedAt: NOW,
    server: { running: true, pid: 1, version: "0.1.10", port: 3773, startedAt: null },
    projects: [{ id: "p1", title: "rich-t3code", workspaceRoot: "/tmp/rich-t3code" }],
    threads,
    focusedThreadId,
    error: null,
  };
}

test("needs attention flags", () => {
  assert.equal(threadNeedsAttention(thread({ pendingApprovals: 1 })), true);
  assert.equal(threadNeedsAttention(thread({ pendingUserInputs: 1 })), true);
  assert.equal(threadNeedsAttention(thread()), false);
});

test("status derivation", () => {
  assert.equal(deriveThreadStatus(thread({ pendingApprovals: 1 }), NOW), "waiting");
  assert.equal(deriveThreadStatus(thread({ pendingUserInputs: 1 }), NOW), "waiting");
  assert.equal(deriveThreadStatus(thread({ latestRun: null }), NOW), "idle");
  assert.equal(
    deriveThreadStatus(
      thread({ latestRun: { ...thread().latestRun!, status: "queued" } }),
      NOW,
    ),
    "starting",
  );
  assert.equal(
    deriveThreadStatus(
      thread({ latestRun: { ...thread().latestRun!, status: "preparing" } }),
      NOW,
    ),
    "starting",
  );
  assert.equal(deriveThreadStatus(thread(), NOW), "thinking");
  assert.equal(
    deriveThreadStatus(
      thread({
        runningItem: {
          type: "command_execution",
          status: "running",
          title: null,
          label: "npm test",
          startedAt: iso(1),
        },
      }),
      NOW,
    ),
    "working",
  );
  assert.equal(
    deriveThreadStatus(
      thread({
        runningItem: {
          type: "todo_list",
          status: "running",
          title: null,
          label: "planning",
          startedAt: iso(1),
        },
      }),
      NOW,
    ),
    "planning",
  );
  assert.equal(
    deriveThreadStatus(
      thread({
        latestRun: {
          ...thread().latestRun!,
          status: "failed",
          completedAt: iso(2),
        },
      }),
      NOW,
    ),
    "failed",
  );
  assert.equal(
    deriveThreadStatus(
      thread({
        latestRun: {
          ...thread().latestRun!,
          status: "failed",
          completedAt: iso(60),
        },
      }),
      NOW,
    ),
    "idle",
  );
});

test("attention thread wins over focus", () => {
  const focused = thread({ id: "focused", updatedAt: iso(5) });
  const attention = thread({ id: "attention", pendingApprovals: 1, updatedAt: iso(10) });
  const options = resolveOptions({ followFocusedThread: true });
  assert.equal(chooseThread(snapshot([focused, attention], "focused"), options)?.id, "attention");
});

test("focused thread wins when nothing needs attention", () => {
  const focused = thread({ id: "focused", updatedAt: iso(30) });
  const running = thread({ id: "running", updatedAt: iso(1) });
  const options = resolveOptions({ followFocusedThread: true });
  assert.equal(chooseThread(snapshot([focused, running], "focused"), options)?.id, "focused");
});

test("busy thread wins when focus following is off", () => {
  const focused = thread({ id: "focused", updatedAt: iso(30) });
  const running = thread({ id: "running", updatedAt: iso(1) });
  const options = resolveOptions({ followFocusedThread: false });
  assert.equal(chooseThread(snapshot([focused, running], "focused"), options)?.id, "running");
});

test("falls back to the newest thread", () => {
  const older = thread({ id: "older", updatedAt: iso(10), lastVisitedAt: null });
  const newer = thread({ id: "newer", updatedAt: iso(2), lastVisitedAt: null });
  const options = resolveOptions({});
  assert.equal(chooseThread(snapshot([older, newer], null), options)?.id, "newer");
});

test("prompting only when idle and recently active in an allowed app", () => {
  const idle = thread({ latestRun: null });
  const options = resolveOptions({ prompting: { enabled: true, frontmostOnly: true } });
  const card = deriveCard(snapshot([idle], idle.id), options, {
    now: NOW,
    sessionStartedAt: NOW - 10_000,
    systemIdleMs: 5_000,
    frontmostApp: "T3 Code (Nightly)",
  });
  assert.equal(card.status, "prompting");

  const away = deriveCard(snapshot([idle], idle.id), options, {
    now: NOW,
    sessionStartedAt: NOW - 10_000,
    systemIdleMs: 5_000,
    frontmostApp: "Finder",
  });
  assert.equal(away.status, "idle");
});

test("counts only root running agents", () => {
  const root = thread({ id: "root" });
  const child = thread({ id: "child", parentThreadId: "root" });
  const card = deriveCard(snapshot([root, child]), resolveOptions({}), {
    now: NOW,
    sessionStartedAt: null,
    systemIdleMs: null,
    frontmostApp: null,
  });
  assert.equal(card.runningAgents, 1);
  assert.equal(card.provider, "opencode");
  assert.equal(card.vendor, "einfra");
  assert.equal(card.tool, "thinking");
});
