import { describe, expect, it } from 'vitest';
import { WerewolvesGame, roleDeck, type WerewolfRole, type WerewolvesAction, type WerewolvesView } from '../../packages/core/src/minigames/werewolves';
import { GarticGame, cleanDrawing, MAX_DRAWING_POINTS } from '../../packages/core/src/minigames/gartic-phone';
import {SharedRoom} from '../../packages/runtime/src/session/shared-room';
import {shuffle} from '../../packages/core/src/minigames/room';
import { GroupProjectsBoard, parseLiveShareUrl, parseRepoUrl, vscodeCloneLink, vscodeWebLink } from '../../packages/core/src/projects/group-projects';
import { parseBlocks, serializeBlocks } from '../src/ui/notes-ui';
import { circleHitsRect, findPath, stepPosition } from '../src/world/model';
import type { AppChannel, AppMessage } from '../../packages/core/src/protocol/types';

/** Deterministic randomness for replaying a game. */
function seeded(seed: number): (max: number) => number {
  let x = seed >>> 0 || 1;
  return (max) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return max <= 1 ? 0 : x % max; };
}

function table(players: string[], random = seeded(7)) {
  const game = new WerewolvesGame(random);
  for (const id of players) game.apply(id, { kind: 'join', name: id, color: '#123456' }, 0);
  return game;
}

const roleOf = (game: WerewolvesGame, id: string) => game.players.find((p) => p.id === id)!.role!;

describe('Werewolves', () => {
  it('deals a balanced deck for every table size and refuses broken ones', () => {
    expect(roleDeck(4).sort()).toEqual(['guard', 'seer', 'villager', 'werewolf']);
    expect(roleDeck(6).filter((r) => r === 'werewolf')).toHaveLength(2);
    expect(roleDeck(8)).toHaveLength(8);
    expect(() => roleDeck(3)).toThrow();
    expect(roleDeck(24)).toHaveLength(24);
    expect(() => roleDeck(25)).toThrow();
  });

  it('shuffles roles differently between games', () => {
    const deals = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const game = table(['a', 'b', 'c', 'd', 'e'], seeded(seed));
      game.apply('a', { kind: 'start' }, 0);
      deals.add(game.players.map((p) => p.role).join());
    }
    // The old engine always dealt the same way; a real shuffle gives many deals.
    expect(deals.size).toBeGreaterThan(10);
    expect(shuffle([1, 2, 3, 4], seeded(3))).toHaveLength(4);
  });

  it('never shows someone a card they have not earned', () => {
    const game = table(['a', 'b', 'c', 'd', 'e', 'f']);
    game.apply('a', { kind: 'start' }, 0);
    for (const viewer of game.players) {
      const view = game.viewFor(viewer.id, 0);
      for (const p of view.players) {
        if (p.id === viewer.id) expect(p.role).toBe(viewer.role);
        else if (viewer.role === 'werewolf' && roleOf(game, p.id) === 'werewolf') expect(p.role).toBe('werewolf');
        else expect(p.role).toBeNull();
      }
    }
  });

  it('calls the night role by role and resolves kills, protection and potions', () => {
    const game = table(['a', 'b', 'c', 'd', 'e']);
    game.apply('a', { kind: 'start' }, 0);
    for (const p of game.players) game.apply(p.id, { kind: 'ready' }, 0);
    expect(game.phase).toBe('night');
    expect(game.step).toBe('wolves');
    const find = (role: WerewolfRole) => game.players.find((p) => p.role === role)!.id;
    const wolf = find('werewolf'); const seer = find('seer'); const guard = find('guard'); const witch = find('witch'); const villager = find('villager');

    // Out of turn is refused: the seer cannot act while the wolves are awake.
    expect(() => game.apply(seer, { kind: 'seer_look', target: wolf }, 1)).toThrow();
    // Wolves cannot eat each other.
    expect(() => game.apply(wolf, { kind: 'wolf_vote', target: wolf }, 1)).toThrow();
    game.apply(wolf, { kind: 'wolf_vote', target: villager }, 1);
    expect(game.step).toBe('seer');
    game.apply(seer, { kind: 'seer_look', target: wolf }, 2);
    expect(game.viewFor(seer, 2).players.find((p) => p.id === wolf)!.role).toBe('werewolf');
    expect(game.step).toBe('guard');
    game.apply(guard, { kind: 'guard', target: villager }, 3);
    expect(game.step).toBe('witch');
    expect(game.viewFor(witch, 3).turn?.victim).toBe(villager);
    game.apply(witch, { kind: 'witch', heal: false, poison: null }, 4);
    // Guarded: nobody dies.
    expect(game.phase).toBe('dawn');
    expect(game.viewFor('a', 4).nightDeaths).toEqual([]);

    game.apply('a', { kind: 'continue' }, 5);
    expect(game.phase).toBe('day');
    for (const p of game.players) if (p.id !== wolf) game.apply(p.id, { kind: 'vote', target: wolf }, 6);
    game.apply(wolf, { kind: 'vote', target: seer }, 6);
    expect(game.phase).toBe('end');
    expect(game.viewFor('a', 6).winner).toBe('aldea');
    // At the end every card is shown.
    expect(game.viewFor(villager, 6).players.every((p) => p.role !== null)).toBe(true);
  });

  it('does not let the guard protect the same person twice in a row', () => {
    const game = table(['a', 'b', 'c', 'd']);
    game.apply('a', { kind: 'start' }, 0);
    for (const p of game.players) game.apply(p.id, { kind: 'ready' }, 0);
    const find = (role: WerewolfRole) => game.players.find((p) => p.role === role)!.id;
    const wolf = find('werewolf'); const seer = find('seer'); const guard = find('guard'); const villager = find('villager');
    game.apply(wolf, { kind: 'wolf_vote', target: seer }, 1);
    game.apply(seer, { kind: 'seer_look', target: wolf }, 1);
    game.apply(guard, { kind: 'guard', target: seer }, 1);
    expect(game.phase).toBe('dawn');
    game.apply('a', { kind: 'continue' }, 2);
    for (const p of game.players) game.apply(p.id, { kind: 'vote', target: 'skip' }, 3);
    game.apply('a', { kind: 'continue' }, 4);
    expect(game.step).toBe('wolves');
    game.apply(wolf, { kind: 'wolf_vote', target: villager }, 5);
    game.apply(seer, { kind: 'seer_look', target: villager }, 5);
    expect(() => game.apply(guard, { kind: 'guard', target: seer }, 5)).toThrow();
  });

  it('plays a whole game with bots to the end, with no human input after dealing', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const game = table(['me'], seeded(seed));
      for (let i = 0; i < 5; i++) game.apply('me', { kind: 'add_bot' }, 0);
      game.apply('me', { kind: 'start' }, 0);
      let now = 0;
      while (game.phase !== 'end' && now < 3_600_000) { now += 1_000; game.tick(now); }
      expect(game.phase).toBe('end');
    }
  });
});

describe('Gartic Phone', () => {
  function room(n: number, random = seeded(11)) {
    const game = new GarticGame(random);
    for (let i = 0; i < n; i++) game.apply(`p${i}`, { kind: 'join', name: `P${i}`, color: '#334455' }, 0);
    return game;
  }

  it('passes every book around so nobody gets their own book until the album', () => {
    const game = room(4);
    game.apply('p0', { kind: 'start' }, 0);
    expect(game.phase).toBe('write');
    for (let i = 0; i < 4; i++) game.apply(`p${i}`, { kind: 'submit', text: `frase de ${i}` }, 1);
    expect(game.phase).toBe('draw');
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const view = game.viewFor(`p${i}`, 1);
      expect(view.task?.kind).toBe('draw');
      expect(view.task?.previous?.text).not.toBe(`frase de ${i}`);
      seen.add(view.task!.previous!.text!);
    }
    expect(seen.size).toBe(4);
  });

  it('starts with two people and still plays write, draw, guess, draw', () => {
    const solo = room(1);
    expect(() => solo.apply('p0', { kind: 'start' }, 0)).toThrow(/2/);
    const game = room(2);
    game.apply('p0', { kind: 'start' }, 0);
    const drawing = { strokes: [{ c: '#ff0000', w: 6, p: [10, 10, 100, 100] }] };
    const kinds: string[] = [];
    for (let round = 0; round < 4; round++) {
      kinds.push(game.viewFor('p0', 0).task!.kind);
      for (let i = 0; i < 2; i++) { const task = game.viewFor(`p${i}`, 0).task!; game.apply(`p${i}`, task.kind === 'draw' ? { kind: 'submit', drawing } : { kind: 'submit', text: `r${round}` }, 0); }
    }
    expect(kinds).toEqual(['write', 'draw', 'guess', 'draw']);
    expect(game.phase).toBe('album');
  });

  it('runs write, draw, guess, draw and opens the album page by page', () => {
    const game = room(3);
    game.apply('p0', { kind: 'start' }, 0);
    const drawing = { strokes: [{ c: '#ff0000', w: 6, p: [10, 10, 100, 100] }] };
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 3; i++) {
        const task = game.viewFor(`p${i}`, 0).task!;
        game.apply(`p${i}`, task.kind === 'draw' ? { kind: 'submit', drawing } : { kind: 'submit', text: `r${round}` }, 0);
      }
    }
    expect(game.phase).toBe('album');
    const first = game.viewFor('p1', 0).album!;
    expect(first.pages).toHaveLength(1);
    game.apply('p0', { kind: 'album_next' }, 0);
    const second = game.viewFor('p1', 0).album!;
    expect(second.pages).toHaveLength(2);
    // Drawings travel once: only the newest page carries one.
    expect(second.pages[1].drawing?.strokes[0].c).toBe('#ff0000');
    expect(() => game.apply('p1', { kind: 'album_next' }, 0)).toThrow();
  });

  it('keeps going on timeout when a verified bot does not answer', () => {
    const game = room(1);
    game.setAiBotsEnabled(true);
    game.apply('p0', { kind: 'add_bot' }, 0);
    game.apply('p0', { kind: 'add_bot' }, 0);
    game.apply('p0', { kind: 'start' }, 0);
    let now = 0;
    while (game.phase !== 'album' && now < 2_000_000) { now += 1_000; game.tick(now); }
    expect(game.phase).toBe('album');
  });

  it('bounds drawings and rejects malformed strokes', () => {
    const huge = { strokes: [{ c: 'red', w: 999, p: Array.from({ length: MAX_DRAWING_POINTS * 4 }, (_, i) => i) }] };
    const clean = cleanDrawing(huge);
    expect(clean.strokes[0].c).toBe('#000000');
    expect(clean.strokes[0].w).toBeLessThanOrEqual(48);
    expect(clean.strokes[0].p.length / 2).toBeLessThanOrEqual(MAX_DRAWING_POINTS);
  });
});

describe('Shared rooms over the village relay', () => {
  it('runs the engine on the host and gives each member only their own view', () => {
    // A tiny in-memory relay standing in for the host-routed app channel.
    const listeners = new Map<string, Set<(m: AppMessage) => void>>();
    const actionsFor = (self: string) => ({
      sendApp: (channel: AppChannel, to: string | null, data: string) => {
        if (!to) return false;
        for (const listener of listeners.get(to) ?? []) listener({ channel, from: self, data });
        return true;
      },
      onApp: (listener: (m: AppMessage) => void) => {
        const set = listeners.get(self) ?? new Set();
        set.add(listener); listeners.set(self, set);
        return () => { set.delete(listener); };
      },
    });
    const host = new SharedRoom<WerewolvesAction, WerewolvesView>('werewolves', actionsFor('host'), () => ({ selfId: 'host', hostId: 'host' }), () => new WerewolvesGame(seeded(5)));
    const guest = new SharedRoom<WerewolvesAction, WerewolvesView>('werewolves', actionsFor('guest'), () => ({ selfId: 'guest', hostId: 'host' }), () => new WerewolvesGame(seeded(5)));
    host.sync(); guest.sync();
    host.act({ kind: 'join', name: 'Host', color: '#111111' });
    guest.act({ kind: 'join', name: 'Guest', color: '#222222' });
    host.act({ kind: 'add_bot' });
    host.act({ kind: 'add_bot' });
    host.act({ kind: 'start' });
    const hostView = host.current()!;
    const guestView = guest.current()!;
    expect(guestView.phase).toBe('reveal');
    expect(guestView.me.role).not.toBeNull();
    expect(guestView.players.find((p) => p.id === 'host')!.role === null || guestView.me.role === 'werewolf').toBe(true);
    expect(hostView.me.id).toBe('host');
    host.dispose(); guest.dispose();
  });
});

describe('Group projects for VS Code', () => {
  it('accepts only real Live Share and https repository links', () => {
    expect(parseLiveShareUrl('https://prod.liveshare.vsengsaas.visualstudio.com/join?ABC123')).toContain('liveshare');
    expect(parseLiveShareUrl('https://vscode.dev/liveshare/ABC123')).toContain('vscode.dev/liveshare');
    expect(parseLiveShareUrl('https://evil.example/join?x')).toBeNull();
    expect(parseLiveShareUrl('javascript:alert(1)')).toBeNull();
    expect(parseRepoUrl('https://github.com/ana/proyecto')).toBe('https://github.com/ana/proyecto');
    expect(parseRepoUrl('git@github.com:ana/proyecto.git')).toBe('https://github.com/ana/proyecto');
    expect(parseRepoUrl('http://github.com/ana/proyecto')).toBeNull();
    expect(parseRepoUrl('https://user:pass@github.com/ana/p')).toBeNull();
    expect(vscodeCloneLink('https://github.com/ana/p')).toBe(`vscode://vscode.git/clone?url=${encodeURIComponent('https://github.com/ana/p.git')}`);
    expect(vscodeWebLink('https://github.com/ana/p.git')).toBe('https://vscode.dev/github/ana/p');
    expect(vscodeWebLink('https://gitlab.com/ana/p')).toBeNull();
  });

  it('tracks live sessions, who is working and tasks; only the creator deletes', () => {
    const board = new GroupProjectsBoard(false);
    const me = { name: 'Ana', color: '#aa3344' };
    board.apply('ana', { kind: 'create', name: 'Final', description: '', repoUrl: 'https://github.com/ana/final', me }, 1);
    const id = board.projects[0].id;
    expect(() => board.apply('ana', { kind: 'live_share', id, url: 'https://phish.example', me }, 2)).toThrow();
    board.apply('ana', { kind: 'live_share', id, url: 'https://prod.liveshare.vsengsaas.visualstudio.com/join?X', me }, 2);
    board.apply('leo', { kind: 'working', id, on: true, me: { name: 'Leo', color: '#112233' } }, 3);
    board.apply('leo', { kind: 'add_task', id, text: 'Pantalla de inicio' }, 4);
    board.apply('leo', { kind: 'toggle_task', id, taskId: board.projects[0].tasks[0].id, me: { name: 'Leo', color: '#112233' } }, 5);
    const project = board.viewFor().projects[0];
    expect(project.liveShareBy).toBe('Ana');
    expect(Object.keys(project.working).sort()).toEqual(['ana', 'leo']);
    expect(project.tasks[0]).toMatchObject({ done: true, by: 'Leo' });
    expect(board.prune(new Set(['ana']))).toBe(true);
    expect(Object.keys(board.projects[0].working)).toEqual(['ana']);
    expect(() => board.apply('leo', { kind: 'delete', id }, 6)).toThrow();
    board.apply('ana', { kind: 'delete', id }, 7);
    expect(board.projects).toHaveLength(0);
  });
});

describe('Notes blocks', () => {
  it('round-trips headings, lists, to-dos, quotes, code, formulas and dividers', () => {
    const md = ['# Título', 'Texto con $x^2$', '- uno', '1. primero', '2. segundo', '- [x] hecho', '- [ ] pendiente', '> cita', '```', 'const a = 1;', '```', '$$a^2+b^2=c^2$$', '---'].join('\n');
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'p', 'bullet', 'number', 'number', 'todo', 'todo', 'quote', 'code', 'math', 'divider']);
    expect(blocks[5].done).toBe(true);
    expect(serializeBlocks(blocks)).toBe(md);
    expect(parseBlocks('')).toEqual([{ type: 'p', text: '' }]);
  });
});

describe('Movement', () => {
  it('finds a way around a wall instead of walking into it', () => {
    const wall = { x: 300, y: 0, w: 40, h: 380 };
    const path = findPath({ x: 100, y: 100 }, { x: 600, y: 100 }, [wall])!;
    expect(path.length).toBeGreaterThan(1);
    expect(path.some((p) => p.y > 380)).toBe(true);
    for (const p of path) expect(circleHitsRect(p.x, p.y, 9, wall)).toBe(false);
    expect(path[path.length - 1]).toEqual({ x: 600, y: 100 });
    // A goal sealed inside walls has no route.
    const box = [{ x: 500, y: 50, w: 200, h: 10 }, { x: 500, y: 150, w: 200, h: 10 }, { x: 500, y: 50, w: 10, h: 110 }, { x: 690, y: 50, w: 10, h: 110 }];
    expect(findPath({ x: 100, y: 100 }, { x: 600, y: 100 }, box)).toBeNull();
    // Clicking on a solid object leads to the closest spot beside it.
    const table = { x: 560, y: 80, w: 80, h: 40 };
    const beside = findPath({ x: 100, y: 100 }, { x: 600, y: 100 }, [table])!;
    const end = beside[beside.length - 1];
    expect(circleHitsRect(end.x, end.y, 9, table)).toBe(false);
    expect(Math.hypot(end.x - 600, end.y - 100)).toBeLessThan(60);
  });


  it('lets a player standing inside an obstacle walk out instead of freezing', () => {
    const rock = { x: 100, y: 100, w: 60, h: 60 };
    const stuck = { x: 130, y: 130, direction: 'down' as const, moving: false };
    const next = stepPosition(stuck, { x: 0, y: 1 }, 0.05, [rock]);
    expect(next.y).toBeGreaterThan(stuck.y);
    // A free player still cannot walk into it.
    const outside = { x: 130, y: 90, direction: 'down' as const, moving: false };
    expect(stepPosition(outside, { x: 0, y: 1 }, 0.05, [rock]).y).toBe(outside.y);
  });
});

describe('mayor election',()=>{
 it('requires organizer permission and elects without eliminating, then counts the mayor twice',()=>{
  const ids=['a','b','c','d','e','f'];const game=table(ids);expect(()=>game.apply('b',{kind:'mayor_setting',enabled:true},0)).toThrow();game.apply('a',{kind:'mayor_setting',enabled:true},0);game.apply('a',{kind:'start'},0);for(const id of ids)game.apply(id,{kind:'ready'},0);let now=0;while(game.phase!=='day'&&now<300000){now+=1000;game.tick(now);}expect(game.phase).toBe('day');expect(game.viewFor('a',now).mayorElection).toBe(true);for(const id of ids)game.apply(id,{kind:'vote',target:'a'},now);expect(game.viewFor('a',now).mayorId).toBe('a');expect(game.players.every(p=>p.alive)).toBe(true);for(const [id,target]of [['a','b'],['b','d'],['c','b'],['d','e'],['e','d'],['f','e']])game.apply(id,{kind:'vote',target},now);expect(game.players.find(p=>p.id==='b')!.alive).toBe(false);expect(game.players.filter(p=>p.alive)).toHaveLength(5);
 });
});
