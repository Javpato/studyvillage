export interface Clock {
  now(): number;
  wallNow(): number;
  setTimeout(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}
export const systemClock: Clock = {
  now: () => performance.now(), wallNow: () => Date.now(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds), clearTimeout: handle => clearTimeout(handle),
};
export interface DataChannel {
  readonly endpoint: string;
  readonly open: boolean;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(): void;
  onOpen(callback: () => void): () => void;
  onData(callback: (data: unknown) => void): () => void;
  onClose(callback: () => void): () => void;
}
export interface MediaCall {
  readonly endpoint: string;
  readonly metadata: unknown;
  answer(): void;
  close(): void;
  onStream(callback: (stream: MediaStream) => void): () => void;
  onClose(callback: () => void): () => void;
  limitBitrate(kind: 'audio' | 'screen' | 'camera'): void;
}
export interface TransportEndpoint {
  readonly id: string;
  connect(endpoint: string): DataChannel;
  call(endpoint: string, stream: MediaStream, metadata: unknown): MediaCall;
  onConnection(callback: (channel: DataChannel) => void): () => void;
  onCall(callback: (call: MediaCall) => void): () => void;
  onError?(callback: (kind: string) => void): () => void;
  onSignalingChange(callback: (connected: boolean) => void): () => void;
  destroy(): void;
}
export type TransportFactory = () => Promise<TransportEndpoint>;
