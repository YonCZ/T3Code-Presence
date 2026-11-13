import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OPTIONS, resolveOptions } from "../src/options.js";

test("defaults are stable", () => {
  const options = resolveOptions({});
  assert.deepEqual(options.details, ["project", "thread", "status", "agents"]);
  assert.deepEqual(options.state, ["modelName", "variant"]);
  assert.equal(options.separator, " \u00b7 ");
  assert.equal(options.timer.source, "activity");
  assert.equal(options.followFocusedThread, true);
  assert.equal(options.clientId, "");
  assert.match(options.largeImage.key, /t3code-icon\.png/);
});

test("merges user values", () => {
  const options = resolveOptions({
    clientId: " 123 ",
    details: ["project", "text:hi"],
    state: ["agents", "pending"],
    separator: " | ",
    timer: { enabled: false, source: "run", idleResetMinutes: 5 },
    followFocusedThread: false,
    hideWhenIdleMinutes: 0,
    pollIntervalMs: 900,
    status: { labels: { working: "Coding" }, approval: "Approve?", input: "Answer?" },
    largeImage: { key: "https://example.com/logo.png", text: "T3" },
    smallImage: { enabled: true, providerIcons: { openai: "https://x/icon.png", bad: 3 } },
  });

  assert.equal(options.clientId, "123");
  assert.deepEqual(options.details, ["project", "text:hi"]);
  assert.equal(options.separator, " | ");
  assert.equal(options.timer.source, "run");
  assert.equal(options.timer.enabled, false);
  assert.equal(options.timer.idleResetMinutes, 5);
  assert.equal(options.followFocusedThread, false);
  assert.equal(options.hideWhenIdleMinutes, 0);
  assert.equal(options.pollIntervalMs, 900);
  assert.equal(options.status.labels.working, "Coding");
  assert.equal(options.status.approval, "Approve?");
  assert.equal(options.status.input, "Answer?");
  assert.equal(options.largeImage.key, "https://example.com/logo.png");
  assert.deepEqual(options.smallImage.providerIcons, { openai: "https://x/icon.png" });
});

test("invalid values fall back", () => {
  const options = resolveOptions({
    details: [],
    state: [1, null, "  "],
    separator: "",
    timer: { source: "nope", idleResetMinutes: -5 },
    pollIntervalMs: 1,
    prompting: { idleSeconds: 0, apps: [] },
    smallImage: "nope",
  });

  assert.deepEqual(options.details, DEFAULT_OPTIONS.details);
  assert.deepEqual(options.state, DEFAULT_OPTIONS.state);
  assert.equal(options.separator, DEFAULT_OPTIONS.separator);
  assert.equal(options.timer.source, "activity");
  assert.equal(options.timer.idleResetMinutes, 1);
  assert.equal(options.pollIntervalMs, 500);
  assert.equal(options.prompting.idleSeconds, 5);
  assert.deepEqual(options.prompting.apps, DEFAULT_OPTIONS.prompting.apps);
});

test("t3Home is only present when set", () => {
  assert.equal("t3Home" in resolveOptions({}), false);
  assert.equal(resolveOptions({ t3Home: " /tmp/t3 " }).t3Home, "/tmp/t3");
});
