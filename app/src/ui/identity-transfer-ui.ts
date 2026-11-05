import { inspectIdentityTransfer } from '../../../packages/runtime/src/storage/identity-transfer';
import type { AppActions } from '../../../packages/core/src/protocol/types';
import { errorMessage } from '../errors/messages';
import { msg,setDisplayText,setDisplayAttribute } from '../i18n';

export function identityTransferControls(actions:AppActions):HTMLElement {
 const root=document.createElement('section');root.className='sv-stack';
 const heading=document.createElement('h4');setDisplayText(heading,msg('Usar mi identidad en otro dispositivo'));
 const explanation=document.createElement('p');explanation.className='sv-subtle';setDisplayText(explanation,msg('Exporta la copia cifrada, llévala a tu otro dispositivo e impórtala con su contraseña. Tu tarjeta pública no permite entrar en tu identidad.'));
 const output=document.createElement('p');output.setAttribute('role','status');
 const run=async(work:()=>Promise<void>)=>{try{await work();}catch(error){output.textContent=errorMessage(error);}};
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='sv-button';setDisplayText(exportButton,msg('Exportar identidad cifrada'));exportButton.onclick=()=>{void run(()=>actions.exportIdentity());};
 const file=document.createElement('input');file.type='file';file.accept='.json';setDisplayAttribute(file,'aria-label',msg('Copia cifrada de identidad'));let selected:File|null=null;
 const pass=document.createElement('input');pass.type='password';pass.autocomplete='current-password';pass.className='sv-input';setDisplayAttribute(pass,'aria-label',msg('Contraseña de la copia'));
 const importButton=document.createElement('button');importButton.type='button';importButton.className='sv-button';importButton.disabled=true;setDisplayText(importButton,msg('Importar y usar esta identidad'));
 file.onchange=()=>{selected=null;importButton.disabled=true;const next=file.files?.[0];if(!next)return;void run(async()=>{if(next.size>16384)throw new Error('Invalid identity file');const parsed=await inspectIdentityTransfer(await next.text());selected=next;output.textContent=`${parsed.publicIdentity.displayName} · ${parsed.publicIdentity.fingerprint}`;importButton.disabled=false;});};
 importButton.onclick=()=>{if(!selected)return;importButton.disabled=true;void run(async()=>{await actions.importIdentity(selected!,pass.value);pass.value='';file.value='';selected=null;setDisplayText(output,msg('Identidad importada y verificada.'));}).finally(()=>{importButton.disabled=!selected;});};
 root.append(heading,explanation,exportButton,file,pass,importButton,output);return root;
}
