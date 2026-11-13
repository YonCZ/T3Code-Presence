import { Client } from "@xhayper/discord-rpc";
import type { Logger } from "../log.js";

export interface ActivityImage {
  key: string;
  text: string;
}

export interface ActivityPayload {
  details: string;
  state?: string;
  startTimestamp?: number;
  largeImage: ActivityImage;
  smallImage?: ActivityImage;
}

const MIN_UPDATE_INTERVAL_MS = 3_000;
const MAX_RETRY_MS = 15_000;

function payloadKey(payload: ActivityPayload): string {
  return JSON.stringify(payload);
}

export interface PresenceClientOptions {
  clientId: string;
  logger: Logger;
}

/**
 * One Discord IPC connection, with backoff and a small rate limiter.
 * Discord only shows one activity per app per user, so the daemon owns this
 * for the whole machine.
 */
export class PresenceClient {
  private readonly clientId: string;
  private readonly logger: Logger;
  private client: Client | null = null;
  private ready = false;
  private disposed = false;
  private retryDelay = 2_000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSent: string | null = null;
  private lastSentAt = 0;
  private pending: ActivityPayload | null = null;

  constructor(options: PresenceClientOptions) {
    this.clientId = options.clientId;
    this.logger = options.logger;
  }

  get connected(): boolean {
    return this.ready && Boolean(this.client?.isConnected);
  }

  start(): void {
    if (this.disposed || this.client || !this.clientId) return;
    try {
      const client = new Client({ clientId: this.clientId });
      this.client = client;

      client.on("ready", () => {
        this.ready = true;
        this.retryDelay = 2_000;
        this.logger.debug("discord.ready", { user: client.user?.username ?? null });
        this.lastSent = null;
        this.flush(true);
      });

      client.on("disconnected", () => {
        this.logger.info("discord.disconnected");
        this.ready = false;
        this.lastSent = null;
        this.client = null;
        this.scheduleRetry();
      });

      void client.login().catch((error: unknown) => {
        this.logger.info("discord.login.failed", {
          error: String(error),
          retryInMs: this.retryDelay,
        });
        try {
          void client.destroy();
        } catch {
          // ignore
        }
        this.client = null;
        this.ready = false;
        this.scheduleRetry();
      });
    } catch (error) {
      this.logger.info("discord.client.failed", { error: String(error) });
      this.client = null;
      this.scheduleRetry();
    }
  }

  async waitForConnection(timeoutMs = 5_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.connected) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return this.connected;
  }

  update(payload: ActivityPayload): void {
    this.pending = payload;
    this.flush(false);
  }

  clear(): void {
    this.pending = null;
    this.lastSent = null;
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    if (!this.connected) return;
    void this.client?.user?.clearActivity().catch((error: unknown) => {
      this.logger.info("discord.clear.failed", { error: String(error) });
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    try {
      void this.client?.destroy();
    } catch {
      // ignore
    }
    this.client = null;
    this.ready = false;
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(Math.round(this.retryDelay * 1.5), MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.start();
    }, delay);
  }

  private flush(force: boolean): void {
    if (this.disposed || !this.pending || !this.connected) return;

    const payload = this.pending;
    const key = payloadKey(payload);
    const now = Date.now();
    const sinceLast = now - this.lastSentAt;

    if (!force) {
      if (key === this.lastSent) return;
      if (sinceLast < MIN_UPDATE_INTERVAL_MS) {
        if (!this.updateTimer) {
          this.updateTimer = setTimeout(() => {
            this.updateTimer = null;
            this.flush(false);
          }, MIN_UPDATE_INTERVAL_MS - sinceLast);
        }
        return;
      }
    }

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    this.lastSent = key;
    this.lastSentAt = now;
    this.logger.debug("discord.activity", { details: payload.details, state: payload.state ?? null });

    void this.client?.user
      ?.setActivity({
        details: payload.details,
        ...(payload.state ? { state: payload.state } : {}),
        ...(payload.startTimestamp ? { startTimestamp: payload.startTimestamp } : {}),
        // Discord accepts an asset key or an https URL here and turns the URL
        // into an mp:external asset. `largeImageUrl` only sets `large_url`,
        // which the profile does not render, so always use the key field.
        largeImageKey: payload.largeImage.key,
        largeImageText: payload.largeImage.text,
        ...(payload.smallImage
          ? {
              smallImageKey: payload.smallImage.key,
              smallImageText: payload.smallImage.text,
            }
          : {}),
      })
      .catch((error: unknown) => {
        this.lastSent = null;
        this.logger.info("discord.activity.failed", { error: String(error) });
      });
  }
}
