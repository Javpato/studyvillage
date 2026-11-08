import { describe, expect, it } from 'vitest';
import { MediaManager, type MediaContext } from '../../packages/runtime/src/media/manager';
import type { MediaCall, TransportEndpoint } from '../../packages/runtime/src/transport/types';

/** These devices, tracks, calls, and streams are FAKE. No OS capture, microphone, or cross-machine result is implied. */
class FakeTrack extends EventTarget {
  enabled = true; stopped = false;
  constructor(readonly kind: 'audio' | 'video') { super(); }
  stop(): void { this.stopped = true; }
  ended(): void { this.dispatchEvent(new Event('ended')); }
}
function fakeStream(kind: 'audio' | 'video') {
  const track = new FakeTrack(kind);
  const stream = { getTracks: () => [track], getAudioTracks: () => kind === 'audio' ? [track] : [], getVideoTracks: () => kind === 'video' ? [track] : [] } as unknown as MediaStream;
  return { stream, track };
}
class FakeCall implements MediaCall {
  answered = false; closed = false; limited?: 'audio' | 'screen';
  streams = new Set<(stream: MediaStream) => void>(); closes = new Set<() => void>();
  constructor(readonly endpoint: string, readonly metadata: unknown) {}
  answer(): void { this.answered = true; }
  close(): void { this.closed = true; }
  onStream(callback: (stream: MediaStream) => void): () => void { this.streams.add(callback); return () => this.streams.delete(callback); }
  onClose(callback: () => void): () => void { this.closes.add(callback); return () => this.closes.delete(callback); }
  limitBitrate(kind: 'audio' | 'screen'): void { this.limited = kind; }
}
function fakeEndpoint() {
  const sent: FakeCall[] = [];
  const endpoint = { call: (id: string, _stream: MediaStream, metadata: unknown) => { const call = new FakeCall(id, metadata); sent.push(call); return call; } } as unknown as TransportEndpoint;
  return { endpoint, sent };
}
const context = (): MediaContext => ({ sessionId: 'session', epoch: 1, room: `house:${'a'.repeat(64)}`, roomName: 'Prueba', identityId: 'a'.repeat(64), peers: [{ identityId: 'b'.repeat(64), endpoint: 'peer-b', receiveToken: 'x'.repeat(43), sendToken: 'y'.repeat(43) }] });
const metadata = () => ({ v: 2, kind: 'audio', sessionId: 'session', epoch: 1, room: `house:${'a'.repeat(64)}`, identityId: 'b'.repeat(64), token: 'x'.repeat(43) });

describe('media lifecycle with explicitly FAKE devices and streams', () => {
  it('requests real-device adapter APIs only on gestures and requires an authorized room', async () => {
    let requests = 0; const microphone = fakeStream('audio');
    const manager = new MediaManager(() => {}, { getUserMedia: async () => { requests++; return microphone.stream; } });
    expect(requests).toBe(0); await manager.toggleMicrophone(); expect(requests).toBe(0);
    manager.setContext(context()); expect(requests).toBe(0);
    await manager.toggleMicrophone(); expect(requests).toBe(1); expect(manager.view.micEnabled).toBe(true);
    manager.dispose(); expect(microphone.track.stopped).toBe(true);
  });
  it('requests up to 4K without capping the captured source to 1080p', async () => {
    let requested: DisplayMediaStreamOptions | undefined;
    const screen = fakeStream('video');
    const manager = new MediaManager(() => {}, { getUserMedia: async () => fakeStream('audio').stream, getDisplayMedia: async options => { requested = options; return screen.stream; } });
    manager.setContext(context());
    await manager.startScreen();
    expect(requested?.video).toEqual({ width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30, max: 30 } });
    manager.dispose();
    expect(screen.track.stopped).toBe(true);
  });
  it('applies mute/PTT, sends only to current authenticated peers, and stops before a room transition', async () => {
    const microphone = fakeStream('audio'), screen = fakeStream('video'), transport = fakeEndpoint();
    const manager = new MediaManager(() => {}, { getUserMedia: async () => microphone.stream, getDisplayMedia: async () => screen.stream });
    manager.attach(transport.endpoint); manager.setContext(context());
    await manager.toggleMicrophone(); await manager.startScreen();
    expect(transport.sent).toHaveLength(2); expect(transport.sent.every(call => call.endpoint === 'peer-b')).toBe(true);
    expect(transport.sent.map(call => call.limited)).toEqual(['audio', 'screen']);
    expect(manager.view.screenPhase).toBe('NEGOTIATING');
    manager.confirmReceiving('b'.repeat(64), 'screen'); expect(manager.view.screenPhase).toBe('SENDING');
    manager.setMuted(true); expect(microphone.track.enabled).toBe(false);
    manager.setMuted(false); manager.setPushToTalk(true); expect(microphone.track.enabled).toBe(false);
    manager.setTalking(true); expect(microphone.track.enabled).toBe(true);
    manager.setContext({ ...context(), room: `house:${'c'.repeat(64)}`, peers: [] });
    expect(microphone.track.stopped).toBe(true); expect(screen.track.stopped).toBe(true);
    expect(transport.sent.every(call => call.closed)).toBe(true); expect(manager.view.screenPhase).toBe('OFF'); expect(manager.view.micEnabled).toBe(false);
    manager.dispose();
  });
  it('rejects strangers, wrong house/epoch/token, and stops remote audio on deafen and removal', () => {
    const manager = new MediaManager(() => {}); manager.setContext(context());
    for (const data of [{ ...metadata(), epoch: 2 }, { ...metadata(), room: `house:${'c'.repeat(64)}` }, { ...metadata(), room: 'village' }, { ...metadata(), token: 'z'.repeat(43) }, { ...metadata(), identityId: 'c'.repeat(64) }]) {
      const call = new FakeCall('peer-b', data); manager.receive(call); expect(call.closed).toBe(true); expect(call.answered).toBe(false);
    }
    const stranger = new FakeCall('peer-stranger', metadata()); manager.receive(stranger); expect(stranger.closed).toBe(true);
    const call = new FakeCall('peer-b', metadata()); manager.receive(call); expect(call.answered).toBe(true);
    const remote = fakeStream('audio'); for (const callback of call.streams) callback(remote.stream);
    expect(manager.view.remote).toHaveLength(1); manager.setDeafened(true); expect(remote.track.enabled).toBe(false);
    manager.setDeafened(false); expect(remote.track.enabled).toBe(true);
    manager.setContext({ ...context(), peers: [] });
    expect(call.closed).toBe(true); expect(remote.track.stopped).toBe(true); expect(manager.view.remote).toHaveLength(0); manager.dispose();
  });
  it('revokes pending OS permission results after leaving the room', async () => {
    const screen = fakeStream('video'); let release!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>(resolve => { release = resolve; });
    const manager = new MediaManager(() => {}, { getUserMedia: async () => fakeStream('audio').stream, getDisplayMedia: () => permission });
    const transport = fakeEndpoint(); manager.attach(transport.endpoint); manager.setContext(context());
    const requesting = manager.startScreen(); expect(manager.view.screenPhase).toBe('REQUESTING_OS_PERMISSION');
    manager.suspend(); release(screen.stream); await requesting;
    expect(screen.track.stopped).toBe(true); expect(transport.sent).toHaveLength(0); expect(manager.view.localScreen).toBeNull(); manager.dispose();
  });
  it('revokes capture when switching into a private channel or returning to location voice', async () => {
    const audio = fakeStream('audio');
    const manager = new MediaManager(() => {}, { getUserMedia: async () => audio.stream });
    manager.attach(fakeEndpoint().endpoint);
    manager.setContext({ ...context(), room: 'village', roomName: 'La aldea' });
    await manager.toggleMicrophone();
    expect(manager.view.micEnabled).toBe(true);
    // Switching audiences always needs fresh microphone consent.
    manager.setContext({ ...context(), room: `pair:${'a'.repeat(64)}:${'b'.repeat(64)}`, roomName: 'Privado' });
    expect(manager.view.micEnabled).toBe(false);
    expect(audio.track.stopped).toBe(true);
    // Hanging up widens the audience again, so capture is revoked.
    manager.setContext({ ...context(), room: 'village', roomName: 'La aldea' });
    expect(manager.view.micEnabled).toBe(false);
    expect(audio.track.stopped).toBe(true);
    manager.dispose();
  });
  it('still revokes capture on ordinary room changes, such as walking out of a house', async () => {
    const audio = fakeStream('audio');
    const manager = new MediaManager(() => {}, { getUserMedia: async () => audio.stream });
    manager.attach(fakeEndpoint().endpoint);
    manager.setContext(context());
    await manager.toggleMicrophone();
    manager.setContext({ ...context(), room: 'village', roomName: 'La aldea' });
    expect(manager.view.micEnabled).toBe(false);
    expect(audio.track.stopped).toBe(true);
    manager.dispose();
  });
  it('reports unsupported/cancelled capture honestly and responds to source-ended', async () => {
    const unsupported = new MediaManager(() => {}, { getUserMedia: async () => fakeStream('audio').stream }); unsupported.setContext(context());
    await unsupported.startScreen(); expect(unsupported.view.screenPhase).toBe('NOT_SUPPORTED'); unsupported.dispose();
    const denied = new MediaManager(() => {}, { getUserMedia: async () => fakeStream('audio').stream, getDisplayMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }); denied.setContext(context());
    await denied.startScreen(); expect(denied.view.screenPhase).toBe('DENIED'); expect(denied.view.localScreen).toBeNull(); denied.dispose();
    const screen = fakeStream('video'); const manager = new MediaManager(() => {}, { getUserMedia: async () => fakeStream('audio').stream, getDisplayMedia: async () => screen.stream }); manager.setContext(context());
    await manager.startScreen(); screen.track.ended(); expect(manager.view.screenPhase).toBe('SOURCE_ENDED'); expect(manager.view.localScreen).toBeNull(); expect(screen.track.stopped).toBe(true); manager.dispose();
  });
});

it('hides an unsupported screen capture API but keeps permission denial retryable',async()=>{
 const unsupported=new MediaManager(()=>{},{getUserMedia:async()=>fakeStream('audio').stream,getDisplayMedia:async()=>{throw new DOMException('Unsupported','NotSupportedError');}});
 unsupported.setContext(context());expect(unsupported.view.screenAvailable).toBe(true);await unsupported.startScreen();expect(unsupported.view.screenAvailable).toBe(false);expect(unsupported.view.screenPhase).toBe('NOT_SUPPORTED');unsupported.dispose();
 const denied=new MediaManager(()=>{},{getUserMedia:async()=>fakeStream('audio').stream,getDisplayMedia:async()=>{throw new DOMException('Denied','NotAllowedError');}});
 denied.setContext(context());await denied.startScreen();expect(denied.view.screenAvailable).toBe(true);expect(denied.view.screenPhase).toBe('DENIED');denied.dispose();
});

it('requests optional display audio and stops both tracks when sharing ends',async()=>{
 const video=fakeStream('video'),audio=fakeStream('audio');let requested:DisplayMediaStreamOptions|undefined;
 const stream={getTracks:()=>[video.track,audio.track],getVideoTracks:()=>[video.track],getAudioTracks:()=>[audio.track]} as unknown as MediaStream;
 const manager=new MediaManager(()=>{},{getUserMedia:async()=>audio.stream,getDisplayMedia:async options=>{requested=options;return stream;}});
 manager.setContext(context());await manager.startScreen(true);expect(requested?.audio).toBe(true);expect(manager.view.localScreen?.getAudioTracks()).toHaveLength(1);manager.stopScreen();expect(video.track.stopped).toBe(true);expect(audio.track.stopped).toBe(true);
});
