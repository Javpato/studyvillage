import type { DiagnosticEntry } from '../../../packages/core/src/protocol/types';
import { isNative } from '../../../packages/runtime/src/storage/local-store';

type DiagnosticKind = 'capabilities' | 'microphone' | 'screen' | 'stop' | 'loopback';
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** This diagnostic deliberately reports observations, never inferred capture support. */
export class MediaDiagnostic {
  entries: DiagnosticEntry[] = [];
  preview: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private loopStop: (() => void) | null = null;
  private generation = 0;
  private pendingCapture = false;
  private loopRunning = false;
  constructor(private changed: () => void = () => {}) {}

  private record(test: string, status: DiagnosticEntry['status'], detail: string) {
    this.entries = [...this.entries.filter(e => e.test !== test), { test, status, detail }].slice(-24);
    this.changed();
  }
  async run(kind: DiagnosticKind): Promise<void> {
    if (kind === 'capabilities') { this.capabilities(); return; }
    if (kind === 'stop') { this.stop(); return; }
    if (kind === 'loopback') { await this.loopback(); return; }
    if (this.pendingCapture) return;
    this.pendingCapture = true;
    const gen = this.generation;
    const label = kind === 'microphone' ? 'Captura de micrófono' : 'Captura de pantalla';
    try {
      const devices = navigator.mediaDevices;
      if (!devices || (kind === 'screen' ? !devices.getDisplayMedia : !devices.getUserMedia)) {
        this.record(label, 'UNSUPPORTED', 'La API no está disponible en este entorno. Prueba el diagnóstico en el runtime de destino.'); return;
      }
      this.record(label, 'UNVERIFIED', 'Esperando la decisión del selector del sistema…');
      const stream = kind === 'microphone'
        ? await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false })
        : await devices.getDisplayMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 10, max: 15 } }, audio: false });
      if (gen !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      const expected = kind === 'microphone' ? stream.getAudioTracks() : stream.getVideoTracks();
      if (!expected.length || expected.every(track => track.readyState !== 'live')) {
        stream.getTracks().forEach(t => t.stop()); throw new DOMException('No live track', 'NotReadableError');
      }
      if (kind === 'microphone') { this.mic?.getTracks().forEach(t => t.stop()); this.mic = stream; }
      else { this.screen?.getTracks().forEach(t => t.stop()); this.screen = stream; this.preview = stream; }
      stream.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (kind === 'screen' && this.screen === stream) { this.screen = null; this.preview = null; }
        if (kind === 'microphone' && this.mic === stream) this.mic = null;
        this.record(label, 'PASS', 'La fuente terminó desde el sistema; no se sigue capturando.');
      }, { once: true }));
      this.record(label, 'PASS', `${expected.length} pista(s) activa(s) entregada(s) por la API. Confirma visualmente/escuchando en otro equipo; esto no prueba envío P2P ni descarta un dispositivo de prueba.`);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      this.record(label, 'FAIL', `${name}. No se ha confirmado captura. No se guardan nombres de dispositivos ni contenido.`);
    } finally { this.pendingCapture = false; }
  }

  capabilities() {
    this.record('Runtime', 'PASS', window.studyVillageDesktop ? 'Linux / Chromium' : isNative() ? 'Tauri: diagnóstico dentro del WebView nativo.' : 'Navegador: este resultado no valida Tauri/WebKitGTK.');
    this.record('Contexto seguro', globalThis.isSecureContext ? 'PASS' : 'FAIL', 'Las APIs multimedia requieren localhost o un contexto seguro.');
    this.record('API micrófono', typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'PASS' : 'UNSUPPORTED', 'Presencia de API únicamente. La captura necesita un gesto y permiso.');
    this.record('API pantalla', typeof navigator.mediaDevices?.getDisplayMedia === 'function' ? 'PASS' : 'UNSUPPORTED', 'Presencia de API únicamente. Monitor/ventana los elige el sistema.');
    this.record('API WebRTC', typeof RTCPeerConnection === 'function' ? 'PASS' : 'UNSUPPORTED', 'La disponibilidad no demuestra conectividad entre redes.');
    this.record('Audio del sistema', 'UNVERIFIED', 'Desactivado en este corte; su soporte requiere una prueba específica del sistema.');
    this.record('Dos Linux / redes distintas', 'UNVERIFIED', 'Usa el protocolo de docs/MEDIA_TEST_PROTOCOL.md y registra evidencia real.');
  }

  stop() {
    ++this.generation;
    const tracks = [...(this.mic?.getTracks() ?? []), ...(this.screen?.getTracks() ?? [])];
    tracks.forEach(track => track.stop());
    this.mic = null; this.screen = null; this.preview = null;
    this.loopStop?.(); this.loopStop = null;
    this.record('Detener pistas', tracks.every(track => track.readyState === 'ended') ? 'PASS' : 'FAIL', `${tracks.length} pista(s) de captura detenida(s). Las conexiones de diagnóstico se cierran.`);
  }

  async loopback() {
    if (this.loopRunning) return;
    this.loopRunning = true;
    const gen = this.generation;
    const label = 'WebRTC sintético en este equipo';
    let a: RTCPeerConnection | undefined, b: RTCPeerConnection | undefined;
    let audio: AudioContext | undefined, stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let playback: HTMLVideoElement | undefined;
    let cancelled = false;
    const cleanup = () => {
      cancelled = true; if (timer) clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      a?.close(); b?.close();
      if (audio && audio.state !== 'closed') void audio.close();
      if (playback) { playback.pause(); playback.srcObject = null; }
    };
    this.loopStop = cleanup;
    try {
      this.record(label, 'UNVERIFIED', 'Probando video de Canvas, tono sintético y DataChannel. No se usa micrófono ni pantalla real.');
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d'); if (!ctx || !canvas.captureStream) throw new Error('CanvasCaptureUnavailable');
      let frame = 0;
      const paint = () => { ctx.fillStyle = frame++ % 2 ? '#497c65' : '#d58771'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#ffffff'; ctx.font = '24px sans-serif'; ctx.fillText(`Prueba sintética ${frame}`, 20, 95); };
      paint(); stream = canvas.captureStream(10); timer = setInterval(paint, 100);
      audio = new AudioContext(); await audio.resume();
      const oscillator = audio.createOscillator(); oscillator.frequency.value = 220;
      const destination = audio.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start();
      for (const track of destination.stream.getTracks()) stream.addTrack(track);
      a = new RTCPeerConnection({ iceServers: [] }); b = new RTCPeerConnection({ iceServers: [] });
      const toA: RTCIceCandidateInit[] = [], toB: RTCIceCandidateInit[] = [];
      const expandLocal = (c: RTCIceCandidate): RTCIceCandidateInit[] => {
        const json = c.toJSON();
        if (json.candidate && json.candidate.includes('.local')) {
          return [json, { ...json, candidate: json.candidate.replace(/[0-9a-fA-F-]+\.local/g, '127.0.0.1') }];
        }
        return [json];
      };
      const candLog: string[] = [];
      a.onicecandidate = event => {
        if (event.candidate && !cancelled) {
          candLog.push(`A:${event.candidate.candidate}`);
          for (const cand of expandLocal(event.candidate)) {
            if (b!.remoteDescription) void b!.addIceCandidate(cand).catch(() => {});
            else toB.push(cand);
          }
        }
      };
      b.onicecandidate = event => {
        if (event.candidate && !cancelled) {
          candLog.push(`B:${event.candidate.candidate}`);
          for (const cand of expandLocal(event.candidate)) {
            if (a!.remoteDescription) void a!.addIceCandidate(cand).catch(() => {});
            else toA.push(cand);
          }
        }
      };
      let dataReceived = false;
      const channel = a.createDataChannel('diagnostic'); channel.onopen = () => channel.send('studyvillage-synthetic');
      b.ondatachannel = event => { event.channel.onmessage = message => { dataReceived = message.data === 'studyvillage-synthetic'; }; };
      playback = document.createElement('video'); playback.muted = true; playback.autoplay = true; playback.playsInline = true;
      const received = new MediaStream(); playback.srcObject = received;
      b.ontrack = event => { received.addTrack(event.track); void playback!.play().catch(() => {}); };
      for (const track of stream.getTracks()) a.addTrack(track, stream);
      await a.setLocalDescription(await a.createOffer()); await b.setRemoteDescription(a.localDescription!);
      await Promise.all(toB.splice(0).map(candidate => b!.addIceCandidate(candidate).catch(() => {})));
      await b.setLocalDescription(await b.createAnswer()); await a.setRemoteDescription(b.localDescription!);
      await Promise.all(toA.splice(0).map(candidate => a!.addIceCandidate(candidate).catch(() => {})));
      const deadline = performance.now() + 10_000;
      let audioPackets = 0, videoFrames = 0;
      while (!cancelled && performance.now() < deadline) {
        const stats = await b.getStats();
        stats.forEach(stat => {
          if (stat.type === 'inbound-rtp') {
            if (stat.kind === 'audio') audioPackets = stat.packetsReceived ?? 0;
            if (stat.kind === 'video') videoFrames = (stat.framesDecoded || stat.packetsReceived) ?? 0;
          }
        });
        if (dataReceived && audioPackets > 0 && videoFrames > 0) break;
        await delay(100);
      }
      if (gen !== this.generation || cancelled) return;
      const passed = dataReceived && audioPackets > 0 && videoFrames > 0;
      this.record(label, passed ? 'PASS' : 'FAIL', `DataChannel: ${dataReceived ? 'recibido' : 'sin recepción'}; paquetes audio: ${audioPackets}; fotogramas video: ${videoFrames}. ICE local sin STUN. No valida captura real, NAT ni dos equipos.`);
    } catch (error) {
      if (gen === this.generation) this.record(label, 'FAIL', `${error instanceof Error ? error.name : 'UnknownError'}. Prueba sintética local fallida.`);
    } finally { cleanup(); this.loopStop = null; this.loopRunning = false; }
  }
  dispose() { this.stop(); }
}
