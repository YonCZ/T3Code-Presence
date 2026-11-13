import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DEFAULT_OPTIONS, resolveOptions, type RichOptions } from "./options.js";

export class ConfigError extends Error {
  override name = "ConfigError";
}

function envPath(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = envPath(env, "XDG_CONFIG_HOME");
  if (xdg) return join(xdg, "rich-t3code");
  if (process.platform === "win32") {
    const appData = envPath(env, "APPDATA") ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "rich-t3code");
  }
  return join(homedir(), ".config", "rich-t3code");
}

export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = envPath(env, "XDG_STATE_HOME");
  if (xdg) return join(xdg, "rich-t3code");
  if (process.platform === "win32") {
    const local = envPath(env, "LOCALAPPDATA") ?? join(homedir(), "AppData", "Local");
    return join(local, "rich-t3code");
  }
  return join(homedir(), ".local", "state", "rich-t3code");
}

export const DEFAULT_CONFIG_PATH = join(configDir(), "config.json");

export interface LoadConfigInput {
  /** Explicit --config path. A missing explicit file is an error. */
  configPath?: string;
  /** Highest-priority values from CLI flags or tests. */
  overrides?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}

export interface LoadedConfig {
  /** Path that was read, or the path we would write to. */
  path: string;
  /** Whether the file existed. */
  exists: boolean;
  options: RichOptions;
}

export function loadConfig(input: LoadConfigInput = {}): LoadedConfig {
  const env = input.env ?? process.env;
  const path = input.configPath
    ? resolve(expandHome(input.configPath))
    : join(configDir(env), "config.json");
  const explicit = Boolean(input.configPath);
  const exists = existsSync(path);

  if (explicit && !exists) {
    throw new ConfigError(`Config file not found: ${path}`);
  }

  let raw: Record<string, unknown> = {};
  if (exists) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new ConfigError(`Config file must contain a JSON object: ${path}`);
      }
      raw = parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      throw new ConfigError(`Could not parse ${path}: ${String(error)}`);
    }
  }

  const merged: Record<string, unknown> = { ...raw, ...(input.overrides ?? {}) };
  const options = resolveOptions(merged);

  const overrideClientId =
    typeof input.overrides?.clientId === "string" && input.overrides.clientId.trim().length > 0;
  const overrideT3Home =
    typeof input.overrides?.t3Home === "string" && input.overrides.t3Home.trim().length > 0;

  const envClientId = envPath(env, "RICH_T3CODE_CLIENT_ID");
  const envT3Home = envPath(env, "T3CODE_HOME");
  if (!overrideClientId && envClientId) options.clientId = envClientId;
  if (!overrideT3Home && envT3Home) options.t3Home = resolve(expandHome(envT3Home));

  return { path, exists, options };
}

export function defaultConfigObject(clientId: string): Record<string, unknown> {
  return {
    clientId,
    details: DEFAULT_OPTIONS.details,
    state: DEFAULT_OPTIONS.state,
    separator: DEFAULT_OPTIONS.separator,
    timer: DEFAULT_OPTIONS.timer,
    hideWhenIdleMinutes: DEFAULT_OPTIONS.hideWhenIdleMinutes,
    followFocusedThread: DEFAULT_OPTIONS.followFocusedThread,
    pollIntervalMs: DEFAULT_OPTIONS.pollIntervalMs,
    prompting: DEFAULT_OPTIONS.prompting,
    largeImage: DEFAULT_OPTIONS.largeImage,
    smallImage: DEFAULT_OPTIONS.smallImage,
    debug: DEFAULT_OPTIONS.debug,
  };
}

export function writeDefaultConfig(
  clientId: string,
  path: string = DEFAULT_CONFIG_PATH,
  force = false,
): { path: string; created: boolean } {
  const target = resolve(expandHome(path));
  if (existsSync(target) && !force) return { path: target, created: false };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(defaultConfigObject(clientId), null, 2)}\n`, "utf8");
  return { path: target, created: true };
}

export function resolveT3Home(options: RichOptions, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = options.t3Home ?? envPath(env, "T3CODE_HOME");
  const chosen = explicit ? expandHome(explicit) : join(homedir(), ".t3");
  return isAbsolute(chosen) ? chosen : resolve(chosen);
}
