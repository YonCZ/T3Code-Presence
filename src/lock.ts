import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const STALE_MS = 60_000;

interface LockFile {
  pid?: number;
  startedAt?: number;
}

function pidAlive(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class InstanceLock {
  readonly path: string;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private held = false;

  constructor(directory: string) {
    this.path = join(directory, "rich-t3code.lock");
  }

  acquire(): boolean {
    mkdirSync(dirname(this.path), { recursive: true });

    if (existsSync(this.path)) {
      let existing: LockFile = {};
      try {
        existing = JSON.parse(readFileSync(this.path, "utf8")) as LockFile;
      } catch {
        // treat a corrupt lock as stale
      }
      let fresh = false;
      try {
        fresh = Date.now() - statSync(this.path).mtimeMs < STALE_MS;
      } catch {
        fresh = false;
      }
      if (pidAlive(existing.pid) && fresh) return false;
    }

    const now = Date.now();
    try {
      writeFileSync(this.path, JSON.stringify({ pid: process.pid, startedAt: now }), "utf8");
    } catch {
      return false;
    }

    this.held = true;
    this.heartbeat = setInterval(() => {
      try {
        const now = new Date();
        utimesSync(this.path, now, now);
      } catch {
        // ignore
      }
    }, 20_000);
    this.heartbeat.unref?.();
    return true;
  }

  release(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (!this.held) return;
    this.held = false;
    try {
      const existing = JSON.parse(readFileSync(this.path, "utf8")) as LockFile;
      if (existing.pid === process.pid) unlinkSync(this.path);
    } catch {
      // ignore
    }
  }
}
