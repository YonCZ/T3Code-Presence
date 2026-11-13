export type {
  CardView,
  RunningItem,
  T3Project,
  T3Run,
  T3Server,
  T3Snapshot,
  T3Thread,
} from "./types.js";
export {
  DEFAULT_OPTIONS,
  DEFAULT_PROMPTING_APPS,
  T3CODE_ICON_URL,
  resolveOptions,
  type LineField,
  type PresenceStatus,
  type RichOptions,
} from "./options.js";
export {
  ConfigError,
  configDir,
  loadConfig,
  resolveT3Home,
  stateDir,
  writeDefaultConfig,
  type LoadedConfig,
} from "./config.js";
export {
  focusedThread,
  isRunActive,
  modelNameFromId,
  providerFromModel,
  readT3Snapshot,
  t3DatabasePath,
  t3RuntimePath,
  variantFromOptions,
} from "./t3/snapshot.js";
export { chooseThread, deriveCard, deriveThreadStatus, threadNeedsAttention } from "./derive.js";
export { prettyModelId, renderPresence, statusLabel, truncateUtf8 } from "./render.js";
export { buildActivity, modelsDevIconUrl, providerIcon } from "./activity.js";
export { PresenceClient, type ActivityPayload } from "./presence/client.js";
export { runDaemon, startDaemon, type DaemonSample, type RunDaemonOptions } from "./daemon.js";
export { createLogger, type Logger } from "./log.js";
