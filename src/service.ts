import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVICE_LABEL = "com.yoncz.rich-t3code";

export interface ServiceInput {
  nodePath: string;
  cliPath: string;
  configPath: string;
  logDirectory: string;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
}

function systemdPath(): string {
  return join(homedir(), ".config", "systemd", "user", "rich-t3code.service");
}

function run(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return `${stdout}${stderr}`.trim();
  }
}

export function serviceInstalled(): { installed: boolean; path: string | null } {
  if (process.platform === "darwin") {
    const path = plistPath();
    return { installed: existsSync(path), path };
  }
  if (process.platform === "linux") {
    const path = systemdPath();
    return { installed: existsSync(path), path };
  }
  return { installed: false, path: null };
}

export function installService(input: ServiceInput): string {
  if (process.platform === "darwin") return installLaunchAgent(input);
  if (process.platform === "linux") return installSystemdUnit(input);
  throw new Error(
    "Automatic service install supports macOS and Linux. On Windows, run `rich-t3code start` at login with Task Scheduler.",
  );
}

export function uninstallService(): string {
  if (process.platform === "darwin") {
    const path = plistPath();
    const uid = process.getuid?.() ?? 0;
    if (existsSync(path)) {
      run("launchctl", ["bootout", `gui/${uid}/${SERVICE_LABEL}`]);
      rmSync(path, { force: true });
      return `Removed LaunchAgent ${path}`;
    }
    return "No LaunchAgent was installed.";
  }

  if (process.platform === "linux") {
    const path = systemdPath();
    if (existsSync(path)) {
      run("systemctl", ["--user", "disable", "--now", "rich-t3code.service"]);
      rmSync(path, { force: true });
      run("systemctl", ["--user", "daemon-reload"]);
      return `Removed systemd unit ${path}`;
    }
    return "No systemd unit was installed.";
  }

  return "Automatic service install supports macOS and Linux.";
}

function installLaunchAgent(input: ServiceInput): string {
  const path = plistPath();
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(input.logDirectory, { recursive: true });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(SERVICE_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(input.nodePath)}</string>
    <string>${xml(input.cliPath)}</string>
    <string>start</string>
    <string>--config</string>
    <string>${xml(input.configPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xml(join(input.logDirectory, "rich-t3code.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(input.logDirectory, "rich-t3code.err.log"))}</string>
</dict>
</plist>
`;
  writeFileSync(path, body, "utf8");

  const uid = process.getuid?.() ?? 0;
  run("launchctl", ["bootout", `gui/${uid}/${SERVICE_LABEL}`]);
  const boot = run("launchctl", ["bootstrap", `gui/${uid}`, path]);
  if (boot.length > 0 && /error|failed/i.test(boot)) {
    throw new Error(`launchctl bootstrap failed:\n${boot}`);
  }
  run("launchctl", ["enable", `gui/${uid}/${SERVICE_LABEL}`]);
  run("launchctl", ["kickstart", "-k", `gui/${uid}/${SERVICE_LABEL}`]);
  return `Installed LaunchAgent ${path}`;
}

function systemdQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function installSystemdUnit(input: ServiceInput): string {
  const path = systemdPath();
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(input.logDirectory, { recursive: true });

  const body = `[Unit]
Description=rich-t3code Discord Rich Presence for T3 Code
After=graphical-session.target

[Service]
Type=simple
ExecStart=${systemdQuote(input.nodePath)} ${systemdQuote(input.cliPath)} start --config ${systemdQuote(input.configPath)}
Restart=on-failure
RestartSec=5
WorkingDirectory=${systemdQuote(dirname(input.cliPath))}

[Install]
WantedBy=default.target
`;
  writeFileSync(path, body, "utf8");
  run("systemctl", ["--user", "daemon-reload"]);
  const enabled = run("systemctl", ["--user", "enable", "--now", "rich-t3code.service"]);
  if (/Failed|error/i.test(enabled)) {
    throw new Error(`systemctl enable failed:\n${enabled}`);
  }
  return `Installed systemd unit ${path}`;
}

/** Absolute path to this module's CLI entry, so service files survive upgrades. */
export function cliEntryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "cli.js");
}
