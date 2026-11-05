import { Capacitor, registerPlugin } from '@capacitor/core';
import { downloadLocal } from './files';
const nativeShare=registerPlugin<{share(options:{json:string}):Promise<void>}>('ContactShare');
/** Called directly from a user gesture; only the public contact card reaches the share sheet. */
export async function sharePublicContact(json:string):Promise<'shared'|'downloaded'|'cancelled'>{
  if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'){
    await nativeShare.share({json});return 'shared';
  }
  const file=new File([json],'studyvillage-contact.json',{type:'application/json'});
  if(navigator.share&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'StudyVillage'});return 'shared';}
    catch(error){if(error instanceof DOMException&&error.name==='AbortError')return 'cancelled';throw error;}
  }
  downloadLocal(file.name,file);return 'downloaded';
}
