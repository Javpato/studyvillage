import { sprite } from '../assets/sprite-catalog';
/**
 * Pixel icons drawn as rects on a 12×12 grid, matching the village art.
 * Mono icons inherit currentColor; role icons carry their own palette so a
 * card reads at a glance even at 20px.
 */
type Rect = readonly [number, number, number, number];
type ColorRect = readonly [number, number, number, number, string];

const NS = 'http://www.w3.org/2000/svg';

function svg(size: number, label?: string): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 12 12');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('shape-rendering', 'crispEdges');
  el.setAttribute('focusable', 'false');
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); }
  else el.setAttribute('aria-hidden', 'true');
  return el;
}

function rect(parent: SVGSVGElement, [x, y, w, h]: Rect, fill?: string): void {
  const r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
  r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
  if (fill) r.setAttribute('fill', fill);
  parent.append(r);
}

export const MONO_ICONS: Record<string, readonly Rect[]> = {
  world: [[2, 3, 2, 1], [1, 4, 4, 1], [1, 5, 1, 6], [4, 5, 1, 6], [2, 8, 2, 3],
    [8, 5, 2, 1], [7, 6, 4, 1], [7, 7, 1, 4], [10, 7, 1, 4], [0, 11, 12, 1]],
  house: [[5, 1, 2, 1], [4, 2, 4, 1], [3, 3, 6, 1], [2, 4, 8, 1],
    [2, 5, 2, 6], [8, 5, 2, 6], [4, 10, 4, 1], [5, 7, 2, 3]],
  contacts: [[7, 1, 3, 3], [6, 5, 5, 3], [2, 3, 3, 3], [1, 7, 5, 4]],
  mic: [[5, 1, 2, 1], [4, 2, 4, 5], [5, 7, 2, 1], [2, 5, 1, 2], [9, 5, 1, 2], [3, 7, 1, 1], [8, 7, 1, 1],
    [4, 8, 4, 1], [5, 9, 2, 1], [3, 10, 6, 1]],
  micOff: [[5, 1, 2, 1], [4, 2, 4, 5], [5, 7, 2, 1], [4, 8, 4, 1], [5, 9, 2, 1], [3, 10, 6, 1],
    [0, 0, 1, 1], [1, 1, 1, 1], [2, 2, 1, 1], [3, 3, 1, 1], [8, 8, 1, 1], [9, 9, 1, 1], [10, 10, 1, 1], [11, 11, 1, 1]],
  headphones: [[3, 2, 6, 1], [2, 3, 1, 1], [9, 3, 1, 1], [1, 4, 1, 4], [10, 4, 1, 4], [1, 7, 3, 4], [8, 7, 3, 4]],
  camera: [[1,3,7,1],[0,4,1,5],[1,9,7,1],[7,4,1,5],[3,5,2,3],[8,5,1,3],[9,4,2,5]],
  screen: [[0, 1, 12, 1], [0, 2, 1, 7], [11, 2, 1, 7], [0, 8, 12, 1], [5, 9, 2, 1], [3, 10, 6, 1], [5, 4, 2, 3], [4, 5, 4, 1]],
  code: [[3, 2, 1, 1], [2, 3, 1, 1], [1, 4, 1, 4], [2, 8, 1, 1], [3, 9, 1, 1],
    [8, 2, 1, 1], [9, 3, 1, 1], [10, 4, 1, 4], [9, 8, 1, 1], [8, 9, 1, 1], [6, 2, 1, 2], [5, 5, 1, 2], [5, 8, 1, 2]],
  notes: [[2, 0, 7, 1], [2, 11, 8, 1], [1, 1, 1, 10], [10, 3, 1, 8], [9, 1, 1, 1], [9, 2, 2, 1],
    [3, 3, 5, 1], [3, 5, 6, 1], [3, 7, 6, 1], [3, 9, 4, 1]],
  cards: [[1, 3, 7, 1], [1, 4, 1, 7], [7, 4, 1, 7], [1, 10, 7, 1], [4, 1, 7, 1], [10, 2, 1, 7], [8, 8, 2, 1], [3, 6, 3, 1]],
  gear: [[5, 0, 2, 2], [5, 10, 2, 2], [0, 5, 2, 2], [10, 5, 2, 2], [2, 2, 2, 1], [8, 2, 2, 1], [2, 9, 2, 1], [8, 9, 2, 1],
    [3, 3, 6, 1], [3, 8, 6, 1], [2, 4, 1, 4], [9, 4, 1, 4], [3, 4, 2, 1], [7, 4, 2, 1], [3, 7, 2, 1], [7, 7, 2, 1], [3, 5, 1, 2], [8, 5, 1, 2]],
  door: [[2, 0, 8, 1], [2, 1, 1, 11], [9, 1, 1, 11], [3, 1, 6, 1], [7, 6, 1, 1], [0, 11, 12, 1]],
  brush: [[9, 0, 2, 1], [8, 1, 3, 1], [7, 2, 3, 1], [6, 3, 3, 1], [5, 4, 3, 1], [4, 5, 2, 1], [2, 6, 3, 2], [1, 8, 3, 2], [0, 10, 2, 2]],
  board: [[1, 1, 10, 1], [1, 7, 10, 1], [1, 2, 1, 5], [10, 2, 1, 5], [3, 3, 5, 1], [3, 5, 3, 1], [5, 8, 2, 2], [3, 10, 6, 1]],
  chat: [[1, 1, 10, 1], [0, 2, 1, 6], [11, 2, 1, 6], [1, 8, 5, 1], [7, 8, 4, 1], [3, 9, 2, 1], [2, 10, 2, 1], [3, 4, 6, 1]],
  phone: [[3, 0, 6, 1], [2, 1, 1, 10], [9, 1, 1, 10], [3, 11, 6, 1], [3, 2, 6, 7], [5, 10, 2, 1]],
  close: [[1, 1, 2, 2], [3, 3, 2, 2], [5, 5, 2, 2], [7, 7, 2, 2], [9, 9, 2, 2], [9, 1, 2, 2], [7, 3, 2, 2], [3, 7, 2, 2], [1, 9, 2, 2]],
  back: [[3, 5, 8, 2], [4, 3, 2, 2], [2, 4, 2, 4], [4, 7, 2, 2], [6, 2, 1, 1], [6, 9, 1, 1]],
  link: [[1, 4, 4, 1], [0, 5, 1, 2], [1, 7, 4, 1], [7, 4, 4, 1], [11, 5, 1, 2], [7, 7, 4, 1], [4, 5, 4, 2]],
  plus: [[5, 1, 2, 10], [1, 5, 10, 2]],
  check: [[1, 6, 2, 2], [3, 8, 2, 2], [5, 6, 2, 2], [7, 4, 2, 2], [9, 2, 2, 2]],
  trash: [[4, 0, 4, 1], [1, 1, 10, 1], [2, 3, 8, 1], [2, 4, 1, 7], [9, 4, 1, 7], [3, 11, 6, 1], [4, 5, 1, 5], [7, 5, 1, 5]],
  search: [[3, 0, 4, 1], [1, 1, 2, 1], [7, 1, 2, 1], [0, 2, 1, 5], [9, 2, 1, 5], [1, 7, 2, 1], [7, 7, 2, 1], [3, 8, 4, 1], [8, 8, 1, 1], [9, 9, 1, 1], [10, 10, 1, 1], [11, 11, 1, 1]],
};

export function monoIcon(name: keyof typeof MONO_ICONS | string, size = 16, label?: string): SVGSVGElement {
  const el = svg(size, label);
  el.setAttribute('fill', 'currentColor');
  const asset=sprite('icon-'+name);if(asset){const mask=document.createElementNS(NS,'mask'),image=document.createElementNS(NS,'image');const id='icon-mask-'+crypto.randomUUID();mask.id=id;mask.setAttribute('style','mask-type:alpha');image.setAttribute('href',asset.src);image.setAttribute('width','12');image.setAttribute('height','12');mask.append(image);el.append(mask);const fill=document.createElementNS(NS,'rect');fill.setAttribute('width','12');fill.setAttribute('height','12');fill.setAttribute('mask',`url(#${id})`);el.append(fill);return el;}
  for (const r of MONO_ICONS[name] ?? MONO_ICONS.house) rect(el, r);
  return el;
}

const ROLE_ART: Record<string, readonly ColorRect[]> = {
  cupid: [[2,2,3,3,'#c36a65'],[7,2,3,3,'#c36a65'],[2,5,8,2,'#c36a65'],[3,7,6,1,'#c36a65'],[4,8,4,1,'#c36a65'],[5,9,2,1,'#c36a65']],
  hunter: [[1,8,3,2,'#765338'],[3,7,2,2,'#765338'],[4,5,2,3,'#765338'],[5,4,6,2,'#5e655d'],[9,2,2,2,'#5e655d']],
  girl: [[3,1,6,3,'#a4683d'],[2,3,8,4,'#a4683d'],[4,3,4,4,'#e6b68a'],[4,7,4,4,'#729a78'],[4,4,1,1,'#33291e'],[7,4,1,1,'#33291e']],
  werewolf: [
    [2, 1, 2, 2, '#495057'], [8, 1, 2, 2, '#495057'], [2, 3, 8, 5, '#6c757d'], [1, 4, 1, 3, '#495057'], [10, 4, 1, 3, '#495057'],
    [3, 5, 2, 1, '#ffd43b'], [7, 5, 2, 1, '#ffd43b'], [4, 8, 4, 2, '#adb5bd'], [5, 8, 2, 1, '#212529'], [4, 10, 1, 1, '#f8f9fa'], [7, 10, 1, 1, '#f8f9fa'],
  ],
  seer: [
    [4, 1, 4, 1, '#7048e8'], [2, 2, 8, 1, '#7048e8'], [1, 3, 10, 4, '#845ef7'], [2, 7, 8, 1, '#7048e8'], [3, 3, 2, 2, '#d0bfff'], [6, 5, 3, 1, '#b197fc'],
    [3, 8, 6, 1, '#5f3dc4'], [2, 9, 8, 2, '#a0522d'], [3, 9, 6, 1, '#c0703f'],
  ],
  guard: [
    [2, 1, 8, 1, '#1864ab'], [1, 2, 10, 5, '#1c7ed6'], [2, 7, 8, 2, '#1c7ed6'], [3, 9, 6, 1, '#1864ab'], [5, 10, 2, 1, '#1864ab'],
    [5, 3, 2, 6, '#e7f5ff'], [3, 4, 6, 2, '#e7f5ff'],
  ],
  witch: [
    [5, 0, 2, 2, '#a0522d'], [5, 2, 2, 2, '#dee2e6'], [3, 4, 6, 1, '#dee2e6'], [2, 5, 8, 5, '#dee2e6'], [3, 10, 6, 1, '#ced4da'],
    [3, 6, 6, 4, '#37b24d'], [4, 7, 1, 1, '#b2f2bb'], [7, 8, 1, 1, '#b2f2bb'],
  ],
  villager: [
    [5, 1, 2, 1, '#e8590c'], [4, 2, 4, 1, '#e8590c'], [3, 3, 6, 1, '#fd7e14'], [2, 4, 8, 1, '#e8590c'],
    [3, 5, 6, 6, '#f4d6a0'], [5, 7, 2, 4, '#8d5a3b'], [3, 6, 1, 1, '#74c0fc'], [8, 6, 1, 1, '#74c0fc'],
  ],
  unknown: [[2, 1, 8, 10, '#495057'], [3, 2, 6, 8, '#868e96'], [5, 3, 2, 1, '#f8f9fa'], [7, 4, 1, 1, '#f8f9fa'], [6, 5, 1, 1, '#f8f9fa'], [5, 6, 1, 1, '#f8f9fa'], [5, 8, 1, 1, '#f8f9fa']],
  dead: [
    [3, 1, 6, 1, '#dee2e6'], [2, 2, 8, 5, '#f1f3f5'], [3, 7, 6, 2, '#dee2e6'], [3, 3, 2, 2, '#343a40'], [7, 3, 2, 2, '#343a40'],
    [5, 5, 2, 1, '#868e96'], [4, 9, 1, 2, '#dee2e6'], [6, 9, 1, 2, '#dee2e6'], [8, 9, 1, 1, '#dee2e6'],
  ],
  moon: [[4, 1, 4, 1, '#ffe066'], [2, 2, 3, 1, '#ffe066'], [1, 3, 3, 6, '#ffe066'], [2, 9, 3, 1, '#ffe066'], [4, 10, 5, 1, '#ffe066'], [8, 9, 2, 1, '#ffe066'], [4, 3, 1, 6, '#fcc419']],
  sun: [[4, 3, 4, 6, '#fcc419'], [3, 4, 6, 4, '#fcc419'], [5, 0, 2, 2, '#ffa94d'], [5, 10, 2, 2, '#ffa94d'], [0, 5, 2, 2, '#ffa94d'], [10, 5, 2, 2, '#ffa94d'],
    [1, 1, 2, 2, '#ffa94d'], [9, 1, 2, 2, '#ffa94d'], [1, 9, 2, 2, '#ffa94d'], [9, 9, 2, 2, '#ffa94d'], [5, 4, 2, 1, '#fff3bf']],
  vote: [[2, 5, 8, 6, '#c0703f'], [1, 4, 10, 1, '#8d5a3b'], [4, 1, 4, 5, '#f8f9fa'], [5, 2, 2, 1, '#e03131'], [4, 7, 4, 1, '#5c3a21']],
  trophy: [[2, 1, 8, 1, '#fab005'], [3, 2, 6, 4, '#fcc419'], [1, 2, 1, 2, '#fab005'], [10, 2, 1, 2, '#fab005'], [4, 6, 4, 1, '#fab005'], [5, 7, 2, 2, '#f08c00'], [3, 9, 6, 2, '#8d5a3b'], [4, 3, 1, 2, '#fff3bf']],
  info: [[5, 1, 2, 2, '#4dabf7'], [5, 4, 2, 6, '#4dabf7'], [4, 10, 4, 1, '#4dabf7']],
};
export type RoleIconName = keyof typeof ROLE_ART;

export function colorIcon(name: string, size = 20, label?: string): SVGSVGElement {
  const custom=sprite('role-'+name);if(custom){const root=svg(size,label);const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttribute('href',custom.src);image.setAttribute('width','12');image.setAttribute('height','12');image.style.imageRendering='pixelated';root.append(image);return root;}
  const el = svg(size, label);
  for (const [x, y, w, h, fill] of ROLE_ART[name] ?? ROLE_ART.unknown) rect(el, [x, y, w, h], fill);
  return el;
}
