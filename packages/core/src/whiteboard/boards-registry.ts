import type {KeyValueStore} from '../storage';
import { AppError } from '../errors';
import { z } from 'zod';
import { LIMITS, type BoardPoint, type BoardStroke } from '../protocol/types';
import { isValidCustomSpriteDataUrl, sanitizeObjectDisplayName } from '../assets/validation';
import { clampBoardPoint } from './model';

/**
 * Part 4 — Multiplayer Whiteboard System
 *
 * Manages multiple independent, persistent whiteboards across the world
 * (personal house boards, community plaza board, study library boards, and
 * user-created boards). Each board is keyed by a stable `boardId` and never
 * overwrites another board's strokes, metadata, permissions, or undo/redo history.
 */

export type ExtendedBoardShapeKind = 'pen' | 'line' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'fill';

export interface BoardRichElement {
  id: string;
  boardId: string;
  authorId: string;
  authorName: string;
  kind: ExtendedBoardShapeKind;
  color: string;
  width: number;
  points: BoardPoint[];
  text?: string;
  deleted: boolean;
  updatedAt: number;
}

export interface BoardRemoteCursor {
  userId: string;
  displayName: string;
  color: string;
  boardId: string;
  x: number;
  y: number;
  tool: string;
  updatedAt: number;
}

export type BoardAccessLevel = 'public_edit' | 'view_only' | 'selected_editors' | 'owner_only';

export interface WhiteboardMetadata {
  boardId: string;
  displayName: string;
  areaId: string;
  ownerId: string | null;
  customSpriteDataUrl: string | null;
  access: BoardAccessLevel;
  allowedEditors: string[];
  revision: number;
}

export const whiteboardMetadataSchema = z.object({
  boardId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(48),
  areaId: z.string().min(1).max(96),
  ownerId: z.string().max(128).nullable(),
  customSpriteDataUrl: z
    .string()
    .refine((v) => isValidCustomSpriteDataUrl(v), 'Invalid sprite data URL')
    .nullable(),
  access: z.enum(['public_edit', 'view_only', 'selected_editors', 'owner_only']),
  allowedEditors: z.array(z.string().max(128)).max(16),
  revision: z.number().int().nonnegative(),
});

const STORAGE_KEY = 'studyvillage-whiteboards-v1';

/**
 * Generates a unique, deterministic persistent board ID for a physical
 * whiteboard furniture item inside a specific house.
 */
export function houseBoardId(houseScopeId: string, furnitureId: string): string {
  const scope = (houseScopeId || 'own').trim().slice(0, 64);
  const item = (furnitureId || 'board').trim().slice(0, 64);
  return `house:${scope}:board:${item}`;
}

export class WhiteboardRegistry {
  protected metadata = new Map<string, WhiteboardMetadata>();
  protected strokesByBoard = new Map<string, BoardStroke[]>();
  protected elementsByBoard = new Map<string, BoardRichElement[]>();
  private redoStackByBoardAndAuthor = new Map<string, BoardStroke[]>();
  private richRedoByBoard = new Map<string, BoardRichElement[]>();
  private remoteCursors = new Map<string, BoardRemoteCursor>();

  constructor(private readonly storage:KeyValueStore|null=null) {
    this.registerDefaultBoards();
    this.loadFromStorage();
    for (const [boardId, elements] of this.elementsByBoard) {
      const strokes = this.strokesByBoard.get(boardId) ?? [];
      for (const element of elements) if (!strokes.some(s => s.id === element.id)) strokes.push({id:element.id,boardId,author:element.authorId,seq:Math.max(1,Math.floor(element.updatedAt)),tool:element.kind,color:element.color,width:element.width,points:element.points,text:element.text,deleted:element.deleted});
      this.strokesByBoard.set(boardId,strokes);
    }
    this.elementsByBoard.clear();
  }

  private registerDefaultBoards(): void {
    const defaults: WhiteboardMetadata[] = [
      {
        boardId: 'board:community-plaza',
        displayName: 'Pizarra de la Plaza Comunitaria',
        areaId: 'community',
        ownerId: null,
        customSpriteDataUrl: null,
        access: 'public_edit',
        allowedEditors: [],
        revision: 1,
      },
      {
        boardId: 'board:study-library',
        displayName: 'Pizarra de Seminario (Biblioteca)',
        areaId: 'study',
        ownerId: null,
        customSpriteDataUrl: null,
        access: 'public_edit',
        allowedEditors: [],
        revision: 1,
      },
      {
        boardId: 'board:study-calculus',
        displayName: 'Pizarra de Cálculo y Demostraciones',
        areaId: 'study',
        ownerId: null,
        customSpriteDataUrl: null,
        access: 'public_edit',
        allowedEditors: [],
        revision: 1,
      },
    ];
    for (const def of defaults) {
      this.metadata.set(def.boardId, def);
    }
  }

  ensureBoard(boardId: string, fallbackName = 'Pizarra de estudio', areaId = 'house', ownerId: string | null = null): WhiteboardMetadata {
    const existing = this.metadata.get(boardId);
    if (existing) return existing;
    const created: WhiteboardMetadata = {
      boardId,
      displayName: sanitizeObjectDisplayName(fallbackName, 'Pizarra de estudio'),
      areaId,
      ownerId,
      customSpriteDataUrl: null,
      access: 'public_edit',
      allowedEditors: [],
      revision: 1,
    };
    this.metadata.set(boardId, created);
    return created;
  }

  listBoards(): WhiteboardMetadata[] {
    return Array.from(this.metadata.values());
  }

  getMetadata(boardId: string): WhiteboardMetadata {
    return this.ensureBoard(boardId);
  }

  // ---------------------------------------------------------------------------
  // Persistent Standard Strokes per BoardId
  // ---------------------------------------------------------------------------

  getStrokes(boardId: string): BoardStroke[] {
    return this.strokesByBoard.get(boardId) ?? [];
  }

  commitStrokes(boardId: string, changes: BoardStroke[]): void {
    const byId = new Map((this.strokesByBoard.get(boardId) ?? []).map(s => [s.id, structuredClone(s)]));
    for (const stroke of changes) {
      const old = byId.get(stroke.id);
      if (old && old.author !== stroke.author) throw new AppError('invalid', 'Solo puedes modificar tus propios objetos.');
      if (old?.deleted || old && old.seq >= stroke.seq) continue;
      byId.set(stroke.id, { ...structuredClone(stroke), boardId });
    }
    const next = new Map(this.strokesByBoard); next.set(boardId, [...byId.values()]);
    try {
      if (this.storage) this.storage?.setItem(STORAGE_KEY, JSON.stringify({ metadata:[...this.metadata.entries()], strokes:[...next.entries()],elements:[] }));
    } catch { throw new AppError('storage'); }
    this.strokesByBoard = next;
  }
  replaceStrokes(boardId:string,strokes:BoardStroke[]):void {
    const next=new Map(this.strokesByBoard);next.set(boardId,structuredClone(strokes));
    try { if(this.storage)this.storage?.setItem(STORAGE_KEY,JSON.stringify({metadata:[...this.metadata.entries()],strokes:[...next.entries()],elements:[]})); }catch{throw new AppError('storage');}
    this.strokesByBoard=next;
  }
  saveStroke(boardId: string, stroke: BoardStroke): void { this.commitStrokes(boardId, [stroke]); }

  markStrokeDeleted(boardId: string, strokeId: string): boolean {
    const list = this.strokesByBoard.get(boardId);
    if (!list) return false;
    const found = list.find((s) => s.id === strokeId && !s.deleted);
    if (!found) return false;
    found.deleted = true;
    this.saveToStorage();
    return true;
  }

  canView(boardId: string, userId: string, isHost = false): boolean {
    const meta = this.ensureBoard(boardId);
    if (isHost || (meta.ownerId && meta.ownerId === userId)) return true;
    return true;
  }

  canEdit(boardId: string, userId: string, isHost = false): boolean {
    const meta = this.ensureBoard(boardId);
    if (meta.ownerId && meta.ownerId === userId) return true;
    if (meta.ownerId === null && isHost && meta.access === 'owner_only') return true;
    switch (meta.access) {
      case 'public_edit':
        return true;
      case 'view_only':
        return meta.ownerId === userId || (meta.ownerId === null && isHost);
      case 'owner_only':
        return meta.ownerId === userId || (meta.ownerId === null && isHost);
      case 'selected_editors':
        return isHost || meta.allowedEditors.includes(userId);
      default:
        return false;
    }
  }

  canConfigure(boardId: string, userId: string, isHost = false): boolean {
    const meta = this.ensureBoard(boardId);
    if (meta.ownerId && meta.ownerId === userId) return true;
    if (meta.ownerId === null && isHost) return true;
    return false;
  }

  renameBoard(boardId: string, newName: string, actorId: string, isHost = false): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    if (!this.canConfigure(boardId, actorId, isHost)) {
      throw new Error('No tienes permiso para renombrar esta pizarra.');
    }
    const updated: WhiteboardMetadata = {
      ...meta,
      displayName: sanitizeObjectDisplayName(newName, 'Pizarra'),
      revision: meta.revision + 1,
    };
    whiteboardMetadataSchema.parse(updated);
    this.metadata.set(boardId, updated);
    this.saveToStorage();
    return updated;
  }

  setBoardCustomSprite(boardId: string, spriteDataUrl: string | null, actorId: string, isHost = false): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    if (!this.canConfigure(boardId, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar el sprite de esta pizarra.');
    }
    if (spriteDataUrl !== null && !isValidCustomSpriteDataUrl(spriteDataUrl)) {
      throw new Error('El sprite de pizarra debe ser una imagen PNG, JPEG o WebP válida de hasta 512 KB.');
    }
    const updated: WhiteboardMetadata = {
      ...meta,
      customSpriteDataUrl: spriteDataUrl,
      revision: meta.revision + 1,
    };
    whiteboardMetadataSchema.parse(updated);
    this.metadata.set(boardId, updated);

    this.saveToStorage();
    return updated;
  }

  setBoardAccess(
    boardId: string,
    access: BoardAccessLevel,
    allowedEditors: string[],
    actorId: string,
    isHost = false,
  ): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    if (!this.canConfigure(boardId, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar los permisos de esta pizarra.');
    }
    const updated: WhiteboardMetadata = {
      ...meta,
      access,
      allowedEditors: allowedEditors.slice(0, 16),
      revision: meta.revision + 1,
    };
    whiteboardMetadataSchema.parse(updated);
    this.metadata.set(boardId, updated);
    this.saveToStorage();
    return updated;
  }

  setBoardSprite(boardId: string, spriteDataUrl: string | null, actorId: string, isHost = false): WhiteboardMetadata {
    return this.setBoardCustomSprite(boardId, spriteDataUrl, actorId, isHost);
  }

  setAccessLevel(boardId: string, access: BoardAccessLevel, actorId: string, isHost = false): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    return this.setBoardAccess(boardId, access, meta.allowedEditors, actorId, isHost);
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo for standard BoardStrokes per (boardId, authorId)
  // ---------------------------------------------------------------------------

  pushRedoStroke(boardId: string, authorId: string, stroke: BoardStroke): void {
    const key = `${boardId}::${authorId}`;
    const stack = this.redoStackByBoardAndAuthor.get(key) ?? [];
    stack.push({ ...stroke, deleted: false });
    if (stack.length > 50) stack.shift();
    this.redoStackByBoardAndAuthor.set(key, stack);
  }

  popRedoStroke(boardId: string, authorId: string): BoardStroke | null {
    const key = `${boardId}::${authorId}`;
    const stack = this.redoStackByBoardAndAuthor.get(key);
    if (!stack || stack.length === 0) return null;
    return stack.pop() ?? null;
  }

  clearRedoStack(boardId: string, authorId: string): void {
    this.redoStackByBoardAndAuthor.delete(`${boardId}::${authorId}`);
  }

  hasRedoStroke(boardId: string, authorId: string): boolean {
    const stack = this.redoStackByBoardAndAuthor.get(`${boardId}::${authorId}`);
    return Boolean(stack && stack.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Rich Elements (Circle, Arrow, Selectable/Movable/Resizable Shapes)
  // ---------------------------------------------------------------------------

  getRichElements(boardId: string): BoardRichElement[] {
    return (this.elementsByBoard.get(boardId) ?? []).filter((e) => !e.deleted);
  }

  addRichElement(
    boardId: string,
    authorId: string,
    authorName: string,
    kind: ExtendedBoardShapeKind,
    color: string,
    width: number,
    points: BoardPoint[],
    text?: string,
    isHost = false,
  ): BoardRichElement {
    if (!this.canEdit(boardId, authorId, isHost)) {
      throw new Error('Esta pizarra está en modo solo lectura para ti.');
    }
    const list = this.elementsByBoard.get(boardId) ?? [];
    const el: BoardRichElement = {
      id: crypto.randomUUID(),
      boardId,
      authorId,
      authorName: authorName.slice(0, 32),
      kind,
      color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#315f51',
      width: Math.max(1, Math.min(16, Math.round(width))),
      points: points.slice(0, LIMITS.strokePoints).map(clampBoardPoint),
      text: text ? text.slice(0, LIMITS.boardText) : undefined,
      deleted: false,
      updatedAt: Date.now(),
    };
    list.push(el);
    this.elementsByBoard.set(boardId, list);
    this.saveToStorage();
    return el;
  }

  moveRichElement(
    boardId: string,
    elementId: string,
    dx: number,
    dy: number,
    actorId: string,
    isHost = false,
  ): BoardRichElement | null {
    if (!this.canEdit(boardId, actorId, isHost)) return null;
    const list = this.elementsByBoard.get(boardId);
    if (!list) return null;
    const item = list.find((e) => e.id === elementId && !e.deleted);
    if (!item) return null;
    item.points = item.points.map((pt) => clampBoardPoint({ x: pt.x + dx, y: pt.y + dy }));
    item.updatedAt = Date.now();
    this.saveToStorage();
    return item;
  }

  resizeRichElement(
    boardId: string,
    elementId: string,
    newEndPoint: BoardPoint,
    actorId: string,
    isHost = false,
  ): BoardRichElement | null {
    if (!this.canEdit(boardId, actorId, isHost)) return null;
    const list = this.elementsByBoard.get(boardId);
    if (!list) return null;
    const item = list.find((e) => e.id === elementId && !e.deleted);
    if (!item || item.points.length < 1) return null;
    const clamped = clampBoardPoint(newEndPoint);
    if (item.points.length === 1) item.points.push(clamped);
    else item.points[item.points.length - 1] = clamped;
    item.updatedAt = Date.now();
    this.saveToStorage();
    return item;
  }

  deleteRichElement(boardId: string, elementId: string, actorId: string, isHost = false): boolean {
    if (!this.canEdit(boardId, actorId, isHost)) return false;
    const list = this.elementsByBoard.get(boardId);
    if (!list) return false;
    const item = list.find((e) => e.id === elementId && !e.deleted);
    if (!item) return false;
    item.deleted = true;
    const redo = this.richRedoByBoard.get(boardId) ?? [];
    redo.push(item);
    this.richRedoByBoard.set(boardId, redo);
    this.saveToStorage();
    return true;
  }

  hitTestRichElement(boardId: string, point: BoardPoint, radius = 10): BoardRichElement | null {
    const list = this.getRichElements(boardId);
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      if (el.points.length === 0) continue;
      const p0 = el.points[0];
      const p1 = el.points[el.points.length - 1];
      const minX = Math.min(p0.x, p1.x) - radius;
      const maxX = Math.max(p0.x, p1.x) + radius;
      const minY = Math.min(p0.y, p1.y) - radius;
      const maxY = Math.max(p0.y, p1.y) + radius;
      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        return el;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Remote Participant Cursors
  // ---------------------------------------------------------------------------

  updateRemoteCursor(cursor: BoardRemoteCursor): void {
    this.remoteCursors.set(`${cursor.boardId}::${cursor.userId}`, {
      ...cursor,
      updatedAt: Date.now(),
    });
  }

  getActiveCursors(boardId: string, now = Date.now()): BoardRemoteCursor[] {
    const out: BoardRemoteCursor[] = [];
    for (const [key, cursor] of this.remoteCursors.entries()) {
      if (now - cursor.updatedAt > 8_000) {
        this.remoteCursors.delete(key);
        continue;
      }
      if (cursor.boardId === boardId) out.push(cursor);
    }
    return out;
  }

  protected saveToStorage(): void {
    try {
      if (!this.storage) return;
      const payload = {
        metadata: Array.from(this.metadata.entries()),
        strokes: Array.from(this.strokesByBoard.entries()),
        elements: Array.from(this.elementsByBoard.entries()),
      };
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  private loadFromStorage(): void {
    try {
      if (!this.storage) return;
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        metadata?: [string, WhiteboardMetadata][];
        strokes?: [string, BoardStroke[]][];
        elements?: [string, BoardRichElement[]][];
      };
      if (Array.isArray(parsed.metadata)) {
        for (const [id, meta] of parsed.metadata) {
          const valid = whiteboardMetadataSchema.safeParse(meta);
          if (valid.success) {
            this.metadata.set(id, valid.data);

          }
        }
      }
      if (Array.isArray(parsed.strokes)) {
        for (const [id, list] of parsed.strokes) {
          if (Array.isArray(list)) {
            this.strokesByBoard.set(id, list);
          }
        }
      }
      if (Array.isArray(parsed.elements)) {
        for (const [id, list] of parsed.elements) {
          if (Array.isArray(list)) {
            this.elementsByBoard.set(id, list);
          }
        }
      }
    } catch {
      // Keep default state
    }
  }
}
