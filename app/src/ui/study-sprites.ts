import {sprite} from '../assets/sprite-catalog';
/** Small coloured sprites on the same rect grid as the village's pixel icons. */
export type StudySprite = 'notebook'|'cards'|'quiz'|'create'|'review';
export function studySprite(kind: StudySprite, size=112): SVGSVGElement {
 const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('width',String(size));svg.setAttribute('height',String(size));svg.setAttribute('shape-rendering','crispEdges');svg.setAttribute('aria-hidden','true');svg.classList.add('sv-study-sprite');
 const asset=sprite('study-'+kind);if(asset){const image=document.createElementNS(ns,'image');image.setAttribute('href',asset.src);image.setAttribute('width','48');image.setAttribute('height','48');image.style.imageRendering='pixelated';svg.append(image);return svg;}
 const rect=(x:number,y:number,w:number,h:number,color:string)=>{const r=document.createElementNS(ns,'rect');for(const [k,v]of Object.entries({x,y,width:w,height:h,fill:color}))r.setAttribute(k,String(v));svg.append(r);};
 const ink='#594332',paper='#fff8df',line='#d5c39b',green='#6c9474';
 rect(8,42,33,2,'#d9c9a9');rect(11,44,27,1,'#e7d9be');
 if(kind==='notebook'){
  rect(10,5,28,36,ink);rect(13,7,23,32,green);rect(10,7,4,32,'#436b59');rect(15,8,20,1,'#9fb39b');rect(18,15,14,12,paper);rect(20,18,10,1,line);rect(20,21,8,1,line);rect(27,32,5,9,'#d19a65');rect(29,39,1,2,green);
  for(let y=11;y<38;y+=7){rect(8,y,5,2,ink);rect(9,y,4,1,'#ddbd83');}
 }else if(kind==='cards'||kind==='review'){
  rect(18,6,23,29,ink);rect(20,8,19,25,'#b09cc0');rect(10,11,25,29,ink);rect(12,13,21,25,'#d9bd87');rect(6,17,24,25,ink);rect(8,19,20,21,paper);rect(10,19,2,21,'#e8d9b9');rect(14,24,9,2,green);rect(14,29,11,1,line);rect(14,32,8,1,line);
  if(kind==='review'){rect(29,30,13,12,'#517c60');rect(31,35,3,2,paper);rect(33,37,2,2,paper);rect(35,35,2,2,paper);rect(37,33,2,2,paper);}
 }else if(kind==='quiz'){
  rect(10,7,28,35,ink);rect(12,9,24,31,paper);rect(18,4,12,7,ink);rect(20,4,8,5,'#d2a263');rect(21,14,8,2,'#b67b55');rect(27,16,2,4,'#b67b55');rect(24,19,4,2,'#b67b55');rect(23,21,2,3,'#b67b55');rect(23,26,2,2,'#b67b55');
  rect(16,31,4,4,green);rect(17,32,2,2,paper);rect(23,32,9,1,line);rect(16,37,4,1,line);rect(23,37,7,1,line);
 }else{
  rect(12,7,25,34,'#e2d2ae');rect(14,9,21,30,paper);for(let x=12;x<38;x+=7){rect(x,6,4,1,'#aa9470');rect(x,41,4,1,'#aa9470');}for(let y=10;y<40;y+=7){rect(11,y,1,4,'#aa9470');rect(37,y,1,4,'#aa9470');}rect(22,18,5,14,green);rect(18,22,13,5,green);rect(30,7,6,1,paper);
 }
 // A tiny leaf keeps these objects in the village rather than an office UI.
 rect(38,36,2,7,'#56704b');rect(35,34,4,3,'#88a36b');rect(39,32,4,3,'#9db67c');
 return svg;
}
