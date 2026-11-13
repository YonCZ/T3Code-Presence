import type { RichOptions } from "./options.js";
import type { CardView } from "./types.js";
import type { ActivityImage, ActivityPayload } from "./presence/client.js";
import type { RenderedPresence } from "./render.js";

export function modelsDevIconUrl(provider: string): string {
  return `https://images.weserv.nl/?url=https://models.dev/logos/${encodeURIComponent(provider)}.svg&output=png&bg=white&w=256&h=256`;
}

export function providerIcon(options: RichOptions, view: CardView): ActivityImage | undefined {
  if (!options.smallImage.enabled) return undefined;
  const candidates = [view.vendor, view.provider].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (candidates.length === 0) return undefined;

  let key: string | undefined;
  for (const candidate of candidates) {
    key = options.smallImage.providerIcons[candidate];
    if (key) break;
  }
  if (!key) key = modelsDevIconUrl(candidates[0]!);

  const label = view.model ?? candidates[0]!;
  return { key, text: label };
}

export function buildActivity(
  view: CardView,
  options: RichOptions,
  rendered: RenderedPresence,
): ActivityPayload {
  const smallImage = providerIcon(options, view);
  return {
    details: rendered.details,
    ...(rendered.state ? { state: rendered.state } : {}),
    ...(options.timer.enabled && view.activityStartedAt
      ? { startTimestamp: Math.floor(view.activityStartedAt / 1_000) }
      : {}),
    largeImage: { key: options.largeImage.key, text: options.largeImage.text },
    ...(smallImage ? { smallImage } : {}),
  };
}
