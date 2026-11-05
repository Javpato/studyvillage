import { describe, expect, it } from 'vitest';
import { configuredDeck, presetRoles, WerewolvesGame } from '../../packages/core/src/minigames/werewolves';
import { GarticGame } from '../../packages/core/src/minigames/gartic-phone';
import { StudyQuiz } from '../../packages/core/src/minigames/study-quiz';
import { HostOllamaGateway, flashcardDeckSchema } from '../../packages/runtime/src/ai/ollama-gateway';
import { botResponseSchema } from '../../packages/runtime/src/ai/gartic-bots';
import { DecorationHistory, placementError } from '../src/house/decoration';
import { furnitureRect } from '../src/house/model';
import { stepPosition } from '../src/world/model';
import { publicHouse } from '../../packages/runtime/src/storage/local-store';
import type { PublicHouse } from '../../packages/core/src/protocol/types';
const home = (): PublicHouse => ({ ownerId:'a'.repeat(64),revision:1,name:'Casa',theme:'mint',access:'open',furniture:[] });
const quizDeck = () => flashcardDeckSchema.parse({id:'q',title:'Prueba',topic:'Prueba',ownerId:'host',cards:[{id:'c',question:'Pregunta',answer:'Respuesta',topic:'Prueba',difficulty:'easy',tags:[],choices:['A','B'],correctChoice:1}],createdAt:0,updatedAt:0,provider:'manual',sourceType:'manual'});

describe('role cards and host controls',()=>{
  it('pads chosen sets with citizens and rejects impossible sets',()=>{
    expect(configuredDeck(6,{werewolf:1,cupid:1})).toEqual(['werewolf','cupid','villager','villager','villager','villager']);
    expect(()=>configuredDeck(4,{werewolf:2})).toThrow();
    expect(()=>configuredDeck(4,{werewolf:1,seer:1,guard:1,witch:1,cupid:1})).toThrow();
    expect(configuredDeck(8,presetRoles('bonds',8))).toHaveLength(8);
  });
  it('resolves Cupid, risky spying, linked deaths and the last shot before resuming',()=>{
    const game=new WerewolvesGame(()=>0,'host');
    for(let i=0;i<8;i++)game.apply(`p${i}`,{kind:'join',name:`p${i}`,color:'#123456'},0);
    game.apply('host',{kind:'configure',counts:{werewolf:2,seer:1,guard:1,witch:1,cupid:1,hunter:1,girl:1}},0);
    game.apply('host',{kind:'start'},0);for(const p of game.players)game.apply(p.id,{kind:'ready'},1);
    const id=(role:string)=>game.players.find(p=>p.role===role)!.id;
    expect(game.step).toBe('cupid');game.apply(id('cupid'),{kind:'cupid',targets:[id('hunter'),id('seer')]},2);
    expect(game.viewFor(id('hunter'),2).loverId).toBe(id('seer'));
    expect(game.viewFor(id('guard'),2).loverId).toBeNull();
    game.apply(id('girl'),{kind:'peek',spy:true},3);
    expect(game.viewFor(id('girl'),3).peeked).toHaveLength(1);
    expect(game.viewFor(id('guard'),3).players.find(p=>p.id===id('girl'))!.role).toBeNull();
    expect(game.viewFor(id('werewolf'),3).players.find(p=>p.id===id('girl'))!.role).toBe('girl');
    for(const wolf of game.players.filter(p=>p.role==='werewolf'))game.apply(wolf.id,{kind:'wolf_vote',target:id('hunter')},4);
    game.apply(id('seer'),{kind:'seer_look',target:id('werewolf')},5);
    game.apply(id('guard'),{kind:'guard',target:id('guard')},6);
    game.apply(id('witch'),{kind:'witch',heal:false,poison:null},7);
    expect(game.phase).toBe('hunter');expect(game.players.find(p=>p.id===id('seer'))!.alive).toBe(false);
    expect(()=>game.apply(id('guard'),{kind:'hunter',target:id('werewolf')},8)).toThrow();
    game.apply(id('hunter'),{kind:'hunter',target:id('werewolf')},8);expect(game.phase).toBe('dawn');
    game.cancel();expect(game.phase).toBe('lobby');expect(game.players).toHaveLength(8);expect(game.players.every(p=>p.role===null)).toBe(true);
  });
  it('resolves a departing lover and hunter without skipping the interrupted night',()=>{
    const game=new WerewolvesGame(()=>0,'host');
    for(let i=0;i<8;i++)game.apply(`p${i}`,{kind:'join',name:`p${i}`,color:'#123456'},0);
    game.apply('host',{kind:'configure',counts:{werewolf:2,seer:1,cupid:1,hunter:1,girl:1}},0);
    game.apply('host',{kind:'start'},0);for(const p of game.players)game.apply(p.id,{kind:'ready'},1);
    const id=(role:string)=>game.players.find(p=>p.role===role)!.id;
    game.apply(id('cupid'),{kind:'cupid',targets:[id('hunter'),id('seer')]},2);
    game.apply(id('seer'),{kind:'leave'},3);expect(game.phase).toBe('hunter');
    expect(game.players.find(p=>p.id===id('hunter'))!.alive).toBe(false);
    game.apply(id('hunter'),{kind:'hunter',target:id('werewolf')},4);
    expect(game.phase).toBe('night');expect(game.step).toBe('wolves');
    expect(game.players.filter(p=>p.alive)).toHaveLength(5);
  });
  it('keeps ordinary Gartic bots disabled and ignores stale inference after cancellation',()=>{
    const game=new GarticGame(()=>0);game.apply('a',{kind:'join',name:'a',color:'#123456'},0);
    expect(()=>game.apply('a',{kind:'add_bot'},0)).toThrow(/Ollama/);
    game.setAiBotsEnabled(true);game.apply('a',{kind:'add_bot'},0);
    // Distinct bot IDs need nondeterministic random values: use three humans for a separate game below.
    const playing=new GarticGame();for(const id of ['a','b'])playing.apply(id,{kind:'join',name:id,color:'#123456'},0);
    playing.setAiBotsEnabled(true);playing.apply('a',{kind:'add_bot'},0);playing.apply('a',{kind:'start'},0);
    const job=playing.botJobs(0)[0];playing.cancel();expect(playing.submitBot(job.key,job.id,{text:'Tardía'},10)).toBe(false);
    expect(playing.phase).toBe('lobby');expect(botResponseSchema.safeParse({drawing:{strokes:[{c:'#000000',w:4,p:[1,2,3]}]}}).success).toBe(false);
  });
});
describe('study without examples and authoritative quizzes',()=>{
  it('starts with an empty library and supports deleting the final user deck',()=>{const gateway=new HostOllamaGateway();expect(gateway.listDecks()).toHaveLength(0);const d=gateway.createManualDeck('Mi mazo','me');expect(gateway.deleteDeck(d.id,'me')).toBe(true);expect(gateway.listDecks()).toHaveLength(0);});
  it('hides solutions, rejects duplicate and late answers, and computes scores at the host',()=>{
    const game=new StudyQuiz('host');game.setDeck(quizDeck());game.apply('a',{kind:'join',name:'A'},0);game.apply('b',{kind:'join',name:'B'},0);
    expect(()=>game.apply('a',{kind:'start',seconds:20},0)).toThrow();game.apply('host',{kind:'start',seconds:20},0);
    const view=game.viewFor('a',0);expect(view.solution).toBeNull();expect(JSON.stringify(view)).not.toContain('correctChoice');
    game.apply('a',{kind:'answer',questionId:view.question!.id,choice:1},10000);
    game.apply('a',{kind:'answer',questionId:view.question!.id,choice:1},10001);expect(game.viewFor('a',10001).players.find(p=>p.id==='a')!.score).toBe(750);
    game.apply('b',{kind:'join',name:'B'},10002);game.tick(20000);game.apply('b',{kind:'answer',questionId:view.question!.id,choice:1},20001);
    expect(game.viewFor('b',20001).players.find(p=>p.id==='b')!.score).toBe(0);expect(game.viewFor('a',20001).solution).toBe(1);
    game.cancel();expect(game.viewFor('a',30000).phase).toBe('lobby');expect(game.viewFor('a',30000).solution).toBeNull();
  });
});
describe('sprint and decoration',()=>{
  it('runs 2.5 times as fast, normalizes diagonals, and cannot tunnel through thin walls',()=>{
    const p={x:100,y:200,direction:'down' as const,moving:false};const walk=stepPosition(p,{x:1,y:0},.05,[],undefined,110);const run=stepPosition(p,{x:1,y:0},.05,[],undefined,275);
    expect(run.x-p.x).toBeCloseTo((walk.x-p.x)*2.5);const diagonal=stepPosition(p,{x:1,y:1},.05,[],undefined,275);expect(Math.hypot(diagonal.x-p.x,diagonal.y-p.y)).toBeCloseTo(run.x-p.x);
    expect(stepPosition(p,{x:1,y:0},.05,[{x:120,y:100,w:1,h:200}],undefined,10000).x).toBeLessThan(120);
  });
  it('rotates footprints, persists optional rotation, validates placement, and restores furniture with new revisions',()=>{
    const h=home();const f={id:'table',kind:'table' as const,x:100,y:200,publicAlias:''};h.furniture=[f];
    expect(furnitureRect({...f,rotation:90}).w).toBe(furnitureRect(f).h);expect(publicHouse(h).furniture[0]).not.toHaveProperty('rotation');
    const rotated={...h,furniture:[{...f,rotation:90 as const}]};expect(publicHouse(rotated).furniture[0].rotation).toBe(90);expect(placementError(rotated,'table')).toBeNull();
    expect(placementError({...h,furniture:[{...f,x:380,y:370}]},'table')).not.toBeNull();
    const history=new DecorationHistory();history.remember(h);const undone=history.undo({...rotated,revision:2})!;expect(undone.furniture).toEqual(h.furniture);expect(undone.revision).toBe(3);expect(history.redo(undone)!.furniture).toEqual(rotated.furniture);
  });
});
