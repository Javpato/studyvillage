/**
 * Minimal RFC 6455 WebSocket server for text frames on top of node:http.
 * No third-party dependency, so the owner installs nothing but Node 24.
 * Supports masking, fragmentation, ping/pong, close, a per-message size
 * limit and back-pressure. Compression and binary messages are refused.
 */
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface Socket {
  readonly id: string;
  readonly remote: string;
  send(text: string): boolean;
  close(code?: number, reason?: string): void;
  onMessage(callback: (text: string) => void): void;
  onClose(callback: () => void): void;
  readonly buffered: number;
}

export interface UpgradeOptions { maxMessageBytes: number; maxBufferedBytes: number; allowOrigin(origin: string | undefined): boolean }

export function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer, id: string, options: UpgradeOptions): Socket | null {
  const key = request.headers['sec-websocket-key'];
  if (request.headers.upgrade?.toLowerCase() !== 'websocket' || typeof key !== 'string' || request.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return null;
  }
  if (!options.allowOrigin(request.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return null; }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return new WsConnection(socket, id, String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? ''), options, head);
}

class WsConnection implements Socket {
  private buffer: Buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;
  private closed = false;
  private messageListeners: ((text: string) => void)[] = [];
  private closeListeners: (() => void)[] = [];
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  constructor(private readonly socket: Duplex, readonly id: string, readonly remote: string, private readonly options: UpgradeOptions, head: Buffer) {
    socket.on('data', chunk => this.receive(chunk as Buffer));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    if (head.length) this.receive(head);
  }
  get buffered(): number { return (this.socket as unknown as { writableLength?: number }).writableLength ?? 0; }
  onMessage(callback: (text: string) => void): void { this.messageListeners.push(callback); }
  onClose(callback: () => void): void { this.closeListeners.push(callback); }

  send(text: string): boolean {
    if (this.closed) return false;
    // A slow client never makes the server buffer without bound.
    if (this.buffered > this.options.maxBufferedBytes) { this.close(1008, 'slow'); return false; }
    this.frame(0x1, Buffer.from(text, 'utf8'));
    return true;
  }
  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0); body.write(reason, 2);
    try { this.frame(0x8, body); } catch { /* Socket already gone. */ }
    this.closed = true;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref();
    this.finish();
  }
  private frame(opcode: number, payload: Buffer): void {
    const length = payload.length;
    const header = length < 126 ? Buffer.alloc(2) : length < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    if (length < 126) header[1] = length;
    else if (length < 65536) { header[1] = 126; header.writeUInt16BE(length, 2); }
    else { header[1] = 127; header.writeBigUInt64BE(BigInt(length), 2); }
    this.socket.write(Buffer.concat([header, payload]));
  }
  private receive(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    if (this.buffer.length > this.options.maxMessageBytes + 16) { this.close(1009, 'too big'); return; }
    for (;;) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0], second = this.buffer[1];
      const fin = (first & 0x80) !== 0, opcode = first & 0x0f, masked = (second & 0x80) !== 0;
      if (first & 0x70) { this.close(1002, 'rsv'); return; }
      if (!masked) { this.close(1002, 'unmasked'); return; }
      let length = second & 0x7f, offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(this.options.maxMessageBytes)) { this.close(1009, 'too big'); return; }
        length = Number(big); offset = 10;
      }
      if (length > this.options.maxMessageBytes) { this.close(1009, 'too big'); return; }
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (!this.handle(fin, opcode, payload)) return;
    }
  }
  private handle(fin: boolean, opcode: number, payload: Buffer): boolean {
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) { this.close(1002, 'control'); return false; }
      if (opcode === 0x8) { this.close(1000); return false; }
      if (opcode === 0x9) this.frame(0xA, payload);
      return true;
    }
    if (opcode === 0x2) { this.close(1003, 'text only'); return false; }
    if (opcode === 0x1) { if (this.fragments.length) { this.close(1002, 'interleaved'); return false; } }
    else if (opcode === 0x0) { if (!this.fragments.length) { this.close(1002, 'continuation'); return false; } }
    else { this.close(1002, 'opcode'); return false; }
    this.fragments.push(payload); this.fragmentBytes += payload.length;
    if (this.fragmentBytes > this.options.maxMessageBytes) { this.close(1009, 'too big'); return false; }
    if (!fin) return true;
    const whole = Buffer.concat(this.fragments); this.fragments = []; this.fragmentBytes = 0;
    let text: string;
    try { text = this.decoder.decode(whole); } catch { this.close(1007, 'utf8'); return false; }
    for (const listener of this.messageListeners) listener(text);
    return !this.closed;
  }
  private finish(): void {
    if (this.closeListeners.length === 0 && this.closed) return;
    this.closed = true;
    const listeners = this.closeListeners; this.closeListeners = []; this.messageListeners = [];
    for (const listener of listeners) { try { listener(); } catch { /* One listener cannot block cleanup. */ } }
  }
}
