import { LIMITS } from '../../../core/src/protocol/types';
import { parseWire, type WireMessage } from '../../../core/src/protocol/schema';
import { systemClock, type Clock, type DataChannel } from './types';

type Queued = { data: string; bytes: number; coalesce?: string };
/** Bounds include work waiting for WebCrypto: a peer cannot create an unbounded promise chain. */
export class BoundedChannel {
  private inbound: Queued[] = [];
  private outbound: Queued[] = [];
  private inboundBytes = 0;
  private outboundBytes = 0;
  private processing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private tokens = 160;
  private sendTokens = 120;
  private tokenTime: number;
  private sendTime: number;
  private unsubscribe: (() => void)[];
  constructor(readonly raw: DataChannel, private receive: (message: WireMessage) => Promise<void>, private failed: (reason: string) => void, private clock: Clock = systemClock) {
    this.tokenTime = this.sendTime = clock.now();
    this.unsubscribe = [raw.onData(data => this.enqueueInbound(data)), raw.onOpen(() => this.pump()), raw.onClose(() => this.close(false))];
  }
  get pendingMessages(): number { return this.outbound.length; }
  get pendingBytes(): number { return this.outboundBytes; }
  private fail(reason: string): void { if (!this.closed) { this.failed(reason); this.close(); } }
  private enqueueInbound(data: unknown): void {
    if (this.closed) return;
    const now = this.clock.now();
    this.tokens = Math.min(160, this.tokens + Math.max(0, now - this.tokenTime) * .12);
    this.tokenTime = now;
    if (this.tokens < 1) return this.fail('Se excedió el límite de mensajes.');
    this.tokens--;
    if (typeof data !== 'string') return this.fail('Formato de mensaje inválido.');
    const bytes = new TextEncoder().encode(data).byteLength;
    if (bytes > LIMITS.messageBytes || this.inbound.length >= LIMITS.queueMessages || this.inboundBytes + bytes > LIMITS.queueBytes) return this.fail('Cola de entrada fuera de límites.');
    this.inbound.push({ data, bytes }); this.inboundBytes += bytes;
    void this.drainInbound();
  }
  private async drainInbound(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (!this.closed && this.inbound.length) {
        const item = this.inbound[0];
        await this.receive(parseWire(item.data));
        if (this.closed) break;
        this.inbound.shift(); this.inboundBytes -= item.bytes;
      }
    } catch { this.fail('Mensaje inválido o no autorizado.'); }
    finally { this.processing = false; }
  }
  send(message: WireMessage, coalesce?: string): boolean {
    if (this.closed) return false;
    const data = JSON.stringify(message);
    const bytes = new TextEncoder().encode(data).byteLength;
    if (bytes > LIMITS.messageBytes) { this.failed('Mensaje demasiado grande.'); return false; }
    if (coalesce) {
      const old = this.outbound.findIndex(item => item.coalesce === coalesce);
      if (old >= 0) { this.outboundBytes -= this.outbound[old].bytes; this.outbound.splice(old, 1); }
    }
    if (this.outbound.length >= LIMITS.queueMessages || this.outboundBytes + bytes > LIMITS.queueBytes) {
      if (!coalesce) this.failed('Cola llena; el cambio todavía no se ha compartido.');
      return false;
    }
    this.outbound.push({ data, bytes, coalesce }); this.outboundBytes += bytes;
    this.pump(); return true;
  }
  private pump(): void {
    if (this.closed) return;
    if (this.timer) { this.clock.clearTimeout(this.timer); this.timer = undefined; }
    const now = this.clock.now();
    this.sendTokens = Math.min(120, this.sendTokens + Math.max(0, now - this.sendTime) * .12); this.sendTime = now;
    while (this.raw.open && this.outbound.length && this.raw.bufferedAmount < 262_144 && this.sendTokens >= 1) {
      const item = this.outbound.shift()!;
      this.outboundBytes -= item.bytes; this.sendTokens--;
      try { this.raw.send(item.data); } catch { this.fail('No se pudo enviar el mensaje.'); return; }
    }
    if (this.outbound.length) this.timer = this.clock.setTimeout(() => { this.timer = undefined; this.pump(); }, 20);
  }
  close(closeRaw = true): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) this.clock.clearTimeout(this.timer);
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.inbound = []; this.outbound = []; this.inboundBytes = this.outboundBytes = 0;
    if (closeRaw) this.raw.close();
  }
}
