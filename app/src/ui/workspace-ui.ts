import { msg, t, defaultMsg, defaultText, setDisplayText, setDisplayAttribute, getLanguage, type DisplayText } from '../i18n';
import type { AccessRequest, Contact, PublicHouse } from '../../../packages/core/src/protocol/types';
import { floorsOf, spaceKey, workspaceTitle, workspaceSchema, type HouseSpace, type WorkspaceDocument, type WorkspaceCommand } from '../house/workspaces';
const el = <K extends keyof HTMLElementTagNameMap>(tag:K,text?:DisplayText):HTMLElementTagNameMap[K] => { const e=document.createElement(tag);if(text)setDisplayText(e,text);return e; };
const button=(label:DisplayText,run:()=>void)=>{const b=el('button',label);b.type='button';b.className='sv-button sv-button-small';b.onclick=run;return b;};
const newId=()=>crypto.randomUUID().slice(0,8);
export interface SpacePanelContext {
  house():PublicHouse|null; space():HouseSpace|null; document():WorkspaceDocument|null; me():string;
  pendingAccess?():AccessRequest|null; cancelAccessRequest?():void;
  command(command:WorkspaceCommand):void; layout(house:PublicHouse):Promise<void>; friends():Contact[]; server():boolean; notify(message:string):void;
}
export class HouseSpacesPanel {
  readonly root=el('dialog');
  private signature='';private saving=false;private feedback:DisplayText='';private failed=false;
  private expanded=new Set<string>();
  constructor(private ctx:SpacePanelContext){this.root.className='sv-space-dialog sv-house-spaces';setDisplayAttribute(this.root,'aria-label',msg('Plantas y habitaciones'));}
  open():void{this.signature='';this.refresh();if(!this.root.open)this.root.showModal();}
  private async save(house:PublicHouse):Promise<void>{
    if(this.saving)return;
    this.saving=true;this.failed=false;this.feedback=msg('Guardando…');this.signature='';this.refresh();
    try{await this.ctx.layout({...house,revision:house.revision+1});this.feedback=this.ctx.server()?msg('Guardado en el servidor. Los amigos autorizados pueden entrar aunque estés desconectado.'):msg('Guardado en este dispositivo. Conecta tu servidor para mantener el acceso cuando estés desconectado.');}
    catch(error){this.failed=true;this.feedback=error instanceof Error?error.message:String(error);}
    finally{this.saving=false;this.signature='';this.refresh();}
  }
  private accessPicker(key:string,ids:string[],changed:(ids:string[])=>void):HTMLElement{
    const details=el('details');details.className='sv-space-access';details.open=this.expanded.has(key);
    details.ontoggle=()=>{if(details.open)this.expanded.add(key);else this.expanded.delete(key);};
    details.append(el('summary',msg('Amigos autorizados · {count}',{count:ids.length})));
    const help=el('p',key==='house'?msg('Estos amigos pueden entrar al vestíbulo incluso si la casa está cerrada. Las habitaciones mantienen su propio acceso.'):msg('Acceso directo a esta habitación, con paso por el vestíbulo y su planta. No abre otras habitaciones.'));
    details.append(help);
    const friends=this.ctx.friends().filter(c=>c.identity.fingerprint!==this.ctx.me());
    const choices=new Map(friends.map(c=>[c.identity.fingerprint,{...c.identity,displayName:c.nickname||c.identity.displayName}]));
    for(const id of ids)if(!choices.has(id))choices.set(id,{fingerprint:id,publicKey:'',displayName:t('Amigo guardado'),color:'#6a8074'});
    if(!choices.size){details.append(el('p',msg('Añade amigos en Contactos para autorizar su entrada.')));}
    for(const [id,friend]of choices){
      const row=el('label');row.className='sv-space-friend';
      const check=el('input');check.type='checkbox';check.checked=ids.includes(id);check.disabled=this.saving||(!check.checked&&ids.length>=24);
      setDisplayAttribute(check,'aria-label',msg('Autorizar a {name}',{name:friend.displayName}));
      check.onchange=()=>changed(check.checked?[...ids,id]:ids.filter(v=>v!==id));
      const avatar=el('span',friend.displayName.slice(0,1).toLocaleUpperCase());avatar.className='sv-space-avatar';avatar.style.backgroundColor=friend.color;
      const info=el('span');info.append(el('strong',friend.displayName),el('small',`${id.slice(0,8)}…${id.slice(-6)}`));
      row.append(check,avatar,info);details.append(row);
    }
    details.append(el('p',msg('Se guarda por identidad, no por nombre. Máximo 24 amigos por lista.')));
    return details;
  }
  refresh():void{
    if(!this.root.open&&this.signature)return;
    const house=this.ctx.house();if(!house){this.root.close();return;}
    const signature=JSON.stringify([house,this.ctx.space(),this.ctx.pendingAccess?.(),this.ctx.friends(),getLanguage(),this.saving,this.feedback]);if(signature===this.signature)return;this.signature=signature;
    const scroll=this.root.scrollTop;
    const owner=house.ownerId===this.ctx.me(),floors=floorsOf(house);
    const pending=this.ctx.pendingAccess?.();
    const enterButton=(label:DisplayText,space:HouseSpace|null)=>{const b=button(label,()=>this.ctx.command({action:'enter',owner:house.ownerId,space}));b.disabled=!!pending;return b;};
    const save=(next:typeof floors)=>void this.save({...house,floors:next});
    const header=el('header');header.className='sv-spaces-header';
    const title=el('div');title.append(el('span',owner?msg('TU CASA'):msg('EN ESTA CASA')),el('h2',msg('Plantas y habitaciones')));
    const close=button(msg('Cerrar'),()=>this.root.close());close.classList.add('sv-space-close');header.append(title,close);
    const intro=el('p',msg('Un vestíbulo para compartir. Habitaciones para tus proyectos, con acceso a tu medida.'));intro.className='sv-spaces-intro';
    const status=el('p',this.feedback);status.className=`sv-space-status${this.failed?' is-error':''}`;status.setAttribute('role','status');
    const home=el('section');home.className='sv-space-home';
    const lobby=el('div');lobby.className='sv-space-heading';lobby.append(el('h3',msg('Vestíbulo')),enterButton(msg('Vestíbulo'),null));home.append(lobby);
    if(owner){
      const label=el('label',msg('Acceso de la casa'));label.className='sv-space-mode';const select=el('select');select.className='sv-input';setDisplayAttribute(select,'aria-label',msg('Acceso de la casa'));
      for(const [value,label]of [['open',msg('Puerta abierta')],['ask',msg('Pedir permiso')],['locked',msg('Cerrada')]] as const){const option=el('option',label);option.value=value;select.append(option);}select.value=house.access;
      select.onchange=()=>void this.save({...house,access:select.value as PublicHouse['access']});label.append(select);home.append(label,this.accessPicker('house',house.allowlist??[],allowlist=>void this.save({...house,allowlist})));
      home.append(el('p',msg('Al guardar en un servidor propio, los permisos quedan disponibles mientras el servidor esté encendido.')));
    }else home.append(el('p',msg('Cada planta y habitación requiere permiso, salvo que estés en su lista de amigos autorizados.')));
    this.root.replaceChildren(header,intro,status,home);
    if(pending){const waiting=el('section');waiting.className='sv-space-home';waiting.setAttribute('role','status');waiting.append(el('p',msg('Solicitud pendiente')),button(msg('Cancelar solicitud'),()=>this.ctx.cancelAccessRequest?.()));this.root.append(waiting);}
    for(const [index,floor]of floors.entries()){
      const section=el('section');section.className='sv-space-floor';
      const heading=el('div');heading.className='sv-space-heading';
      const badge=el('span',String(index+1).padStart(2,'0'));badge.className='sv-space-number';heading.append(badge);
      if(owner){
        const name=el('input');name.className='sv-input sv-space-title';name.value=defaultText(floor.name);name.maxLength=48;setDisplayAttribute(name,'aria-label',msg('Nombre de la planta'));
        name.onchange=()=>{const value=name.value.trim();if(value&&value!==defaultText(floor.name))save(floors.map(f=>f.id===floor.id?{...f,name:value}:f));};heading.append(name);
      }else heading.append(el('h3',defaultMsg(floor.name)));
      heading.append(enterButton(msg('Entrar a la planta'),{floorId:floor.id,roomId:null}));section.append(heading);
      const grid=el('div');grid.className='sv-space-rooms';
      for(const room of floor.rooms){
        const card=el('article');card.className='sv-space-room';
        if(owner){const name=el('input');name.className='sv-input sv-space-title';name.value=defaultText(room.name);name.maxLength=48;setDisplayAttribute(name,'aria-label',msg('Nombre de la habitación'));name.onchange=()=>{const value=name.value.trim();if(value&&value!==defaultText(room.name))save(floors.map(f=>f.id===floor.id?{...f,rooms:f.rooms.map(r=>r.id===room.id?{...r,name:value}:r)}:f));};card.append(name);}else card.append(el('h4',room.name));
        const enter=enterButton(msg('Entrar a la habitación'),{floorId:floor.id,roomId:room.id});enter.classList.add('sv-space-primary');card.append(enter);
        if(owner){card.append(this.accessPicker(`${floor.id}/${room.id}`,room.allowlist??[],allowlist=>save(floors.map(f=>f.id===floor.id?{...f,rooms:f.rooms.map(r=>r.id===room.id?{...r,allowlist}:r)}:f))));
          const remove=button(msg('Eliminar habitación'),()=>{if(confirm(t('¿Eliminar esta habitación y su contenido?')))save(floors.map(f=>f.id===floor.id?{...f,rooms:f.rooms.filter(r=>r.id!==room.id)}:f));});remove.classList.add('sv-space-danger');card.append(remove);
        }grid.append(card);
      }
      if(!floor.rooms.length)grid.append(el('p',msg('Dale un lugar a tu próximo proyecto. Añade tu primera habitación.')));
      section.append(grid);
      const footer=el('footer');footer.className='sv-space-heading';footer.append(el('small',msg('{count}/10 habitaciones',{count:floor.rooms.length})));
      if(owner&&floor.rooms.length<10)footer.append(button(msg('Añadir habitación'),()=>save(floors.map(f=>f.id===floor.id?{...f,rooms:[...f.rooms,{id:newId(),name:t('Habitación {n}',{n:f.rooms.length+1})}]}:f))));
      if(owner&&index>0){const remove=button(msg('Eliminar planta'),()=>{if(confirm(t('¿Eliminar esta planta y todas sus habitaciones y contenidos?')))save(floors.filter(f=>f.id!==floor.id));});remove.classList.add('sv-space-danger');footer.append(remove);}section.append(footer);this.root.append(section);
    }
    if(owner){const footer=el('footer');footer.className='sv-space-heading';footer.append(el('small',msg('{count}/3 plantas',{count:floors.length})));if(floors.length<3)footer.append(button(msg('Añadir planta'),()=>save([...floors,{id:newId(),name:t('Planta {n}',{n:floors.length+1}),rooms:[]}])));this.root.append(footer);}
    if(this.saving)this.root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button:not(.sv-space-close),input,select').forEach(control=>control.disabled=true);
    this.root.scrollTop=scroll;
  }
}
export class RoomWorkspacePanel {
  readonly root=el('dialog');private scope='';private draft:WorkspaceDocument|null=null;private base=0;private dirty=false;private tab:'notes'|'materials'|'projects'='notes';private feedback=el('p');
  constructor(private ctx:SpacePanelContext){this.root.className='sv-space-dialog';setDisplayAttribute(this.root,'aria-label',msg('Espacio del proyecto'));}
  open(tab:'notes'|'materials'|'projects'='notes'):void{this.tab=tab;this.scope='';this.refresh();if(this.draft&&!this.root.open)this.root.showModal();}
  refresh():void{
    const house=this.ctx.house(),space=this.ctx.space(),doc=this.ctx.document();
    if(!house||!space?.roomId||!doc){this.root.close();this.scope='';this.draft=null;return;}
    const scope=`${house.ownerId}/${spaceKey(space)}`;
    if(scope!==this.scope){this.scope=scope;this.draft=structuredClone(doc);this.base=doc.revision;this.dirty=false;this.render();}
    else if(this.base!==doc.revision){
      const equal=this.draft&&JSON.stringify({...this.draft,revision:0})===JSON.stringify({...doc,revision:0});
      if(!this.dirty||equal){this.draft=structuredClone(doc);this.base=doc.revision;this.dirty=false;this.render();}
      else setDisplayText(this.feedback,msg('El espacio cambió. Tu borrador se conserva. Carga la versión actual o guarda después de revisarla.'));
    }
  }
  private render():void{
    const doc=this.draft;if(!doc)return;
    const house=this.ctx.house()!,space=this.ctx.space()!;
    this.root.replaceChildren(el('h2',workspaceTitle(house,space)),button(msg('Cerrar'),()=>this.root.close()));
    const tabs=el('nav');for(const[key,label]of [['notes',msg('Notas compartidas')],['materials',msg('Material de estudio')],['projects',msg('Proyectos y tareas')]]as const)tabs.append(button(label,()=>{this.tab=key;this.render();}));this.root.append(tabs);
    const changed=()=>{this.dirty=true;};
    const input=(label:DisplayText,value:string,max:number,write:(value:string)=>void,multiline=false)=>{const field=el('label');setDisplayText(field,label);const e=multiline?el('textarea'):el('input');e.className='sv-input';e.value=value;e.maxLength=max;setDisplayAttribute(e,'aria-label',label);e.oninput=()=>{write(e.value);changed();};field.append(e);return field;};
    if(this.tab==='notes'||this.tab==='materials'){
      const list=doc[this.tab];
      for(const item of list){const card=el('section');card.className='sv-space-floor';card.append(input(msg('Título'),item.title,80,value=>item.title=value),input(msg('Contenido compartido'),item.text,8000,value=>item.text=value,true),button(msg('Quitar'),()=>{list.splice(list.indexOf(item),1);changed();this.render();}));this.root.append(card);}
      if(list.length<16)this.root.append(button(this.tab==='notes'?msg('Añadir nota compartida'):msg('Añadir material'),()=>{list.push({id:newId(),title:'',text:''});changed();this.render();}));
    }else{
      for(const project of doc.projects){const card=el('section');card.className='sv-space-floor';card.append(input(msg('Nombre del proyecto'),project.name,80,value=>project.name=value),input(msg('Repositorio o enlace HTTPS'),project.url,600,value=>project.url=value),input(msg('Descripción'),project.description,4000,value=>project.description=value,true));
        try{const url=new URL(project.url);if(url.protocol==='https:'&&!url.username&&!url.password){const link=el('a',msg('Abrir proyecto'));link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}}catch{/* Invalid drafts are editable, never opened. */}
        for(const task of project.tasks){const row=el('div');row.className='sv-inline';const done=el('input');done.type='checkbox';done.checked=task.done;setDisplayAttribute(done,'aria-label',msg('Tarea completada'));done.onchange=()=>{task.done=done.checked;changed();};row.append(done,input(msg('Tarea'),task.text,280,value=>task.text=value),button(msg('Quitar'),()=>{project.tasks=project.tasks.filter(t=>t.id!==task.id);changed();this.render();}));card.append(row);}
        if(project.tasks.length<40)card.append(button(msg('Añadir tarea'),()=>{project.tasks.push({id:newId(),text:'',done:false});changed();this.render();}));
        card.append(button(msg('Quitar proyecto'),()=>{doc.projects=doc.projects.filter(p=>p.id!==project.id);changed();this.render();}));this.root.append(card);
      }
      if(doc.projects.length<16)this.root.append(button(msg('Añadir proyecto'),()=>{doc.projects.push({id:newId(),name:'',url:'',description:'',tasks:[]});changed();this.render();}));
    }
    this.feedback=el('p');this.feedback.setAttribute('role','status');
    this.root.append(button(msg('Guardar espacio'),()=>{try{for(const p of doc.projects)if(p.url){const url=new URL(p.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error();}workspaceSchema.parse(doc);this.ctx.command({action:'commit',base:this.base,document:structuredClone(doc)});}catch{setDisplayText(this.feedback,msg('Revisa los enlaces HTTPS y el tamaño del contenido antes de guardar.'));}}),button(msg('Cargar versión actual'),()=>{const current=this.ctx.document();if(current){this.draft=structuredClone(current);this.base=current.revision;this.dirty=false;this.render();}}),this.feedback);
  }
}
