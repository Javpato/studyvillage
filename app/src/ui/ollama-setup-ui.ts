import { msg, t, defaultText, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import { AI_FEATURES, LocalOllama, type AiFeature } from '../../../packages/runtime/src/ai/local-ollama';
import { openExternal } from '../../../packages/runtime/src/local-bridge/external';
import { errorMessage } from '../errors/messages';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: DisplayText = '', cls = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); setDisplayText(e, text); e.className = cls; return e; }
function button(text: DisplayText, fn: () => void): HTMLButtonElement { const b = el('button', text); b.type = 'button'; b.onclick = fn; return b; }
export class OllamaSetupPanel {
 readonly root = el('section', '', 'sv-study-workspace sv-ollama-setup');
 private message = ''; private busy = false; private generation = 0;
 constructor(private ai: LocalOllama, private close: () => void) { setDisplayAttribute(this.root, 'aria-label', msg('Configurar Ollama')); }
 mount(container: HTMLElement): void { container.replaceChildren(this.root); this.render(); }
 unmount(): void { this.generation++; if (this.root.isConnected) this.ai.cancel(); this.root.remove(); }
 private async run(fn: () => Promise<void>): Promise<void> {
  if(this.busy)return; this.busy=true; this.message='Comprobando…'; this.render(); const generation=this.generation;
  try { await fn(); if(generation===this.generation)this.message='Configuración comprobada y guardada en este equipo.'; }
  catch(e){if(generation===this.generation)this.message=errorMessage(e);}
  finally{this.busy=false;if(generation===this.generation)this.render();}
 }
 private render(): void {
  this.root.replaceChildren(); const head=el('header'); head.append(el('h2',msg('Configurar Ollama')),button(msg('Cerrar'),this.close)); this.root.append(head,el('p',msg('Ollama es opcional: ayuda a preparar materiales de estudio y bots de Gartic. Requiere instalar Ollama y configurar un modelo compatible. Sin él puedes estudiar, dibujar, usar el reloj y jugar con los bots normales.')));
  if(!this.ai.configurable()) {
   this.root.append(el('p',this.ai.sharedMode()?msg('La IA compartida pertenece al anfitrión. Solo el contenido que elijas se envía a su equipo.'):msg('Ollama local está disponible en la aplicación de escritorio. Un anfitrión móvil no ofrece IA compartida.')));
   for(const [key,name]of Object.entries(AI_FEATURES))this.root.append(el('p',`${t(name)}: ${t(this.ai.isReady(key as AiFeature)?'Lista para usar.':'No disponible')}`));
   return;
  }
  const body=el('div','','sv-study-form'); body.append(el('p',msg('Tu IA vive en tu ordenador. Conéctala una vez y elige dónde quieres utilizarla.')));
  if(this.message){const status=el('p',defaultText(this.message),'sv-feedback');status.setAttribute('role','status');body.append(status);}
  const guide=el('details');guide.open=!this.ai.reachable; guide.append(el('summary',msg('1. Instalar y preparar Ollama')));
  const install=el('a',msg('Descargar Ollama'));install.href='https://ollama.com/download';install.target='_blank';install.rel='noopener noreferrer';install.onclick=e=>{e.preventDefault();void openExternal(install.href).catch(error=>{this.message=errorMessage(error);this.render();});};guide.append(el('p',msg('Instala Ollama, abre su aplicación e instala un modelo desde Ollama. Después vuelve aquí para comprobar la conexión.')),install);
  const platform=el('select');setDisplayAttribute(platform, 'aria-label', msg('Sistema operativo'));for(const name of ['Windows','Linux','macOS']){const o=el('option',name);platform.append(o);}
  const instructions=el('p');const update=()=>{setDisplayText(instructions, platform.value==='Linux' ? msg('En Linux, sigue el instalador oficial. Si el servicio está detenido, inicia Ollama con ollama serve.') : platform.value==='Windows' ? msg('En Windows, instala la aplicación oficial y ábrela desde Inicio.') : msg('En macOS, instala la aplicación oficial y ábrela desde Aplicaciones.'));};platform.onchange=update;update();guide.append(platform,instructions);
  const modelsLink=el('a',msg('Elegir un modelo en la biblioteca de Ollama'));modelsLink.href='https://ollama.com/library';modelsLink.target='_blank';modelsLink.rel='noopener noreferrer';modelsLink.onclick=e=>{e.preventDefault();void openExternal(modelsLink.href).catch(error=>{this.message=errorMessage(error);this.render();});};guide.append(el('p',msg('Elige un modelo que tu equipo pueda ejecutar. Para flashcards, quizzes y explicaciones basta un modelo de texto; para leer dibujos y jugar Gartic necesitas uno que indique visión.')),modelsLink);
  const modelName=el('input');setDisplayAttribute(modelName, "placeholder", msg('Nombre exacto del modelo elegido'));modelName.maxLength=100;setDisplayAttribute(modelName, 'aria-label', msg('Modelo que quieres instalar'));
  const pull=el('code',msg('ollama pull <modelo>'));modelName.oninput=()=>{const name=modelName.value.trim();setDisplayText(pull, /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(name) ? msg("ollama pull {p0}", { p0: name }) : msg('ollama pull <modelo>'));};
  const copy=button(msg('Copiar comando de descarga'),()=>{if(!modelName.value.trim()||pull.textContent?.includes('<modelo>')){this.message='Escribe primero el nombre del modelo que elegiste.';this.render();return;}void navigator.clipboard.writeText(pull.textContent||'').then(()=>{setDisplayText(copy, msg('Copiado'));}).catch(()=>{setDisplayText(copy, msg('Selecciona y copia el comando de arriba'));});});guide.append(el('p',msg('Si no tienes un modelo instalado, escribe su nombre y ejecuta este comando en tu terminal. La descarga la realiza Ollama; la app no ejecuta comandos.')),modelName,pull,copy);

  const help=el('details');help.append(el('summary',msg('Si no consigue conectar')));
  help.append(el('p',msg('Comprueba que Ollama está abierto en este mismo equipo y escucha en 127.0.0.1:11434. Sin modelos instalados no se puede activar ninguna función. Para analizar dibujos necesitas un modelo con visión.')));
  const origin=el('code',location.origin);help.append(el('p',msg('Si Ollama funciona pero el navegador no le permite conectar, autoriza solo este origen mediante OLLAMA_ORIGINS y reinicia Ollama:')),origin);
  const origins=el('a',msg('Guía oficial de conexión y permisos'));origins.href='https://docs.ollama.com/faq';origins.target='_blank';origins.rel='noopener noreferrer';origins.onclick=e=>{e.preventDefault();void openExternal(origins.href).catch(error=>{this.message=errorMessage(error);this.render();});};help.append(origins);guide.append(help);body.append(guide);
  const detect=button(this.ai.reachable ? msg('Volver a comprobar conexión') : msg('2. Comprobar conexión'),()=>{void this.run(()=>this.ai.detect());});detect.disabled=this.busy;body.append(detect);
  if(this.ai.reachable){
   const models=this.ai.availableModels();
   if(!models.length)body.append(el('p',msg('Ollama está abierto, pero no tiene modelos locales instalados. Instala uno desde Ollama y vuelve a comprobar.')));
   else {
    const label=el('label',msg('3. Modelo común')); const select=el('select'); setDisplayAttribute(select, 'aria-label', msg('Modelo común'));for(const model of models){const o=el('option',model);o.value=model;select.append(o);}select.value=this.ai.getConfig().model;select.disabled=this.busy;select.onchange=()=>{try{this.ai.setDefaultModel(select.value);this.render();}catch(e){this.message=errorMessage(e);this.render();}};label.append(select);body.append(label);
    const all=button(msg('Configurar todo'),()=>{void this.run(async()=>{const failed:string[]=[];const generation=this.generation;for(const feature of Object.keys(AI_FEATURES) as AiFeature[]){if(generation!==this.generation)return;try{await this.ai.verify(feature);}catch{failed.push(t(AI_FEATURES[feature]));}}if(failed.length)throw new PartialSetup(t('Listas las funciones compatibles. Revisa individualmente: {features}.', { features: failed.join(', ') }));});});all.disabled=this.busy;body.append(all,el('h3',msg('4. Activar por función')));
    for(const [key,name]of Object.entries(AI_FEATURES)){
     const feature=key as AiFeature;const row=el('details','','sv-ai-feature');row.append(el('summary',`${this.ai.isReady(feature)?'✓ ':''}${t(name)}`));
     row.append(el('p',this.ai.isReady(feature) ? msg('Lista para usar.') : msg('Oculta en la app hasta que la actives y la prueba termine correctamente.')));
     const label=el('label',msg('Modelo para esta función'));const choice=el('select');setDisplayAttribute(choice, 'aria-label', msg("Modelo para {p0}", { p0: msg(name) }));const common=el('option',msg('Usar modelo común'));common.value='';choice.append(common);for(const model of models){const o=el('option',model);o.value=model;choice.append(o);}choice.value=this.ai.getConfig().features[feature]?.model||'';choice.disabled=this.busy;choice.onchange=()=>{try{this.ai.setFeature(feature,false,choice.value);}catch(e){this.message=errorMessage(e);}};label.append(choice);
     const test=button(msg('Activar y probar'),()=>{void this.run(()=>this.ai.verify(feature));});test.disabled=this.busy;
     const disable=button(msg('Desactivar'),()=>{try{this.ai.setFeature(feature,false,choice.value);this.render();}catch(e){this.message=errorMessage(e);this.render();}});disable.disabled=this.busy;row.append(label,test,disable);body.append(row);
    }
   }
  }
  this.root.append(body);
 }
}
// A partial result is expected when a text model cannot analyse pictures.
import { AppError } from '../errors/messages';
class PartialSetup extends AppError { constructor(message:string){super('ai-response',message);} }
