export * from '../../../packages/core/src/whiteboard/boards-registry';
import {WhiteboardRegistry as Registry,type ExtendedBoardShapeKind} from '../../../packages/core/src/whiteboard/boards-registry';
import type {BoardPoint} from '../../../packages/core/src/protocol/types';
import type {KeyValueStore} from '../../../packages/core/src/storage';
import {browserKeyValue} from '../../../packages/runtime/src/storage/key-value';
/** Canvas and decoded image cache are presentation concerns; the registry model stays headless. */
export class WhiteboardRegistry extends Registry {
 private decodedSprites=new Map<string,{url:string,image:HTMLImageElement}>();
 constructor(storage:KeyValueStore|null=browserKeyValue){super(storage);}
 getDecodedBoardSprite(boardId:string):HTMLImageElement|null {
  const url=this.getMetadata(boardId).customSpriteDataUrl;
  if(!url){this.decodedSprites.delete(boardId);return null;}
  let cached=this.decodedSprites.get(boardId);
  if(!cached||cached.url!==url){const image=new Image();image.src=url;cached={url,image};this.decodedSprites.set(boardId,cached);}
  return cached.image.complete&&cached.image.naturalWidth>0?cached.image:null;
 }
  /**
   * Renders rich shapes (circles, arrows, selected bounding boxes) and remote
   * participant cursors on top of the whiteboard canvas.
   */
  drawRichLayer(
    ctx: CanvasRenderingContext2D,
    boardId: string,
    selectedElementId: string | null = null,
    draftRich: { kind: ExtendedBoardShapeKind; points: BoardPoint[]; color: string; width: number } | null = null,
  ): void {
    const elements = this.getRichElements(boardId);
    const drawOne = (el: { kind: ExtendedBoardShapeKind; points: BoardPoint[]; color: string; width: number }, isSelected: boolean) => {
      if (el.points.length === 0) return;
      const p0 = el.points[0];
      const p1 = el.points[el.points.length - 1] ?? p0;
      ctx.save();
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.kind === 'circle') {
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2;
        const rx = Math.max(2, Math.abs(p1.x - p0.x) / 2);
        const ry = Math.max(2, Math.abs(p1.y - p0.y) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.kind === 'arrow') {
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const headLen = Math.max(10, el.width * 3.2);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - headLen * Math.cos(angle - Math.PI / 6), p1.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p1.x - headLen * Math.cos(angle + Math.PI / 6), p1.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }

      if (isSelected) {
        const minX = Math.min(p0.x, p1.x) - 6;
        const minY = Math.min(p0.y, p1.y) - 6;
        const w = Math.abs(p1.x - p0.x) + 12;
        const h = Math.abs(p1.y - p0.y) + 12;
        ctx.strokeStyle = '#cf6f3c';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(minX, minY, w, h);
      }
      ctx.restore();
    };

    for (const el of elements) {
      drawOne(el, el.id === selectedElementId);
    }
    if (draftRich && draftRich.points.length > 0) {
      drawOne(draftRich, false);
    }

    // Remote cursors
    for (const cursor of this.getActiveCursors(boardId)) {
      ctx.save();
      ctx.fillStyle = cursor.color;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 10px Inter, ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(cursor.displayName.slice(0, 14), cursor.x + 8, cursor.y - 4);
      ctx.restore();
    }
  }

}
