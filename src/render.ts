import type { LineField, RichOptions } from "./options.js";
import type { CardView } from "./types.js";

const MAX_LINE_BYTES = 128;

const BRANDS: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
  qwen: "Qwen",
  kimi: "Kimi",
  gemini: "Gemini",
  claude: "Claude",
  llama: "Llama",
  mistral: "Mistral",
  grok: "Grok",
  codex: "Codex",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  glm: "GLM",
  gpt: "GPT",
  llm: "LLM",
  api: "API",
  mcp: "MCP",
  ai: "AI",
  oss: "OSS",
  vl: "VL",
};

const MODE_LABELS: Record<string, string> = {
  "full-access": "Full access",
  "approval-required": "Supervised",
  "auto-accept-edits": "Auto-accept",
  auto: "Auto",
};

export function cleanText(value: string): string {
  return value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
}

export function truncateUtf8(input: string, maxBytes: number = MAX_LINE_BYTES): string {
  const clean = cleanText(input);
  if (Buffer.byteLength(clean, "utf8") <= maxBytes) return clean;
  const budget = maxBytes - 3; // room for the ellipsis
  let output = "";
  let bytes = 0;
  for (const char of clean) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > budget) break;
    output += char;
    bytes += size;
  }
  return `${output}\u2026`;
}

export function prettyModelId(model: string | null): string {
  if (!model) return "";
  const base = model.includes("/") ? (model.split("/").pop() ?? model) : model;
  return base
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const brand = BRANDS[part.toLowerCase()];
      if (brand) return brand;
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function modelIdWithoutVendor(model: string | null): string {
  if (!model) return "";
  return model.includes("/") ? (model.split("/").pop() ?? model) : model;
}

export function prettyVariant(variant: string | null): string {
  if (!variant) return "";
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

export function modelNameWithVariant(model: string | null, variant: string | null): string {
  const name = prettyModelId(model);
  if (!name) return "";
  const label = prettyVariant(variant);
  return label ? `${name} (${label})` : name;
}

function projectName(view: CardView): string {
  if (view.project) {
    if (view.project.title.trim().length > 0) return view.project.title;
    const parts = view.project.workspaceRoot.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }
  return "";
}

export function pendingLabel(view: CardView): string {
  const parts: string[] = [];
  if (view.pendingApprovals > 0) {
    parts.push(`${view.pendingApprovals} approval${view.pendingApprovals === 1 ? "" : "s"}`);
  }
  if (view.pendingUserInputs > 0) {
    parts.push(`${view.pendingUserInputs} question${view.pendingUserInputs === 1 ? "" : "s"}`);
  }
  return parts.join(" + ");
}

export function statusLabel(view: CardView, options: RichOptions): string {
  if (view.status === "waiting") {
    if (view.pendingApprovals > 0) return options.status.approval;
    if (view.pendingUserInputs > 0) return options.status.input;
  }
  return options.status.labels[view.status] ?? "";
}

function renderField(field: LineField, view: CardView, options: RichOptions): string {
  switch (field) {
    case "thread":
      return view.thread?.title ?? "";
    case "project":
      return projectName(view);
    case "model":
      return modelIdWithoutVendor(view.model);
    case "modelName":
      return prettyModelId(view.model);
    case "modelNameVariant":
      return modelNameWithVariant(view.model, view.variant);
    case "provider":
      return view.provider ?? "";
    case "vendor":
      return view.vendor ?? "";
    case "variant":
      return view.variant ?? "";
    case "status":
      return statusLabel(view, options);
    case "agents":
      if (view.runningAgents <= 0) return "";
      return `${view.runningAgents} agent${view.runningAgents === 1 ? "" : "s"}`;
    case "pending":
      return pendingLabel(view);
    case "mode":
      return MODE_LABELS[view.thread?.runtimeMode ?? ""] ?? view.thread?.runtimeMode ?? "";
    case "branch":
      return view.thread?.branch ?? "";
    case "tool":
      return view.tool ?? "";
    case "version":
      return view.server.version ?? "";
    default:
      return field.startsWith("text:") ? field.slice("text:".length) : "";
  }
}

function renderLine(
  fields: readonly LineField[],
  view: CardView,
  options: RichOptions,
): string {
  const parts: string[] = [];
  for (const field of fields) {
    const value = renderField(field, view, options);
    if (value.length > 0) parts.push(value);
  }
  return truncateUtf8(parts.join(options.separator));
}

export interface RenderedPresence {
  details: string;
  state: string | undefined;
}

export function renderPresence(view: CardView, options: RichOptions): RenderedPresence {
  const details = renderLine(options.details, view, options) || "T3 Code";
  const state = renderLine(options.state, view, options);
  return { details, state: state.length > 0 ? state : undefined };
}
