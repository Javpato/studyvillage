import { t } from '../../../../app/src/i18n';
import { errorMessage } from '../../../../app/src/errors/messages';
import type { AppActions, AppChannel, AppMessage } from '../../../core/src/protocol/types';
import { applyRoomCommand, REMOTE_AUTHORITY, type RoomEngine, type RoomContext, type RoomCommand } from '../../../core/src/minigames/room';
export { activityScope, ACTIVITY_SCOPE } from '../../../core/src/minigames/room';
type Wire<Action, View> =
  | { t: 'hello' }
  | { t: 'act'; a: Action }
  | { t: 'cmd'; c: RoomCommand; d?: unknown }
  | { t: 'view'; v: View; lead?: boolean }
  | { t: 'jobs'; jobs: unknown[] }
  | { t: 'error'; m: string };


type Commandable = { botJobs?(now: number): unknown[] };
const TICK_MS = 400;

export class SharedRoom<Action, View, Engine extends RoomEngine<Action, View> = RoomEngine<Action, View>> {
  private engine: Engine | null = null;
  private modeKey = '';
  private watchers = new Set<string>();
  private view: View | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offApp: () => void;
  private listeners = new Set<(view: View | null, error: string | null) => void>();
  /** Server mode: whether the server says I organise this activity. */
  private lead = false;
  private jobWaiters: ((jobs: unknown[]) => void)[] = [];

  constructor(
    private readonly channel: AppChannel,
    private readonly actions: Pick<AppActions, 'sendApp' | 'onApp'> & Partial<Pick<AppActions, 'voiceCommand'>>,
    private readonly context: () => RoomContext,
    private readonly createEngine: () => Engine,
    /** '' is the village-wide activity; a room scope (see activityScope) keeps a separate copy per room. */
    readonly scope: string = '',
  ) {
    this.offApp = actions.onApp((message) => this.receive(message));
  }

  /** Called whenever the session may have changed: going online, offline or a new host. */
  sync(): void {
    const { selfId, hostId } = this.context();
    const key = hostId ? `online:${hostId}:${this.isAuthority()}` : `local:${selfId}`;
    if (key === this.modeKey) return;
    this.modeKey = key;
    this.engine?.cancel?.(Date.now());this.engine = this.isAuthority() ? this.createEngine() : null;
    this.watchers.clear();
    this.view = null; this.lead = false;
    this.ensureTimer();
    if (this.engine) this.publish();
    else this.sendToHost({ t: 'hello' });
  }

  subscribe(listener: (view: View | null, error: string | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.view, null);
    return () => { this.listeners.delete(listener); };
  }

  /** Re-requests the current view, for example when the station is opened again. */
  refresh(): void {
    this.sync();
    if (this.engine) this.publish();
    else this.sendToHost({ t: 'hello' });
  }

  act(action: Action): void {
    this.sync();
    if (this.engine) {
      try {
        this.engine.apply(this.context().selfId, action, Date.now());
        this.publish();
      } catch (error) {
        this.emit(this.view, errorMessage(error));
      }
      return;
    }
    if (!this.sendToHost({ t: 'act', a: action })) this.emit(this.view, 'No se pudo contactar con el anfitrión de la aldea.');
  }

  /** The peer host, or in server mode the first participant still present, organises. */
  canLead(): boolean { return this.isAuthority() || (this.remote() && this.lead); }
  canStop(): boolean { return this.canLead(); }
  stop(): void {
    this.sync();
    if (this.remote()) { if (this.lead) this.sendToHost({ t: 'cmd', c: 'stop' }); return; }
    if (!this.isAuthority() || !this.engine?.cancel) return;
    this.engine.cancel(Date.now());
    this.stopVoice();
    this.publish();
  }
  private stopVoice(): void {
    if (this.channel === 'tetris' || this.channel === 'werewolves' || this.channel === 'gartic' || this.channel === 'study') this.actions.voiceCommand?.({ action: 'game.end', game: this.channel });
  }
  /** Organiser command, applied here when this device is the authority, otherwise sent to it. */
  command(command: RoomCommand, data?: unknown): void {
    this.sync();
    if (this.engine) {
      try { if (applyRoomCommand(this.engine, command, data, Date.now())) { if (command === 'stop') this.stopVoice(); this.publish(); } }
      catch (error) { this.emit(this.view, errorMessage(error)); }
      return;
    }
    if (!this.sendToHost({ t: 'cmd', c: command, d: data })) this.emit(this.view, 'No se pudo contactar con el anfitrión de la aldea.');
  }
  /** Pending bot turns, from the local engine or from the server for its organiser. */
  async botJobs(): Promise<unknown[]> {
    this.sync();
    const local = this.engine as unknown as Commandable | null;
    if (local) return local.botJobs?.(Date.now()) ?? [];
    if (!this.remote() || !this.lead) return [];
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.jobWaiters = this.jobWaiters.filter(w => w !== done); resolve([]); }, 5_000);
      const done = (jobs: unknown[]) => { clearTimeout(timer); resolve(jobs); };
      this.jobWaiters.push(done);
      if (!this.sendToHost({ t: 'cmd', c: 'bots.jobs' as RoomCommand })) done([]);
    });
  }

  current(): View | null { return this.view; }

  /** Lets the authority change its own state (housekeeping), publishing if anything changed. */
  mutate(change: (engine: Engine) => boolean): void {
    this.sync();
    if (this.engine && change(this.engine)) this.publish();
  }

  dispose(): void {
    this.engine?.cancel?.(Date.now());
    this.offApp();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  usesServer():boolean{return this.remote();}
  private remote(): boolean { return this.context().hostId === REMOTE_AUTHORITY; }
  private isAuthority(): boolean {
    const { selfId, hostId, authority } = this.context();
    return hostId === null || (authority ?? hostId === selfId);
  }

  private ensureTimer(): void {
    if (this.engine && !this.timer) {
      this.timer = setInterval(() => {
        if (this.engine?.tick(Date.now())) this.publish();
      }, this.channel==='tetris'?50:TICK_MS);
    } else if (!this.engine && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private lastTetrisPublish=0;
  private publish(): void {
    if(this.channel==='tetris'&&(this.engine?.viewFor('',Date.now()) as {phase:string})?.phase==='playing'&&Date.now()-this.lastTetrisPublish<100)return;
    this.lastTetrisPublish=Date.now();
    const engine = this.engine;
    if (!engine) return;
    const now = Date.now();
    const { selfId, hostId } = this.context();
    this.view = engine.viewFor(selfId, now);
    this.emit(this.view, null);
    if (!hostId) return;
    const recipients = new Set([...engine.audience(), ...this.watchers]);
    // The host's paired devices share its identity and need authoritative updates too.
    if(this.watchers.has(selfId))recipients.add(selfId);
    for (const id of recipients) this.sendTo(id, { t: 'view', v: engine.viewFor(id, now) });
  }

  private receive(message: AppMessage): void {
    if (message.channel !== this.channel) return;
    let wire: Wire<Action, View>;
    try { wire = JSON.parse(message.data) as Wire<Action, View>; } catch { return; }
    if (!wire || typeof wire !== 'object') return;
    if (((wire as { s?: unknown }).s ?? '') !== this.scope) return; // another room's copy of this activity
    this.sync();
    const { hostId } = this.context();
    if (this.engine) {
      // Only the authority accepts requests, and only from real members.
      if (wire.t === 'hello') { this.watchers.add(message.from); this.sendTo(message.from, { t: 'view', v: this.engine.viewFor(message.from, Date.now()) }); return; }
      if (wire.t === 'act') {
        this.watchers.add(message.from);
        try { this.engine.apply(message.from, wire.a, Date.now()); this.publish(); }
        catch (error) { this.sendTo(message.from, { t: 'error', m: errorMessage(error) }); }
      }
      return;
    }
    if (message.from !== hostId) return;
    if (wire.t === 'view') { this.view = wire.v; this.lead = this.remote() && wire.lead === true; this.emit(this.view, null); }
    else if (wire.t === 'jobs') { const waiters = this.jobWaiters.splice(0); for (const done of waiters) done(Array.isArray(wire.jobs) ? wire.jobs : []); }
    else if (wire.t === 'error') this.emit(this.view, t(String(wire.m).slice(0, 200)));
  }

  private sendToHost(wire: Wire<Action, View>): boolean {
    const { hostId } = this.context();
    return !!hostId && this.sendTo(hostId, wire);
  }

  private sendTo(id: string, wire: Wire<Action, View>): boolean {
    return this.actions.sendApp(this.channel, id, JSON.stringify(this.scope ? { ...wire, s: this.scope } : wire));
  }

  private emit(view: View | null, error: string | null): void {
    for (const listener of this.listeners) listener(view, error);
  }
}

