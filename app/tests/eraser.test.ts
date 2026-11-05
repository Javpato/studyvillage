import { describe, expect, it } from 'vitest';
import { cutStroke, EraserGesture } from '../../packages/core/src/whiteboard/eraser';
import { makeStroke } from '../../packages/core/src/whiteboard/model';
const point = (x: number, y = 0) => ({ x, y });
const line = () => makeStroke('board', 'me', 1, 'pen', '#123456', 2, [point(0), point(100)], 'line');
describe('precision eraser geometry and gesture', () => {
  it('cuts a sparse line without deleting untouched ink', () => {
    const fragments = cutStroke(line(), point(50), point(50), 4)!;
    expect(fragments).toHaveLength(2);
    expect(fragments[0]).toEqual([point(0), point(45)]);
    expect(fragments[1][0].x).toBeCloseTo(55);
    expect(fragments[1][1]).toEqual(point(100));
  });
  it('sweeps the whole path even with no intermediate pointer events', () => {
    const stroke = { ...line(), points: [point(50, -100), point(50, 100)] };
    const fragments = cutStroke(stroke, point(-100), point(100), 4)!;
    expect(fragments).toHaveLength(2);
    expect(fragments[0].at(-1)!.y).toBeCloseTo(-5);
    expect(fragments[1][0].y).toBeCloseTo(5);
  });
  it('keeps distant strokes, text, and empty interiors untouched', () => {
    expect(cutStroke(line(), point(50, 20), point(50, 20), 4)).toBeNull();
    expect(cutStroke({ ...line(), tool: 'text', text: 'math' }, point(50), point(50), 20)).toBeNull();
    expect(cutStroke({ ...line(), tool: 'rectangle', points: [point(0, 0), point(100, 100)] }, point(50, 50), point(50, 50), 4)).toBeNull();
  });
  it('cuts circles and arrowheads using the visible outline', () => {
    const circle = { ...line(), tool: 'circle' as const, points: [point(0, 0), point(100, 100)] };
    expect(cutStroke(circle, point(100, 50), point(100, 50), 4)?.length).toBeGreaterThan(0);
    expect(cutStroke(circle, point(50, 50), point(50, 50), 4)).toBeNull();
    const arrow = { ...line(), tool: 'arrow' as const };
    expect(cutStroke(arrow, point(91, 5), point(91, 5), 1)).not.toBeNull();
  });
  it('preserves author/style and exposes one final operation without intermediate fragments', () => {
    const source = line();
    const gesture = new EraserGesture([source], () => true, 'precision', 4, () => null);
    gesture.erase(point(30)); gesture.erase(point(70));
    const changes = gesture.changes();
    expect(changes).toHaveLength(2);
    expect(changes.every(s => s.author === source.author && s.color === source.color && s.width === source.width)).toBe(true);
    expect(gesture.preview([source])).toHaveLength(2);
    expect(source.points).toEqual([point(0), point(100)]);
    expect(source.deleted).toBe(false);
  });
  it('respects editing permissions, whole-stroke mode and eraser sizes', () => {
    const source = line(), forbidden = new EraserGesture([source], () => false, 'precision', 4, () => null);
    forbidden.erase(point(50)); expect(forbidden.changes()).toEqual([]);
    const normal = new EraserGesture([source], () => true, 'stroke', 4, () => null);
    normal.erase(point(50)); expect(normal.changes()).toEqual([{ ...source, deleted: true }]);
    const small = cutStroke(source, point(50), point(50), 4)!, large = cutStroke(source, point(50), point(50), 16)!;
    expect(large[0].at(-1)!.x).toBeLessThan(small[0].at(-1)!.x);
  });
  it('removes dots and fully covered strokes', () => {
    const dot = { ...line(), points: [point(50)] };
    expect(cutStroke(dot, point(50), point(50), 4)).toEqual([]);
    expect(cutStroke(line(), point(-10), point(110), 4)).toEqual([]);
  });
});
