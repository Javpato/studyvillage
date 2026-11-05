import type { BoardPoint, BoardStroke, BoardTextStyle } from '../protocol/types';
import { LIMITS } from '../protocol/types';
import { clampBoardPoint, type BoardRect } from './model';
export const DEFAULT_TEXT_STYLE: BoardTextStyle = {fontSize:22,fontFamily:'sans',bold:false,italic:false,align:'left'};
export type TextMeasure = (stroke: BoardStroke) => BoardRect | null;
/** Pure fallback for headless consumers; the app supplies its exact canvas/math layout. */
export const estimateTextBounds: TextMeasure = stroke => {
 const size=stroke.textStyle?.fontSize??10+stroke.width*3, lines=(stroke.text??'').split('\n');
 return {x:stroke.points[0]?.x??0,y:stroke.points[0]?.y??0,w:stroke.textStyle?.boxWidth??Math.max(8,...lines.map(line=>line.length*size*.55)),h:Math.max(1,lines.length)*Math.round(size*1.3)};
};
export function objectBounds(stroke: BoardStroke, measureText: TextMeasure = estimateTextBounds): BoardRect {
  if (stroke.tool === 'text') return measureText(stroke) ?? estimateTextBounds(stroke)!;
  const xs=stroke.points.map(p=>p.x),ys=stroke.points.map(p=>p.y),pad=stroke.width/2;
  return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:Math.max(...xs)-Math.min(...xs)+pad*2,h:Math.max(...ys)-Math.min(...ys)+pad*2};
}
export function selectionBounds(strokes: BoardStroke[], measureText: TextMeasure = estimateTextBounds): BoardRect | null {
  if(!strokes.length)return null;const boxes=strokes.map(stroke=>objectBounds(stroke,measureText));const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,w:Math.max(8,Math.max(...boxes.map(b=>b.x+b.w))-x),h:Math.max(8,Math.max(...boxes.map(b=>b.y+b.h))-y)};
}
export function contains(rect:BoardRect,p:BoardPoint,pad=0):boolean{return p.x>=rect.x-pad&&p.x<=rect.x+rect.w+pad&&p.y>=rect.y-pad&&p.y<=rect.y+rect.h+pad;}
export function pointInPolygon(p:BoardPoint,polygon:BoardPoint[]):boolean{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function selectedByArea(strokes:BoardStroke[],path:BoardPoint[],lasso:boolean,measureText:TextMeasure=estimateTextBounds):BoardStroke[]{
 if(path.length<2)return[];const a=path[0],b=path[path.length-1];const rect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};
 return strokes.filter(s=>{const box=objectBounds(s,measureText);const corners=[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x,y:box.y+box.h},{x:box.x+box.w,y:box.y+box.h}];return lasso?corners.every(p=>pointInPolygon(p,path)):corners.every(p=>contains(rect,p));});
}
export function moveObjects(strokes:BoardStroke[],dx:number,dy:number):BoardStroke[]{return strokes.map(s=>({...structuredClone(s),points:s.points.map(p=>clampBoardPoint({x:p.x+dx,y:p.y+dy}))}));}
export function scaleObjects(strokes:BoardStroke[],bounds:BoardRect,factor:number):BoardStroke[]{const scale=Math.max(.1,Math.min(10,factor));return strokes.map(s=>({...structuredClone(s),points:s.points.map(p=>clampBoardPoint({x:bounds.x+(p.x-bounds.x)*scale,y:bounds.y+(p.y-bounds.y)*scale})),width:s.tool==='text'?s.width:Math.max(1,Math.min(32,s.width*scale)),...(s.tool==='text'?{textStyle:{...DEFAULT_TEXT_STYLE,...s.textStyle,fontSize:Math.max(8,Math.min(160,(s.textStyle?.fontSize??10+s.width*3)*scale)),...(s.textStyle?.boxWidth?{boxWidth:Math.max(24,Math.min(4000,s.textStyle.boxWidth*scale))}:{})}}:{})}));}
export function clipboardText(strokes:BoardStroke[]):string{return strokes.filter(s=>s.tool==='text').map(s=>s.text||'').join('\n');}
export function validateClipboard(value:unknown):BoardStroke[]{
 const payload=value as {kind?:string;version?:number;objects?:unknown[]};if(payload?.kind!=='studyvillage-selection'||payload.version!==1||!Array.isArray(payload.objects)||payload.objects.length>128)throw new Error('Invalid selection');
 const list=payload.objects as BoardStroke[];for(const s of list){if(!s||typeof s!=='object'||!['pen','line','rectangle','circle','arrow','text'].includes(s.tool)||!Array.isArray(s.points)||!s.points.length||s.points.length>LIMITS.strokePoints||s.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>LIMITS.boardExtent||Math.abs(p.y)>LIMITS.boardExtent)||typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color)||!Number.isFinite(s.width)||s.width<1||s.width>32||(s.tool==='text'&&(typeof s.text!=='string'||!s.text.trim()||s.text.length>LIMITS.boardText)))throw new Error('Invalid object');if(s.textStyle){const t=s.textStyle;if(!Number.isFinite(t.fontSize)||t.fontSize<8||t.fontSize>160||!['sans','serif','mono'].includes(t.fontFamily)||!['left','center','right'].includes(t.align)||typeof t.bold!=='boolean'||typeof t.italic!=='boolean'||t.underline!==undefined&&typeof t.underline!=='boolean'||t.boxWidth!==undefined&&(!Number.isFinite(t.boxWidth)||t.boxWidth<24||t.boxWidth>4000))throw new Error('Invalid style');}}
 return structuredClone(list);
}
