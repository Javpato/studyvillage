import {readConnectionConfig,saveConnectionConfig} from '../../../packages/runtime/src/signaling/config';
import {msg,setDisplayText,setDisplayAttribute} from '../i18n';
export class ConnectionPanel {
 readonly root=document.createElement('dialog');private status=document.createElement('p');private fields=new Map<string,HTMLInputElement>();
 constructor(){this.root.className='sv-settings-dialog';setDisplayAttribute(this.root,'aria-label',msg('Opciones de conexión'));const heading=document.createElement('h2');setDisplayText(heading,msg('Opciones de conexión'));this.root.append(heading);
  const help=document.createElement('p');setDisplayText(help,msg('Puedes usar tu propio servidor de señalización y relay TURN. Sin relay, algunas redes no permiten conectar.'));this.root.append(help);
  for(const [name,label,placeholder]of [['signaling','Señalización propia (HTTPS)','https://peer.example.org/'],['turn','Relay TURN','turns:relay.example.org:5349?transport=tcp'],['username','Usuario TURN',''],['credential','Contraseña TURN',''],['relayOnly','Usar solo relay','']]as const){const field=document.createElement('label'),input=document.createElement('input');setDisplayText(field,msg(label));input.type=name==='relayOnly'?'checkbox':name==='credential'?'password':'text';input.placeholder=placeholder;setDisplayAttribute(input,'aria-label',msg(label));field.append(input);field.style.cssText='display:block;margin:12px 0';input.style.maxWidth='100%';this.fields.set(name,input);this.root.append(field);}
  const save=document.createElement('button');save.type='button';setDisplayText(save,msg('Guardar conexión'));save.onclick=()=>{try{saveConnectionConfig(Object.fromEntries([...this.fields].map(([name,input])=>[name,name==='relayOnly'?input.checked:input.value.trim()])));setDisplayText(this.status,msg('Guardado. Se aplicará la próxima vez que te conectes.'));}catch{setDisplayText(this.status,msg('Revisa la dirección segura y las credenciales del relay.'));}};
  const close=document.createElement('button');close.type='button';setDisplayText(close,msg('Cerrar'));close.onclick=()=>this.root.close();this.status.setAttribute('role','status');this.root.append(save,close,this.status);document.body.append(this.root);
 }
 open():void{const config=readConnectionConfig();for(const [name,input]of this.fields){const value=config[name as keyof typeof config];if(typeof value==='boolean')input.checked=value;else input.value=value;}this.status.textContent='';this.root.showModal();}
 dispose():void{this.root.remove();}
}
