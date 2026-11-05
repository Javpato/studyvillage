import {describe,it,expect} from 'vitest';
import {WerewolvesGame,configuredDeck,ROLE_INFO, type WerewolfRole,type NightStep} from '../../packages/core/src/minigames/werewolves';

function table(roles:WerewolfRole[],settings={buildings:false,events:false}) {
 const game=new WerewolvesGame(max=>Math.max(0,max-1));
 roles.forEach((_,i)=>game.apply(`p${i}`,{kind:'join',name:`Player ${i}`,color:'#123456'},0));
 const counts:Record<string,number>={};for(const role of roles)counts[role]=(counts[role]??0)+1;
 game.apply('p0',{kind:'configure',counts},0);game.apply('p0',{kind:'settings',value:settings},0);game.apply('p0',{kind:'start'},0);
 // Fix seats after the actual validated setup/deal to make adjacency and special interactions reproducible.
 roles.forEach((role,i)=>game.players[i].role=role);
 roles.forEach((_,i)=>game.apply(`p${i}`,{kind:'ready'},0));return game;
}
let time=0;
function until(game:WerewolvesGame,step:NightStep){for(let i=0;i<30&&game.phase==='night'&&game.step!==step;i++){time+=game.viewFor('p0',time).remainingMs+1;game.tick(time);}expect(game.step).toBe(step);}
function dawn(game:WerewolvesGame){for(let i=0;i<30&&game.phase==='night';i++){time+=game.viewFor('p0',time).remainingMs+1;game.tick(time);}}
function nextNight(game:WerewolvesGame){if(game.phase==='dawn')game.apply('p0',{kind:'continue'},++time);if(game.phase==='day'){for(const p of game.players.filter(p=>p.alive))if(game.phase==='day'&&game.viewFor(p.id,time).canVote)game.apply(p.id,{kind:'vote',target:'skip'},++time);}if(game.phase==='verdict')game.apply('p0',{kind:'continue'},++time);}

describe('Pact character authority and lifecycle',()=>{
 it('offers every implemented hidden character and validates sibling groups and population bounds',()=>{
  expect(Object.keys(ROLE_INFO)).toHaveLength(32);expect(configuredDeck(24,{werewolf:5,sister:2,brother:3,piper:1})).toHaveLength(24);
  expect(()=>configuredDeck(8,{werewolf:2,sister:1})).toThrow();expect(()=>configuredDeck(4,{whitewolf:1,infectwolf:1})).toThrow();
 });
 it('keeps special wolf identities secret from the pack and denies sleeping/dead camera subscriptions',()=>{
  time=0;const game=table(['werewolf','whitewolf','seer','villager','villager','villager']);until(game,'wolves');
  expect(game.viewFor('p0',time).players[1].role).toBe('werewolf');expect(game.viewFor('p1',time).me.role).toBe('whitewolf');
  expect(game.canReceiveCamera('p0','p2')).toBe(true);expect(game.canReceiveCamera('p2','p0')).toBe(false);
  game.apply('p0',{kind:'wolf_vote',target:'p4'},++time);expect(game.canReceiveCamera('p0','p2')).toBe(false);
  game.apply('p1',{kind:'wolf_vote',target:'p4'},++time);dawn(game);expect(game.canBroadcastCamera('p4')).toBe(false);expect(game.canReceiveCamera('p2','p4')).toBe(false);
 });
 it('infects a seer without killing her, keeps her power, and does not reveal it to outsiders',()=>{
  time=0;const game=table(['infectwolf','seer','guard','villager','villager','villager']);until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p1'},++time);
  until(game,'infectwolf');game.apply('p0',{kind:'power',choice:'infect'},++time);until(game,'seer');expect(game.viewFor('p1',time).turn?.step).toBe('seer');game.apply('p1',{kind:'seer_look',target:'p4'},++time);
  dawn(game);expect(game.players[1].alive).toBe(true);expect(game.viewFor('p1',time).pack).toContain('p0');expect(game.viewFor('p2',time).players[1].role).toBeNull();
  nextNight(game);until(game,'wolves');expect(game.viewFor('p1',time).turn?.step).toBe('wolves');
 });
 it('gives the fox a private result and permanently consumes a negative search',()=>{
  time=0;const game=table(['werewolf','villager','fox','villager','villager','villager']);until(game,'fox');game.apply('p2',{kind:'power',targets:['p3']},++time);
  expect(game.viewFor('p2',time).privateInfo.some(i=>i.text.includes('olfato'))).toBe(true);expect(game.viewFor('p1',time).privateInfo).toEqual([]);
  dawn(game);nextNight(game);expect(game.step).not.toBe('fox');
 });
 it('lets the elder survive one wolf attack and removes village powers after a council execution',()=>{
  time=0;const game=table(['werewolf','elder','seer','villager','villager']);until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p1'},++time);dawn(game);expect(game.players[1].alive).toBe(true);
  game.apply('p0',{kind:'continue'},++time);for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p1'?'skip':'p1'},++time);
  expect(game.players[1].alive).toBe(false);expect(game.viewFor('p2',time).privateInfo.some(i=>i.text.includes('perdido sus poderes'))).toBe(true);
  game.apply('p0',{kind:'continue'},++time);game.apply('p0',{kind:'wolf_vote',target:'p4'},++time);expect(game.step).not.toBe('seer');
 });
 it('lets the village idiot survive a conviction but removes the vote',()=>{
  time=0;const game=table(['werewolf','idiot','villager','villager']);dawn(game);game.apply('p0',{kind:'continue'},++time);
  for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p1'?'skip':'p1'},++time);
  expect(game.players[1].alive).toBe(true);expect(game.viewFor('p0',time).players[1].role).toBe('idiot');expect(game.viewFor('p1',time).canVote).toBe(false);
 });
 it('gives the piper a real solo victory without exposing the charm list to uncharmed people',()=>{
  time=0;const game=table(['werewolf','piper','villager','villager']);until(game,'piper');game.apply('p1',{kind:'power',targets:['p0','p2']},++time);
  expect(game.viewFor('p3',time).privateInfo).toEqual([]);expect(game.viewFor('p0',time).privateInfo.length).toBe(1);
  nextNight(game);until(game,'piper');game.apply('p1',{kind:'power',targets:['p3']},++time);expect(game.viewFor('p1',time).winner).toBe('piper');
 });
 it('transforms the wild child only when the chosen model dies',()=>{
  time=0;const game=table(['werewolf','wildchild','villager','villager','villager']);until(game,'wildchild');game.apply('p1',{kind:'power',targets:['p2']},++time);
  until(game,'wolves');expect(game.viewFor('p1',time).turn).toBeNull();game.apply('p0',{kind:'wolf_vote',target:'p2'},++time);dawn(game);expect(game.viewFor('p1',time).pack).toContain('p0');
 });
 it('allows a maid to accept the condemned role before revealing it',()=>{
  time=0;const game=table(['werewolf','maid','seer','villager','villager']);dawn(game);game.apply('p0',{kind:'continue'},++time);
  for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p2'?'skip':'p2'},++time);
  expect(game.phase).toBe('execution');expect(game.viewFor('p1',time).canInherit).toBe(true);expect(game.viewFor('p0',time).players[2].role).toBeNull();
  game.apply('p1',{kind:'inherit',use:true},++time);expect(game.players[1].role).toBe('seer');expect(game.players[2].alive).toBe(false);expect(game.viewFor('p0',time).players[2].role).toBeNull();
 });
 it('starts the angel variant with a council and awards its first-turn victory',()=>{
  time=0;const game=table(['werewolf','angel','villager','villager']);expect(game.phase).toBe('day');
  for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p1'?'skip':'p1'},++time);expect(game.viewFor('p1',time).winner).toBe('angel');
 });
 it('makes a tie kill the scapegoat, who restricts the following council',()=>{
  time=0;const game=table(['werewolf','scapegoat','villager','villager','villager','villager']);dawn(game);game.apply('p0',{kind:'continue'},++time);
  ['p2','p3','p3','p2','skip','skip'].forEach((target,i)=>game.apply(`p${i}`,{kind:'vote',target},++time));expect(game.phase).toBe('scapegoat');expect(game.players[1].alive).toBe(false);
  game.apply('p1',{kind:'scapegoat_vote',targets:['p4','p5']},++time);game.apply('p0',{kind:'continue'},++time);dawn(game);game.apply('p0',{kind:'continue'},++time);
  expect(game.viewFor('p0',time).canVote).toBe(false);expect(game.viewFor('p4',time).canVote).toBe(true);
 });
});

// These scenarios exercise authority transitions through real public actions.
describe('Pact buildings, succession and compound roles',()=>{
 for(const inherited of ['hunter','elder','cupid']as const)it(`exchanges ${inherited} before death effects and observes the Cupid exception`,()=>{
  time=0;const game=table(['werewolf','maid',inherited,'seer','villager','villager']);dawn(game);game.apply('p0',{kind:'continue'},++time);for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p2'?'skip':'p2'},++time);game.apply('p1',{kind:'inherit',use:true},++time);
  expect(game.phase).toBe('verdict');expect(game.players[1].role).toBe(inherited==='cupid'?'villager':inherited);expect(game.players[2].role).toBe('maid');expect(game.viewFor('p3',time).privateInfo.some(i=>i.text.includes('perdido sus poderes'))).toBe(false);
 });
 it('does not spend actor cards, infection or arson by passing their optional turns',()=>{
  time=0;const game=table(['infectwolf','arsonist','actor','seer','villager','villager']);until(game,'actor');game.apply('p2',{kind:'power',use:false},++time);until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p4'},++time);until(game,'infectwolf');game.apply('p0',{kind:'power',choice:'skip'},++time);until(game,'arsonist');game.apply('p1',{kind:'power',use:false},++time);dawn(game);nextNight(game);
  until(game,'actor');expect(game.viewFor('p2',time).turn?.choices).toEqual(['seer','guard','hunter']);game.apply('p2',{kind:'power',use:false},++time);until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p5'},++time);until(game,'infectwolf');expect(game.viewFor('p0',time).turn?.choices).toContain('infect');game.apply('p0',{kind:'power',use:false},++time);until(game,'arsonist');expect(game.viewFor('p1',time).turn?.targets.length).toBeGreaterThan(0);
 });
 it('keeps the maid power available after declining a condemned card',()=>{
  time=0;const game=table(['werewolf','maid','villager','villager','villager','villager']);dawn(game);game.apply('p0',{kind:'continue'},++time);
  for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p3'?'skip':'p3'},++time);game.apply('p1',{kind:'inherit',use:false},++time);nextNight(game);dawn(game);game.apply('p0',{kind:'continue'},++time);
  for(const p of game.players.filter(p=>p.alive))game.apply(p.id,{kind:'vote',target:p.id==='p4'?'skip':'p4'},++time);expect(game.phase).toBe('execution');expect(game.viewFor('p1',time).canInherit).toBe(true);
 });
 it('expires the angel victory after the first dawn',()=>{
  time=0;const game=table(['werewolf','angel','villager','villager','villager']);for(const p of game.players)game.apply(p.id,{kind:'vote',target:'skip'},++time);game.apply('p0',{kind:'continue'},++time);dawn(game);expect(game.players[1].role).toBe('villager');
  game.apply('p0',{kind:'continue'},++time);for(const p of game.players)game.apply(p.id,{kind:'vote',target:p.id==='p1'?'skip':'p1'},++time);expect(game.viewFor('p1',time).winner).not.toBe('angel');
 });
 it('lets a judge require one extra council, and rejects reuse',()=>{
  time=0;const game=table(['werewolf','judge','villager','villager','villager']);dawn(game);game.apply('p0',{kind:'continue'},++time);game.apply('p1',{kind:'judge'},++time);for(const p of game.players)game.apply(p.id,{kind:'vote',target:'skip'},++time);game.apply('p0',{kind:'continue'},++time);expect(game.phase).toBe('day');expect(()=>game.apply('p1',{kind:'judge'},++time)).toThrow();
 });
 it('requires the dead mayor to name a living successor',()=>{
  time=0;const game=new WerewolvesGame(max=>max-1);for(let i=0;i<6;i++)game.apply(`p${i}`,{kind:'join',name:`P${i}`,color:'#123456'},0);game.apply('p0',{kind:'configure',counts:{werewolf:1}},0);game.apply('p0',{kind:'mayor_setting',enabled:true},0);game.apply('p0',{kind:'start'},0);game.players.forEach((p,i)=>p.role=i===0?'werewolf':'villager');game.players.forEach(p=>game.apply(p.id,{kind:'ready'},0));dawn(game);game.apply('p0',{kind:'continue'},++time);
  for(const p of game.players)game.apply(p.id,{kind:'vote',target:'p2'},++time);for(const p of game.players)game.apply(p.id,{kind:'vote',target:'skip'},++time);game.apply('p0',{kind:'continue'},++time);game.apply('p0',{kind:'wolf_vote',target:'p2'},++time);dawn(game);expect(game.phase).toBe('succession');expect(()=>game.apply('p3',{kind:'successor',target:'p4'},++time)).toThrow();game.apply('p2',{kind:'successor',target:'p4'},++time);expect(game.viewFor('p0',time).mayorId).toBe('p4');
 });
 it('keeps confessions private, restores a spent building power and respects the school voting rule',()=>{
  time=0;const game=table(['werewolf','villager','villager','villager','villager','villager'],{buildings:true,events:false});dawn(game);game.apply('p0',{kind:'continue'},++time);expect(game.viewFor('p3',time).canVote).toBe(false);
  game.apply('p1',{kind:'building',target:'p0'},++time);expect(game.viewFor('p1',time).seerSeen).toEqual([{id:'p0',role:'werewolf'}]);expect(game.viewFor('p2',time).seerSeen).toEqual([]);expect(()=>game.apply('p1',{kind:'building',target:'p2'},++time)).toThrow();game.apply('p2',{kind:'building',target:'p1'},++time);game.apply('p1',{kind:'building',target:'p4'},++time);expect(game.viewFor('p1',time).seerSeen).toHaveLength(2);
  game.apply('p3',{kind:'building',targets:['p0','p4']},++time);expect(game.viewFor('p0',time).canVote).toBe(false);expect(game.viewFor('p5',time).canVote).toBe(true);
 });
 it('uses the manor to pardon without revealing the condemned card',()=>{
  time=0;const game=table(['werewolf','villager','villager','villager','villager','villager'],{buildings:true,events:false});dawn(game);game.apply('p0',{kind:'continue'},++time);for(const p of game.players.filter(p=>game.viewFor(p.id,time).canVote))game.apply(p.id,{kind:'vote',target:p.id==='p2'?'skip':'p2'},++time);expect(game.phase).toBe('execution');game.apply('p5',{kind:'building'},++time);expect(game.players[2].alive).toBe(true);expect(game.viewFor('p0',time).players[2].role).toBeNull();expect(game.viewFor('p5',time).buildingAvailable).toBe(false);
 });
 it('the barber kills a wolf safely and the tavern rejects ordinary attack targets',()=>{
  time=0;const roles:WerewolfRole[]=['werewolf',...Array(8).fill('villager')];const game=table(roles,{buildings:true,events:false});until(game,'wolves');expect(game.viewFor('p0',time).turn!.targets).not.toContain('p7');expect(()=>game.apply('p0',{kind:'wolf_vote',target:'p7'},++time)).toThrow();dawn(game);game.apply('p0',{kind:'continue'},++time);game.apply('p8',{kind:'building',target:'p0'},++time);expect(game.players[0].alive).toBe(false);expect(game.players[8].alive).toBe(true);expect(game.viewFor('p8',time).winner).toBe('aldea');
 });
 it('a knight infection removes its wolf next night and announces the death at dawn',()=>{
  time=0;const game=table(['werewolf','knight','villager','villager','villager']);until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p1'},++time);dawn(game);expect(game.players[0].alive).toBe(true);nextNight(game);dawn(game);expect(game.players[0].alive).toBe(false);expect(game.viewFor('p2',time).log.some(l=>l.text.includes('sin vida')&&l.params?.name==='Player 0')).toBe(true);
 });
 it('a dog chooses its faction, while the actor receives a one-night seer action',()=>{
  time=0;const game=table(['werewolf','dogwolf','actor','villager','villager','villager']);until(game,'actor');game.apply('p2',{kind:'power',choice:'seer'},++time);until(game,'dogwolf');game.apply('p1',{kind:'power',choice:'wolves'},++time);until(game,'wolves');expect(game.viewFor('p1',time).pack).toContain('p0');until(game,'seer');game.apply('p2',{kind:'seer_look',target:'p3'},++time);dawn(game);expect(game.viewFor('p2',time).seerSeen).toHaveLength(1);nextNight(game);until(game,'actor');expect(game.viewFor('p2',time).turn?.choices).not.toContain('seer');
 });
 it('gives the big wolf a second victim until a wolf-family death',()=>{
  time=0;const game=table(['bigwolf','villager','villager','villager','villager','villager']);until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p2'},++time);until(game,'bigwolf');game.apply('p0',{kind:'power',targets:['p3']},++time);dawn(game);expect(game.players.filter(p=>!p.alive).map(p=>p.id)).toEqual(['p2','p3']);
 });
 it('burns a targeted house, saves the occupant, and catches the wolf to its right',()=>{
  time=0;const game=table(['werewolf','arsonist','villager','villager','villager','villager'],{buildings:true,events:false});until(game,'wolves');game.apply('p0',{kind:'wolf_vote',target:'p2'},++time);until(game,'arsonist');game.apply('p1',{kind:'power',targets:['p2']},++time);dawn(game);expect(game.players[0].alive).toBe(false);expect(game.players[2].alive).toBe(true);expect(game.viewFor('p2',time).myBuilding).toBeNull();
 });
});

describe('all character tables remain playable under deadlines',()=>{
 for(const role of Object.keys(ROLE_INFO) as WerewolfRole[])it(`${role}: bots finish a validated table without invalid actions`,()=>{
  let seed=12345;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return n?seed%n:0;};const game=new WerewolvesGame(random);const counts:Record<string,number>={werewolf:3};if(role!=='villager'&&role!=='werewolf')counts[role]=role==='sister'?2:role==='brother'?3:1;
  for(let i=0;i<12;i++)game.apply(`seat${i}`,{kind:'join',name:`Seat ${i}`,color:'#abcdef'},0);game.apply('seat0',{kind:'configure',counts},0);game.apply('seat0',{kind:'settings',value:{daySeconds:30,nightSeconds:10,buildings:true,events:true}},0);game.apply('seat0',{kind:'start'},0);game.players.forEach(p=>{p.bot=true;game.apply(p.id,{kind:'ready'},0);});
  for(let now=5000;now<=2_000_000&&game.phase!=='end';now+=5000)game.tick(now);
  expect(game.phase).toBe('end');expect(game.viewFor('seat0',2_000_000).winner).not.toBeNull();
 });
});
