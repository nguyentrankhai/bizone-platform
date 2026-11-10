/**
 * Browser client for POS 2-screen sync.
 *
 * Primary path: WebSocket to server/ws/pos.ts (cart is server-side, both screens
 * receive the same `cart:updated`). Fallback: when the socket is down the cashier
 * window keeps a local cart (lib/pos/cart.ts) and mirrors it to the customer
 * display through BroadcastChannel — same browser, no network needed.
 */
import {
  POS_WS_PATH,
  POS_WS_PROTOCOL,
  type PosClientEvent,
  type PosEnvelope,
  type PosServerEvent,
} from "./protocol";

export type PosSyncMode = "connecting" | "ws" | "local";

export interface PosSyncOptions {
  sessionId: number;
  tenantId: string;
  /** Returns a fresh access token (called on every (re)connect) */
  getToken: () => string | Promise<string>;
  /** ws(s)://host:port — defaults to NEXT_PUBLIC_POS_WS_URL or ws://<host>:3002 */
  wsUrl?: string;
  onEvent: (event: PosEnvelope<PosServerEvent>, source: "ws" | "local") => void;
  onMode?: (mode: PosSyncMode) => void;
  /** The server closed with 4401/4403 or kept refusing the handshake (bad / expired token) */
  onRejected?: () => void;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 10_000;

export const localChannelName = (sessionId: number) => `bizone-pos-${sessionId}`;

export class PosSyncClient {
  private ws: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private pending = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  /** Consecutive sockets that closed before opening (handshake refused) */
  private refused = 0;
  private closed = false;
  mode: PosSyncMode = "connecting";

  constructor(private readonly opts: PosSyncOptions) {}

  start() {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(localChannelName(this.opts.sessionId));
      this.channel.onmessage = (e: MessageEvent) => this.opts.onEvent(e.data, "local");
    }
    void this.connect();
    return this;
  }

  stop() {
    this.closed = true;
    clearTimeout(this.retry);
    this.ws?.close(1000);
    this.channel?.close();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("closed"));
    }
    this.pending.clear();
  }

  /** Send an event and wait for the server's ack (rejects with the server's error message) */
  send(event: PosClientEvent): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Mất kết nối máy chủ POS — đang dùng chế độ cục bộ"));
    }
    const requestId = Math.random().toString(36).slice(2, 10);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Máy chủ POS không phản hồi"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...event, requestId }));
    });
  }

  /** Fallback mode: the cashier window mirrors its local state to other windows */
  broadcastLocal(event: PosServerEvent) {
    this.channel?.postMessage({ ...event, at: new Date().toISOString() });
  }

  private setMode(mode: PosSyncMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.opts.onMode?.(mode);
  }

  private url() {
    const base =
      this.opts.wsUrl ??
      process.env.NEXT_PUBLIC_POS_WS_URL ??
      (typeof location !== "undefined"
        ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3002`
        : "ws://localhost:3002");
    return `${base}${POS_WS_PATH}/${this.opts.sessionId}?tenant=${encodeURIComponent(this.opts.tenantId)}`;
  }

  private async connect() {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url(), [POS_WS_PROTOCOL, await this.opts.getToken()]);
    } catch {
      return this.scheduleReconnect();
    }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.attempts = 0;
      this.refused = 0;
      this.setMode("ws");
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as PosEnvelope<PosServerEvent>;
      const waiter = msg.requestId ? this.pending.get(msg.requestId) : undefined;
      if (waiter && (msg.type === "ack" || msg.type === "error")) {
        clearTimeout(waiter.timer);
        this.pending.delete(msg.requestId!);
        if (msg.type === "ack") waiter.resolve();
        else waiter.reject(new Error(msg.data.message));
        return;
      }
      this.opts.onEvent(msg, "ws");
    };
    ws.onclose = (e) => {
      if (this.ws === ws) this.ws = null;
      if (e.code === 4401 || e.code === 4403) this.opts.onRejected?.();
      // Browsers hide the HTTP status of a refused handshake; 3 refusals in a row → report it
      else if (!opened && ++this.refused === 3) this.opts.onRejected?.();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.closed) return;
    this.setMode("local");
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts++);
    this.retry = setTimeout(() => void this.connect(), delay);
  }
}
