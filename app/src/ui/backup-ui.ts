import type { AppActions } from '../../../packages/core/src/protocol/types';
import { errorMessage } from '../errors/messages';
import { msg,setDisplayText,setDisplayAttribute } from '../i18n';

export function backupControls(actions:AppActions):HTMLElement {
 const root=document.createElement('section');root.className='sv-stack';
 const heading=document.createElement('h4');setDisplayText(heading,msg('Copia de todos mis datos'));
 const description=document.createElement('p');description.className='sv-subtle';setDisplayText(description,msg('Incluye identidad cifrada, casa, contactos, apuntes, estudio, proyectos y cuadernos privados con PDF. Guarda primero una copia personal de los cambios compartidos pendientes.'));
 const status=document.createElement('p');status.setAttribute('role','status');
 const run=async(work:()=>Promise<void>)=>{try{await work();}catch(error){status.textContent=errorMessage(error);}};
 const button=(text:string,fn:()=>void)=>{const b=document.createElement('button');b.type='button';b.className='sv-button';setDisplayText(b,msg(text));b.onclick=fn;return b;};
 const file=document.createElement('input');file.type='file';file.accept='.json';setDisplayAttribute(file,'aria-label',msg('Copia completa de StudyVillage'));let selected:File|null=null;
 const confirm=document.createElement('input');confirm.type='checkbox';const label=document.createElement('label');setDisplayText(label,msg('He cerrado otras ventanas. Quiero reemplazar los datos locales con esta copia.'));label.prepend(confirm);
 const restore=button('Restaurar copia y reiniciar',()=>{if(!selected||!confirm.checked)return;restore.disabled=true;void run(()=>actions.restoreBackup(selected!)).finally(()=>{restore.disabled=!selected||!confirm.checked;});});restore.disabled=true;
 file.onchange=()=>{selected=null;confirm.checked=false;restore.disabled=true;const next=file.files?.[0];if(!next)return;void run(async()=>{const info=await actions.inspectBackup(next);selected=next;setDisplayText(status,msg('{name}: {notebooks} cuadernos, {pages} páginas, {attachments} adjuntos y {keys} bibliotecas o ajustes. {conflicts} entradas locales son diferentes.',{name:info.profile,notebooks:info.notebooks,pages:info.pages,attachments:info.attachments,keys:info.keys,conflicts:info.conflicts}));});};
 confirm.onchange=()=>restore.disabled=!selected||!confirm.checked;
 root.append(heading,description,button('Exportar copia completa',()=>{void run(()=>actions.exportBackup());}),button('Exportar copia anterior a la restauración',()=>{void run(()=>actions.exportRecoveryBackup());}),file,status,label,restore);return root;
}
