import type {WerewolvesView,WerewolvesAction} from '../minigames/werewolves';
/** Only the role-filtered human view enters this policy. Hidden engine state is inaccessible. */
export function werewolfDecision(v:WerewolvesView,random:(n:number)=>number):WerewolvesAction|null{
 const pick=(ids:string[])=>ids.length?ids[random(ids.length)]:undefined;
 if(v.phase==='end'||v.phase==='lobby'||!v.me.seated)return null;
 if(v.hunterTargets.length)return{kind:'hunter',target:pick(v.hunterTargets)??null};
 if(v.successorTargets.length)return{kind:'successor',target:pick(v.successorTargets)!};
 if(v.scapegoatTargets.length)return{kind:'scapegoat_vote',targets:v.scapegoatTargets};
 if(!v.me.alive)return null;
 if(v.housingOffer)return{kind:'housing',accept:true};
 if(v.canInherit)return{kind:'inherit',use:false};
 if(v.phase==='reveal'&&!v.me.acted)return{kind:'ready'};
 if(v.phase==='day'&&v.canVote&&!v.me.acted){
  const allowed=v.voteTargets.filter(id=>!v.pack.includes(id));
  const known=allowed.filter(id=>v.seerSeen.some(p=>p.id===id&&p.role==='werewolf'));
  const publicVotes=v.players.flatMap(p=>p.votesFor&&allowed.includes(p.votesFor)?[p.votesFor]:[]);
  return{kind:'vote',target:pick(known.length?known:publicVotes.length&&random(3)===0?publicVotes:allowed)??'skip'};
 }
 if(v.phase==='night'&&v.me.role==='girl'&&v.step==='wolves'&&!v.me.acted)return{kind:'peek',spy:random(2)===0};
 const turn=v.turn;if(!turn||v.me.acted)return null;
 const targets=[...turn.targets],chosen:string[]=[];while(targets.length&&chosen.length<(turn.chooseCount??1))chosen.push(targets.splice(random(targets.length),1)[0]);
 switch(turn.step){
  case 'cupid':{const pair=[...turn.targets];if(pair.length<2)return null;const first=pair.splice(random(pair.length),1)[0];return{kind:'cupid',targets:[first,pick(pair)!]};}
  case 'witch':return{kind:'witch',heal:turn.canHeal&&random(2)===0,poison:turn.canPoison&&random(5)===0?pick(turn.targets)??null:null};
  case 'wolves':{const votes=v.players.flatMap(p=>p.wolfTarget&&turn.targets.includes(p.wolfTarget)?[p.wolfTarget]:[]),target=pick(votes.length&&random(2)===0?votes:turn.targets);return target?{kind:'wolf_vote',target}:null;}
  case 'seer':return chosen[0]?{kind:'seer_look',target:chosen[0]}:null;
  case 'guard':return chosen[0]?{kind:'guard',target:chosen[0]}:null;
  default:return {kind:'power',targets:chosen,choice:pick(turn.choices??[]),...(!chosen.length&&!turn.choices?.length?{use:false}:{})};
 }
}
