import {it,expect} from 'vitest';
import {connectionSchema,rtcConfiguration,signalingOptions} from '../../packages/runtime/src/signaling/config';
it('adds only an explicitly configured relay and validates safe signaling addresses',()=>{
 const defaults=connectionSchema.parse({});expect(rtcConfiguration(defaults).iceServers).toHaveLength(1);expect(signalingOptions(defaults)).toEqual({});
 const config=connectionSchema.parse({signaling:'https://peer.example.org/my-peer',turn:'turns:relay.example.org:5349?transport=tcp',username:'alice',credential:'secret',relayOnly:true});
 expect(rtcConfiguration(config)).toMatchObject({iceTransportPolicy:'relay',iceServers:[{}, {urls:config.turn,username:'alice',credential:'secret'}]});expect(signalingOptions(config)).toEqual({host:'peer.example.org',port:443,path:'/my-peer/',secure:true});
 for(const input of [{relayOnly:true},{signaling:'http://peer.example.org'},{signaling:'https://user:secret@peer.example.org'},{turn:'https://example.org'},{turn:'turn:relay.example.org'}])expect(connectionSchema.safeParse(input).success).toBe(false);
});
