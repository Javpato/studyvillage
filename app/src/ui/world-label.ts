import {dialoguePages} from './npc-speech-model';
/** Complete labels shared by world signs and furniture; camera-independent logical coordinates. */
export function drawWorldLabel(ctx:CanvasRenderingContext2D,label:string,x:number,y:number,maxWidth=220){
 ctx.save();ctx.font='700 10px system-ui';const lines=dialoguePages(label,maxWidth-16,1000,s=>ctx.measureText(s).width)[0].split('\n');const width=Math.min(maxWidth,Math.max(40,...lines.map(line=>ctx.measureText(line).width+16))),height=lines.length*13+8,left=Math.max(4,Math.min(764-width,x-width/2)),top=Math.max(4,Math.min(428-height,y));ctx.fillStyle='#fbf4e2f2';ctx.strokeStyle='#61745c';ctx.fillRect(left,top,width,height);ctx.strokeRect(left,top,width,height);ctx.fillStyle='#30493b';ctx.textAlign='center';for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],left+width/2,top+14+i*13);ctx.restore();
}
