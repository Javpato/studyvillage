import {z} from 'zod';
const KEY='studyvillage-network-v1';
export const connectionSchema=z.strictObject({
 signaling:z.string().max(300).default('').refine(raw=>{if(!raw)return true;try{const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}}),
 turn:z.string().max(300).default('').refine(raw=>!raw||/^turns?:[a-z0-9.-]+(?::\d{1,5})?(?:\?transport=(?:tcp|udp))?$/i.test(raw)),
 username:z.string().max(128).default(''),credential:z.string().max(512).default(''),relayOnly:z.boolean().default(false),
}).refine(value=>!value.relayOnly||!!value.turn).refine(value=>!value.turn||!!value.username&&!!value.credential);
export type ConnectionConfig=z.infer<typeof connectionSchema>;
export function readConnectionConfig():ConnectionConfig{try{return connectionSchema.parse(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return connectionSchema.parse({});}}
export function saveConnectionConfig(raw:unknown):void{localStorage.setItem(KEY,JSON.stringify(connectionSchema.parse(raw)));}
export function rtcConfiguration(config=readConnectionConfig()):RTCConfiguration {
 return {iceTransportPolicy:config.relayOnly?'relay':'all',iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},...(config.turn?[{urls:config.turn,username:config.username,credential:config.credential}]:[])]};
}
export function signalingOptions(config=readConnectionConfig()):{host?:string;port?:number;path?:string;secure?:boolean}{if(!config.signaling)return {};const url=new URL(config.signaling);return {host:url.hostname,port:Number(url.port)||443,path:url.pathname.endsWith('/')?url.pathname:url.pathname+'/',secure:true};}
