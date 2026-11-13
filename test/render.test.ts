import assert from "node:assert/strict";
import test from "node:test";
import { resolveOptions } from "../src/options.js";
import {
  modelIdWithoutVendor,
  modelNameWithVariant,
  pendingLabel,
  prettyModelId,
  prettyVariant,
  renderPresence,
  statusLabel,
  truncateUtf8,
} from "../src/render.js";
import type { CardView, T3Thread } from "../src/types.js";

function thread(overrides: Partial<T3Thread> = {}): T3Thread {
  return {
    id: "t1",
    projectId: "p1",
    title: "Ship\n the thing ",
    branch: "main",
    worktreePath: null,
    runtimeMode: "full-access",
    interactionMode: "default",
    model: "einfra/deepseek-v4.1-flash",
    provider: "opencode",
    vendor: "einfra",
    variant: "high",
    createdAt: null,
    updatedAt: null,
    lastVisitedAt: null,
    parentThreadId: null,
    latestRun: null,
    pendingApprovals: 0,
    pendingUserInputs: 0,
    runningItem: null,
    ...overrides,
  };
}

function view(overrides: Partial<CardView> = {}): CardView {
  return {
    thread: thread(),
    project: { id: "p1", title: "rich-t3code", workspaceRoot: "/Users/you/Projects/rich-t3code" },
    status: "working",
    model: "einfra/deepseek-v4.1-flash",
    provider: "opencode",
    vendor: "einfra",
    variant: "high",
    runningAgents: 2,
    pendingApprovals: 0,
    pendingUserInputs: 0,
    tool: "npm run build",
    activityStartedAt: 1_700_000_000_000,
    runStartedAt: 1_700_000_000_000,
    lastActivityAt: 1_700_000_000_000,
    server: { running: true, pid: 1, version: "0.1.10", port: 3773, startedAt: null },
    t3Home: "/Users/you/.t3",
    ...overrides,
  };
}

test("renders fields in order and skips empty ones", () => {
  const options = resolveOptions({
    details: ["thread", "project"],
    state: ["model", "status", "text:x"],
  });
  const rendered = renderPresence(view(), options);
  assert.equal(rendered.details, "Ship the thing · rich-t3code");
  assert.equal(rendered.state, "deepseek-v4.1-flash · Working · x");
});

test("falls back to T3 Code when details are empty", () => {
  const options = resolveOptions({ details: ["branch"], state: ["branch"] });
  const rendered = renderPresence(view({ thread: null }), options);
  assert.equal(rendered.details, "T3 Code");
  assert.equal(rendered.state, undefined);
});

test("status labels distinguish approvals and questions", () => {
  const options = resolveOptions({});
  assert.equal(
    statusLabel(view({ status: "waiting", pendingApprovals: 1 }), options),
    "Needs approval",
  );
  assert.equal(
    statusLabel(view({ status: "waiting", pendingUserInputs: 2 }), options),
    "Needs input",
  );
  assert.equal(statusLabel(view({ status: "waiting" }), options), "Needs you");
  assert.equal(statusLabel(view({ status: "thinking" }), options), "Thinking");
});

test("pending and agents fields", () => {
  const options = resolveOptions({ state: ["agents", "pending"] });
  const rendered = renderPresence(
    view({ runningAgents: 3, pendingApprovals: 2, pendingUserInputs: 1 }),
    options,
  );
  assert.equal(rendered.state, "3 agents · 2 approvals + 1 question");
  assert.equal(pendingLabel(view({ pendingApprovals: 1 })), "1 approval");
});

test("model helpers", () => {
  assert.equal(prettyModelId("einfra/deepseek-v4.1-flash"), "DeepSeek V4.1 Flash");
  assert.equal(prettyModelId("openai/gpt-5.1-codex-max"), "GPT 5.1 Codex Max");
  assert.equal(modelIdWithoutVendor("einfra/deepseek-v4.1-flash"), "deepseek-v4.1-flash");
  assert.equal(prettyModelId(null), "");
  assert.equal(prettyVariant("high"), "High");
  assert.equal(prettyVariant(null), "");
  assert.equal(
    modelNameWithVariant("einfra/deepseek-v4.1-flash", "high"),
    "DeepSeek V4.1 Flash (High)",
  );
  assert.equal(modelNameWithVariant("einfra/deepseek-v4.1-flash", null), "DeepSeek V4.1 Flash");
});

test("renders the default profile", () => {
  const options = resolveOptions({});
  const rendered = renderPresence(view({ runningAgents: 2 }), options);
  assert.equal(
    rendered.details,
    "Ship the thing",
  );
  assert.equal(rendered.state, "DeepSeek V4.1 Flash (High) · Working");
});

test("truncates long lines by UTF-8 bytes", () => {
  const text = `é`.repeat(100);
  const truncated = truncateUtf8(text, 20);
  assert.ok(Buffer.byteLength(truncated, "utf8") <= 20);
  assert.ok(truncated.endsWith("\u2026"));
  assert.equal(truncateUtf8("short", 20), "short");
});

test("strips control characters", () => {
  assert.equal(truncateUtf8("a\nb\tc"), "a b c");
});
