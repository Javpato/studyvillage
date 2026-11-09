import {rtcConfiguration,signalingOptions} from './config';
import type { DataConnection, MediaConnection, Peer } from 'peerjs';
import type { DataChannel, MediaCall, TransportEndpoint } from '../transport/types';

/** Compatibility export: defaults to STUN, with only the user's explicit TURN configuration added. */
export const STUN_ONLY_CONFIG:RTCConfiguration={get iceServers(){return rtcConfiguration().iceServers;},get iceTransportPolicy(){return rtcConfiguration().iceTransportPolicy;}};
function dataAdapter(connection: DataConnection): DataChannel {
  return {
    endpoint: connection.peer,
    get open() { return connection.open; },
    get bufferedAmount() { return connection.dataChannel?.bufferedAmount ?? 0; },
    send: data => { void connection.send(data); }, close: () => connection.close(),
    onOpen: callback => { connection.on('open', callback); return () => connection.off('open', callback); },
    onData: callback => { connection.on('data', callback); return () => connection.off('data', callback); },
    onClose: callback => {
      const failed = () => { connection.close(); callback(); };
      connection.on('close', callback); connection.on('error', failed);
      return () => { connection.off('close', callback); connection.off('error', failed); };
    },
  };
}
function mediaAdapter(connection: MediaConnection): MediaCall {
  let retry: ReturnType<typeof setTimeout> | undefined;
  const limit = (kind: 'audio' | 'screen' | 'camera') => {
    const apply = () => {
      for (const sender of connection.peerConnection?.getSenders() ?? []) {
        if (!sender.track) continue;
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) continue;
        for (const encoding of parameters.encodings) {
          encoding.maxBitrate = kind === 'audio' ? 48_000 : kind === 'camera' ? 6_000_000 : 12_000_000;
          if (kind !== 'audio') encoding.maxFramerate = 30;
        }
        if (kind === 'camera') parameters.degradationPreference = 'maintain-resolution';
        void sender.setParameters(parameters).catch(() => { /* Browser may not expose bitrate controls. */ });
      }
    };
    apply();
    retry = setTimeout(apply, 1_000);
  };
  connection.on('close', () => { if (retry) clearTimeout(retry); });
  return {
    endpoint: connection.peer, metadata: connection.metadata,
    answer: () => connection.answer(), close: () => { if (retry) clearTimeout(retry); connection.close(); },
    onStream: callback => { connection.on('stream', callback); return () => connection.off('stream', callback); },
    onClose: callback => {
      const failed = () => { connection.close(); callback(); };
      connection.on('close', callback); connection.on('error', failed);
      return () => { connection.off('close', callback); connection.off('error', failed); };
    },
    limitBitrate: limit,
  };
}
/** Called exclusively after an explicit host/join action. No PeerJS object exists on import. */
export async function createPeerEndpoint(requestedId?:string): Promise<TransportEndpoint> {
  const { Peer } = await import('peerjs');
  const options={...signalingOptions(),config:rtcConfiguration(),debug:0 as const};
  const peer:Peer=requestedId?new Peer(requestedId,options):new Peer(options);
  const connections = new Set<(channel: DataChannel) => void>();
  const calls = new Set<(call: MediaCall) => void>();
  const changes = new Set<(connected: boolean) => void>();
  let destroyed = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  peer.on('connection', connection => {
    // This application has no binary/file transfer channel.
    if (connection.serialization !== 'raw' || connections.size === 0) { connection.close(); return; }
    for (const callback of connections) callback(dataAdapter(connection));
  });
  peer.on('call', call => { if (!calls.size) call.close(); else for (const callback of calls) callback(mediaAdapter(call)); });
  peer.on('disconnected', () => {
    for (const callback of changes) callback(false);
    if (!destroyed) reconnect = setTimeout(() => { if (!destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* Existing P2P links remain valid. */ } } }, 2_000);
  });
  peer.on('open', () => { for (const callback of changes) callback(true); });
  peer.on('error', () => { for (const callback of changes) callback(false); });
  const id = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { peer.destroy(); reject(new Error('No se pudo abrir la señalización.')); }, 15_000);
    const opened = (endpoint: string) => { clearTimeout(timeout); peer.off('error', failed); resolve(endpoint); };
    const failed = () => { clearTimeout(timeout); peer.off('open', opened); peer.destroy(); reject(new Error('Señalización no disponible; revisa la red.')); };
    peer.once('open', opened); peer.once('error', failed);
  });
  return {
    id,
    connect: endpoint => dataAdapter(peer.connect(endpoint, { reliable: true, serialization: 'raw', label: 'studyvillage-v1' })),
    call: (endpoint, stream, metadata) => mediaAdapter(peer.call(endpoint, stream, { metadata })),
    onConnection: callback => { connections.add(callback); return () => connections.delete(callback); },
    onCall: callback => { calls.add(callback); return () => calls.delete(callback); },
    onSignalingChange: callback => { changes.add(callback); return () => changes.delete(callback); },
    destroy: () => { destroyed = true; if (reconnect) clearTimeout(reconnect); connections.clear(); calls.clear(); changes.clear(); peer.destroy(); },
  };
}
