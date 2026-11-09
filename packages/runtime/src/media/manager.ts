import { t } from '../../../../app/src/i18n';
import type { MediaView, RemoteMedia, ScreenPhase } from '../../../core/src/protocol/types';
import { mediaMetadataSchema, type MediaMetadata } from '../../../core/src/protocol/schema';
import type { MediaCall, TransportEndpoint } from '../transport/types';

export interface MediaDevicesAdapter {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
}
export interface MediaPeer { identityId: string; endpoint: string; sendToken: string; receiveToken: string }
/** `room` is 'village', 'house:<id>' or 'pair:<a>:<b>'; peers are everyone you exchange media with there. */
export interface MediaContext { sessionId: string; epoch: number; identityId: string; room: string; roomName: string; peers: MediaPeer[]; audience?: 'proximity'|'channel' }
interface ActiveCall { call: MediaCall; identityId: string; kind: 'audio' | 'screen'; stream?: MediaStream; unsubscribe: (() => void)[] }

export class MediaManager {
  private endpoint?: TransportEndpoint;
  private context: MediaContext | null = null;
  private microphone: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private outgoing = new Map<string, ActiveCall>();
  private incoming = new Map<string, ActiveCall>();
  private muted = false;
  private deafened = false;
  private pushToTalk = false;
  private talking = false;
  private phase: ScreenPhase = 'OFF';
  private error: string | null = null;
  private consentGeneration = 0;
  private screenGeneration = 0;
  private captureUnsupported = false;
  private microphonePending = false;
  constructor(private changed: () => void, private devices?: MediaDevicesAdapter, private received?: (identityId: string, kind: 'audio' | 'screen') => void) {}
  get view(): MediaView {
    const remote: RemoteMedia[] = [];
    for (const item of this.incoming.values()) if (item.stream) remote.push({ identityId: item.identityId, kind: item.kind, stream: item.stream });
    return {
      screenAvailable: !this.captureUnsupported && typeof this.currentDevices()?.getDisplayMedia === 'function' && (typeof isSecureContext === 'undefined' || isSecureContext),
      micEnabled: !!this.microphone, muted: this.muted, deafened: this.deafened, pushToTalk: this.pushToTalk,
      talking: !!this.microphone && !this.muted && (!this.pushToTalk || this.talking), screenPhase: this.phase,
      localScreen: this.screen, remote, audience: this.context ? t('{room} · {count} persona(s) pueden oírte', { room: this.context.roomName, count: this.context.peers.length }) : t('Nadie: conéctate a una aldea para hablar'), error: this.error,
    };
  }
  attach(endpoint: TransportEndpoint): void { this.endpoint = endpoint; }
  setContext(context: MediaContext | null): void {
    const previous = this.context;
    const changedRoom = previous?.sessionId !== context?.sessionId || previous?.epoch !== context?.epoch || previous?.room !== context?.room;
    const proximity=(c:MediaContext)=>c.audience==='proximity'||(!c.audience&&/^(village$|area:|house:)/.test(c.room));
    const movement=previous&&context&&previous.sessionId===context.sessionId&&previous.epoch===context.epoch&&previous.identityId===context.identityId&&proximity(previous)&&proximity(context);
    // Moving changes listeners, not the user's microphone choice. Old calls close first.
    if(changedRoom){if(movement){this.closeAllCalls();this.stopScreen();}else this.stopAll();}
    this.context = context;
    for (const [key, item] of this.incoming) {
      if (!context?.peers.some(peer => peer.identityId === item.identityId && peer.endpoint === item.call.endpoint)) this.closeCall(this.incoming, key);
    }
    for (const [key, item] of this.outgoing) {
      if (!context?.peers.some(peer => peer.identityId === item.identityId && peer.endpoint === item.call.endpoint)) this.closeCall(this.outgoing, key);
    }
    this.reconcile(); this.changed();
  }
  /** Drop the old proximity audience before navigation, retaining the capture grant. */
  moveAudience():void {this.closeAllCalls();this.stopScreen();if(this.context)this.context={...this.context,peers:[]};this.applyMute();this.changed();}
  /** Session/channel revocation remains distinct from movement. */
  suspend(): void { this.stopAll(); this.context = null; this.changed(); }
  private currentDevices(): MediaDevicesAdapter | undefined {
    return this.devices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);
  }
  setCompanionMicrophone(stream:MediaStream|null):void {
    if(stream&&!this.context)throw Error('Conéctate a una aldea para activar el micrófono.');
    if(stream&&!stream.getAudioTracks().length)throw Error('No audio track');
    this.consentGeneration++;this.microphonePending=false;this.stopMicrophone();this.microphone=stream;
    if(stream)for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(this.microphone===stream){this.stopMicrophone();this.changed();}},{once:true});
    this.applyMute();this.reconcile();this.changed();
  }
  setCompanionScreen(stream:MediaStream|null):void {
    if(stream&&!this.context)throw Error('Conéctate a una aldea para compartir pantalla.');
    if(stream&&!stream.getVideoTracks().length)throw Error('No video track');
    this.stopScreen();this.screen=stream;if(stream){this.phase='CAPTURING_LOCAL';for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(this.screen===stream)this.stopScreen();},{once:true});}this.reconcile();this.changed();
  }
  async toggleMicrophone(): Promise<void> {
    if (this.microphone || this.microphonePending) {
      this.consentGeneration++; this.microphonePending = false; this.stopMicrophone(); this.changed(); return;
    }
    if (!this.context) { this.error = 'Conéctate a una aldea para activar el micrófono.'; this.changed(); return; }
    const devices = this.currentDevices();
    if (!devices?.getUserMedia) { this.error = 'El micrófono no está disponible en este entorno.'; this.changed(); return; }
    const generation = this.consentGeneration;
    this.microphonePending = true; this.error = null; this.changed();
    try {
      const stream = await devices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation !== this.consentGeneration || !this.context) { this.stopTracks(stream); return; }
      if (!stream.getAudioTracks().length) { this.stopTracks(stream); throw new Error('No audio track'); }
      this.microphone = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (this.microphone === stream) { this.stopMicrophone(); this.changed(); } }, { once: true });
      this.applyMute(); this.reconcile();
    } catch { if (generation === this.consentGeneration) this.error = 'No se pudo activar el micrófono; revisa el permiso del sistema.'; }
    finally { if (generation === this.consentGeneration) this.microphonePending = false; this.changed(); }
  }
  async startScreen(withAudio = false): Promise<void> {
    if (this.screen || this.phase === 'REQUESTING_OS_PERMISSION') return;
    if (!this.context) { this.error = 'Conéctate a una aldea para compartir pantalla.'; this.changed(); return; }
    const devices = this.currentDevices();
    if (!devices?.getDisplayMedia) { this.phase = 'NOT_SUPPORTED'; this.error = 'La captura de pantalla no está disponible en este entorno.'; this.changed(); return; }
    const consent = this.consentGeneration;
    const generation = ++this.screenGeneration;
    this.phase = 'REQUESTING_OS_PERMISSION'; this.error = null; this.changed();
    try {
      const mobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
      const stream = await devices.getDisplayMedia({
        video: {
          width: { ideal: mobile ? 1280 : 3840 },
          height: { ideal: mobile ? 720 : 2160 },
          frameRate: { ideal: mobile ? 15 : 30, max: mobile ? 15 : 30 },
        },
        audio: withAudio,
      });
      if (consent !== this.consentGeneration || generation !== this.screenGeneration || !this.context) { this.stopTracks(stream); return; }
      if (!stream.getVideoTracks().length) { this.stopTracks(stream); throw new Error('No video track'); }
      for (const track of stream.getVideoTracks()) {
        if ('contentHint' in track) {
          try { (track as MediaStreamTrack & { contentHint: string }).contentHint = 'detail'; } catch { /* Optional hint */ }
        }
      }
      for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>this.changed(),{once:true});
      this.screen = stream; this.phase = 'CAPTURING_LOCAL'; this.changed();
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (this.screen === stream) { this.stopScreen(); this.phase = 'SOURCE_ENDED'; this.changed(); }
      }, { once: true });
      this.reconcile();
    } catch (error) {
      if (consent === this.consentGeneration && generation === this.screenGeneration) {
        const unsupported = error instanceof Error && error.name === 'NotSupportedError';
        this.captureUnsupported = unsupported; this.phase = unsupported ? 'NOT_SUPPORTED' : 'DENIED';
        this.error = unsupported ? 'La captura de pantalla no está disponible en este entorno.' : 'La captura fue cancelada o el sistema no concedió el permiso.';
      }
    } finally { this.changed(); }
  }
  stopScreen(): void {
    this.screenGeneration++;
    const stream = this.screen; this.screen = null;
    for (const [key, item] of this.outgoing) if (item.kind === 'screen') this.closeCall(this.outgoing, key);
    if (stream) this.stopTracks(stream);
    this.phase = 'OFF'; this.changed();
  }
  setMuted(value: boolean): void { this.muted = value; this.applyMute(); this.changed(); }
  setDeafened(value: boolean): void {
    this.deafened = value;
    for (const item of this.incoming.values()) for (const track of item.stream?.getAudioTracks() ?? []) track.enabled = !value;
    this.changed();
  }
  setPushToTalk(value: boolean): void { this.pushToTalk = value; this.talking = false; this.applyMute(); this.changed(); }
  setTalking(value: boolean): void { this.talking = value; this.applyMute(); this.changed(); }
  private applyMute(): void {
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = !this.muted && (!this.pushToTalk || this.talking);
  }
  receive(call: MediaCall): void {
    const parsed = mediaMetadataSchema.safeParse(call.metadata);
    const context = this.context;
    if (!parsed.success || !context) { call.close(); return; }
    const metadata = parsed.data;
    const peer = context.peers.find(peer => peer.endpoint === call.endpoint && peer.identityId === metadata.identityId);
    if (!peer || metadata.token !== peer.receiveToken || metadata.sessionId !== context.sessionId || metadata.epoch !== context.epoch || metadata.room !== context.room) { call.close(); return; }
    const key = `${metadata.identityId}/${metadata.kind}`;
    if (this.incoming.has(key) || this.incoming.size >= 46) { call.close(); return; }
    const item: ActiveCall = { call, identityId: metadata.identityId, kind: metadata.kind, unsubscribe: [] };
    this.incoming.set(key, item);
    item.unsubscribe.push(call.onClose(() => { this.closeCall(this.incoming, key); this.changed(); }));
    item.unsubscribe.push(call.onStream(stream => {
      const current = this.context;
      if (this.incoming.get(key) !== item || !current || current.room !== metadata.room || !current.peers.some(p => p.identityId === metadata.identityId && p.endpoint === call.endpoint && p.receiveToken === metadata.token)) { this.stopTracks(stream); this.closeCall(this.incoming, key); return; }
      item.stream = stream;
      for (const track of stream.getAudioTracks()) track.enabled = !this.deafened;
      for (const track of item.kind==='screen'?stream.getVideoTracks():stream.getTracks()) track.addEventListener('ended', () => { if (this.incoming.get(key) === item) { this.closeCall(this.incoming, key); this.changed(); } }, { once: true });
      this.received?.(metadata.identityId, metadata.kind);
      this.changed();
    }));
    try { call.answer(); } catch { this.closeCall(this.incoming, key); }
  }
  confirmReceiving(identityId: string, kind: 'audio' | 'screen'): void {
    if (kind === 'screen' && this.screen && this.outgoing.has(`${identityId}/screen`)) { this.phase = 'SENDING'; this.changed(); }
  }
  private reconcile(): void {
    const context = this.context;
    if (!context || !this.endpoint) return;
    for (const peer of context.peers) {
      for (const [kind, stream] of [['audio', this.microphone], ['screen', this.screen]] as const) {
        const key = `${peer.identityId}/${kind}`;
        if (!stream || this.outgoing.has(key) || this.outgoing.size >= 46) continue;
        const metadata: MediaMetadata = { v: 2, kind, sessionId: context.sessionId, epoch: context.epoch, room: context.room, identityId: context.identityId, token: peer.sendToken };
        try {
          const call = this.endpoint.call(peer.endpoint, stream, metadata);
          const item: ActiveCall = { call, identityId: peer.identityId, kind, unsubscribe: [] };
          this.outgoing.set(key, item);
          item.unsubscribe.push(call.onClose(() => {
            this.closeCall(this.outgoing, key);
            if (kind === 'screen' && this.screen) { this.phase = 'NETWORK_FAILED'; this.error = 'Se interrumpió una conexión de pantalla.'; }
            this.changed();
          }));
          // Outgoing calls are send-only. A remote stream must never bypass incoming authorization.
          item.unsubscribe.push(call.onStream(remote => this.stopTracks(remote)));
          call.limitBitrate(kind);
          if (kind === 'screen') this.phase = 'NEGOTIATING';
        } catch { this.error = 'No se pudo iniciar una conexión de medios.'; if (kind === 'screen') this.phase = 'NETWORK_FAILED'; }
      }
    }
    // SENDING waits for an authenticated receiver to acknowledge its stream event.
  }
  private closeCall(map: Map<string, ActiveCall>, key: string): void {
    const item = map.get(key);
    if (!item) return;
    map.delete(key);
    for (const unsubscribe of item.unsubscribe) unsubscribe();
    if (item.stream) this.stopTracks(item.stream);
    try { item.call.close(); } catch { /* Already closed. */ }
  }
  private stopTracks(stream: MediaStream): void { for (const track of stream.getTracks()) track.stop(); }
  private stopMicrophone(): void {
    const stream = this.microphone; this.microphone = null; this.talking = false;
    for (const [key, item] of this.outgoing) if (item.kind === 'audio') this.closeCall(this.outgoing, key);
    if (stream) this.stopTracks(stream);
  }
  /** Drops every call but keeps local capture, so it can be re-offered to a new room. */
  private closeAllCalls(): void {
    for (const key of [...this.outgoing.keys()]) this.closeCall(this.outgoing, key);
    for (const key of [...this.incoming.keys()]) this.closeCall(this.incoming, key);
    if (this.screen) this.phase = 'CAPTURING_LOCAL';
  }
  private stopAll(): void {
    this.consentGeneration++; this.microphonePending = false;
    this.stopMicrophone(); this.stopScreen();
    for (const key of this.incoming.keys()) this.closeCall(this.incoming, key);
  }
  dispose(): void { this.suspend(); this.endpoint = undefined; }
}
