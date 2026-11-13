import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

function run(command: string, args: string[], timeout = 2_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
  });
}

/**
 * Seconds since the last keyboard/mouse input anywhere on the machine.
 * T3 Code keeps the composer draft local, so system input is the closest
 * proxy for "the user is typing". macOS only.
 */
export async function readSystemIdleMs(): Promise<number | null> {
  if (process.platform !== "darwin") return null;
  const stdout = await run("/usr/sbin/ioreg", ["-c", "IOHIDSystem"]);
  if (!stdout) return null;
  const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(stdout);
  return match?.[1] ? Number(match[1]) / 1_000_000 : null;
}

/** Display name of the frontmost macOS app, e.g. "T3 Code (Nightly)". */
export async function readFrontmostApp(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  const asn = (await run("/usr/bin/lsappinfo", ["front"]))?.trim();
  if (!asn) return null;
  const info = await run("/usr/bin/lsappinfo", ["info", "-only", "name", asn]);
  if (!info) return null;
  const match = /"LSDisplayName"\s*=\s*"([^"]+)"/.exec(info);
  return match?.[1] ?? null;
}

function discordSocketCandidates(): string[] {
  if (process.platform === "win32") {
    return Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`);
  }

  const roots: string[] = [];
  if (process.platform === "darwin") {
    const support = join(homedir(), "Library", "Application Support");
    roots.push(
      join(support, "discord"),
      join(support, "discordcanary"),
      join(support, "discordptb"),
      join(support, "Lightcord"),
      // Current Discord builds keep the IPC socket in the per-user temp dir.
      tmpdir(),
      "/tmp",
    );
  } else {
    const runtime = process.env.XDG_RUNTIME_DIR;
    if (runtime) roots.push(runtime);
    roots.push(tmpdir(), "/tmp");
  }

  const names = ["discord-ipc", "discordcanary-ipc", "discordptb-ipc"];
  const candidates: string[] = [];
  for (const root of roots) {
    for (const name of names) {
      for (let index = 0; index < 10; index += 1) candidates.push(join(root, `${name}-${index}`));
    }
  }
  return candidates;
}

/** First existing Discord IPC socket, or null when the desktop app is not running. */
export function findDiscordIpc(): string | null {
  return discordSocketCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

export function discordSocketHint(): string {
  if (process.platform === "win32") return "\\\\?\\pipe\\discord-ipc-0";
  return join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), "discord-ipc-0");
}
