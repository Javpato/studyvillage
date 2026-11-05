import { describe, expect, it } from 'vitest';
import { GameCameraManager, cameraScene, type CameraContext } from '../../packages/runtime/src/media/game-camera';
import type { MediaCall, TransportEndpoint } from '../../packages/runtime/src/transport/types';
// Fake tracks and calls: these tests never activate a physical camera.
class Track extends EventTarget { stopped=false; enabled=true; contentHint=''; stop(){this.stopped=true;} }
function stream(audio=false) { const track=new Track(); return {track,stream:{getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>audio?[track]:[]} as unknown as MediaStream}; }
class Call implements MediaCall {
  closed=false; answered=false; limited='';streams=new Set<(s:MediaStream)=>void>();closes=new Set<()=>void>();
  constructor(readonly endpoint:string,readonly metadata:unknown){}
  answer(){this.answered=true;} close(){this.closed=true;}
  onStream(fn:(s:MediaStream)=>void){this.streams.add(fn);return()=>this.streams.delete(fn);}
  onClose(fn:()=>void){this.closes.add(fn);return()=>this.closes.delete(fn);}
  limitBitrate(kind:'audio'|'screen'|'camera'){this.limited=kind;}
}
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const context=():CameraContext=>({sessionId:'session',epoch:1,identityId:a,room:'area:community:game:werewolves',roomName:'werewolves',peers:[{identityId:b,endpoint:'b',sendToken:'y'.repeat(43),receiveToken:'x'.repeat(43),watching:true},{identityId:c,endpoint:'c',sendToken:'y'.repeat(43),receiveToken:'z'.repeat(43),watching:false}]});
const metadata=()=>({v:2,kind:'camera',sessionId:'session',epoch:1,identityId:b,room:'area:community:game:werewolves',token:'x'.repeat(43)});
const worldContext=(room='village:game:village'):CameraContext=>({...context(),room,roomName:'village'});
describe('optional game camera consent and audience',()=>{
  it('gives every floor and legal room an unambiguous camera scope',()=>{
    expect(cameraScene(a,{space:{floorId:'ground',roomId:null}})).toBe(`house:${a}:space:ground:floor`);
    expect(cameraScene(a,{space:{floorId:'ground',roomId:'-'}})).toBe(`house:${a}:space:ground:room:-`);
    expect(cameraScene(a,{space:{floorId:'ground',roomId:'floor'}})).toBe(`house:${a}:space:ground:room:floor`);
    expect(cameraScene(a)).toBe(`house:${a}`);expect(cameraScene(null,{areaId:'study'})).toBe('area:study');
  });
  it('closes live subscriptions when asleep, restricts the awake audience, and stops a dead player’s camera',async()=>{
    const video=stream(),remote=stream(),calls:Call[]=[];const camera=new GameCameraManager(()=>{},{getUserMedia:async()=>video.stream});
    camera.attach({call:(endpoint:string,_stream:MediaStream,metadata:unknown)=>{const call=new Call(endpoint,metadata);calls.push(call);return call;}} as unknown as TransportEndpoint);
    camera.setContext(context());camera.setPolicy({canSend:true,canReceive:true,audience:[b]});await camera.toggle();const incoming=new Call('b',metadata());camera.receive(incoming);for(const fn of incoming.streams)fn(remote.stream);
    expect(calls).toHaveLength(1);expect(camera.view.remote).toHaveLength(1);
    camera.setPolicy({canSend:true,canReceive:false,audience:[]});expect(incoming.closed).toBe(true);expect(remote.track.stopped).toBe(true);expect(calls[0].closed).toBe(true);expect(camera.view.remote).toEqual([]);expect(video.track.stopped).toBe(false);
    const sleepingOffer=new Call('b',metadata());camera.receive(sleepingOffer);expect(sleepingOffer.answered).toBe(false);expect(sleepingOffer.closed).toBe(true);
    camera.setPolicy({canSend:true,canReceive:true,audience:[b]});expect(calls).toHaveLength(2);
    camera.setPolicy({canSend:false,canReceive:true,audience:[]});expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();await camera.toggle();expect(camera.view.local).toBeNull();camera.dispose();
  });
  it('revokes an unresolved camera prompt when the authority reports the player’s death',async()=>{
    let release!:(s:MediaStream)=>void;const video=stream();const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>release=resolve)});camera.setContext(context());
    const opening=camera.toggle();camera.setPolicy({canSend:false,canReceive:true,audience:[]});release(video.stream);await opening;expect(video.track.stopped).toBe(true);expect(camera.view.pending).toBe(false);expect(camera.view.local).toBeNull();camera.dispose();
  });
  it('requests video-only Full HD after a gesture and sends only to viewers of the same game',async()=>{
    let requested:MediaStreamConstraints|undefined;const video=stream();const calls:Call[]=[];
    const camera=new GameCameraManager(()=>{},{getUserMedia:async constraints=>{requested=constraints;return video.stream;}});
    camera.attach({call:(endpoint:string,_stream:MediaStream,metadata:unknown)=>{const call=new Call(endpoint,metadata);calls.push(call);return call;}} as unknown as TransportEndpoint);
    expect(requested).toBeUndefined();await camera.toggle();expect(requested).toBeUndefined();camera.setContext(context());expect(requested).toBeUndefined();
    await camera.toggle();expect(requested).toEqual({audio:false,video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}});
    expect(calls).toHaveLength(1);expect(calls[0].endpoint).toBe('b');expect(calls[0].limited).toBe('camera');expect(camera.view.local).toBe(video.stream);
    camera.setContext({...context(),peers:context().peers.map(p=>({...p,watching:false}))});expect(calls[0].closed).toBe(true);expect(video.track.stopped).toBe(false);
    await camera.toggle();expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();camera.dispose();
  });
  it('authenticates sender, token, scene, session and game before receiving, and closes on removal',()=>{
    const camera=new GameCameraManager(()=>{});camera.setContext(context());
    for(const data of [{...metadata(),room:'area:community:game:gartic'},{...metadata(),epoch:2},{...metadata(),sessionId:'other'},{...metadata(),token:'z'.repeat(43)},{...metadata(),identityId:c}]){const call=new Call('b',data);camera.receive(call);expect(call.closed).toBe(true);expect(call.answered).toBe(false);}
    const call=new Call('b',metadata());camera.receive(call);expect(call.answered).toBe(true);const remote=stream();for(const fn of call.streams)fn(remote.stream);expect(camera.view.remote).toHaveLength(1);
    camera.setContext({...context(),peers:[]});expect(call.closed).toBe(true);expect(remote.track.stopped).toBe(true);expect(camera.view.remote).toHaveLength(0);camera.dispose();
  });
  it('revokes late permission results on close, cancel, scene change and game change',async()=>{
    for(const mode of ['close','cancel','scene','game']){
      let release!:(s:MediaStream)=>void;const video=stream();const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>{release=resolve;})});camera.setContext(context());
      const opening=camera.toggle();expect(camera.view.pending).toBe(true);
      if(mode==='close')camera.setContext(null);else if(mode==='cancel')await camera.toggle();else camera.setContext({...context(),room:mode==='scene'?'area:study:game:werewolves':'area:community:game:gartic'});
      release(video.stream);await opening;expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();expect(camera.view.pending).toBe(false);camera.dispose();
    }
  });
  it('keeps one floating-camera capture across areas, houses, floors and rooms while replacing scene-bound calls',async()=>{
    const video=stream(),calls:Call[]=[];let requests=0;
    const camera=new GameCameraManager(()=>{},{getUserMedia:async()=>{requests++;return video.stream;}});
    camera.attach({call:(endpoint:string,sent:MediaStream,meta:unknown)=>{expect(sent).toBe(video.stream);const call=new Call(endpoint,meta);calls.push(call);return call;}} as unknown as TransportEndpoint);
    camera.setContext(worldContext());await camera.toggle();
    for(const room of ['area:community:game:village','area:study:game:village',`house:${a}:game:village`,`house:${a}:space:ground:floor:game:village`,`house:${a}:space:ground:room:-:game:village`,'village:game:village']){
      const old=calls.at(-1)!;
      const incoming=new Call('b',{...metadata(),room:cameraRoom(old)});camera.receive(incoming);expect(incoming.answered).toBe(true);
      const remote=stream();for(const fn of incoming.streams)fn(remote.stream);
      camera.setContext(worldContext(room));
      expect(old.closed).toBe(true);expect(incoming.closed).toBe(true);expect(remote.track.stopped).toBe(true);
      expect(camera.view.remote).toEqual([]);expect(camera.view.local).toBe(video.stream);expect(video.track.stopped).toBe(false);
      expect(cameraRoom(calls.at(-1)!)).toBe(room);
      const stale=new Call('b',{...metadata(),room:cameraRoom(old)});camera.receive(stale);expect(stale.closed).toBe(true);expect(stale.answered).toBe(false);
    }
    expect(requests).toBe(1);expect(calls).toHaveLength(7);camera.dispose();expect(video.track.stopped).toBe(true);
  });
  it('keeps a permission prompt valid through ordinary travel and sends its result only to the final audience',async()=>{
    let release!:(s:MediaStream)=>void;const video=stream(),calls:Call[]=[];
    const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>release=resolve)});
    camera.attach({call:(endpoint:string,_sent:MediaStream,meta:unknown)=>{const call=new Call(endpoint,meta);calls.push(call);return call;}} as unknown as TransportEndpoint);
    camera.setContext(worldContext());const opening=camera.toggle();
    camera.setContext(worldContext('area:study:game:village'));
    const finalRoom=`house:${a}:space:upper:room:quiet:game:village`;camera.setContext(worldContext(finalRoom));
    expect(camera.view.pending).toBe(true);expect(calls).toHaveLength(0);
    release(video.stream);await opening;expect(camera.view.local).toBe(video.stream);expect(video.track.stopped).toBe(false);expect(camera.view.pending).toBe(false);
    expect(calls).toHaveLength(1);expect(cameraRoom(calls[0])).toBe(finalRoom);camera.dispose();
  });
  it('revokes floating-camera consent on close, cancellation, device suspension, session changes and game transitions',async()=>{
    for(const mode of ['close','cancel','suspend','session','epoch','identity','game'] as const){
      let release!:(s:MediaStream)=>void;const video=stream();const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>release=resolve)});
      camera.setContext(worldContext());const opening=camera.toggle();
      if(mode==='close')camera.setContext(null);
      else if(mode==='cancel')await camera.toggle();
      else if(mode==='suspend')camera.suspend();
      else camera.setContext({...worldContext(),...(mode==='session'?{sessionId:'new-session'}:mode==='epoch'?{epoch:2}:mode==='identity'?{identityId:c}:{room:'village:game:werewolves',roomName:'werewolves'})});
      release(video.stream);await opening;expect(video.track.stopped,mode).toBe(true);expect(camera.view.local,mode).toBeNull();expect(camera.view.pending,mode).toBe(false);camera.dispose();
    }
  });
  it('does not let a cancelled old prompt clear a newer request while travelling',async()=>{
    const releases:((stream:MediaStream)=>void)[]=[];const old=stream(),current=stream();
    const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>releases.push(resolve))});camera.setContext(worldContext());
    const first=camera.toggle();await camera.toggle();const second=camera.toggle();camera.setContext(worldContext('area:community:game:village'));
    releases[0](old.stream);await first;expect(old.track.stopped).toBe(true);expect(camera.view.pending).toBe(true);expect(camera.view.local).toBeNull();
    releases[1](current.stream);await second;expect(current.track.stopped).toBe(false);expect(camera.view.local).toBe(current.stream);expect(camera.view.pending).toBe(false);camera.dispose();
  });
  it('allows a fresh scene offer to a peer that rejected an earlier scene without reopening the camera',async()=>{
    const video=stream(),calls:Call[]=[];const camera=new GameCameraManager(()=>{},{getUserMedia:async()=>video.stream});
    camera.attach({call:(endpoint:string,_sent:MediaStream,meta:unknown)=>{const call=new Call(endpoint,meta);calls.push(call);return call;}} as unknown as TransportEndpoint);
    camera.setContext(worldContext());await camera.toggle();for(const close of [...calls[0].closes])close();
    camera.setContext(worldContext());expect(calls).toHaveLength(1);
    camera.setContext(worldContext('area:study:game:village'));expect(calls).toHaveLength(2);expect(video.track.stopped).toBe(false);camera.dispose();
  });
  it('rejects audio in a camera call and handles denied or ended capture without retaining tracks',async()=>{
    const camera=new GameCameraManager(()=>{},{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}});camera.setContext(context());await camera.toggle();expect(camera.view.pending).toBe(false);expect(camera.view.error).toContain('permiso');
    const call=new Call('b',metadata());camera.receive(call);const invalid=stream(true);for(const fn of call.streams)fn(invalid.stream);expect(call.closed).toBe(true);expect(invalid.track.stopped).toBe(true);camera.dispose();
    const video=stream();const live=new GameCameraManager(()=>{},{getUserMedia:async()=>video.stream});live.setContext(context());await live.toggle();video.track.dispatchEvent(new Event('ended'));expect(live.view.local).toBeNull();expect(video.track.stopped).toBe(true);live.dispose();
  });
});
function cameraRoom(call:Call):string{return (call.metadata as {room:string}).room;}
