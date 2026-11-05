/** Local authenticated coturn loopback fixture; does not claim external-network reachability. */
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const binary=process.env.TURNSERVER_BIN;if(!binary)throw Error('Set TURNSERVER_BIN to an installed coturn turnserver executable.');
const temp=await mkdtemp(path.join(tmpdir(),'studyvillage-relay-'));const port=24000+Math.floor(Math.random()*1000);
const child=spawn(binary,['-n','--listening-ip=127.0.0.1','--relay-ip=127.0.0.1',`--listening-port=${port}`,'--min-port=26000','--max-port=26050','--lt-cred-mech','--realm=studyvillage-fixture','--user=fixture:local-fixture-password','--no-tls','--no-dtls','--no-cli','--no-multicast-peers','--allow-loopback-peers','--simple-log',`--log-file=${temp}/turn.log`,`--pidfile=${temp}/turn.pid`,`--db=${temp}/turn.sqlite`],{stdio:['ignore','pipe','pipe']});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--allow-loopback-in-peer-connection']});
try{
 const page=await browser.newPage();await page.goto(process.env.SV_RELAY_TEST_URL||'http://127.0.0.1:3100');
 const result=await page.evaluate(async({port,module})=>{
  const {saveConnectionConfig,rtcConfiguration}=await import(module);
  saveConnectionConfig({turn:`turn:127.0.0.1:${port}?transport=udp`,username:'fixture',credential:'local-fixture-password',relayOnly:true});
  const a=new RTCPeerConnection(rtcConfiguration()),b=new RTCPeerConnection(rtcConfiguration());
  const candidates=[[],[]];let readyA=false,readyB=false;
  a.onicecandidate=e=>{if(e.candidate){if(readyB)void b.addIceCandidate(e.candidate);else candidates[0].push(e.candidate);}};
  b.onicecandidate=e=>{if(e.candidate){if(readyA)void a.addIceCandidate(e.candidate);else candidates[1].push(e.candidate);}};
  try{
   const channel=a.createDataChannel('relay-test'),reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Relay timed out')),20000);b.ondatachannel=e=>{e.channel.onmessage=event=>e.channel.send(event.data);};channel.onopen=()=>channel.send('StudyVillage through TURN');channel.onmessage=e=>{clearTimeout(timer);resolve(e.data);};});
   await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);readyB=true;for(const c of candidates[0])await b.addIceCandidate(c);
   await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);readyA=true;for(const c of candidates[1])await a.addIceCandidate(c);
   const payload=await reply;const stats=await a.getStats();let pair;stats.forEach(value=>{if(value.type==='candidate-pair'&&value.nominated&&value.state==='succeeded')pair=value;});
   return {payload,local:stats.get(pair.localCandidateId)?.candidateType,remote:stats.get(pair.remoteCandidateId)?.candidateType};
  }finally{a.close();b.close();}
 },{port,module:'/@fs'+fileURLToPath(new URL('../packages/runtime/src/signaling/config.ts',import.meta.url))});
 if(result.payload!=='StudyVillage through TURN'||result.local!=='relay'||result.remote!=='relay')throw Error(JSON.stringify(result));
 console.log('PASS: application RTC adapter, authenticated coturn, forced relay on both peers, real bidirectional data channel; loopback fixture only.');
}finally{await browser.close();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});await rm(temp,{recursive:true,force:true});}
