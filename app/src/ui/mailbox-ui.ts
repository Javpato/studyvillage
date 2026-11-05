import {MailboxError,MAILBOX_PAGE_SIZE,type MailboxCommand,type MailboxView} from '../../../packages/core/src/house/mailbox';
import {getLocale,msg,setDisplayAttribute,setDisplayText} from '../i18n';
import {errorMessage} from '../errors/messages';
import './mailbox.css';

function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',label=''):HTMLElementTagNameMap[K]{const node=document.createElement(tag);node.className=cls;if(label)setDisplayText(node,msg(label));return node;}
function button(label:string,run:()=>void){const node=el('button','sv-button',label);node.type='button';node.onclick=run;return node;}
const errors={limit:'Ya tienes cinco notas en este buzón. Retira una para dejar otra.',forbidden:'Solo el autor o el destinatario pueden retirar esta nota.',missing:'Este buzón ya no está disponible.',offline:'El destinatario debe estar conectado para abrir su buzón entre amigos. Vuelve a intentarlo cuando regrese.',invalid:'No se pudo guardar la nota. Conservamos tu texto para que lo intentes de nuevo.'};

export class MailboxUI {
 readonly root=el('dialog','sv-mailbox');
 private title=el('h2');private list=el('section','sv-mailbox-notes');private draft=el('textarea','sv-mailbox-draft');private count=el('p','sv-mailbox-count');private error=el('p','sv-error');private pager=el('nav','sv-mailbox-pages');
 private send:HTMLButtonElement;private refresh:HTMLButtonElement;private view:MailboxView|null=null;private owner='';private busy=false;private generation=0;private draftId:{text:string;id:string}|null=null;
 constructor(private self:()=>string,private command:(command:MailboxCommand)=>Promise<MailboxView>){
  setDisplayAttribute(this.root,'aria-label',msg('Buzón'));const header=el('header');header.append(this.title,button('Cerrar',()=>this.root.close()));
  const hint=el('p','sv-mailbox-hint','Las notas solo las ven su autor y el destinatario. Hasta cinco por persona.');
  this.refresh=button('Actualizar',()=>{void this.run({action:'list',owner:this.owner,page:this.view?.page??0});});
  const bar=el('div','sv-mailbox-bar');bar.append(el('h3','','Notas del buzón'),this.refresh);
  this.draft.rows=4;this.draft.maxLength=1000;setDisplayAttribute(this.draft,'aria-label',msg('Escribe una nota'));setDisplayAttribute(this.draft,'placeholder',msg('Escribe una nota…'));this.draft.oninput=()=>this.controls();
  this.send=button('Dejar nota',()=>{const text=this.draft.value.trim();if(!text||this.busy)return;if(this.draftId?.text!==text)this.draftId={id:crypto.randomUUID(),text};void this.run({action:'post',owner:this.owner,id:this.draftId.id,text});});
  const footer=el('footer');footer.append(this.count,this.send);this.error.hidden=true;this.error.setAttribute('role','alert');
  this.root.append(header,hint,bar,this.list,this.pager,this.draft,footer,this.error);document.body.append(this.root);
  this.root.addEventListener('close',()=>{this.generation++;this.busy=false;});
 }
 open(ownerId:string,name:string):void{
  this.generation++;this.owner=ownerId;this.view=null;this.busy=false;this.draft.value='';this.draftId=null;this.error.hidden=true;this.list.replaceChildren();this.pager.replaceChildren();this.count.textContent='';
  setDisplayText(this.title,msg('Buzón de {name}',{name}));if(!this.root.open)this.root.showModal();this.controls();void this.run({action:'list',owner:ownerId});
 }
 private controls(){if(this.view)setDisplayText(this.count,msg('{n} de 5 notas · {chars}/1000 caracteres',{n:this.view.ownCount,chars:this.draft.value.length}));this.send.disabled=this.busy||!this.view||!this.draft.value.trim()||this.view.ownCount>=this.view.limit;this.refresh.disabled=this.busy;this.draft.disabled=this.busy;for(const button of this.list.querySelectorAll('button'))button.disabled=this.busy;for(const button of this.pager.querySelectorAll('button'))button.disabled=this.busy||button.dataset.unavailable==='true';}
 private render(){
  const view=this.view;if(!view)return;this.list.replaceChildren();
  if(!view.notes.length)this.list.append(el('p','sv-mailbox-empty',this.owner===this.self()?'Todavía no hay notas en tu buzón.':'Todavía no has dejado notas en este buzón.'));
  for(const note of view.notes){const card=el('article','sv-mailbox-note'),head=el('header'),author=el('strong'),date=el('time'),text=el('p');author.textContent=note.authorName;date.dateTime=new Date(note.createdAt).toISOString();date.textContent=new Intl.DateTimeFormat(getLocale(),{dateStyle:'short',timeStyle:'short'}).format(note.createdAt);text.textContent=note.text;const remove=button('Retirar nota',()=>{void this.run({action:'remove',owner:this.owner,id:note.id,page:view.page});});remove.classList.add('sv-mailbox-remove');head.append(author,date);card.append(head,text,remove);this.list.append(card);}
  setDisplayText(this.count,msg('{n} de 5 notas · {chars}/1000 caracteres',{n:view.ownCount,chars:this.draft.value.length}));
  this.pager.replaceChildren();if(view.total>MAILBOX_PAGE_SIZE){const previous=button('Anterior',()=>{void this.run({action:'list',owner:this.owner,page:view.page-1});}),next=button('Siguiente',()=>{void this.run({action:'list',owner:this.owner,page:view.page+1});});previous.dataset.unavailable=String(view.page===0);next.dataset.unavailable=String((view.page+1)*MAILBOX_PAGE_SIZE>=view.total);const page=el('span');setDisplayText(page,msg('Página {n} de {total}',{n:view.page+1,total:Math.ceil(view.total/MAILBOX_PAGE_SIZE)}));this.pager.append(previous,page,next);}
 }
 private async run(command:MailboxCommand){
  if(this.busy)return;this.busy=true;const generation=this.generation;this.error.hidden=true;this.controls();
  try{const view=await this.command(command);if(generation!==this.generation)return;this.view=view;if(command.action==='post'){this.draft.value='';this.draftId=null;}this.render();}
  catch(error){if(generation!==this.generation)return;if(error instanceof MailboxError)setDisplayText(this.error,msg(errors[error.code]));else this.error.textContent=errorMessage(error);this.error.hidden=false;}
  finally{if(generation===this.generation){this.busy=false;this.controls();}}
 }
 dispose(){this.generation++;this.root.remove();}
}
