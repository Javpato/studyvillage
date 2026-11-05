import { openExternal } from '../../../packages/runtime/src/local-bridge/external';
import { msg, t, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import { errorMessage } from '../errors/messages';
import {
  gitCloneCommand, parseLiveShareUrl, repoLabel, vscodeCloneLink, vscodeWebLink,
  type GroupProject, type ProjectsAction, type ProjectsView,
} from '../../../packages/core/src/projects/group-projects';
import { monoIcon } from './pixel-icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text: DisplayText = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) setDisplayText(node, text);
  return node;
}
function btn(label: DisplayText, className = 'pj-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

export interface ProjectsPanelContext {
  send(action: ProjectsAction): void;
  close(): void;
  notify(message: string): void;
  me(): { id: string; name: string; color: string; online: boolean; isHost: boolean };
}

/**
 * The group's project board. Code is written in VS Code; this is where the
 * group finds the repository, joins whoever is sharing a Live Share session,
 * sees who is working and keeps a short to-do list.
 */
export class ProjectsPanel {
  readonly root = el('section', 'pj');
  private view: ProjectsView | null = null;
  private selected: string | null = null;
  private mode: 'view' | 'create' | 'edit' = 'view';
  private errorText = '';
  /** A create or edit was sent; the next answer from the board closes the form. */
  private awaiting: 'create' | 'edit' | null = null;

  constructor(private readonly ctx: ProjectsPanelContext) {
    setDisplayAttribute(this.root, 'aria-label', msg('Proyectos en VS Code'));
  }

  mount(container: HTMLElement): void { container.replaceChildren(this.root); this.render(); }
  unmount(): void { this.root.remove(); }

  update(view: ProjectsView | null, error: string | null): void {
    if (view) {
      this.view = view;
      if (this.awaiting && !error) {
        if (this.awaiting === 'create') this.selected = view.projects[0]?.id ?? null;
        this.mode = 'view';
      }
      if (!this.selected || !view.projects.some((p) => p.id === this.selected)) this.selected = view.projects[0]?.id ?? null;
    }
    if (error || view) this.awaiting = null;
    this.errorText = error ?? '';
    // Someone else's change must not wipe what you are typing.
    const typing = this.root.contains(document.activeElement)
      && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement);
    if (!typing) this.render();
  }

  private render(): void {
    this.root.replaceChildren();
    const me = this.ctx.me();
    const head = el('header', 'pj-head');
    const titles = el('div');
    titles.append(el('h2', '', msg('Proyectos del grupo')), el('p', '', me.online ? msg('Compartidos con la aldea. El código se escribe en VS Code; aquí os coordináis.') : msg('Sin conexión: se guardan en este equipo. Al abrir tu aldea los verá todo el grupo.')));
    const close = btn('', 'pj-icon-btn');
    close.append(monoIcon('close', 12));
    setDisplayAttribute(close, 'aria-label', msg('Cerrar'));
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(el('span', 'pj-logo'), titles, close);
    head.querySelector('.pj-logo')!.append(monoIcon('code', 20));
    this.root.append(head);

    const body = el('div', 'pj-body');
    body.append(this.list(), this.detail());
    this.root.append(body);
  }

  private list(): HTMLElement {
    const side = el('aside', 'pj-list');
    const create = btn('', 'pj-btn pj-btn-primary pj-new');
    create.append(monoIcon('plus', 10), el('span', '', msg('Nuevo proyecto')));
    create.addEventListener('click', () => { this.mode = 'create'; this.errorText = ''; this.render(); });
    side.append(create);
    const projects = this.view?.projects ?? [];
    if (!this.view) side.append(el('p', 'pj-muted', msg('Cargando…')));
    for (const p of projects) {
      const row = btn('', 'pj-row');
      row.classList.toggle('is-active', p.id === this.selected && this.mode !== 'create');
      const top = el('span', 'pj-row-top');
      top.append(el('strong', '', p.name));
      if (p.liveShareUrl) top.append(el('span', 'pj-live', msg('En vivo')));
      row.append(top, el('span', 'pj-row-sub', p.repoUrl ? repoLabel(p.repoUrl) : msg('Sin repositorio')));
      const people = Object.values(p.working);
      if (people.length) row.append(this.faces(people));
      row.addEventListener('click', () => { this.selected = p.id; this.mode = 'view'; this.errorText = ''; this.render(); });
      side.append(row);
    }
    return side;
  }

  private faces(people: { name: string; color: string }[]): HTMLElement {
    const wrap = el('span', 'pj-faces');
    for (const person of people.slice(0, 5)) {
      const face = el('span', 'pj-face', person.name.slice(0, 1).toUpperCase());
      face.style.backgroundColor = person.color;
      face.title = person.name;
      wrap.append(face);
    }
    if (people.length > 5) wrap.append(el('span', 'pj-face is-more', `+${people.length - 5}`));
    return wrap;
  }

  private detail(): HTMLElement {
    const main = el('div', 'pj-detail');
    const project = this.view?.projects.find((p) => p.id === this.selected) ?? null;
    if (this.mode === 'create' || (this.mode === 'edit' && project)) {
      main.append(this.form(this.mode === 'edit' ? project : null));
      return main;
    }
    if (!project) {
      main.append(this.onboarding());
      return main;
    }
    const me = this.ctx.me();
    const title = el('div', 'pj-title-row');
    title.append(el('h3', '', project.name));
    const edit = btn(msg('Editar'), 'pj-btn pj-btn-quiet');
    edit.addEventListener('click', () => { this.mode = 'edit'; this.render(); });
    title.append(edit);
    main.append(title);
    if (project.description) main.append(el('p', 'pj-desc', project.description));
    main.append(el('p', 'pj-muted', msg("Creado por {p0}", { p0: project.ownerName })));
    if (this.errorText) main.append(el('p', 'pj-error', this.errorText));

    // Live Share: the heart of working together right now.
    const live = el('section', 'pj-section pj-live-box');
    if (project.liveShareUrl) {
      live.classList.add('is-live');
      live.append(el('h4', '', msg("Sesión en vivo de {p0}", { p0: project.liveShareBy ?? 'alguien' })),
        el('p', 'pj-muted', msg('Entra para editar los mismos archivos a la vez, con cursores y terminal compartidos.')));
      const row = el('div', 'pj-actions');
      const join = btn(msg('Unirme en VS Code'), 'pj-btn pj-btn-primary');
      join.addEventListener('click', () => {
        if (!project.working[me.id]) this.ctx.send({ kind: 'working', id: project.id, on: true, me });
        this.open(project.liveShareUrl!);
      });
      const end = btn(msg('Terminar sesión'), 'pj-btn pj-btn-quiet');
      end.addEventListener('click', () => this.ctx.send({ kind: 'end_live_share', id: project.id }));
      row.append(join, end);
      live.append(row);
    } else {
      live.append(el('h4', '', msg('Programad juntos con Live Share')));
      const steps = el('ol', 'pj-steps');
      for (const step of [
        'En VS Code, instala la extensión «Live Share» de Microsoft.',
        'Abre el proyecto y pulsa «Live Share» en la barra inferior. El enlace se copia solo.',
        'Pégalo aquí: todo el grupo verá un botón para unirse.',
      ]) steps.append(el('li', '', msg(step)));
      const form = el('form', 'pj-inline-form');
      const input = el('input', 'pj-input');
      input.placeholder = 'https://prod.liveshare.vsengsaas.visualstudio.com/join?…';
      setDisplayAttribute(input, 'aria-label', msg('Enlace de Live Share'));
      const share = btn(msg('Compartir sesión'), 'pj-btn pj-btn-primary');
      share.type = 'submit';
      form.append(input, share);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!parseLiveShareUrl(input.value)) { this.errorText = t('Ese no parece un enlace de Live Share. Cópialo desde VS Code (empieza por https://prod.liveshare…).'); this.render(); return; }
        this.ctx.send({ kind: 'live_share', id: project.id, url: input.value, me });
      });
      live.append(steps, form);
    }
    main.append(live);

    // Repository: open it in the real editor.
    const repo = el('section', 'pj-section');
    repo.append(el('h4', '', msg('Repositorio')));
    if (project.repoUrl) {
      const url = project.repoUrl;
      const link = el('code', 'pj-repo', repoLabel(url));
      const row = el('div', 'pj-actions');
      const clone = btn(msg('Clonar en VS Code'), 'pj-btn');
      setDisplayAttribute(clone, "title", msg('Abre VS Code y te pregunta dónde guardar la copia'));
      clone.addEventListener('click', () => this.open(vscodeCloneLink(url)));
      row.append(clone);
      const web = vscodeWebLink(url);
      if (web) {
        const webBtn = btn(msg('Abrir en vscode.dev'), 'pj-btn');
        setDisplayAttribute(webBtn, "title", msg('VS Code en el navegador, sin instalar nada'));
        webBtn.addEventListener('click', () => this.open(web));
        row.append(webBtn);
      }
      const copy = btn(msg('Copiar «git clone»'), 'pj-btn pj-btn-quiet');
      copy.addEventListener('click', () => {
        void navigator.clipboard?.writeText(gitCloneCommand(url)).then(
          () => this.ctx.notify(t('Comando copiado. Pégalo en una terminal.')),
          () => this.ctx.notify(gitCloneCommand(url)),
        );
      });
      row.append(copy);
      repo.append(link, row);
    } else {
      repo.append(el('p', 'pj-muted', msg('Añade la dirección del repositorio (GitHub, GitLab…) para que cualquiera pueda clonarlo con un clic.')));
      const add = btn(msg('Añadir repositorio'), 'pj-btn');
      add.addEventListener('click', () => { this.mode = 'edit'; this.render(); });
      repo.append(add);
    }
    main.append(repo);

    // Who is on it.
    const people = el('section', 'pj-section');
    people.append(el('h4', '', msg('Trabajando ahora')));
    const working = Object.entries(project.working);
    if (working.length) {
      const chips = el('div', 'pj-chips');
      for (const [, person] of working) {
        const chip = el('span', 'pj-chip');
        const dot = el('span', 'pj-face', person.name.slice(0, 1).toUpperCase());
        dot.style.backgroundColor = person.color;
        chip.append(dot, el('span', '', person.name));
        chips.append(chip);
      }
      people.append(chips);
    } else people.append(el('p', 'pj-muted', msg('Nadie todavía.')));
    const imIn = !!project.working[me.id];
    const toggle = btn(imIn ? msg('Ya no estoy en ello') : msg('Estoy trabajando en esto'), imIn ? 'pj-btn pj-btn-quiet' : 'pj-btn');
    toggle.addEventListener('click', () => this.ctx.send({ kind: 'working', id: project.id, on: !imIn, me }));
    people.append(toggle);
    main.append(people);

    main.append(this.tasks(project));
    return main;
  }

  private tasks(project: GroupProject): HTMLElement {
    const me = this.ctx.me();
    const section = el('section', 'pj-section');
    const done = project.tasks.filter((t) => t.done).length;
    section.append(el('h4', '', project.tasks.length ? msg("Tareas · {p0}/{p1}", { p0: done, p1: project.tasks.length }) : msg('Tareas')));
    const list = el('ul', 'pj-tasks');
    for (const task of project.tasks) {
      const li = el('li', task.done ? 'is-done' : '');
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = task.done;
      box.addEventListener('change', () => this.ctx.send({ kind: 'toggle_task', id: project.id, taskId: task.id, me }));
      label.append(box, el('span', '', task.text));
      li.append(label);
      if (task.done && task.by) li.append(el('small', 'pj-muted', task.by));
      const remove = btn('', 'pj-icon-btn');
      remove.append(monoIcon('trash', 11));
      setDisplayAttribute(remove, 'aria-label', msg("Borrar tarea {p0}", { p0: task.text }));
      remove.addEventListener('click', () => this.ctx.send({ kind: 'remove_task', id: project.id, taskId: task.id }));
      li.append(remove);
      list.append(li);
    }
    const form = el('form', 'pj-inline-form');
    const input = el('input', 'pj-input');
    setDisplayAttribute(input, "placeholder", msg('Nueva tarea, p. ej. «Hacer la pantalla de inicio»'));
    input.maxLength = 140;
    setDisplayAttribute(input, 'aria-label', msg('Nueva tarea'));
    const add = btn(msg('Añadir'), 'pj-btn');
    add.type = 'submit';
    form.append(input, add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      this.ctx.send({ kind: 'add_task', id: project.id, text: input.value });
      input.value = '';
    });
    section.append(list, form);
    return section;
  }

  private form(project: GroupProject | null): HTMLElement {
    const form = el('form', 'pj-form');
    form.append(el('h3', '', project ? msg('Editar proyecto') : msg('Nuevo proyecto')));
    const name = el('input', 'pj-input');
    name.required = true;
    name.maxLength = 60;
    name.value = project?.name ?? '';
    setDisplayAttribute(name, "placeholder", msg('Proyecto final de Programación'));
    const description = el('textarea', 'pj-input');
    description.maxLength = 280;
    description.rows = 3;
    description.value = project?.description ?? '';
    setDisplayAttribute(description, "placeholder", msg('Qué estáis construyendo y para cuándo.'));
    const repo = el('input', 'pj-input');
    repo.value = project?.repoUrl ?? '';
    repo.placeholder = 'https://github.com/usuario/proyecto';
    const field = (label: DisplayText, control: HTMLElement, hint = '') => {
      const wrap = el('label', 'pj-field');
      wrap.append(el('span', '', label), control);
      if (hint) wrap.append(el('small', 'pj-muted', hint));
      return wrap;
    };
    form.append(field(msg('Nombre'), name), field(msg('Descripción'), description),
      field(msg('Repositorio (opcional)'), repo, t('Dirección https de GitHub, GitLab, Bitbucket u otro servidor git.')));
    if (this.errorText) form.append(el('p', 'pj-error', this.errorText));
    const actions = el('div', 'pj-actions');
    const save = btn(project ? msg('Guardar') : msg('Crear proyecto'), 'pj-btn pj-btn-primary');
    save.type = 'submit';
    const cancel = btn(msg('Cancelar'), 'pj-btn pj-btn-quiet');
    cancel.addEventListener('click', () => { this.mode = 'view'; this.errorText = ''; this.render(); });
    actions.append(save, cancel);
    if (project && project.ownerId === this.ctx.me().id) {
      const del = btn(msg('Borrar proyecto'), 'pj-btn pj-btn-danger');
      del.addEventListener('click', () => {
        if (del.dataset.armed) { this.ctx.send({ kind: 'delete', id: project.id }); return; }
        del.dataset.armed = '1';
        setDisplayText(del, msg('¿Seguro? Pulsa otra vez'));
        setTimeout(() => { delete del.dataset.armed; setDisplayText(del, msg('Borrar proyecto')); }, 3_000);
      });
      actions.append(del);
    }
    form.append(actions);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const me = this.ctx.me();
      this.awaiting = project ? 'edit' : 'create';
      if (project) this.ctx.send({ kind: 'edit', id: project.id, name: name.value, description: description.value, repoUrl: repo.value });
      else this.ctx.send({ kind: 'create', name: name.value, description: description.value, repoUrl: repo.value, me });
    });
    queueMicrotask(() => name.focus());
    return form;
  }

  private onboarding(): HTMLElement {
    const box = el('div', 'pj-onboarding');
    const art = el('span', 'pj-logo is-big');
    art.append(monoIcon('code', 36));
    box.append(art, el('h3', '', msg('Trabajad juntos en VS Code')),
      el('p', '', msg('Crea un proyecto para el grupo: enlaza el repositorio, comparte tu sesión de Live Share y repartid las tareas. Todos lo verán desde la aldea.')));
    const create = btn(msg('Crear el primer proyecto'), 'pj-btn pj-btn-primary');
    create.addEventListener('click', () => { this.mode = 'create'; this.render(); });
    box.append(create);
    return box;
  }

  private open(url: string): void {
    openExternal(url).catch((error: unknown) => this.ctx.notify(errorMessage(error, 'No se pudo abrir el enlace.')));
  }
}
