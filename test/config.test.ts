import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig, resolveT3Home, writeDefaultConfig } from "../src/config.js";
import { resolveOptions } from "../src/options.js";

test("loads a config file and lets CLI overrides win", () => {
  const home = mkdtempSync(join(tmpdir(), "rich-t3code-config-"));
  const path = join(home, "config.json");
  writeFileSync(path, JSON.stringify({ clientId: "file-id", separator: " | " }));
  try {
    const loaded = loadConfig({ configPath: path, env: {} });
    assert.equal(loaded.exists, true);
    assert.equal(loaded.options.clientId, "file-id");
    assert.equal(loaded.options.separator, " | ");

    const overridden = loadConfig({
      configPath: path,
      overrides: { clientId: "cli-id" },
      env: { RICH_T3CODE_CLIENT_ID: "env-id" },
    });
    assert.equal(overridden.options.clientId, "cli-id");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("environment id wins over the file but not the CLI", () => {
  const home = mkdtempSync(join(tmpdir(), "rich-t3code-config-"));
  const path = join(home, "config.json");
  writeFileSync(path, JSON.stringify({ clientId: "file-id" }));
  try {
    const env = loadConfig({ configPath: path, env: { RICH_T3CODE_CLIENT_ID: "env-id" } });
    assert.equal(env.options.clientId, "env-id");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("missing explicit config is an error, missing default is fine", () => {
  assert.throws(
    () => loadConfig({ configPath: "/definitely/not/here/config.json", env: {} }),
    /Config file not found/,
  );
  const loaded = loadConfig({ env: { XDG_CONFIG_HOME: "/tmp/rich-t3code-none" } });
  assert.equal(loaded.exists, false);
  assert.equal(loaded.options.clientId, "");
});

test("writes a default config once and with force", () => {
  const home = mkdtempSync(join(tmpdir(), "rich-t3code-config-"));
  const path = join(home, "nested", "config.json");
  try {
    const first = writeDefaultConfig("123", path);
    assert.equal(first.created, true);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).clientId, "123");

    const second = writeDefaultConfig("456", path);
    assert.equal(second.created, false);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).clientId, "123");

    const forced = writeDefaultConfig("456", path, true);
    assert.equal(forced.created, true);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).clientId, "456");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("t3 home precedence", () => {
  assert.equal(resolveT3Home(resolveOptions({ t3Home: "/tmp/custom" }), {}), "/tmp/custom");
  assert.equal(resolveT3Home(resolveOptions({}), { T3CODE_HOME: "/tmp/env" }), "/tmp/env");
});
