import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../packages/core/src/protocol/types';
import { boardAtCapacity, canDeleteStroke, makeStroke, newestOwnStroke, nextSequence, visibleStrokes } from '../../packages/core/src/whiteboard/model';

const stroke = (author: string, boardId = 'room', seq = 1, id = `${author}-${seq}`) =>
  makeStroke(boardId, author, seq, 'pen', '#e88d79', 4, [{ x: -100, y: 500 }, { x: 100, y: 200 }], id);

describe('whiteboard layers', () => {
  it('allows author-only undo and local author visibility', () => {
    const own = stroke('own');
    const other = stroke('other');
    expect(canDeleteStroke(own, 'own', 'room')).toBe(true);
    expect(canDeleteStroke(other, 'own', 'room')).toBe(false);
    expect(newestOwnStroke([own, other], 'own', 'room')).toBe(own);
    expect(visibleStrokes([own, other], 'room', new Set(['other']))).toEqual([own]);
    expect(other.deleted).toBe(false);
  });

  it('caps points, coordinates, width and board operations', () => {
    const points = Array.from({ length: LIMITS.strokePoints + 10 }, () => ({ x: -1, y: 999 }));
    const normalized = makeStroke('room', 'own', 1, 'pen', '#123456', 100, points, 'bounded');
    expect(normalized.points).toHaveLength(LIMITS.strokePoints);
    // The board is infinite: points outside the old 768x432 frame are kept,
    // and only the far ±boardExtent limit still applies.
    expect(normalized.points[0]).toEqual({ x: -1, y: 999 });
    expect(makeStroke('room', 'own', 1, 'pen', '#123456', 2, [{ x: 1e7, y: -1e7 }], 'far').points[0])
      .toEqual({ x: LIMITS.boardExtent, y: -LIMITS.boardExtent });
    expect(normalized.width).toBe(12);
    expect(normalized.color).toBe('#123456');
    expect(boardAtCapacity(Array(5000).fill(normalized), 'room')).toBe(false);
  });

  it('keeps author sequence within its board', () => {
    expect(nextSequence([stroke('own', 'room', 2), stroke('other', 'room', 20), stroke('own', 'elsewhere', 80)], 'own', 'room')).toBe(3);
  });
});

describe('infinite board, eraser and text notes', () => {
  it('preserves Excalifont through protocol and clipboard validation', async () => {
    const { strokeSchema } = await import('../../packages/core/src/protocol/schema');
    const { validateClipboard,moveObjects,scaleObjects } = await import('../../packages/core/src/whiteboard/selection');
    const fp='a'.repeat(64),note={...makeStroke(fp,fp,1,'text','#123456',2,[{x:10,y:10}],'font-note','Árbol, français'),textStyle:{fontSize:32,fontFamily:'excalifont' as const,bold:false,italic:false,align:'left' as const}};
    expect(strokeSchema.parse(note).textStyle).toEqual(note.textStyle);
    const pasted=validateClipboard({kind:'studyvillage-selection',version:1,objects:[note]});
    expect(moveObjects(pasted,20,10)[0].textStyle).toEqual(note.textStyle);
    expect(scaleObjects(pasted,{x:10,y:10,w:200,h:40},2)[0].textStyle).toMatchObject({fontFamily:'excalifont',fontSize:64});
    expect(strokeSchema.safeParse({...note,textStyle:{...note.textStyle,fontFamily:'arbitrary-url'}}).success).toBe(false);
  });
  it('keeps points far outside the old 768x432 frame', async () => {
    const { clampBoardPoint } = await import('../../packages/core/src/whiteboard/model');
    expect(clampBoardPoint({ x: -5000.4, y: 9000.6 })).toEqual({ x: -5000.4, y: 9000.6 });
    expect(clampBoardPoint({ x: 1e9, y: Number.NaN })).toEqual({ x: 20000, y: 0 });
  });

  it('erases pen, line and rectangle strokes only near their ink', async () => {
    const { makeStroke, strokeHit } = await import('../../packages/core/src/whiteboard/model');
    const pen = makeStroke('b', 'a', 1, 'pen', '#000000', 2, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 'p');
    expect(strokeHit(pen, { x: 50, y: 5 }, 8)).toBe(true);
    expect(strokeHit(pen, { x: 50, y: 40 }, 8)).toBe(false);
    const rect = makeStroke('b', 'a', 1, 'rectangle', '#000000', 2, [{ x: 0, y: 0 }, { x: 100, y: 100 }], 'r');
    expect(strokeHit(rect, { x: 100, y: 50 }, 8)).toBe(true);
    // The middle of an unfilled rectangle is empty paper.
    expect(strokeHit(rect, { x: 50, y: 50 }, 8)).toBe(false);
    const note = makeStroke('b', 'a', 1, 'text', '#000000', 2, [{ x: 10, y: 10 }], 't', 'hola');
    expect(strokeHit(note, { x: 20, y: 15 }, 4, { x: 10, y: 10, w: 40, h: 20 })).toBe(true);
    expect(strokeHit({ ...pen, deleted: true }, { x: 50, y: 0 }, 8)).toBe(false);
  });

  it('zooms around the cursor and frames everything that was drawn', async () => {
    const { zoomAt, screenToWorld, fitCamera, DEFAULT_CAMERA } = await import('../../packages/core/src/whiteboard/model');
    const before = screenToWorld(DEFAULT_CAMERA, 300, 200);
    const zoomed = zoomAt(DEFAULT_CAMERA, 300, 200, 2);
    expect(zoomed.zoom).toBe(2);
    const after = screenToWorld(zoomed, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(DEFAULT_CAMERA, 0, 0, 1000).zoom).toBe(4);
    const fit = fitCamera({ x: 1000, y: 1000, w: 200, h: 100 }, 768, 432);
    const centre = screenToWorld(fit, 384, 216);
    expect(centre.x).toBeCloseTo(1100);
    expect(centre.y).toBeCloseTo(1050);
  });

  it('turns mixed notes into TeX and leaves plain notes alone', async () => {
    const { toTex } = await import('../../packages/core/src/whiteboard/math');
    expect(toTex('sin fórmulas')).toBeNull();
    expect(toTex('$x^2$')).toBe('x^2');
    expect(toTex('Área = $\\pi r^2$')).toBe('\\text{Área = }\\pi r^2');
    // Characters TeX treats as commands are escaped inside \text{}.
    expect(toTex('50% de $x$')).toBe('\\text{50\\% de }x');
  });

  it('accepts text notes and far coordinates on the wire, and rejects mixed shapes', async () => {
    const { strokeSchema } = await import('../../packages/core/src/protocol/schema');
    const fp = 'a'.repeat(64);
    const base = { id: 'abc', author: fp, boardId: fp, seq: 1, color: '#123456', width: 2, deleted: false };
    expect(strokeSchema.safeParse({ ...base, tool: 'text', text: '$x$', points: [{ x: -900, y: 4000 }] }).success).toBe(true);
    expect(strokeSchema.safeParse({ ...base, tool: 'pen', text: 'sneaky', points: [{ x: 0, y: 0 }] }).success).toBe(false);
    expect(strokeSchema.safeParse({ ...base, tool: 'text', points: [{ x: 0, y: 0 }] }).success).toBe(false);
    expect(strokeSchema.safeParse({ ...base, tool: 'pen', points: [{ x: 90000, y: 0 }] }).success).toBe(false);
  });
});
