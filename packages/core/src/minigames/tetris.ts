import {z} from 'zod';
import type {RoomEngine} from './room';
export const tetrisActionSchema=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('join'),name:z.string().trim().min(1).max(48)}),
 z.strictObject({type:z.literal('ready'),ready:z.boolean()}),z.strictObject({type:z.literal('start')}),z.strictObject({type:z.literal('leave')}),z.strictObject({type:z.literal('ping')}),
 z.strictObject({type:z.literal('input'),round:z.number().int().nonnegative(),seq:z.number().int().nonnegative(),key:z.enum(['left','right','down','cw','ccw','drop','hold','shield','moss','roots']),target:z.string().max(100).optional()}),
]);
export type TetrisAction=z.infer<typeof tetrisActionSchema>;
export type Piece={kind:number;rotation:number;x:number;y:number};
export type TetrisPlayer={id:string;name:string;ready:boolean;board:number[][];piece:Piece;next:number[];hold:number|null;held:boolean;alive:boolean;score:number;lines:number;energy:number;cooldown:number;pending:{rows:number;at:number;hole:number}[];seq:number;lastSeen:number;gravity:number;lock:number;resets:number;bagIndex:number;combo:number;target:string|null;lastInput:number;rank:number|null};
export type TetrisView={phase:'lobby'|'countdown'|'playing'|'finished';round:number;startsAt:number;now:number;host:string|null;players:TetrisPlayer[];winner:string|null;solo:boolean};
const shapes=[[[0,1],[1,1],[2,1],[3,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[0,1],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,0],[0,1],[1,1],[2,1]],[[2,0],[0,1],[1,1],[2,1]]];
export function cells(piece:Piece):number[][]{let points=shapes[piece.kind].map(p=>[...p]);if(piece.kind!==1)for(let r=0;r<piece.rotation;r++)points=points.map(([x,y])=>[(piece.kind===0?3:2)-y,x]);return points.map(([x,y])=>[x+piece.x,y+piece.y]);}
export function fits(board:number[][],piece:Piece){return cells(piece).every(([x,y])=>x>=0&&x<10&&y<20&&(y<0||board[y][x]===0));}
export function shiftPiece(p:TetrisPlayer,key:string):boolean{let next={...p.piece};if(key==='left')next.x--;else if(key==='right')next.x++;else if(key==='down')next.y++;else if(key==='cw'||key==='ccw'){next.rotation=(next.rotation+(key==='cw'?1:3))%4;for(const [dx,dy]of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]]){const kick={...next,x:next.x+dx,y:next.y+dy};if(fits(p.board,kick)){p.piece=kick;return true;}}return false;}else return false;if(!fits(p.board,next))return false;p.piece=next;return true;}
const empty=()=>Array.from({length:20},()=>Array<number>(10).fill(0));
/** All rules and time are owned by the host/server; no client supplied board is trusted. */
export class TetrisGame implements RoomEngine<TetrisAction,TetrisView>{
 private players=new Map<string,TetrisPlayer>();private phase:TetrisView['phase']='lobby';private round=0;private startsAt=0;private host:string|null=null;private winner:string|null=null;private sequence:number[]=[];private randomState:number;
 constructor(seed=crypto.getRandomValues(new Uint32Array(1))[0],readonly solo=false){this.randomState=seed||1;}
 private random(n:number){let x=this.randomState;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;return this.randomState%n;}
 private number(index:number){while(this.sequence.length<=index){const bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=this.random(i+1);[bag[i],bag[j]]=[bag[j],bag[i]];}this.sequence.push(...bag);}return this.sequence[index];}
 private spawn(p:TetrisPlayer,now:number,kind?:number){p.piece={kind:kind??this.number(p.bagIndex++),rotation:0,x:3,y:-1};p.next=[0,1,2].map(i=>this.number(p.bagIndex+i));p.gravity=now;p.lock=0;p.resets=0;if(!fits(p.board,p.piece))this.kill(p);}
 private kill(p:TetrisPlayer){if(!p.alive)return;p.alive=false;p.rank=[...this.players.values()].filter(p=>p.alive).length+1;}
 apply(id:string,raw:TetrisAction,now:number){const a=tetrisActionSchema.parse(raw);let p=this.players.get(id);
  if(a.type==='join'){if(p){p.lastSeen=now;p.name=a.name;return;}if(this.players.size>=16)throw Error('La sala está llena.');p={id,name:a.name,ready:false,board:empty(),piece:{kind:0,rotation:0,x:3,y:-1},next:[],hold:null,held:false,alive:false,score:0,lines:0,energy:25,cooldown:0,pending:[],seq:-1,lastSeen:now,gravity:now,lock:0,resets:0,bagIndex:0,combo:0,target:null,lastInput:0,rank:null};this.players.set(id,p);this.host??=id;return;}
  if(!p)throw Error('Entra en la sala primero.');p.lastSeen=now;
  if(a.type==='ping')return;
  if(a.type==='leave'){this.kill(p);if(this.phase==='lobby'||this.phase==='finished')this.players.delete(id);if(this.host===id)this.host=[...this.players.keys()].find(x=>x!==id)??null;this.finish();return;}
  if(a.type==='ready'){if(this.phase==='lobby'||this.phase==='finished')p.ready=a.ready;return;}
  if(a.type==='start'){if(id!==this.host||!['lobby','finished'].includes(this.phase))throw Error('Solo quien organiza puede comenzar.');const all=[...this.players.values()];if(all.length<(this.solo?1:2)||all.some(p=>!p.ready))throw Error('Espera a que todos estén preparados.');this.round++;this.sequence=[];this.phase='countdown';this.startsAt=now+3000;this.winner=null;for(const p of all){Object.assign(p,{board:empty(),hold:null,held:false,alive:true,score:0,lines:0,energy:25,cooldown:0,pending:[],seq:-1,bagIndex:0,combo:0,rank:null,lastSeen:now});this.spawn(p,this.startsAt);}return;}
  if(a.type!=='input'||a.round!==this.round||a.seq<=p.seq||this.phase!=='playing'||!p.alive)return;
  p.seq=a.seq;if(now-p.lastInput<15)return;p.lastInput=now;if(a.target&&this.players.get(a.target)?.alive&&a.target!==id)p.target=a.target;
  if(['shield','moss','roots'].includes(a.key)){this.power(p,a.key,now);return;}
  if(a.key==='hold'){if(p.held)return;const old=p.hold;p.hold=p.piece.kind;this.spawn(p,now,old??undefined);p.held=true;return;}
  if(a.key==='drop'){while(shiftPiece(p,'down'))p.score+=2;this.lockPiece(p,now);this.finish();return;}
  const grounded=!fits(p.board,{...p.piece,y:p.piece.y+1});if(shiftPiece(p,a.key)){if(a.key==='down')p.score++;if(grounded&&p.resets<15){p.lock=now;p.resets++;}}this.finish();
 }
 private power(p:TetrisPlayer,key:string,now:number){const cost=key==='shield'?30:key==='moss'?40:50;if(p.energy<cost||p.cooldown>now)return;if(this.solo&&key!=='moss')return;p.energy-=cost;p.cooldown=now+10000;if(key==='shield')this.cancelRows(p,4);if(key==='moss'){let count=0;for(let y=19;y>=0&&count<4;y--)if(p.board[y].includes(8)){p.board[y]=p.board[y].map(v=>v===8?6:v);count++;}}if(key==='roots')this.attack(p,2,now);}
 private cancelRows(p:TetrisPlayer,rows:number){while(rows&&p.pending.length){const n=Math.min(rows,p.pending[0].rows);rows-=n;p.pending[0].rows-=n;if(!p.pending[0].rows)p.pending.shift();}return rows;}
 private attack(p:TetrisPlayer,rows:number,now:number){rows=this.cancelRows(p,rows);if(!rows||this.solo)return;const rivals=[...this.players.values()].filter(q=>q.id!==p.id&&q.alive);const target=rivals.find(q=>q.id===p.target)??rivals[this.random(Math.max(1,rivals.length))];if(target&&target.pending.reduce((n,a)=>n+a.rows,0)<40)target.pending.push({rows,at:now+3000,hole:this.random(10)});}
 private lockPiece(p:TetrisPlayer,now:number){const points=cells(p.piece);if(points.some(([,y])=>y<0)){this.kill(p);return;}for(const [x,y]of points)p.board[y][x]=p.piece.kind+1;const left=p.board.filter(row=>!row.every(v=>v>0&&v!==8)),n=20-left.length;p.board=[...Array.from({length:n},()=>Array<number>(10).fill(0)),...left];if(n){p.score+=([0,100,300,500,800][n]??800)*(1+Math.floor(p.lines/10));p.lines+=n;p.energy=Math.min(100,p.energy+n*10);p.combo++;this.attack(p,Math.min(6,([0,0,1,2,4][n]??4)+(p.combo>=2?1:0)),now);}else p.combo=0;
  let allowance=4;while(allowance&&p.pending[0]?.at<=now){const attack=p.pending[0];if(p.board[0].some(Boolean)){this.kill(p);break;}p.board.shift();p.board.push(Array.from({length:10},(_,x)=>x===attack.hole?0:8));attack.rows--;allowance--;if(!attack.rows)p.pending.shift();}p.held=false;if(p.alive)this.spawn(p,now);
 }
 tick(now:number){if(this.phase==='countdown'&&now>=this.startsAt){this.phase='playing';for(const p of this.players.values())p.gravity=now;return true;}if(this.phase!=='playing')return false;
  for(const p of this.players.values()){if(!p.alive)continue;if(!this.solo&&now-p.lastSeen>15000){this.kill(p);continue;}const interval=Math.max(100,1000-Math.floor(p.lines/10)*80);if(now-p.gravity>=interval){shiftPiece(p,'down');p.gravity=now;}if(!fits(p.board,{...p.piece,y:p.piece.y+1})){if(!p.lock)p.lock=now;if(now-p.lock>=500)this.lockPiece(p,now);}else p.lock=0;}this.finish();return true;
 }
 private finish(){if(this.phase!=='playing')return;const alive=[...this.players.values()].filter(p=>p.alive);if(alive.length<=(this.solo?0:1)){this.phase='finished';this.winner=alive[0]?.id??null;if(alive[0])alive[0].rank=1;for(const p of this.players.values())p.ready=false;}}
 cancel(){this.phase='lobby';for(const p of this.players.values()){p.alive=false;p.ready=false;}this.winner=null;}
 /** Pause is local-only; network rounds always keep running. */
 postpone(ms:number){if(!this.solo)return;this.startsAt+=ms;for(const p of this.players.values()){p.gravity+=ms;if(p.lock)p.lock+=ms;p.cooldown+=ms;}}
 audience(){return [...this.players.keys()];}
 viewFor(_id:string,now:number):TetrisView{return structuredClone({phase:this.phase,round:this.round,startsAt:this.startsAt,now,host:this.host,players:[...this.players.values()],winner:this.winner,solo:this.solo});}
}
