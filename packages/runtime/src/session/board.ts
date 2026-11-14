import { LIMITS } from '../../../core/src/protocol/types';
import type { SignedStroke } from '../../../core/src/protocol/schema';

/** Tombstones are retained; an old add cannot resurrect a deleted stroke. */
export class BoardStore {
  private boards = new Map<string, Map<string, SignedStroke>>();
  private operations = new Map<string, number>();
  apply(document: SignedStroke): 'applied' | 'duplicate' | 'full' | 'forbidden' {
    const stroke = document.stroke;
    let board = this.boards.get(stroke.boardId);
    if (!board) { if (this.boards.size >= 256) return 'full'; board = new Map(); this.boards.set(stroke.boardId, board); }
    const previous = board.get(stroke.id);
    if (previous && previous.stroke.author !== stroke.author) return 'forbidden';
    if (previous && (stroke.seq <= previous.stroke.seq || previous.stroke.deleted)) return 'duplicate';
    const count = this.operations.get(stroke.boardId) ?? 0;
    board.set(stroke.id, structuredClone(document)); this.operations.set(stroke.boardId, count + 1);
    return 'applied';
  }
  applyBatch(documents: SignedStroke[]): 'applied' | 'duplicate' | 'full' | 'forbidden' {
    if (!documents.length) return 'duplicate';
    const boardId = documents[0].stroke.boardId;
    if (documents.some(d => d.stroke.boardId !== boardId) || new Set(documents.map(d => d.stroke.id)).size !== documents.length) return 'forbidden';
    const existing = this.boards.get(boardId);
    let changed = 0;
    for (const document of documents) {
      const previous = existing?.get(document.stroke.id)?.stroke;
      if (previous && previous.author !== document.stroke.author) return 'forbidden';
      if (previous && (previous.deleted || document.stroke.seq <= previous.seq)) continue;
      changed++;
    }
    if (!changed) return 'duplicate';
    if ((!existing && this.boards.size >= 256)) return 'full';
    for (const document of documents) this.apply(document);
    return 'applied';
  }
  documents(boardId: string): SignedStroke[] { return [...(this.boards.get(boardId)?.values() ?? [])].sort((a, b) => a.stroke.id.localeCompare(b.stroke.id)); }
  find(boardId: string, id: string): SignedStroke | undefined { return this.boards.get(boardId)?.get(id); }
  removeBoard(boardId: string): void { this.boards.delete(boardId); this.operations.delete(boardId); }
  retainOwn(author: string): void {
    for (const [boardId, board] of this.boards) {
      for (const [id, document] of board) if (document.stroke.author !== author) board.delete(id);
      if (!board.size) { this.boards.delete(boardId); this.operations.delete(boardId); }
    }
  }
}
