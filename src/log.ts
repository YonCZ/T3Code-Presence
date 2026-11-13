import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export type LogData = Record<string, unknown>;

export interface Logger {
  readonly filePath: string | null;
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
}

export interface LoggerOptions {
  /** Print debug lines to stderr as well. */
  verbose?: boolean;
  /** Write a JSON-lines file. */
  filePath?: string | null;
  /** Print warnings and errors to stderr. */
  stderr?: boolean;
}

function writeLine(
  filePath: string | null,
  level: string,
  message: string,
  data: LogData | undefined,
): void {
  if (!filePath) return;
  try {
    if (existsSync(filePath) && statSync(filePath).size > MAX_LOG_BYTES) {
      renameSync(filePath, `${filePath}.old`);
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const entry = { time: new Date().toISOString(), level, message, ...(data ?? {}) };
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // logging must never break presence
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const filePath = options.filePath ?? null;
  const verbose = options.verbose ?? false;
  const stderr = options.stderr ?? true;

  return {
    filePath,
    debug(message, data) {
      writeLine(filePath, "debug", message, data);
      if (verbose) process.stderr.write(`[rich-t3code] ${message}${data ? ` ${JSON.stringify(data)}` : ""}\n`);
    },
    info(message, data) {
      writeLine(filePath, "info", message, data);
      if (verbose) process.stderr.write(`[rich-t3code] ${message}${data ? ` ${JSON.stringify(data)}` : ""}\n`);
    },
    warn(message, data) {
      writeLine(filePath, "warn", message, data);
      if (stderr) process.stderr.write(`[rich-t3code] ${message}${data ? ` ${JSON.stringify(data)}` : ""}\n`);
    },
    error(message, data) {
      writeLine(filePath, "error", message, data);
      if (stderr) process.stderr.write(`[rich-t3code] ${message}${data ? ` ${JSON.stringify(data)}` : ""}\n`);
    },
  };
}
