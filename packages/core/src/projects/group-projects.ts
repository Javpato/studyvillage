import type {KeyValueStore} from '../storage';
import type { RoomEngine } from '../minigames/room';

/**
 * Group projects worked on together in VS Code.
 *
 * StudyVillage does not edit code. It is the place where a group keeps its
 * projects: where the repository lives, the Live Share session someone is
 * hosting right now, who is working, and what is left to do. Every link opens
 * in the real VS Code (desktop or vscode.dev), so the group gets a full editor,
 * terminals, debugging and git instead of a toy notebook.
 *
 * The board is shared through the village host like a game: the host keeps
 * the list (and saves it on its machine), members send changes.
 */

export interface ProjectTask { id: string; text: string; done: boolean; by: string | null }
export interface GroupProject {
  id: string;
  name: string;
  description: string;
  repoUrl: string | null;
  liveShareUrl: string | null;
  liveShareBy: string | null;
  ownerId: string;
  ownerName: string;
  /** Who said "I'm in": id -> display name and color. */
  working: Record<string, { name: string; color: string }>;
  tasks: ProjectTask[];
  updatedAt: number;
}

export type ProjectsAction =
  | { kind: 'create'; name: string; description: string; repoUrl: string; me: Who }
  | { kind: 'edit'; id: string; name: string; description: string; repoUrl: string }
  | { kind: 'delete'; id: string }
  | { kind: 'live_share'; id: string; url: string; me: Who }
  | { kind: 'end_live_share'; id: string }
  | { kind: 'working'; id: string; on: boolean; me: Who }
  | { kind: 'add_task'; id: string; text: string }
  | { kind: 'toggle_task'; id: string; taskId: string; me: Who }
  | { kind: 'remove_task'; id: string; taskId: string };

export interface Who { name: string; color: string }
export interface ProjectsView { projects: GroupProject[] }

const MAX_PROJECTS = 24;
const MAX_TASKS = 40;
const STORAGE_KEY = 'studyvillage-group-projects-v1';

/** Live Share and vscode.dev hosts; any other link would be a phishing vector on a shared board. */
const LIVE_SHARE_HOSTS = new Set(['prod.liveshare.vsengsaas.visualstudio.com', 'vscode.dev', 'insiders.vscode.dev']);

export function parseLiveShareUrl(raw: string): string | null {
  const url = safeUrl(raw);
  if (!url || !LIVE_SHARE_HOSTS.has(url.hostname)) return null;
  if (url.hostname !== 'prod.liveshare.vsengsaas.visualstudio.com' && !url.pathname.startsWith('/liveshare/')) return null;
  return url.href;
}

/** An https repository address (GitHub, GitLab, Bitbucket, a self-hosted git…). */
export function parseRepoUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ssh = /^git@([a-z0-9.-]+):([\w.-]+\/[\w./-]+?)(\.git)?$/i.exec(trimmed);
  const url = safeUrl(ssh ? `https://${ssh[1]}/${ssh[2]}` : trimmed);
  if (!url || url.pathname.split('/').filter(Boolean).length < 2) return null;
  return url.href.replace(/\/$/, '');
}

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 600) return null;
    return url;
  } catch { return null; }
}

/** Opens VS Code's own "Clone repository" flow for this address. */
export function vscodeCloneLink(repoUrl: string): string {
  const clone = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;
  return `vscode://vscode.git/clone?url=${encodeURIComponent(clone)}`;
}

/** vscode.dev opens GitHub and Azure repos straight in the browser. */
export function vscodeWebLink(repoUrl: string): string | null {
  const url = safeUrl(repoUrl);
  if (!url) return null;
  const path = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
  if (url.hostname === 'github.com' && path.length >= 2) return `https://vscode.dev/github/${path[0]}/${path[1]}`;
  return null;
}

export function gitCloneCommand(repoUrl: string): string {
  return `git clone ${repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`}`;
}

export function repoLabel(repoUrl: string): string {
  const url = safeUrl(repoUrl);
  if (!url) return repoUrl;
  return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\.git$/, '')}`;
}

export class GroupProjectsBoard implements RoomEngine<ProjectsAction, ProjectsView> {
  projects: GroupProject[] = [];

  constructor(private readonly persist = true, private readonly scope = '', private readonly storage:KeyValueStore|null=null) {
    if (persist) this.load();
  }

  audience(): string[] { return []; }
  tick(): boolean { return false; }

  viewFor(): ProjectsView { return { projects: this.projects.map((p) => structuredClone(p)) }; }

  apply(actorId: string, action: ProjectsAction, now: number): void {
    if (action.kind === 'create') {
      if (this.projects.length >= MAX_PROJECTS) throw new Error('La aldea ya tiene el máximo de proyectos.');
      const name = text(action.name, 60);
      if (!name) throw new Error('Ponle un nombre al proyecto.');
      const repoUrl = action.repoUrl.trim() ? parseRepoUrl(action.repoUrl) : null;
      if (action.repoUrl.trim() && !repoUrl) throw new Error('El repositorio debe ser una dirección https (por ejemplo https://github.com/usuario/proyecto).');
      this.projects.unshift({
        id: `p${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
        name, description: text(action.description, 280), repoUrl, liveShareUrl: null, liveShareBy: null,
        ownerId: actorId, ownerName: text(action.me.name, 32) || 'Alguien',
        working: {}, tasks: [], updatedAt: now,
      });
      return this.save();
    }
    const project = this.projects.find((p) => p.id === action.id);
    if (!project) throw new Error('Ese proyecto ya no existe.');
    switch (action.kind) {
      case 'edit': {
        const name = text(action.name, 60);
        if (!name) throw new Error('Ponle un nombre al proyecto.');
        const repoUrl = action.repoUrl.trim() ? parseRepoUrl(action.repoUrl) : null;
        if (action.repoUrl.trim() && !repoUrl) throw new Error('El repositorio debe ser una dirección https.');
        Object.assign(project, { name, description: text(action.description, 280), repoUrl });
        break;
      }
      case 'delete':
        if (project.ownerId !== actorId) throw new Error('Solo quien creó el proyecto puede borrarlo.');
        this.projects = this.projects.filter((p) => p !== project);
        return this.save();
      case 'live_share': {
        const url = parseLiveShareUrl(action.url);
        if (!url) throw new Error('Pega el enlace que copia Live Share (https://prod.liveshare.vsengsaas.visualstudio.com/join?…).');
        project.liveShareUrl = url;
        project.liveShareBy = text(action.me.name, 32) || 'Alguien';
        project.working[actorId] = who(action.me);
        break;
      }
      case 'end_live_share':
        project.liveShareUrl = null;
        project.liveShareBy = null;
        break;
      case 'working':
        if (action.on) project.working[actorId] = who(action.me);
        else delete project.working[actorId];
        break;
      case 'add_task': {
        const value = text(action.text, 140);
        if (!value) return;
        if (project.tasks.length >= MAX_TASKS) throw new Error('Demasiadas tareas: marca algunas como hechas y bórralas.');
        project.tasks.push({ id: `t${now.toString(36)}${project.tasks.length}`, text: value, done: false, by: null });
        break;
      }
      case 'toggle_task': {
        const task = project.tasks.find((t) => t.id === action.taskId);
        if (!task) return;
        task.done = !task.done;
        task.by = task.done ? text(action.me.name, 32) : null;
        break;
      }
      case 'remove_task':
        project.tasks = project.tasks.filter((t) => t.id !== action.taskId);
        break;
    }
    project.updatedAt = now;
    this.save();
  }

  /** Forget "working now" marks of people who are no longer here. */
  prune(present: ReadonlySet<string>): boolean {
    let changed = false;
    for (const project of this.projects) {
      for (const id of Object.keys(project.working)) if (!present.has(id)) { delete project.working[id]; changed = true; }
    }
    if (changed) this.save();
    return changed;
  }

  private save(): void {
    if (!this.persist) return;
    try { this.storage?.setItem(this.scope ? `${STORAGE_KEY}:${this.scope}` : STORAGE_KEY, JSON.stringify(this.projects)); } catch { /* Quota or private mode: the board still works in memory. */ }
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(this.scope ? `${STORAGE_KEY}:${this.scope}` : STORAGE_KEY);
      const list = raw ? JSON.parse(raw) as GroupProject[] : [];
      this.projects = Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string').slice(0, MAX_PROJECTS)
        .map((p) => ({ ...p, working: {}, tasks: Array.isArray(p.tasks) ? p.tasks : [] })) : [];
    } catch { this.projects = []; }
  }
}

function text(value: unknown, max: number): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function who(me: Who): { name: string; color: string } {
  return { name: text(me.name, 32) || 'Alguien', color: /^#[0-9a-fA-F]{6}$/.test(me.color) ? me.color : '#7c8a7a' };
}
