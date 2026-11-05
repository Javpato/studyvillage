import {describe,it,expect} from 'vitest';
import {StudyQuiz} from '../../packages/core/src/minigames/study-quiz';
const quiz={id:'q',title:'Options',updatedAt:1,questions:[{id:'a',text:'A?',choices:['yes-a','no-a'],correctChoice:0},{id:'b',text:'B?',choices:['yes-b','no-b'],correctChoice:0}]};
function game(){const game=new StudyQuiz('host',()=>0);game.setQuiz(quiz);game.apply('host',{kind:'join',name:'H'},0);return game;}
describe('quiz competition options',()=>{
 it('shuffles questions and answers together without revealing or losing the correct answer',()=>{
  const g=game();g.apply('host',{kind:'start',seconds:5,settings:{shuffleQuestions:true,shuffleChoices:true,scoring:'accuracy'}},0);
  const view=g.viewFor('host',0);expect(view.question!.text).toBe('B?');expect(view.question!.choices).toEqual(['no-b','yes-b']);expect(view.solution).toBeNull();expect(JSON.stringify(view)).not.toContain('correctChoice');
  g.apply('host',{kind:'answer',questionId:view.question!.id,choice:1},4500);expect(g.viewFor('host',4500).players[0].score).toBe(1000);expect(g.viewFor('host',4500).solution).toBe(1);
  expect(quiz.questions[0].choices).toEqual(['yes-a','no-a']);
 });
 it('awards a bounded streak bonus and supports practice without points',()=>{
  const g=game();g.apply('host',{kind:'start',seconds:0,settings:{scoring:'accuracy',streakBonus:true}},0);g.apply('host',{kind:'answer',questionId:g.viewFor('host',0).question!.id,choice:0},1);g.apply('host',{kind:'next'},2);g.apply('host',{kind:'answer',questionId:g.viewFor('host',2).question!.id,choice:0},3);expect(g.viewFor('host',3).players[0].score).toBe(2100);
  g.apply('host',{kind:'start',seconds:120,settings:{scoring:'none',streakBonus:true,showLeaderboard:false}},4);g.apply('host',{kind:'answer',questionId:g.viewFor('host',4).question!.id,choice:0},5);expect(g.viewFor('host',5).players[0].score).toBe(0);
 });
 it('only lets the activity organizer set options and rejects invalid input',()=>{
  const g=game();expect(()=>g.apply('guest',{kind:'start',seconds:20,settings:{scoring:'none'}},0)).toThrow();expect(()=>g.apply('host',{kind:'start',seconds:12},0)).toThrow();expect(()=>g.apply('host',{kind:'start',seconds:20,settings:{scoring:'invented' as 'none'}},0)).toThrow();expect(g.viewFor('host',0).phase).toBe('lobby');
 });
});
