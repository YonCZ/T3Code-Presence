import type { PresenceStatus } from "./options.js";

export interface RunningItem {
  type: string;
  status: string;
  title: string | null;
  /** Human label for the current activity, e.g. a command or a file name. */
  label: string | null;
  startedAt: string | null;
}

export interface T3Run {
  id: string;
  status: string;
  provider: string | null;
  model: string | null;
  variant: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface T3Thread {
  id: string;
  projectId: string;
  title: string;
  branch: string | null;
  worktreePath: string | null;
  runtimeMode: string;
  interactionMode: string;
  model: string | null;
  provider: string | null;
  vendor: string | null;
  variant: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastVisitedAt: string | null;
  parentThreadId: string | null;
  latestRun: T3Run | null;
  pendingApprovals: number;
  pendingUserInputs: number;
  runningItem: RunningItem | null;
}

export interface T3Project {
  id: string;
  title: string;
  workspaceRoot: string;
}

export interface T3Server {
  running: boolean;
  pid: number | null;
  version: string | null;
  port: number | null;
  startedAt: string | null;
}

export interface T3Snapshot {
  available: boolean;
  t3Home: string;
  dbPath: string;
  capturedAt: number;
  server: T3Server;
  projects: T3Project[];
  threads: T3Thread[];
  /** Most recently visited thread id, i.e. the one open in the T3 Code window. */
  focusedThreadId: string | null;
  error: string | null;
}

/** The thread and derived values the card renders. */
export interface CardView {
  thread: T3Thread | null;
  project: T3Project | null;
  status: PresenceStatus;
  model: string | null;
  provider: string | null;
  vendor: string | null;
  variant: string | null;
  runningAgents: number;
  pendingApprovals: number;
  pendingUserInputs: number;
  tool: string | null;
  activityStartedAt: number | null;
  runStartedAt: number | null;
  lastActivityAt: number | null;
  server: T3Server;
  t3Home: string;
}
