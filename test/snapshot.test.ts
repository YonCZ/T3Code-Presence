import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  modelNameFromId,
  providerFromModel,
  readT3Snapshot,
  variantFromOptions,
} from "../src/t3/snapshot.js";

const NOW = "2026-11-13T12:00:00.000Z";

function makeDb(home: string): Database.Database {
  mkdirSync(join(home, "userdata"), { recursive: true });
  const db = new Database(join(home, "userdata", "statev2.sqlite"));
  db.exec(`
    CREATE TABLE projection_projects (
      project_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_root TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE orchestration_v2_projection_threads (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      default_provider TEXT NOT NULL,
      runtime_mode TEXT NOT NULL,
      interaction_mode TEXT NOT NULL,
      active_provider_thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      deleted_at TEXT,
      payload_json TEXT NOT NULL,
      provider_instance_id TEXT
    );
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_thread_id TEXT,
      status TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      completed_at TEXT,
      payload_json TEXT NOT NULL,
      provider_instance_id TEXT
    );
    CREATE TABLE orchestration_v2_projection_runtime_requests (
      runtime_request_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      provider_turn_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE orchestration_v2_projection_turn_items (
      turn_item_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      run_id TEXT,
      node_id TEXT,
      provider_thread_id TEXT,
      provider_turn_id TEXT,
      parent_item_id TEXT,
      ordinal INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);

  db.prepare("INSERT INTO projection_projects VALUES (?, ?, ?, NULL)").run(
    "p1",
    "rich-t3code",
    "/Users/you/Projects/rich-t3code",
  );

  const threadPayload = {
    lastVisitedAt: NOW,
    modelSelection: {
      instanceId: "opencode",
      model: "einfra/deepseek-v4.1-flash",
      options: [{ id: "variant", value: "high" }],
    },
    branch: "main",
    worktreePath: null,
    lineage: { parentThreadId: null },
  };
  db.prepare(
    `INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    "t1",
    "p1",
    "Build it",
    "opencode",
    "full-access",
    "default",
    NOW,
    NOW,
    JSON.stringify(threadPayload),
    "opencode",
  );

  db.prepare(
    `INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)`,
  ).run(
    "r1",
    "t1",
    1,
    "opencode",
    "running",
    NOW,
    JSON.stringify({
      startedAt: NOW,
      modelSelection: { model: "einfra/deepseek-v4.1-flash" },
    }),
    "opencode",
  );

  db.prepare(
    `INSERT INTO orchestration_v2_projection_runtime_requests VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
  ).run("req1", "t1", "node1", "command", "pending", NOW, "{}");

  db.prepare(
    `INSERT INTO orchestration_v2_projection_turn_items VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    "item1",
    "t1",
    "r1",
    "node2",
    100,
    "command_execution",
    "running",
    NOW,
    JSON.stringify({ startedAt: NOW, title: null, input: "npm test" }),
  );

  writeFileSync(
    join(home, "userdata", "server-runtime.json"),
    JSON.stringify({
      version: 1,
      pid: process.pid,
      port: 3773,
      serverVersion: "0.1.10-nightly.test",
      startedAt: NOW,
    }),
  );

  return db;
}

test("reads threads, runs, requests and running items", () => {
  const home = mkdtempSync(join(tmpdir(), "rich-t3code-"));
  const db = makeDb(home);
  db.close();
  try {
    const snapshot = readT3Snapshot(home);
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.error, null);
    assert.equal(snapshot.server.running, true);
    assert.equal(snapshot.server.version, "0.1.10-nightly.test");
    assert.equal(snapshot.projects.length, 1);
    assert.equal(snapshot.threads.length, 1);

    const thread = snapshot.threads[0]!;
    assert.equal(thread.id, "t1");
    assert.equal(thread.title, "Build it");
    assert.equal(thread.model, "einfra/deepseek-v4.1-flash");
    assert.equal(thread.provider, "opencode");
    assert.equal(thread.vendor, "einfra");
    assert.equal(thread.variant, "high");
    assert.equal(thread.branch, "main");
    assert.equal(thread.latestRun?.status, "running");
    assert.equal(thread.latestRun?.startedAt, NOW);
    assert.equal(thread.pendingApprovals, 1);
    assert.equal(thread.pendingUserInputs, 0);
    assert.equal(thread.runningItem?.type, "command_execution");
    assert.equal(thread.runningItem?.label, "npm test");
    assert.equal(snapshot.focusedThreadId, "t1");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reports a database without v2 tables", () => {
  const home = mkdtempSync(join(tmpdir(), "rich-t3code-"));
  mkdirSync(join(home, "userdata"), { recursive: true });
  const db = new Database(join(home, "userdata", "statev2.sqlite"));
  db.exec("CREATE TABLE legacy (id INTEGER)");
  db.close();
  try {
    const snapshot = readT3Snapshot(home);
    assert.equal(snapshot.available, false);
    assert.match(snapshot.error ?? "", /orchestration v2/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reports a missing database", () => {
  const home = mkdtempSync(join(tmpdir(), "rich-t3code-"));
  try {
    const snapshot = readT3Snapshot(home);
    assert.equal(snapshot.available, false);
    assert.match(snapshot.error ?? "", /not found/);
    assert.equal(snapshot.server.running, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("helpers", () => {
  assert.equal(variantFromOptions('[{"id":"variant","value":"high"}]'), "high");
  assert.equal(variantFromOptions('{"variant":"low"}'), "low");
  assert.equal(variantFromOptions("nope"), null);
  assert.equal(providerFromModel("einfra/deepseek-v4.1-flash", "opencode"), "einfra");
  assert.equal(providerFromModel(null, "codex"), "codex");
  assert.equal(modelNameFromId("einfra/deepseek-v4.1-flash"), "deepseek-v4.1-flash");
});
