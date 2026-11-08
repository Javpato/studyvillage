import { msg, t, defaultText, defaultMsg, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import { studySprite } from './study-sprites';
import { monoIcon } from './pixel-icons';
import './study-links.css';
import { LocalOllama, type AiFeature } from '../../../packages/runtime/src/ai/local-ollama';
import { AppError, errorMessage } from '../errors/messages';
import { StudyLibrary, type FlashcardDeck, type FlashcardItem, type QuizDefinition, type QuizQuestion } from '../../../packages/core/src/study/library';
import { SecureNotesStore } from '../../../packages/core/src/notes/secure-notes';
import { NotesPanel } from './notes-ui';
import { SharedRoom } from '../../../packages/runtime/src/session/shared-room';
import { StudyQuiz, quizSettingsSchema, type QuizSettings, type QuizAction, type QuizView } from '../../../packages/core/src/minigames/study-quiz';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: DisplayText = '', cls = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); setDisplayText(e, text); e.className = cls; return e; }
/** Static labels become messages; values that are already messages pass through. */
function L(label: DisplayText): DisplayText { return typeof label === 'string' ? msg(label) : label; }
function button(text: DisplayText, action: () => void, primary = false): HTMLButtonElement { const b = el('button',text,primary?'is-primary':''); b.type='button';b.onclick=action;return b; }
function field(label: DisplayText, input: HTMLElement): HTMLLabelElement { const l=el('label',label);if(input.matches('input,select,textarea'))setDisplayAttribute(input,'aria-label',label);l.append(input);return l; }
type Mode = 'home'|'notebooks'|'notebook'|'cards'|'decks'|'edit'|'review'|'quizzes'|'quiz-library'|'quiz-edit'|'quiz-mode'|'group'|'play';
export interface StudyContext {
 actor(): {id: string;displayName: string;isHost: boolean;online: boolean}; close():void;notify(message:string):void;
 library: StudyLibrary; ai: LocalOllama; notes: SecureNotesStore; room: SharedRoom<QuizAction,QuizView,StudyQuiz>;
}
export class StudyPanel {
 readonly root=el('section','','sv-study-workspace');
 private mode:Mode='home';private deckId:string|null=null;private quizId:string|null=null;
 private quizSettings:QuizSettings=quizSettingsSchema.parse({});
 private reviewOrder:string[]=[];private shuffled=false;private reversed=false;private pendingOnly=false;
 private index=0;private revealed=false;private progress:Record<string,'mastered'|'review'>={};
 private clock:ReturnType<typeof setInterval>|null=null;private off:(()=>void)[]=[];private notesPanel:NotesPanel;
 private solo:StudyQuiz|null=null;private lastView='';private generation=0;private mounted=false;private groupSeconds=20;
 private noteReturn:{id:string;mode:'edit'|'review'|'decks'}|null=null;
 private linkDrafts=new Map<string,{name:string;cardId:string;values:string[]}>();
 private alert=el('p','','sv-feedback is-error');
 constructor(private ctx:StudyContext){
  setDisplayAttribute(this.root, 'aria-label', msg('Estudio'));this.alert.setAttribute('role','alert');this.alert.hidden=true;
  this.notesPanel=new NotesPanel({store:ctx.notes,actorId:()=>ctx.actor().id,close:()=>this.leaveNotes(),notify:ctx.notify,
   makeDeck:note=>{const current=ctx.notes.getNote(note.id,ctx.actor().id);if(!current)throw new AppError('invalid','El apunte vinculado ya no está disponible.');const deck=ctx.library.createManualDeck({title:t('Tarjetas de {title}',{title:current.title}),ownerId:'local-host',visibility:'private',sourceNoteId:current.id});this.noteReturn=null;this.deckId=deck.id;this.go('edit');},makeAiDeck:null,
   linkedDecks:id=>ctx.library.listDecksForNote(id,ctx.actor().id).map(deck=>({id:deck.id,title:deck.title})),openLinkedDeck:id=>this.openLinkedDeck(id)});
 }
 mount(container:HTMLElement):void{
  this.mounted=true;container.replaceChildren(this.root);
  try{this.progress=JSON.parse(localStorage.getItem('studyvillage-review-v2')||'{}');}catch{this.progress={};}
  this.off.push(this.ctx.room.subscribe((view,error)=>{if(error)this.fail(error);if((this.mode==='group'||(this.mode==='play'&&!this.solo))&&view){const signature=JSON.stringify({...view,remainingMs:0});if(signature!==this.lastView){this.lastView=signature;this.render();}}}));
  this.off.push(this.ctx.ai.subscribe(()=>{if(this.mode!=='notebook'&&this.mode!=='edit'&&this.mode!=='quiz-edit')this.render();else this.root.querySelectorAll<HTMLElement>('[data-ai-feature]').forEach(e=>{e.hidden=!this.ctx.ai.isReady(e.dataset.aiFeature as AiFeature);});}));
  try { const old=JSON.parse(localStorage.getItem('studyvillage-flashcard-progress-v1')||'{}'); const marks=old[this.ctx.actor().id]??old['local-host']??{}; for(const deck of this.ctx.library.listDecks())for(const card of deck.cards){const key=`${deck.id}:${card.id}`;if(!(key in this.progress)&&marks[card.id])this.progress[key]=marks[card.id]==='mastered'?'mastered':'review';} } catch {}
  this.clock=setInterval(()=>{if(this.solo?.tick(Date.now())&&this.mode==='play')this.render();const timer=this.root.querySelector<HTMLElement>('[data-quiz-deadline]');if(timer)setDisplayText(timer, msg("{p0} s", { p0: Math.max(0,Math.ceil((Number(timer.dataset.quizDeadline)-Date.now())/1000)) }));},250);
  this.ctx.room.refresh();this.render();
 }
 unmount():void{this.notesPanel.unmount();this.mounted=false;this.generation++;this.ctx.ai.cancel('flashcards');this.ctx.ai.cancel('quizzes');this.off.splice(0).forEach(fn=>fn());if((this.mode==='group'||this.mode==='play')&&!this.solo)this.ctx.room.act({kind:'leave'});if(this.clock)clearInterval(this.clock);this.clock=null;this.root.remove();this.mode='home';this.solo=null;this.noteReturn=null;}
 openDeck(id:string):void{this.deckId=id;this.mode='edit';}
 private go(mode:Mode):void{if((this.mode==='group'||this.mode==='play')&&!this.solo&&mode!=='group'&&mode!=='play')this.ctx.room.act({kind:'leave'});this.notesPanel.unmount();this.generation++;this.ctx.ai.cancel('flashcards');this.ctx.ai.cancel('quizzes');this.mode=mode;this.alert.hidden=true;this.render();}
 private fail(error:unknown):void{this.alert.textContent=errorMessage(error);this.alert.hidden=false;}
 private run(fn:()=>void):void{try{this.alert.hidden=true;fn();this.render();}catch(e){this.fail(e);}}
 private back():void{
  if(this.mode==='notebook'&&this.noteReturn){this.leaveNotes();return;}
  const parents:Record<Mode,Mode>={home:'home',notebooks:'home',notebook:'notebooks',cards:'home',decks:'cards',edit:'decks',review:'decks',quizzes:'home','quiz-library':'quizzes','quiz-edit':'quiz-library','quiz-mode':'quiz-library',group:'quiz-library',play:'quiz-library'};
  this.go(parents[this.mode]);
 }
 private render():void{
  if(!this.mounted)return;
  this.root.replaceChildren();const head=el('header');if(this.mode!=='home'){const back=button(msg(this.mode==='notebook'&&this.noteReturn?'Volver al mazo':'← Volver'),()=>this.back());back.dataset.controlBack='';head.append(back);}
  const titles:Record<Mode,DisplayText>={home:msg('Tu rincón de estudio'),notebooks:msg('Mis cuadernos'),notebook:msg('Cuaderno'),cards:msg('Flashcards'),decks:msg('Mis mazos'),edit:msg('Editar mazo'),review:msg('Repasar'),quizzes:msg('Quiz'),'quiz-library':msg('Mis quizzes'),'quiz-edit':msg('Editar quiz'),'quiz-mode':msg('Cómo quieres jugar'),group:msg('Concurso en la aldea'),play:msg('Quiz')};
  head.append(el('h2',titles[this.mode]),button(msg('Cerrar'),this.ctx.close));this.root.append(head,this.alert);
  const body=el('div','','sv-study-body');this.root.append(body);
  if(this.mode==='home'){body.append(el('p',msg('Elige cómo quieres aprender hoy.'),'sv-study-intro'));const grid=el('div','','sv-study-portals');for(const [name,icon,description,mode]of[['Cuadernos','▤','Tus ideas y apuntes, a tu manera.','notebooks'],['Flashcards','▣','Recuerda una tarjeta cada vez.','cards'],['Quiz','?','Pon a prueba lo que sabes.','quizzes']]as const){const tile=button('',()=>this.go(mode));tile.className='sv-study-portal';tile.append(studySprite(mode==='notebooks'?'notebook':mode==='cards'?'cards':'quiz',144),el('strong',msg(name)),el('span',msg(description)));grid.append(tile);}body.append(grid);}
  else if(this.mode==='notebooks')this.notebooks(body);
  else if(this.mode==='notebook')this.notesPanel.mount(body);
  else if(this.mode==='cards'||this.mode==='quizzes')this.choices(body,this.mode==='cards');
  else if(this.mode==='decks')this.decks(body);
  else if(this.mode==='edit')this.deckEditor(body);
  else if(this.mode==='review')this.review(body);
  else if(this.mode==='quiz-library')this.quizzes(body);
  else if(this.mode==='quiz-edit')this.quizEditor(body);
  else if(this.mode==='quiz-mode')this.playMode(body);
  else this.play(body);
 }
 private noteLink(deck:FlashcardDeck):HTMLElement|null{
  if(!deck.sourceNoteId)return null;
  const row=el('div','','sv-deck-note-link'),label=el('span',msg('Apunte vinculado'),'sv-study-link-label');label.prepend(monoIcon('notes',14));row.append(label);
  const note=this.ctx.notes.getNote(deck.sourceNoteId,this.ctx.actor().id);
  if(!note){row.append(el('span',msg('Apunte no disponible'),'sv-study-reference-missing'));return row;}
  const link=button(defaultMsg(note.title),()=>this.openSourceNote(deck));link.className='sv-study-reference';setDisplayAttribute(link,'aria-label',msg('Abrir apunte: {title}',{title:note.title}));row.append(link);return row;
 }
 private openSourceNote(deck:FlashcardDeck):void{
  if(!deck.sourceNoteId||!this.ctx.notes.getNote(deck.sourceNoteId,this.ctx.actor().id)){this.fail(new AppError('invalid','El apunte vinculado ya no está disponible.'));return;}
  if(this.mode==='edit'){
   const editor=this.root.querySelector<HTMLElement>('[data-card-editor]'),name=this.root.querySelector<HTMLInputElement>('.sv-study-form > label input');
   if(editor)this.linkDrafts.set(deck.id,{name:name?.value??deck.title,cardId:editor.dataset.cardId??'',values:[...editor.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select')].map(field=>field.value)});
  }
  if(!this.notesPanel.openNote(deck.sourceNoteId))return;
  this.noteReturn={id:deck.id,mode:this.mode==='review'?'review':this.mode==='decks'?'decks':'edit'};this.go('notebook');
 }
 private openLinkedDeck(id:string):void{
  const deck=this.ctx.library.getDeck(id);if(!deck||!this.ctx.library.canViewDeck(deck,this.ctx.actor().id,false)){this.fail(new AppError('invalid','El mazo vinculado ya no está disponible.'));return;}
  if(!this.notesPanel.savePending())return;
  this.deckId=id;const returningToReview=this.noteReturn?.id===id&&this.noteReturn.mode==='review';const readOnly=!this.ctx.library.canEditDeck(deck,this.ctx.actor().id,false);if(readOnly&&!returningToReview)this.prepareReview(deck);this.noteReturn=null;this.go(returningToReview||readOnly?'review':'edit');
 }
 private leaveNotes():void{
  if(!this.notesPanel.savePending())return;
  const target=this.noteReturn;this.noteReturn=null;
  if(target){const deck=this.ctx.library.getDeck(target.id);if(deck&&this.ctx.library.canViewDeck(deck,this.ctx.actor().id,false)){this.deckId=deck.id;this.go(target.mode);return;}}
  this.go('notebooks');
 }
 private prepareReview(deck:FlashcardDeck):void{
  this.index=0;this.revealed=false;this.reviewOrder=deck.cards.filter(card=>!this.pendingOnly||this.progress[`${deck.id}:${card.id}`]!=='mastered').map(card=>card.id);
  if(this.shuffled)for(let i=this.reviewOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.reviewOrder[i],this.reviewOrder[j]]=[this.reviewOrder[j],this.reviewOrder[i]];}
 }
 private choices(body:HTMLElement,cards:boolean):void{
  const has=cards?this.ctx.library.listDecks().length:this.ctx.library.listQuizzes().length;
  const grid=el('div','','sv-study-portals is-choice');const play=button('',()=>this.go(cards?'decks':'quiz-library'));play.className='sv-study-portal';play.append(studySprite(cards?'review':'quiz',144),el('strong',cards ? msg('Repasar mis flashcards') : msg('Jugar un quiz')),el('span',msg('Elige de tu biblioteca y empieza.')));const create=button('',()=>{if(cards)this.deckId=null;else this.quizId=null;this.go(cards?'edit':'quiz-edit');});create.className='sv-study-portal';create.append(studySprite('create',144),el('strong',cards ? msg('Crear flashcards') : msg('Crear un quiz')),el('span',msg('Prepara algo nuevo a tu manera.')));grid.append(play,create);body.append(grid);
  if(!has)body.append(el('p',cards ? msg('Todavía no tienes mazos. Crea el primero con tus propias preguntas.') : msg('Todavía no tienes quizzes. Crea el primero con preguntas y respuestas.'),'sv-study-intro'));
 }
 private notebooks(body:HTMLElement):void{
  const grid=el('div','','sv-notebook-grid');for(const book of this.ctx.notes.listNotebooks()){
   const tile=button('',()=>{this.noteReturn=null;this.notesPanel.openNotebook(book.id);this.go('notebook');});tile.className='sv-notebook-cover';tile.append(studySprite('notebook'),el('strong',defaultMsg(book.name)),el('small',msg("{p0} páginas", { p0: this.ctx.notes.listNotes(this.ctx.actor().id,book.id).length })));grid.append(tile);
  }
  const create=button('',()=>{if(body.querySelector('form'))return;const form=el('form','','sv-study-form');const name=el('input');name.maxLength=60;name.required=true;const error=el('p','','sv-feedback is-error');error.hidden=true;error.setAttribute('role','alert');const commit=button(msg('Crear cuaderno'),()=>{});commit.type='submit';form.append(field(msg('Nombre del cuaderno'),name),error,commit,button(msg('Cancelar'),()=>form.remove()));form.onsubmit=e=>{e.preventDefault();try{if(!name.value.trim())throw new AppError('invalid','Escribe un nombre para tu cuaderno.');const book=this.ctx.notes.createNotebook(name.value.trim(),'local-owner');this.notesPanel.openNotebook(book.id);this.go('notebook');}catch(e){error.textContent=errorMessage(e);error.hidden=false;}};body.append(form);name.focus();});
  create.className='sv-notebook-cover is-create';setDisplayAttribute(create, 'aria-label', msg('Nuevo cuaderno'));create.append(studySprite('create'),el('strong',msg('Nuevo cuaderno')));grid.append(create);body.append(grid);
 }
 private empty(body:HTMLElement,text:DisplayText,label:DisplayText,fn:()=>void):void{const empty=el('div','','sv-study-empty');empty.append(studySprite('create'),el('p',text),button(label,fn,true));body.append(empty);}
 private decks(body:HTMLElement):void{
  const decks=this.ctx.library.listDecks();if(!decks.length){this.empty(body,msg('Aquí aparecerán tus mazos de flashcards.'),msg('Crear mi primer mazo'),()=>{this.deckId=null;this.go('edit');});return;}
  const options=el('details');options.append(el('summary',msg('Modo de repaso')));for(const [key,label]of [['shuffled','Orden aleatorio'],['reversed','Invertir pregunta y respuesta'],['pendingOnly','Solo tarjetas pendientes']]as const){const input=el('input');input.type='checkbox';input.checked=this[key];input.onchange=()=>{this[key]=input.checked;};options.append(field(msg(label),input));}body.append(options);
  body.append(button(msg('Crear mazo'),()=>{this.deckId=null;this.go('edit');}));const grid=el('div','','sv-study-library');
  for(const deck of decks){const card=el('article','','sv-study-card');card.append(studySprite('cards',86),el('h3',defaultMsg(deck.title)),el('p',msg("{p0} tarjetas · {p1} aprendidas", { p0: deck.cards.length, p1: deck.cards.filter(c=>this.progress[`${deck.id}:${c.id}`]==='mastered').length })));const source=this.noteLink(deck);if(source)card.append(source);const review=button(msg('Repasar'),()=>{this.deckId=deck.id;this.prepareReview(deck);this.go('review');},true);review.disabled=!deck.cards.length;card.append(review,button(msg('Editar'),()=>{this.deckId=deck.id;this.go('edit');}));
   const contest=button(msg('Crear quiz con este mazo'),()=>this.run(()=>{const questions=deck.cards.filter(c=>c.choices&&c.correctChoice!==undefined).map(c=>({id:crypto.randomUUID(),text:c.question,choices:[...c.choices!],correctChoice:c.correctChoice!,explanation:c.explanation||''}));this.quizId=this.ctx.library.saveQuiz({id:crypto.randomUUID(),title:deck.title,questions,updatedAt:Date.now()}).id;this.mode='quiz-mode';}));contest.disabled=!deck.cards.some(c=>c.choices);card.append(contest);grid.append(card);}body.append(grid);
 }
 private input(label:DisplayText,value:string,max:number,parent:HTMLElement,area=false):HTMLInputElement|HTMLTextAreaElement{
  const input=area?el('textarea'):el('input');input.value=value;input.maxLength=max;parent.append(field(label,input));return input;
 }
 private required(input:HTMLInputElement|HTMLTextAreaElement,message:string):string{input.removeAttribute('aria-invalid');if(!input.value.trim()){input.setAttribute('aria-invalid','true');input.focus();throw new AppError('invalid',message);}return input.value.trim();}
 private createTitle(body:HTMLElement,quiz:boolean):void{
  const form=el('form','','sv-study-form');const title=this.input(quiz ? msg('Nombre del quiz') : msg('Nombre del mazo'),'',110,form);const submit=button(msg('Crear'),()=>{} ,true);submit.type='submit';form.append(submit);form.onsubmit=e=>{e.preventDefault();this.run(()=>{const name=this.required(title,'Escribe un nombre para empezar.');if(quiz)this.quizId=this.ctx.library.saveQuiz({id:crypto.randomUUID(),title:name,questions:[],updatedAt:Date.now()}).id;else this.deckId=this.ctx.library.createManualDeck({title:name,ownerId:'local-host',visibility:'private'}).id;});};body.append(form);
 }
 private rename(form:HTMLElement,title:string,save:(title:string)=>void):void{
  const name=this.input(msg('Nombre'),title,110,form);const update=button(msg('Guardar nombre'),()=>this.run(()=>save(this.required(name,'Escribe un nombre.'))));form.append(update);
 }
 private deckEditor(body:HTMLElement):void{
  const deck=this.deckId?this.ctx.library.getDeck(this.deckId):null;if(!deck){this.createTitle(body,false);return;}
  const source=this.noteLink(deck);if(source)body.append(source);
  const form=el('div','','sv-study-form');this.rename(form,deck.title,title=>this.ctx.library.renameDeck(deck.id,title,this.ctx.actor().id,true));
  const list=el('div','','sv-study-items');for(const [index,card]of deck.cards.entries()){
   const row=el('article','','sv-study-card');row.append(el('strong',`${index+1}. ${defaultText(card.question)}`),button(msg('Editar'),()=>this.cardEditor(form,deck,card)));
   const more=el('details');more.append(el('summary',msg('Más')));for(const [label,action]of [['Subir',()=>this.ctx.library.reorderCard(deck.id,card.id,'up',this.ctx.actor().id,true)],['Bajar',()=>this.ctx.library.reorderCard(deck.id,card.id,'down',this.ctx.actor().id,true)],[msg('Eliminar tarjeta'),()=>this.ctx.library.deleteCard(deck.id,card.id,this.ctx.actor().id,true)]]as const)more.append(button(L(label),()=>this.run(action)));row.append(more);list.append(row);
  }form.append(list);const draft=this.linkDrafts.get(deck.id);this.cardEditor(form,deck,draft?.cardId?deck.cards.find(card=>card.id===draft.cardId):undefined);if(draft){const name=form.querySelector<HTMLInputElement>(':scope > label input');if(name)name.value=draft.name;const fields=form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('[data-card-editor] input,[data-card-editor] textarea,[data-card-editor] select');fields.forEach((field,index)=>{if(draft.values[index]!==undefined)field.value=draft.values[index];});this.linkDrafts.delete(deck.id);}this.aiCreator(form,'flashcards',deck.id);
  form.append(button(msg('Terminar edición'),()=>this.go('decks'),true));this.deleteMenu(form,msg('Eliminar mazo'),()=>{this.ctx.library.deleteDeck(deck.id,this.ctx.actor().id,true);this.linkDrafts.delete(deck.id);this.mode='decks';});body.append(form);
 }
 private cardEditor(parent:HTMLElement,deck:FlashcardDeck,existing?:FlashcardItem):void{
  parent.querySelector('[data-card-editor]')?.remove();const form=el('div','','sv-study-form sv-study-editor');form.dataset.cardEditor='true';form.dataset.cardId=existing?.id??'';form.append(el('h3',existing ? msg('Editar tarjeta') : msg('Nueva tarjeta')));
  const question=this.input(msg('Pregunta'),existing?.question||'',260,form,true);const answer=this.input(msg('Respuesta'),existing?.answer||'',400,form,true);
  const more=el('details');more.append(el('summary',msg('Detalles opcionales')));const hint=this.input(msg('Pista'),existing?.hint||'',220,more);const tags=this.input(msg('Etiquetas (separadas por comas)'),existing?.tags.join(', ')||'',260,more);const difficulty=el('select');for(const [value,label]of [['easy',msg('Fácil')],['medium',msg('Media')],['hard',msg('Difícil')]]){const o=el('option',label);o.value=String(value);difficulty.append(o);}difficulty.value=existing?.difficulty||'medium';more.append(field(msg('Dificultad'),difficulty));form.append(more);
  const contest=el('details');contest.append(el('summary',msg('Respuestas para el concurso')));
  contest.append(el('p',msg('Añade respuestas alternativas para jugar con estas tarjetas como un quiz. La respuesta de la tarjeta será la correcta.')));
  const distractors=Array.from({length:3},(_,index)=>this.input(msg('Alternativa {p0}',{p0:index+1}),existing?.choices?.filter((_,i)=>i!==existing.correctChoice)[index]||'',120,contest));form.append(contest);
  form.append(button(existing ? msg('Guardar tarjeta') : msg('Añadir tarjeta'),()=>this.run(()=>{
   const current=this.ctx.library.getDeck(deck.id)!;if(!existing&&current.cards.length>=100)throw new AppError('invalid','Este mazo ya tiene 100 tarjetas. Crea otro para continuar.');
   const card:FlashcardItem={...existing,id:existing?.id||crypto.randomUUID(),question:this.required(question,'Escribe la pregunta de la tarjeta.'),answer:this.required(answer,'Escribe la respuesta de la tarjeta.'),hint:hint.value.trim(),tags:tags.value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,8),difficulty:difficulty.value as FlashcardItem['difficulty'],topic:current.topic};
   const alternatives=distractors.map(input=>input.value.trim()).filter(Boolean);
   if(alternatives.length){if(card.answer.length>120||new Set([card.answer,...alternatives]).size!==alternatives.length+1)throw new AppError('invalid','Cada respuesta del concurso debe ser distinta y tener hasta 120 caracteres.');card.choices=[card.answer,...alternatives];card.correctChoice=0;}else{delete card.choices;delete card.correctChoice;}
   if(card.tags.some(t=>t.length>32))throw new AppError('invalid','Cada etiqueta puede tener hasta 32 caracteres.');
   this.ctx.library.saveDeck({...current,cards:existing?current.cards.map(c=>c.id===card.id?card:c):[...current.cards,card],updatedAt:Date.now()});this.linkDrafts.delete(deck.id);
  }),true));parent.append(form);if(existing)question.focus();
 }
 private deleteMenu(parent:HTMLElement,label:DisplayText,remove:()=>void):void{const more=el('details');more.append(el('summary',msg('Opciones')));const b=button(label,()=>{b.replaceWith(button(msg('Confirmar eliminación'),()=>this.run(remove)),button(msg('Cancelar'),()=>this.render()));});more.append(b);parent.append(more);}
 private review(body:HTMLElement):void{
  const deck=this.deckId?this.ctx.library.getDeck(this.deckId):null;if(deck){const source=this.noteLink(deck);if(source)body.append(source);}const card=deck?.cards.find(c=>c.id===this.reviewOrder[this.index]);const wrap=el('div','','sv-study-review');
  if(!deck||!card){wrap.append(el('h3',msg('¡Repaso terminado!')),el('p',msg('Cada vuelta cuenta. Vuelve cuando quieras.')),button(msg('Volver a mis mazos'),()=>this.go('decks'),true));body.append(wrap);return;}
  wrap.append(el('p',`${this.index+1} / ${this.reviewOrder.length}`),el('article',defaultMsg(this.revealed!==this.reversed?card.answer:card.question),'sv-study-card'));
  if(card.hint&&!this.revealed){const hint=el('details');hint.append(el('summary',msg('Mostrar pista')),el('p',card.hint));wrap.append(hint);}
  if(!this.revealed)wrap.append(button(msg('Revelar respuesta'),()=>{this.revealed=true;this.render();},true));else for(const [mark,label]of [['mastered',msg('Lo sabía')],['review',msg('Repasar')]]as const)wrap.append(button(L(label),()=>this.run(()=>{const progress={...this.progress,[`${deck.id}:${card.id}`]:mark};try{localStorage.setItem('studyvillage-review-v2',JSON.stringify(progress));}catch{throw new AppError('storage');}this.progress=progress;this.index++;this.revealed=false;})));body.append(wrap);
 }
 private quizzes(body:HTMLElement):void{
  if(this.ctx.library.loadError){this.fail(new AppError('storage',this.ctx.library.loadError));return;}
  if(this.ctx.actor().online&&!this.ctx.room.canLead())body.append(button(msg('Unirme al concurso de la aldea'),()=>{this.solo=null;this.go('group');this.ctx.room.act({kind:'join',name:this.ctx.actor().displayName});}));
  const quizzes=this.ctx.library.listQuizzes();if(!quizzes.length){this.empty(body,msg('Aquí aparecerán tus quizzes.'),msg('Crear mi primer quiz'),()=>{this.quizId=null;this.go('quiz-edit');});return;}
  body.append(button(msg('Crear quiz'),()=>{this.quizId=null;this.go('quiz-edit');}));const grid=el('div','','sv-study-library');
  for(const quiz of quizzes){const card=el('article','','sv-study-card');card.append(studySprite('quiz',86),el('h3',defaultMsg(quiz.title)),el('p',msg("{p0} preguntas", { p0: quiz.questions.length })));const play=button(msg('Jugar'),()=>{this.quizId=quiz.id;this.go('quiz-mode');},true);play.disabled=!quiz.questions.length;card.append(play,button(msg('Editar'),()=>{this.quizId=quiz.id;this.go('quiz-edit');}));grid.append(card);}body.append(grid);

 }
 private quizEditor(body:HTMLElement):void{
  const quiz=this.quizId?this.ctx.library.getQuiz(this.quizId):null;if(!quiz){this.createTitle(body,true);return;}
  const form=el('div','','sv-study-form');this.rename(form,quiz.title,title=>this.ctx.library.saveQuiz({...quiz,title,updatedAt:Date.now()}));
  for(const [index,q]of quiz.questions.entries()){
   const row=el('article','','sv-study-card');row.append(el('strong',`${index+1}. ${defaultText(q.text)}`),button(msg('Editar'),()=>this.questionEditor(form,quiz,q)));const more=el('details');more.append(el('summary',msg('Más')));more.append(button(msg('Eliminar pregunta'),()=>this.run(()=>{this.ctx.library.saveQuiz({...quiz,questions:quiz.questions.filter(x=>x.id!==q.id),updatedAt:Date.now()});})));for(const [label,delta]of [['Subir',-1],['Bajar',1]]as const){const b=button(msg(label),()=>this.run(()=>{const questions=[...quiz.questions];[questions[index],questions[index+delta]]=[questions[index+delta],questions[index]];this.ctx.library.saveQuiz({...quiz,questions,updatedAt:Date.now()});}));b.disabled=index+delta<0||index+delta>=quiz.questions.length;more.append(b);}row.append(more);form.append(row);
  }this.questionEditor(form,quiz);this.aiCreator(form,'quizzes',quiz.id);form.append(button(msg('Terminar edición'),()=>this.go('quiz-library'),true));this.deleteMenu(form,msg('Eliminar quiz'),()=>{this.ctx.library.deleteQuiz(quiz.id);this.mode='quiz-library';});body.append(form);
 }
 private questionEditor(parent:HTMLElement,quiz:QuizDefinition,existing?:QuizQuestion):void{
  parent.querySelector('[data-question-editor]')?.remove();const form=el('div','','sv-study-form sv-study-editor');form.dataset.questionEditor='true';form.append(el('h3',existing ? msg('Editar pregunta') : msg('Nueva pregunta')));const text=this.input(msg('Pregunta'),existing?.text||'',260,form,true);
  const options=el('div','','sv-quiz-editor-options');let correct=existing?.correctChoice??0;
  const inputs=Array.from({length:4},(_,i)=>{const row=el('div','','sv-quiz-editor-row');const radio=el('input');radio.type='radio';radio.name=`correct-${quiz.id}`;radio.checked=i===correct;setDisplayAttribute(radio, 'aria-label', msg("La respuesta {p0} es correcta", { p0: i+1 }));radio.onchange=()=>{correct=i;};const input=this.input(msg("Respuesta {p0}{p1}", { p0: i+1, p1: i>1?msg(' (opcional)'):'' }),existing?.choices[i]||'',120,row);row.prepend(radio);options.append(row);return input;});form.append(el('p',msg('Marca el círculo de la respuesta correcta. Completa al menos dos respuestas.')),options);
  form.append(button(msg('Usar verdadero o falso'),()=>{inputs[0].value=t('Verdadero');inputs[1].value=t('Falso');inputs[2].value='';inputs[3].value='';correct=0;const radios=options.querySelectorAll<HTMLInputElement>('input[type=radio]');radios.forEach((radio,index)=>radio.checked=index===0);}));
  const more=el('details');more.append(el('summary',msg('Explicación opcional')));const explanation=this.input(msg('Explicación'),existing?.explanation||'',400,more,true);form.append(more);
  form.append(button(existing ? msg('Guardar pregunta') : msg('Añadir pregunta'),()=>this.run(()=>{const question=this.required(text,'Escribe la pregunta del quiz.');const values=inputs.map(i=>i.value.trim());if(!values[0]||!values[1])throw new AppError('invalid','Completa al menos las dos primeras respuestas.');if(!values[correct])throw new AppError('invalid','La respuesta marcada como correcta está vacía.');const nonempty=values.filter(Boolean);if(new Set(nonempty).size!==nonempty.length)throw new AppError('invalid','Escribe respuestas diferentes.');const q:QuizQuestion={id:existing?.id||crypto.randomUUID(),text:question,choices:nonempty,correctChoice:values.slice(0,correct).filter(Boolean).length,explanation:explanation.value.trim()};const current=this.ctx.library.getQuiz(quiz.id)!;if(!existing&&current.questions.length>=100)throw new AppError('invalid','Este quiz ya tiene 100 preguntas.');this.ctx.library.saveQuiz({...current,questions:existing?current.questions.map(x=>x.id===q.id?q:x):[...current.questions,q],updatedAt:Date.now()});}),true));parent.append(form);if(existing)text.focus();
 }
 private quizOptions(parent:HTMLElement):void {
  const options=el('details');options.append(el('summary',msg('Opciones del concurso')));
  for(const [key,label]of [['shuffleQuestions','Mezclar preguntas'],['shuffleChoices','Mezclar respuestas'],['streakBonus','Bonificación por racha'],['showLeaderboard','Mostrar clasificación']]as const){const check=el('input');check.type='checkbox';check.checked=this.quizSettings[key];check.onchange=()=>this.quizSettings[key]=check.checked;options.append(field(msg(label),check));}
  const scoring=el('select');for(const [key,label]of [['speed','Puntos por velocidad'],['accuracy','Puntos por acierto'],['none','Sin puntos']]as const){const option=el('option',msg(label));option.value=key;scoring.append(option);}scoring.value=this.quizSettings.scoring;scoring.onchange=()=>this.quizSettings.scoring=scoring.value as QuizSettings['scoring'];options.append(field(msg('Puntuación'),scoring));parent.append(options);
 }
 private playMode(body:HTMLElement):void{
  const quiz=this.quizId?this.ctx.library.getQuiz(this.quizId):null;if(!quiz)return;
  body.append(el('h3',defaultMsg(quiz.title)));const seconds=el('select');for(const [value,label]of [['0',msg('Sin tiempo')],['5',msg('5 segundos')],['10',msg('10 segundos')],['20',msg('20 segundos')],['30',msg('30 segundos')],['60',msg('60 segundos')],['90',msg('90 segundos')],['120',msg('120 segundos')]]){const o=el('option',label);o.value=String(value);seconds.append(o);}const options=el('details');options.append(el('summary',msg('Tiempo por pregunta')),field(msg('Tiempo'),seconds));body.append(options);this.quizOptions(body);
  body.append(button(msg('Practicar solo'),()=>{this.solo=new StudyQuiz(this.ctx.actor().id);this.solo.setQuiz(quiz);this.solo.apply(this.ctx.actor().id,{kind:'join',name:this.ctx.actor().displayName},Date.now());this.solo.apply(this.ctx.actor().id,{kind:'start',seconds:Number(seconds.value),settings:this.quizSettings},Date.now());this.go('play');},true));
  if(this.ctx.actor().online){const leads=this.ctx.room.canLead();body.append(button(leads ? msg('Crear concurso en la aldea') : msg('Unirme al concurso de la aldea'),()=>this.run(()=>{this.solo=null;if(leads)this.ctx.room.command('study.setQuiz',quiz);this.ctx.room.act({kind:'join',name:this.ctx.actor().displayName});this.go('group');})));}else body.append(el('p',msg('Para jugar en grupo, abre una aldea o únete a una desde Menú → Aldea.')));
 }
 private play(body:HTMLElement):void{
  const actor=this.ctx.actor();const view=this.solo?this.solo.viewFor(actor.id,Date.now()):this.ctx.room.current();if(!view){body.append(el('p',msg('Preparando el concurso…')));return;}
  const send=(a:QuizAction)=>{if(this.solo){this.run(()=>this.solo!.apply(actor.id,a,Date.now()));}else this.ctx.room.act(a);};
  const wrap=el('div','','sv-study-session');wrap.append(el('h3',view.title ? defaultMsg(view.title) : msg('Concurso de la aldea')));
  if(view.phase==='lobby'){
   if(view.stopped)wrap.append(el('p',msg('El concurso ha terminado. Puedes empezar otro cuando quieras.')));
   wrap.append(el('p',msg("{p0} participantes", { p0: view.players.length })));
   if(!view.players.some(p=>p.id===actor.id))wrap.append(button(msg('Unirme'),()=>send({kind:'join',name:actor.displayName}),true));
   if(this.ctx.room.canLead()){this.quizOptions(wrap);const seconds=el('select');for(const [value,label]of [['5',msg('5 segundos')],['10',msg('10 segundos')],['20',msg('20 segundos')],['30',msg('30 segundos')],['60',msg('60 segundos')],['90',msg('90 segundos')],['120',msg('120 segundos')],['0',msg('Sin tiempo')]]){const o=el('option',label);o.value=String(value);seconds.append(o);}seconds.value=String(this.groupSeconds);seconds.onchange=()=>{this.groupSeconds=Number(seconds.value);};wrap.append(field(msg('Tiempo por pregunta'),seconds));const start=button(msg('Comenzar concurso'),()=>{this.mode='play';send({kind:'start',seconds:Number(seconds.value),settings:this.quizSettings});},true);start.disabled=!view.count||view.players.length<2;wrap.append(start,el('p',view.count ? msg('Espera a que se una al menos otra persona.') : msg('Elige un quiz desde tu biblioteca para abrir el concurso.')));}else wrap.append(el('p',msg('Espera a que el anfitrión comience.')));
  }else if(view.question){
   wrap.append(el('p',msg("Pregunta {p0} de {p1}", { p0: view.index+1, p1: view.count })),el('h2',defaultMsg(view.question.text)));
   if(view.phase==='question'){const timer=el('p',view.timed ? msg("{p0} s", { p0: Math.ceil(view.remainingMs/1000) }) : msg('Sin límite de tiempo'));if(view.timed)timer.dataset.quizDeadline=String(Date.now()+view.remainingMs);wrap.append(timer);const choices=el('div','','sv-quiz-answers');view.question.choices.forEach((choice,index)=>{const b=button(defaultMsg(choice),()=>send({kind:'answer',questionId:view.question!.id,choice:index}));b.disabled=view.meAnswered;choices.append(b);});wrap.append(choices);if(view.meAnswered)wrap.append(el('p',msg('Respuesta enviada. Esperando al resto…'),'sv-feedback'));}
   else{wrap.append(el('p',msg("Respuesta correcta: {p0}", { p0: defaultText(view.question.choices[view.solution!]) }),'sv-feedback'));if(view.explanation)wrap.append(el('p',defaultMsg(view.explanation)));if(this.solo||this.ctx.room.canLead())wrap.append(button(msg('Siguiente'),()=>send({kind:'next'}),true));else wrap.append(el('p',msg('El anfitrión pasará a la siguiente pregunta.')));}
  }else{wrap.append(el('h2',msg('¡Quiz terminado!')));if(this.solo)wrap.append(button(msg('Volver a jugar'),()=>this.go('quiz-mode'),true));else if(this.ctx.room.canLead())wrap.append(button(msg('Elegir otro quiz'),()=>this.go('quiz-library'),true));}
  if(view.phase!=='question'&&view.settings.showLeaderboard&&view.settings.scoring!=='none'){const scores=el('ol','','sv-quiz-scores');for(const p of view.players)scores.append(el('li',msg("{p0} · {p1} puntos", { p0: defaultText(p.name), p1: p.score })));wrap.append(scores);}
  if(!this.solo&&this.ctx.room.canLead()&&view.phase!=='lobby'){const more=el('details');more.append(el('summary',msg('Opciones del concurso')));const stop=button(msg('Terminar concurso'),()=>{stop.replaceWith(button(msg('Confirmar fin para todos'),()=>this.ctx.room.stop()));});more.append(stop);wrap.append(more);}body.append(wrap);
 }
 private aiCreator(parent:HTMLElement,feature:'flashcards'|'quizzes',id:string):void{
  const panel=el('details');panel.dataset.aiFeature=feature;panel.hidden=!this.ctx.ai.isReady(feature);panel.append(el('summary',feature==='flashcards' ? msg('Crear tarjetas con IA') : msg('Crear preguntas con IA')));
  const material=this.input(msg('Material de estudio'),'',8000,panel,true);const count=el('input');count.type='number';count.min='1';count.max='12';count.value='5';panel.append(field(msg('Cantidad'),count));
  const preview=el('div','','sv-ai-preview');const status=el('p','','sv-feedback');status.setAttribute('role','status');status.hidden=true;
  const generate=button(msg('Generar borrador'),()=>{const text=material.value.trim();if(!text){setDisplayText(status, msg('Añade el material que quieres estudiar.'));status.hidden=false;return;}const n=Number(count.value);if(!Number.isInteger(n)||n<1||n>12){setDisplayText(status, msg('Elige entre 1 y 12 preguntas.'));status.hidden=false;return;}const generation=this.generation;generate.disabled=true;status.hidden=false;setDisplayText(status, msg('Preparando un borrador…'));preview.replaceChildren();
   void (feature==='flashcards'?this.ctx.ai.cards(text,n):this.ctx.ai.questions(text,n)).then(items=>{
    if(generation!==this.generation)return;setDisplayText(status, msg('Revisa el borrador antes de añadirlo.'));for(const item of items)preview.append(el('article','question'in item ? `${item.question}\n${item.answer}` : msg("{p0}\n{p1}\nCorrecta: {p2}", { p0: item.text, p1: item.choices.join(' · '), p2: item.choices[item.correctChoice] }),'sv-study-card'));
    preview.append(button(msg('Añadir a mi biblioteca'),()=>this.run(()=>{if(feature==='flashcards'){const deck=this.ctx.library.getDeck(id)!;if(deck.cards.length+items.length>100)throw new AppError('invalid','El mazo no puede tener más de 100 tarjetas.');this.ctx.library.saveDeck({...deck,cards:[...deck.cards,...items as FlashcardItem[]],updatedAt:Date.now()});}else{const quiz=this.ctx.library.getQuiz(id)!;if(quiz.questions.length+items.length>100)throw new AppError('invalid','El quiz no puede tener más de 100 preguntas.');this.ctx.library.saveQuiz({...quiz,questions:[...quiz.questions,...items as QuizQuestion[]],updatedAt:Date.now()});}}),true),button(msg('Descartar borrador'),()=>{preview.replaceChildren();status.hidden=true;}));
   }).catch(e=>{if(generation===this.generation){status.textContent=errorMessage(e);status.hidden=false;this.fail(e);}}).finally(()=>{generate.disabled=false;});
  });panel.append(generate,status,preview);parent.append(panel);
 }
}
