import path from 'node:path';
import {releaseTarget} from './release-targets.mjs';
export function installerConfig(key,root,app,output,pkg){
 const target=releaseTarget(key);
 return {
  appId:'com.studyvillage.rebuild',productName:'StudyVillage',electronVersion:pkg.devDependencies.electron,
  directories:{app,output},asar:true,npmRebuild:false,publish:null,
  files:['*.cjs','package.json','icon.png','web/**/*','!node_modules/**/*'],
  extraMetadata:{description:'Una aldea para compartir, decorar y crear a tu ritmo.',author:'StudyVillage contributors'},
  artifactName:target.file,
  win:{target:['nsis'],icon:path.join(root,'app/src-tauri/icons/icon.ico'),signExecutable:false},
  nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,runAfterFinish:false,deleteAppDataOnUninstall:false,differentialPackage:false,installerLanguages:['es_ES','en_US','fr_FR']},
  linux:{target:['AppImage'],executableName:'studyvillage',category:'Game',icon:path.join(root,'app/src-tauri/icons/icon.png')},
  appImage:{executableArgs:[]},
  mac:{target:[{target:'dmg',arch:['universal']}],icon:path.join(root,'app/src-tauri/icons/icon.png'),category:'public.app-category.games',identity:'-',hardenedRuntime:false,notarize:false,mergeASARs:true,minimumSystemVersion:'13.0',extendInfo:{NSCameraUsageDescription:'Comparte tu cámara cuando tú lo decidas.',NSMicrophoneUsageDescription:'Habla con otras personas de la aldea cuando tú lo decidas.'}},
  dmg:{sign:false,contents:[{x:140,y:160,type:'file'},{x:420,y:160,type:'link',path:'/Applications'}]},
 };
}
