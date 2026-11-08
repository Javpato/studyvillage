/**
 * A shared activity run by one authority. Online, the village host runs the
 * engine and every member sees only the view the engine projects for them,
 * so secrets (roles, other people's drawings) never leave the host. Offline,
 * the same engine runs locally, usually with bots.
 */
export interface RoomEngine<Action, View> {
  /** Applies one member's action; throws a user-facing Error when not allowed. */
  apply(actorId: string, action: Action, now: number): void;
  cancel?(now: number): void;
  /** Advances timers and bots; returns true when anything visible changed. */
  tick(now: number): boolean;
  viewFor(viewerId: string, now: number): View;
  /** Humans who should receive views even without having asked. */
  audience(): string[];
}

export interface RoomContext {
  authority?:boolean;
  present?:readonly string[];
  selfId: string;
  /** Host fingerprint while joined to a village, otherwise null (offline). */
  hostId: string | null;
}

/** Organiser commands. Peer hosts apply them locally; a server applies the same function remotely. */
export type RoomCommand = 'stop' | 'study.setQuiz' | 'bots.enable' | 'bots.disable' | 'bots.submit';
/** Virtual host fingerprint used by a self-hosted server (see server/contracts). */
export const REMOTE_AUTHORITY = '0'.repeat(64);
/** Scope of an activity copy that belongs to one room of one house; '' is the village-wide one. */
export const ACTIVITY_SCOPE = /^room:[a-f0-9]{64}:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{1,32}$/;
export function activityScope(owner: string, floorId: string, roomId: string): string {
  const scope = `room:${owner}:${floorId}:${roomId}`;
  return ACTIVITY_SCOPE.test(scope) ? scope : '';
}

type Commandable = { cancel?(now: number): void; setQuiz?(quiz: unknown): void; setAiBotsEnabled?(on: boolean): void; submitBot?(key: string, id: string, answer: unknown, now: number): boolean; botJobs?(now: number): unknown[] };
/** Returns true when the visible state changed. Throws a user-facing error for anything not allowed. */
export function applyRoomCommand(engine: unknown, command: string, data: unknown, now: number): boolean {
  const target = engine as Commandable;
  if (command === 'stop' && target.cancel) { target.cancel(now); return true; }
  if (command === 'study.setQuiz' && target.setQuiz) { target.setQuiz(data); return true; }
  if ((command === 'bots.enable' || command === 'bots.disable') && target.setAiBotsEnabled) { target.setAiBotsEnabled(command === 'bots.enable'); return true; }
  if (command === 'bots.submit' && target.submitBot) {
    const job = data as { key?: unknown; id?: unknown; answer?: unknown } | null;
    if (typeof job?.key !== 'string' || typeof job.id !== 'string' || !job.answer || typeof job.answer !== 'object') throw new Error('Respuesta de bot inválida.');
    return target.submitBot(job.key, job.id, job.answer, now);
  }
  throw new Error('Esta actividad no admite esa orden.');
}

/** Uniform integer in [0, max) from the platform CSPRNG. */
export function secureRandomInt(max: number): number {
  if (max <= 1) return 0;
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}

export function shuffle<T>(items: readonly T[], random: (max: number) => number = secureRandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], random: (max: number) => number = secureRandomInt): T | undefined {
  return items.length ? items[random(items.length)] : undefined;
}
