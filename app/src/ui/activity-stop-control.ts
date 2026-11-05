import {msg,setDisplayText} from '../i18n';

/** A stop action belongs to a running round and follows the current authority view. */
export class ActivityStopControl {
 private button:HTMLButtonElement|null=null;
 private confirmation:ReturnType<typeof setTimeout>|null=null;
 private allowed=false;
 constructor(private container:HTMLElement,private stop:()=>void){}
 update(phase:string|null|undefined,authorized:boolean):void{
  this.allowed=authorized&&!!phase&&phase!=='lobby'&&phase!=='end';
  if(!this.allowed){this.remove();return;}
  if(this.button)return;
  const button=document.createElement('button');button.type='button';button.className='sv-activity-stop';setDisplayText(button,msg('Terminar partida'));
  button.onclick=()=>{
   if(!this.allowed)return;
   if(this.confirmation===null){setDisplayText(button,msg('¿Terminar para todos?'));this.confirmation=setTimeout(()=>this.disarm(),3000);return;}
   this.disarm();this.stop();
  };
  this.button=button;this.container.append(button);
 }
 private disarm():void{if(this.confirmation!==null)clearTimeout(this.confirmation);this.confirmation=null;if(this.button)setDisplayText(this.button,msg('Terminar partida'));}
 private remove():void{this.disarm();this.button?.remove();this.button=null;}
 dispose():void{this.allowed=false;this.remove();}
}
