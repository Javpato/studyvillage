import type {PetBot} from '../../../packages/core/src/pets/protocol';
import {petPortrait} from '../pets/art';
import './werewolves.css';
import { msg, t, defaultText, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import {
  MAX_PLAYERS, MIN_PLAYERS, ROLE_INFO, STEP_CALL, BUILDING_INFO, EVENT_INFO, SPIRIT_QUESTIONS, roleLimit, presetRoles, type RoleCounts,
  type VillageBuilding, type WerewolfRole, type WerewolvesAction, type WerewolvesView,
} from '../../../packages/core/src/minigames/werewolves';
import { colorIcon, monoIcon } from './pixel-icons';
/** Role texts in the current language; the engine keeps the Spanish source keys. */
function roleInfo(role: keyof typeof ROLE_INFO): { name: string; plural: string; team: 'aldea' | 'lobos' | 'solo'; goal: string } { const info = ROLE_INFO[role]; return { name: t(info.name), plural: t(info.plural), team: info.team, goal: t(info.goal) }; }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text: DisplayText = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) setDisplayText(node, text);
  return node;
}
function btn(label: DisplayText, className = 'ww-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const PHASE_TITLE: Record<WerewolvesView['phase'], string> = {
  execution:'Última oportunidad',succession:'Sucesión del alcalde',scapegoat:'Última decisión',hunter: 'El último disparo', lobby: 'La mesa de la hoguera', reveal: 'Mira tu carta', night: 'Noche', dawn: 'Amanece',
  day: 'Día: la aldea vota', verdict: 'Veredicto', end: 'Fin de la partida',
};

const BUILDING_HELP:Record<VillageBuilding,string>={
  farm:'Solo los granjeros eligen al alcalde, desde el segundo día. La sucesión también queda entre granjeros.',
  church:'Una vez, descubre en privado la carta de otra persona.',
  healer:'Una vez, devuelve un poder de edificio que ya se haya usado.',
  school:'Impide hasta dos votos por día. No puedes votar ni impedir el voto de alguien sin casa.',
  bailiff:'Ofrece casas vacías a personas sin edificio. Cada persona decide si acepta.',
  manor:'Una vez, perdona al condenado antes de que revele su carta. También puedes salvarte.',
  bakery:'Después del turno de los lobos, puedes mirar las cámaras durante tres segundos.',
  tavern:'Los lobos y los votos normales no te atacan. Pierdes la inmunidad si votas al condenado.',
  barber:'Una vez, elimina a alguien con casa. Si no es lobo, tú también mueres.',
};

export interface WerewolvesPanelContext {
  pets?():PetBot[];
  send(action: WerewolvesAction): void;
  close(): void;
  me(): { name: string; color: string };
}

/**
 * The game table. Seats sit around the fire; each card shows only what you
 * know about that person. Night is dark and quiet unless it is your turn.
 */
export class WerewolvesPanel {
  readonly root = el('section', 'ww');
  private view: WerewolvesView | null = null;
  private receivedAt = 0;
  private selected: string | null = null;
  private heal = false;
  private timerEl: HTMLElement | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private errorText = '';
  private turnKey = '';
  private cardsOpen = false;
  private settingsOpen=false;
  private pendingFlip:WerewolfRole|null=null;
  private roleQuery='';
  private roleFilter='all';

  constructor(private readonly ctx: WerewolvesPanelContext) {
    setDisplayAttribute(this.root, 'aria-label', msg('Hombres lobo'));
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    this.clock ??= setInterval(() => this.paintTimer(), 250);
    this.render();
  }

  unmount(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.root.remove();
  }

  update(view: WerewolvesView | null, error: string | null): void {
    // Unchanged default names ("Explorador") follow the language; typed names stay as typed.
    if (view) view = { ...view, players: view.players.map(p => ({ ...p, name: defaultText(p.name) })) };
    if (view) {
      const key = `${view.phase}:${view.round}:${view.step}`;
      if (key !== this.turnKey) { this.turnKey = key; this.selected = null; this.heal = false; }
      this.view = view;
      this.receivedAt = Date.now();
    }
    this.errorText = error ?? '';
    this.render();
  }

  private remaining(): number {
    return this.view ? Math.max(0, this.view.remainingMs - (Date.now() - this.receivedAt)) : 0;
  }

  private paintTimer(): void {
    if (!this.timerEl || !this.view) return;
    const s = Math.ceil(this.remaining() / 1000);
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('is-low', s <= 10);
  }

  private render(): void {
    const v = this.view;
    const oldBodyScroll=this.root.querySelector('.ww-body')?.scrollTop??0;
    const oldCardScroll=this.root.querySelector('.ww-card-contents')?.scrollTop??0;
    this.root.replaceChildren();
    this.root.dataset.phase = v?.phase ?? 'lobby';
    this.root.dataset.dark = String(!!v && (v.phase === 'night' || v.phase === 'reveal'));
    this.root.append(this.header(v));
    if (!v) {
      this.root.append(el('p', 'ww-empty', msg('Conectando con la mesa…')));
      return;
    }
    const body = el('div', 'ww-body');
    const side = el('div', 'ww-side');
    if(v.phase==='lobby'){
      body.classList.add('ww-lobby');
      const main=el('div','ww-lobby-main'),seats=el('section','ww-lobby-seats');
      seats.append(el('h3','ww-section-label',msg('En la mesa')),this.table(v));
      main.append(this.cardSetup(v),seats);side.append(this.settings(v),this.actionBox(v));body.append(main,side);
    }else{side.append(this.myCard(v),this.actionBox(v));body.append(this.table(v),side);}
    if (this.errorText) side.append(el('p', 'ww-error', this.errorText));
    if(v.log.length)side.append(this.logBox(v));
    this.root.dataset.phase=v.phase;this.root.append(body);
    body.scrollTop=oldBodyScroll;
    const cardScroll=this.root.querySelector<HTMLElement>('.ww-card-contents');if(cardScroll)cardScroll.scrollTop=oldCardScroll;
    this.pendingFlip=null;this.paintTimer();
  }

  private header(v: WerewolvesView | null): HTMLElement {
    const head = el('header', 'ww-head');
    const phaseIcon = el('span', 'ww-phase-icon');
    phaseIcon.append(colorIcon(!v || v.phase === 'lobby' || v.phase === 'end' ? 'werewolf' : v.phase === 'night' || v.phase === 'reveal' ? 'moon' : 'sun', 28));
    const titles = el('div', 'ww-titles');
    const title = v?.mayorElection ? t('Elegir alcalde') : v?.phase === 'night' ? t('Noche {round}', { round: v.round }) : v?.phase === 'day' ? t('Día {round}: la aldea vota', { round: v.round }) : t(PHASE_TITLE[v?.phase ?? 'lobby']);
    titles.append(el('h2', '', title), el('p', '', this.subtitle(v)));
    head.append(phaseIcon, titles);
    if (v && v.phase !== 'lobby' && v.phase !== 'end') {
      this.timerEl = el('span', 'ww-timer');
      setDisplayAttribute(this.timerEl, 'aria-label', msg('Tiempo restante'));
      head.append(this.timerEl);
    } else this.timerEl = null;
    const close = btn('', 'ww-icon-btn');
    close.append(monoIcon('close', 14));
    setDisplayAttribute(close, 'aria-label', msg('Cerrar'));
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(close);
    return head;
  }

  private subtitle(v: WerewolvesView | null): string {
    if (!v) return '';
    switch (v.phase) {
      case 'lobby': return t('De {min} a {max} jugadores. Si faltan personas, añade bots.', { min: MIN_PLAYERS, max: MAX_PLAYERS });
      case 'reveal': return t('Solo tú ves tu carta. Pulsa «Entendido» cuando la recuerdes.');
      case 'night': return v.step ? `${t(STEP_CALL[v.step])}.` : t('La aldea duerme.');
      case 'dawn': return v.nightDeaths.length ? t('La noche ha dejado víctimas.') : t('Nadie ha muerto esta noche.');
      case 'day': return t('Hablad por voz, sospechad y elegid. Gana la mayoría; con empate no muere nadie.');
      case 'verdict': return t('La aldea ha decidido.');
      case 'execution':return t('La sirvienta o la mansión pueden intervenir antes de revelar la carta.');
      case 'succession':return t('El alcalde elige a su sucesor.');
      case 'scapegoat':return t('El chivo expiatorio decide quién podrá votar mañana.');
      case 'hunter': return t('El cazador puede elegir una última víctima antes de continuar.');
      case 'end': return this.winnerText(v);
    }
  }

  private cardSetup(v: WerewolvesView): HTMLElement {
    const setup=el('details','ww-card sv-role-setup');setup.open=this.cardsOpen;
    const summary=el('summary','');const title=el('span','ww-summary-title',msg('Elegir cartas y sets'));title.prepend(monoIcon('cards',20));summary.append(title,el('span','ww-summary-count',String(v.deck.length)));
    summary.onclick=e=>{e.preventDefault();this.cardsOpen=!this.cardsOpen;setup.open=this.cardsOpen;};setup.append(summary);
    const contents=el('div','ww-card-contents');setup.append(contents);
    contents.append(el('p','ww-card-intro',msg('Pulsa una carta para añadirla o retirarla. Las cartas elegidas brillan.')));
    const tools=el('div','ww-deck-tools');const presets=el('select','sv-select');setDisplayAttribute(presets,'aria-label',msg('Set de cartas'));
    for(const[value,name]of [['',msg('Elegir set')],['basic',msg('Básico')],['classic',msg('Clásico')],['bonds',msg('Vínculos')]]){const o=el('option','',name);o.value=String(value);presets.append(o);}
    let saved:Record<string,RoleCounts>={};try{const raw=JSON.parse(localStorage.getItem('studyvillage-role-sets')||'{}');saved=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};}catch{/* Empty cabinet. */}
    for(const key of Object.keys(saved)){const o=el('option','',key);o.value=`saved:${key}`;presets.append(o);}
    presets.disabled=!v.me.isLeader;presets.onchange=()=>{if(presets.value)this.ctx.send({kind:'configure',counts:presets.value.startsWith('saved:')?saved[presets.value.slice(6)]:presetRoles(presets.value,v.players.length)});};
    const search=el('input','ww-role-search');search.type='search';search.value=this.roleQuery;setDisplayAttribute(search,'placeholder',msg('Buscar personaje'));setDisplayAttribute(search,'aria-label',msg('Buscar personaje'));tools.append(search,presets);contents.append(tools);
    const filters=el('div','ww-role-filters');setDisplayAttribute(filters,'aria-label',msg('Filtrar personajes'));
    for(const[value,label]of [['all','Todas'],['aldea','Equipo aldea'],['lobos','Equipo lobos'],['solo','Victoria individual']]){const b=btn(msg(label),'ww-filter');b.setAttribute('aria-pressed',String(this.roleFilter===value));b.onclick=()=>{this.roleFilter=value;this.render();};filters.append(b);}contents.append(filters);
    const grid=el('div','sv-role-catalog');
    const rows:{node:HTMLElement;text:string;team:string}[]=[];
    for(const role of Object.keys(ROLE_INFO)as WerewolfRole[]){
      const info=roleInfo(role),count=role==='villager'?v.deck.filter(r=>r===role).length:v.counts[role]??0;
      const card=el('article','sv-role-card');card.dataset.role=role;card.dataset.team=info.team;card.classList.toggle('is-chosen',count>0);card.classList.toggle('is-flipping',this.pendingFlip===role);card.classList.toggle('is-readonly',!v.me.isLeader||role==='villager');
      const choose=btn('','sv-role-pick');choose.disabled=!v.me.isLeader||role==='villager';choose.setAttribute('aria-pressed',String(count>0));setDisplayAttribute(choose,'aria-label',info.name);choose.append(colorIcon(role,48),el('strong','',info.name));
      const change=()=>{this.pendingFlip=role;this.ctx.send({kind:'configure',counts:{...v.counts,[role]:count>0?0:role==='sister'?2:role==='brother'?3:1}});};choose.onclick=change;
      card.onclick=e=>{if(!choose.disabled&&!(e.target as Element).closest('input,button,label'))change();};
      card.append(choose,el('p','ww-role-description',info.goal));
      const foot=el('div','ww-role-foot');foot.append(el('span','ww-role-status',msg(role==='villager'?'Automático':count>0?'Elegida':'Añadir carta')));
      const amount=el('input');amount.type='number';amount.min='0';amount.max=String(roleLimit(role));amount.step=String(role==='sister'?2:role==='brother'?3:1);amount.value=String(count);amount.disabled=!v.me.isLeader||role==='villager';setDisplayAttribute(amount,'aria-label',msg('Cantidad: {p0}',{p0:info.name}));
      amount.onchange=()=>{this.pendingFlip=role;this.ctx.send({kind:'configure',counts:{...v.counts,[role]:Number(amount.value)}});};foot.append(amount);card.append(foot);grid.append(card);rows.push({node:card,text:`${info.name} ${info.goal}`.toLocaleLowerCase(),team:info.team});
    }
    const empty=el('p','ww-muted',msg('No hay personajes con ese nombre.'));const filter=()=>{const q=this.roleQuery.trim().toLocaleLowerCase();for(const row of rows)row.node.hidden=!(row.text.includes(q)&&(this.roleFilter==='all'||row.team===this.roleFilter));empty.hidden=rows.some(row=>!row.node.hidden);};search.oninput=()=>{this.roleQuery=search.value;filter();};filter();
    contents.append(grid,empty,el('p','ww-muted',msg('Las plazas sin carta especial se completan con ciudadanos.')));
    if(v.deckError)contents.append(el('p','ww-error',msg(v.deckError)));
    if(v.me.isLeader){const saveBox=el('details','ww-save-deck');saveBox.append(el('summary','',msg('Guardar este set')));const row=el('div','ww-deck-tools'),input=el('input','sv-input');setDisplayAttribute(input,'placeholder',msg('Nombre del set'));input.maxLength=40;const save=btn(msg('Guardar set'));save.onclick=()=>{const name=input.value.trim();if(!name)return;saved[name]=v.counts;localStorage.setItem('studyvillage-role-sets',JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-12))));this.render();};row.append(input,save);saveBox.append(row);contents.append(saveBox);}
    return setup;
  }

  private table(v: WerewolvesView): HTMLElement {
    const table = el('div', 'ww-table');
    const selectable = this.selectableTargets(v);
    const tally = new Map<string, number>();
    for (const p of v.players) if (p.votesFor && p.votesFor !== 'skip') tally.set(p.votesFor, (tally.get(p.votesFor) ?? 0) + 1);
    const packMarks = new Map<string, number>();
    for (const p of v.players) if (p.wolfTarget) packMarks.set(p.wolfTarget, (packMarks.get(p.wolfTarget) ?? 0) + 1);

    for (const p of v.players) {
      const seat = btn('', 'ww-seat');
      seat.classList.toggle('is-me', p.id === v.me.id);
      seat.classList.toggle('is-dead', !p.alive);
      seat.classList.toggle('is-selected', this.selected === p.id);
      const canPick = selectable.includes(p.id);
      seat.classList.toggle('is-pickable', canPick);
      seat.disabled = !canPick && !(v.phase === 'lobby' && p.bot && v.me.isLeader);
      seat.setAttribute('aria-label', `${p.name}${p.alive ? '' : t(' (eliminado)')}${p.role ? `, ${roleInfo(p.role).name}` : ''}`);

      const avatar = el('span', 'ww-avatar', p.bot ? '' : p.name.slice(0, 1).toUpperCase());if(p.pet)avatar.append(petPortrait(p.pet));else if(p.bot)avatar.append(colorIcon('bot',38));if(p.id===v.mayorId)avatar.append(el('small','',msg('Alcalde')));
      avatar.style.backgroundColor = p.color;
      const badge = el('span', 'ww-role-badge');
      badge.append(colorIcon(!p.alive ? 'dead' : p.role ?? 'unknown', 22, p.role ? roleInfo(p.role).name : t('Carta oculta')));
      avatar.append(badge);
      const name = el('span', 'ww-seat-name', p.id === v.me.id ? msg("{p0} (tú)", { p0: p.name }) : p.name);
      const status = el('span', 'ww-seat-status', this.seatStatus(v, p, tally.get(p.id) ?? 0));
      seat.append(avatar, name, status);
      if (packMarks.get(p.id)) {
        const mark = el('span', 'ww-pack-mark');
        mark.append(colorIcon('werewolf', 16), el('span', '', `×${packMarks.get(p.id)}`));
        seat.append(mark);
      }
      if (v.phase === 'lobby' && p.bot && v.me.isLeader) {
        setDisplayAttribute(seat, "title", msg('Quitar bot'));
        seat.classList.add('is-removable');
        seat.addEventListener('click', () => this.ctx.send({ kind: 'remove_bot', id: p.id }));
      } else if (canPick) {
        seat.addEventListener('click', () => { this.selected = this.selected === p.id ? null : p.id; this.render(); });
      }
      table.append(seat);
    }
    if (v.phase === 'lobby') {
      for (let i = v.players.length; i < Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, v.players.length + 1)); i++) {
        const empty = el('div', 'ww-seat is-empty');
        empty.append(el('span', 'ww-avatar'), el('span', 'ww-seat-name', msg('Sitio libre')));
        table.append(empty);
      }
    }
    return table;
  }

  private seatStatus(v: WerewolvesView, p: WerewolvesView['players'][number], votes: number): string {
    if (!p.alive) return p.role ? roleInfo(p.role).name : t('Eliminado');
    if (v.phase === 'lobby') return p.bot ? 'Bot' : p.id === v.leaderId ? t('Anfitrión') : t('Listo');
    if (v.phase === 'reveal') return p.ready ? t('Listo') : t('Mirando su carta…');
    if (v.phase === 'day' || v.phase === 'verdict') {
      const target = p.votesFor === 'skip' ? t('nadie') : v.players.find((x) => x.id === p.votesFor)?.name;
      const got = votes ? t(votes===1?'{n} voto':'{n} votos',{n:votes}) : '';
      return [got, target ? t('Vota a {name}',{name:target}) : ''].filter(Boolean).join(' · ') || t('Pensando…');
    }
    if (v.phase === 'end' && p.role) return roleInfo(p.role).name;
    return p.role && p.id !== v.me.id ? roleInfo(p.role).name : '';
  }

  private selectableTargets(v: WerewolvesView): string[] {
    if (v.turn && !v.me.acted) return v.turn.step === 'witch' ? (v.turn.canPoison ? v.turn.targets : []) : v.turn.targets;
    if (v.turn?.step === 'wolves') return v.turn.targets;
    if (v.phase === 'day' && v.canVote) return v.voteTargets;
    return [];
  }

  private myCard(v: WerewolvesView): HTMLElement {
    const card = el('div', 'ww-card');
    if (v.phase === 'lobby' || !v.me.role) {
      card.append(el('h3', '', v.phase === 'lobby' ? msg('Cartas en juego') : msg('Partida en curso')));
      if (!v.deck.length) card.append(el('p', 'ww-muted', msg("Hacen falta al menos {p0} jugadores para repartir cartas.", { p0: MIN_PLAYERS })));
      const counts = new Map<WerewolfRole, number>();
      for (const r of v.deck) counts.set(r, (counts.get(r) ?? 0) + 1);
      const list = el('ul', 'ww-deck');
      for (const [role, n] of counts) {
        const item = el('li');
        item.append(colorIcon(role, 22), el('strong', '', `${n} × ${n === 1 ? roleInfo(role).name : roleInfo(role).plural}`), el('span', '', roleInfo(role).goal));
        list.append(item);
      }
      card.append(list);
      if (v.phase !== 'lobby') card.append(el('p', 'ww-muted', msg('Estás mirando. Podrás sentarte en la siguiente partida.')));
      return card;
    }
    const role = v.me.role;
    card.classList.add('is-role', `is-${roleInfo(role).team}`);
    const art = el('div', 'ww-card-art');
    art.append(colorIcon(role, 56, roleInfo(role).name));
    card.append(art, el('div', 'ww-card-team', roleInfo(role).team === 'lobos' ? msg('Equipo lobos') : roleInfo(role).team==='solo'?msg('Victoria individual'):msg('Equipo aldea')),
      el('h3', '', roleInfo(role).name), el('p', '', roleInfo(role).goal));
    if (v.loverId) card.append(el('p', 'ww-muted', msg("Tu vínculo: {p0}", { p0: v.players.find(p => p.id === v.loverId)?.name ?? '' })));
    if (v.peeked.length) card.append(el('p', 'ww-muted', msg("Has visto a: {p0}", { p0: v.peeked.map(id => v.players.find(p => p.id === id)?.name).join(', ') })));
    if (!v.me.alive && v.phase !== 'end') card.append(el('p', 'ww-muted', msg('Has sido eliminado. Puedes hablar, pero tu cámara permanece apagada.')));
    const allies = v.players.filter(p=>v.pack.includes(p.id));
    if (allies.length) card.append(el('p', 'ww-muted', msg("Tu manada: {p0}.", { p0: allies.map((p) => p.name).join(', ') })));
    if (v.seerSeen.length) {
      const seen = el('ul', 'ww-seen');
      for (const s of v.seerSeen) {
        const who = v.players.find((p) => p.id === s.id)?.name ?? '¿?';
        const li = el('li');
        li.append(colorIcon(s.role, 18), el('span', '', `${who}: ${roleInfo(s.role).name}`));
        seen.append(li);
      }
      card.append(el('h4', '', msg('Lo que has visto')), seen);
    }
    for(const info of v.privateInfo)card.append(el('p','ww-muted',msg(info.text,info.params)));
    return card;
  }

  private actionBox(v: WerewolvesView): HTMLElement {
    const box = el('div', 'ww-action');
    const name = (id: string | null) => v.players.find((p) => p.id === id)?.name ?? '';
    const primary = (label: DisplayText, action: () => void, enabled = true) => {
      const b = btn(label, 'ww-btn ww-btn-primary');
      b.disabled = !enabled;
      b.addEventListener('click', action);
      box.append(b);
      return b;
    };
    const secondary = (label: DisplayText, action: () => void) => {
      const b = btn(label, 'ww-btn');
      b.addEventListener('click', action);
      box.append(b);
      return b;
    };

    if(v.successorTargets.length){for(const id of v.successorTargets)primary(msg('Nombrar a {name}',{name:name(id)}),()=>this.ctx.send({kind:'successor',target:id}));return box;}
    if(v.scapegoatTargets.length){const chosen=new Set<string>();for(const id of v.scapegoatTargets){const label=el('label','ww-check',name(id)),check=el('input');check.type='checkbox';check.onchange=()=>{if(check.checked)chosen.add(id);else chosen.delete(id);};label.prepend(check);box.append(label);}primary(msg('Confirmar votantes'),()=>this.ctx.send({kind:'scapegoat_vote',targets:[...chosen]}));return box;}
    if(v.canInherit){primary(msg('Tomar la carta del condenado'),()=>this.ctx.send({kind:'inherit',use:true}));secondary(msg('Conservar mi carta'),()=>this.ctx.send({kind:'inherit',use:false}));}
    if(v.canJudge)secondary(msg('Pedir una segunda votación'),()=>this.ctx.send({kind:'judge'}));
    if(v.housingOffer){box.append(el('p','',msg('Te ofrecen: {building}.',{building:msg(BUILDING_INFO[v.housingOffer])})));primary(msg('Aceptar edificio'),()=>this.ctx.send({kind:'housing',accept:true}));secondary(msg('Seguir sin edificio'),()=>this.ctx.send({kind:'housing',accept:false}));}
    this.buildingControls(v,box);
    if(v.turn&&!['cupid','wolves','seer','guard','witch'].includes(v.turn.step)){
      if(v.me.acted){box.append(el('p','',msg('Hecho. Vuelve a cerrar los ojos.')));return box;}
      const turn=v.turn,chosen=new Set<string>();let choice=turn.choices?.[0];
      if(turn.choices?.length){const select=el('select','sv-select');setDisplayAttribute(select,'aria-label',msg('Elegir poder'));for(const value of turn.choices){let label=value;const role=value.includes(':')?value.split(':')[1]:value;if(Object.hasOwn(ROLE_INFO,role))label=roleInfo(role as WerewolfRole).name;else label=t(SPIRIT_QUESTIONS[value]??({village:'Equipo aldea',wolves:'Equipo lobos',infect:'Infectar a la víctima',skip:'Pasar'} as Record<string,string>)[value]??value);const option=el('option','',label);option.value=value;select.append(option);}select.onchange=()=>choice=select.value;box.append(select);}
      if((turn.chooseCount??1)>1){for(const id of turn.targets){const label=el('label','ww-check',name(id)),check=el('input');check.type='checkbox';check.onchange=()=>{if(check.checked&&chosen.size<(turn.chooseCount??1))chosen.add(id);else{chosen.delete(id);check.checked=false;}};label.prepend(check);box.append(label);}}
      primary(msg('Confirmar poder'),()=>this.ctx.send({kind:'power',targets:(turn.chooseCount??1)>1?[...chosen]:this.selected?[this.selected]:[],choice}),!!turn.choices?.length||!turn.targets.length||(turn.chooseCount??1)>1||!!this.selected);
      if(turn.optional)secondary(msg('Pasar'),()=>this.ctx.send({kind:'power',use:false}));return box;
    }
    if (v.phase === 'hunter' && v.hunterTargets.length) {
      for (const id of v.hunterTargets) primary(msg("Disparar a {p0}", { p0: name(id) }), () => this.ctx.send({ kind: 'hunter', target: id }));
      secondary(msg('No disparar'), () => this.ctx.send({ kind: 'hunter', target: null })); return box;
    }
    if (v.phase === 'night' && v.me.alive && v.me.role === 'girl' && v.step === 'wolves' && !v.me.acted) {
      box.append(el('p', '', msg('Espiar revela un lobo. Riesgo de ser descubierta: 33 %.')));
      primary(msg('Espiar'), () => this.ctx.send({ kind: 'peek', spy: true }));
      secondary(msg('No espiar'), () => this.ctx.send({ kind: 'peek', spy: false })); return box;
    }
    if (v.turn?.step === 'cupid' && !v.me.acted) {
      const selects = [el('select', 'sv-select'), el('select', 'sv-select')];
      selects.forEach((input, i) => { setDisplayAttribute(input, 'aria-label', msg("Enamorado {p0}", { p0: i + 1 })); for (const id of v.turn!.targets) { const o = el('option', '', name(id)); o.value = id; input.append(o); } box.append(input); });
      if (selects[1].options.length > 1) selects[1].selectedIndex = 1;
      primary(msg('Unir enamorados'), () => this.ctx.send({ kind: 'cupid', targets: [selects[0].value, selects[1].value] })); return box;
    }
    switch (v.phase) {
      case 'execution':box.append(el('p','',msg('Esperando posibles intervenciones…')));break;
      case 'succession':case 'scapegoat':box.append(el('p','',msg('Esperando la última decisión…')));break;
      case 'hunter': box.append(el('p', '', msg('El cazador decide su último disparo…'))); break;
      case 'lobby': {
        if (!v.me.seated) {
          box.append(el('p', '', msg('Siéntate junto al fuego para jugar.')));
          primary(msg('Sentarme a la mesa'), () => this.ctx.send({ kind: 'join', ...this.ctx.me() }));
          if(!v.me.isLeader)break;
        }
        if (v.me.isLeader) {
          const need = MIN_PLAYERS - v.players.length;
          box.append(el('p', '', need > 0 ? msg("Faltan {p0} jugador{p1}. Espera a tus vecinos o añade bots.", { p0: need, p1: need === 1 ? '' : 'es' }) : msg('Todo listo. Cuando empieces, cada uno recibirá una carta al azar.')));
          const add = secondary(msg('Añadir bot'), () => this.ctx.send({ kind: 'add_bot' }));
          add.disabled = v.players.length >= MAX_PLAYERS;
          const pets=this.ctx.pets?.()??[];if(pets.length){const select=el('select');setDisplayAttribute(select,'aria-label',msg('Elegir mascota'));for(const pet of pets){const o=el('option','',pet.name);o.value=pet.id;select.append(o);}box.append(select);const addPet=secondary(msg('Añadir mascota bot'),()=>{const pet=pets.find(p=>p.id===select.value);if(pet)this.ctx.send({kind:'add_bot',pet});});addPet.disabled=v.players.length>=MAX_PLAYERS;}
          primary(msg('Repartir cartas'), () => this.ctx.send({ kind: 'start' }), v.players.length >= MIN_PLAYERS && !v.deckError);
          if (v.players.some((p) => p.bot)) box.append(el('p', 'ww-muted', msg('Pulsa un bot para quitarlo.')));
        } else {
          primary(msg('Repartir cartas'),()=>{},false);
          box.append(el('p', '', msg("Esperando a que {p0} reparta las cartas…", { p0: name(v.leaderId) || t('el anfitrión') })));
        }
        if(v.me.seated)secondary(msg('Levantarme'), () => this.ctx.send({ kind: 'leave' }));
        break;
      }
      case 'reveal':
        if (v.me.seated) {
          if (v.me.acted) box.append(el('p', '', msg('Esperando a los demás…')));
          else primary(msg('Entendido'), () => this.ctx.send({ kind: 'ready' }));
        }
        break;
      case 'night': {
        const turn = v.turn;
        if (!turn) {
          box.classList.add('is-sleeping');
          box.append(el('p', 'ww-sleep', v.me.alive ? msg('Cierra los ojos… no es tu turno.') : msg('Observas la noche en silencio.')));
          break;
        }
        if (turn.step === 'wolves') {
          box.append(el('p', '', v.me.acted ? msg('Has elegido. Puedes cambiar mientras tu manada decide.') : msg('Elige a quién atacar esta noche.')));
          primary(this.selected ? msg("Atacar a {p0}", { p0: name(this.selected) }) : msg('Elige una víctima'), () => this.selected && this.ctx.send({ kind: 'wolf_vote', target: this.selected }), !!this.selected);
        } else if (v.me.acted) {
          box.append(el('p', '', msg('Hecho. Vuelve a cerrar los ojos.')));
        } else if (turn.step === 'seer') {
          box.append(el('p', '', msg('Elige la carta de quién quieres mirar.')));
          primary(this.selected ? msg("Mirar la carta de {p0}", { p0: name(this.selected) }) : msg('Elige a alguien'), () => this.selected && this.ctx.send({ kind: 'seer_look', target: this.selected }), !!this.selected);
        } else if (turn.step === 'guard') {
          box.append(el('p', '', turn.lastGuarded ? msg("Elige a quién proteger (anoche: {p0}).", { p0: name(turn.lastGuarded) }) : msg('Elige a quién proteger esta noche. Puedes ser tú.')));
          primary(this.selected ? msg("Proteger a {p0}", { p0: name(this.selected) }) : msg('Elige a alguien'), () => this.selected && this.ctx.send({ kind: 'guard', target: this.selected }), !!this.selected);
        } else {
          box.append(el('p', '', turn.victim ? msg("Los lobos han atacado a {p0}.", { p0: name(turn.victim) }) : msg('Esta noche los lobos no han atacado a nadie.')));
          if (turn.canHeal) {
            const toggle = el('label', 'ww-check');
            const input = el('input');
            input.type = 'checkbox';
            input.checked = this.heal;
            input.addEventListener('change', () => { this.heal = input.checked; this.render(); });
            toggle.append(input, el('span', '', msg("Salvar a {p0} (poción de vida)", { p0: name(turn.victim) })));
            box.append(toggle);
          }
          box.append(el('p', 'ww-muted', turn.canPoison ? msg('Pulsa a alguien si quieres envenenarlo (opcional).') : msg('Ya usaste tu poción de veneno.')));
          const label = [this.heal ? t('Salvar') : '', this.selected ? t('Envenenar a {name}',{name:name(this.selected)}) : ''].filter(Boolean).join(t(' y '));
          primary(label ? msg("Usar: {p0}", { p0: label }) : msg('No usar pociones'), () => this.ctx.send({ kind: 'witch', heal: this.heal, poison: this.selected }));
        }
        break;
      }
      case 'dawn':
        if (v.nightDeaths.length) {
          for (const id of v.nightDeaths) {
            const p = v.players.find((x) => x.id === id);
            const row = el('p', 'ww-death');
            row.append(colorIcon('dead', 20), el('span', '', `${p?.name ?? '¿?'} · ${p?.role ? roleInfo(p.role).name : ''}`));
            box.append(row);
          }
        } else box.append(el('p', '', msg('Todos despiertan sanos y salvos.')));
        if (v.me.isLeader) secondary(msg('Empezar el día'), () => this.ctx.send({ kind: 'continue' }));
        break;
      case 'day': {
        if (!v.canVote) { box.append(el('p', 'ww-muted', msg('No puedes votar en este consejo.'))); break; }
        const mine = v.players.find((p) => p.id === v.me.id)?.votesFor;
        if (mine) box.append(el('p', '', msg("Tu voto: {p0}. Puedes cambiarlo.", { p0: mine === 'skip' ? t('No eliminar a nadie') : name(mine) })));
        else box.append(el('p', '', msg('Pulsa a alguien y vota.')));
        primary(this.selected ? msg("Votar a {p0}", { p0: name(this.selected) }) : msg('Elige a alguien'), () => this.selected && this.ctx.send({ kind: 'vote', target: this.selected }), !!this.selected);
        secondary(msg('No eliminar a nadie'), () => this.ctx.send({ kind: 'vote', target: 'skip' }));
        break;
      }
      case 'verdict': {
        const p = v.verdict?.id ? v.players.find((x) => x.id === v.verdict!.id) : null;
        if (p) {
          const row = el('p', 'ww-death');
          row.append(colorIcon(p.role ?? 'dead', 22), el('span', '', msg("{p0} era {p1}.", { p0: p.name, p1: p.role ? roleInfo(p.role).name.toLowerCase() : '¿?' })));
          box.append(row);
        } else box.append(el('p', '', v.verdict?.tie ? msg('Empate: nadie es eliminado.') : msg('Nadie es eliminado hoy.')));
        if (v.me.isLeader) secondary(msg('Caer la noche'), () => this.ctx.send({ kind: 'continue' }));
        break;
      }
      case 'end': {
        const banner = el('div', `ww-winner is-${v.winner}`);
        banner.append(colorIcon(v.winner === 'lobos' ? 'werewolf' : 'trophy', 36), el('strong', '', this.winnerText(v)));
        box.append(banner);
        if (v.me.isLeader) primary(msg('Jugar otra vez'), () => this.ctx.send({ kind: 'play_again' }));
        if (v.me.seated) secondary(msg('Levantarme'), () => this.ctx.send({ kind: 'leave' }));
        break;
      }
    }
    return box;
  }

  private winnerText(v:WerewolvesView):string {
    const keys:Record<string,string>={aldea:'¡La aldea gana!',lobos:'¡Los hombres lobo ganan!',lovers:'¡Ganan los enamorados!',whitewolf:'¡Gana el lobo blanco!',piper:'¡Gana el flautista!',cultist:'¡Gana el sectario!',angel:'¡Gana el ángel!',nobody:'No quedan supervivientes.'};return t(keys[v.winner??'']??'Fin de la partida');
  }
  private settings(v:WerewolvesView):HTMLElement {
    const box=el('details','ww-card ww-settings');box.open=this.settingsOpen;const summary=el('summary','');const heading=el('span','ww-summary-title',msg('Ajustes de partida'));heading.prepend(monoIcon('gear',20));summary.append(heading);summary.onclick=e=>{e.preventDefault();this.settingsOpen=!this.settingsOpen;box.open=this.settingsOpen;};box.append(summary);
    const content=el('div','ww-settings-content');box.append(content);
    const toggle=(text:string,description:string,checked:boolean,change:(on:boolean)=>void)=>{const label=el('label','ww-setting-switch'),check=el('input');check.type='checkbox';check.checked=checked;check.disabled=!v.me.isLeader;setDisplayAttribute(check,'aria-label',msg(text));check.onchange=()=>change(check.checked);const textBox=el('span','');textBox.append(el('strong','',msg(text)),el('small','',msg(description)));label.append(check,textBox);content.append(label);};
    toggle('Elegir alcalde','Su voto cuenta doble y decide quién le sucede.',v.mayorEnabled,on=>this.ctx.send({kind:'mayor_setting',enabled:on}));
    toggle('Edificios y oficios','Los edificios añaden poderes públicos a las cartas. Se reparten al comenzar.',v.settings.buildings,on=>this.ctx.send({kind:'settings',value:{buildings:on}}));
    const guide=el('details','ww-building-guide');guide.append(el('summary','',msg('Qué hace cada edificio')));const list=el('dl','');for(const role of Object.keys(BUILDING_INFO)as VillageBuilding[])list.append(el('dt','',msg(BUILDING_INFO[role])),el('dd','',msg(BUILDING_HELP[role])));guide.append(list);content.append(guide);
    toggle('Eventos seleccionados','Cinco eventos adaptados. La médium usa preguntas de espiritismo digitales.',v.settings.events,on=>this.ctx.send({kind:'settings',value:{events:on}}));
    const timers=el('div','ww-setting-timers');for(const[key,text,min,max]of [['daySeconds','Segundos de debate',30,300],['nightSeconds','Segundos por poder',10,120]]as const){const label=el('label','',msg(text)),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.value=String(v.settings[key]);input.disabled=!v.me.isLeader;setDisplayAttribute(input,'aria-label',msg(text));input.onchange=()=>this.ctx.send({kind:'settings',value:{[key]:Number(input.value)}});label.append(input);timers.append(label);}content.append(timers);return box;
  }
  private buildingControls(v:WerewolvesView,box:HTMLElement):void {
    if(v.myBuilding){const note=el('div','ww-building-note');note.append(el('strong','',msg('Tu edificio: {building}.',{building:msg(BUILDING_INFO[v.myBuilding])})),el('p','',msg(BUILDING_HELP[v.myBuilding])));box.append(note);}
    const name=(id:string)=>v.players.find(p=>p.id===id)?.name??id;
    const select=(ids:string[],label='Elegir persona')=>{if(!ids.length)return null;const input=el('select','sv-select');setDisplayAttribute(input,'aria-label',msg(label));for(const id of ids){const option=el('option','',name(id));option.value=id;input.append(option);}box.append(input);return input;};
    const action=(label:string,run:()=>void)=>{const button=btn(msg(label));button.onclick=run;box.append(button);};
    if(v.buildingAvailable){const role=v.myBuilding;
      if(role==='church'||role==='healer'||role==='barber'){
        const eligible=v.buildingTargets.filter(id=>id!==v.me.id&&(role==='church'||role==='barber'&&v.buildings.some(b=>b.id===id&&b.kind)||role==='healer'&&v.buildings.some(b=>b.id===id&&b.used&&['church','healer','manor','barber'].includes(b.kind??''))));const target=select(eligible);
        if(target)action(role==='church'?'Confesar':role==='healer'?'Restaurar poder del edificio':'Usar la navaja',()=>this.ctx.send({kind:'building',target:target.value}));else box.append(el('p','ww-muted',msg('Todavía no hay un objetivo para este poder.')));
      }
      if(role==='school'){const chosen=new Set<string>();for(const id of v.buildingTargets.filter(id=>id!==v.me.id&&v.buildings.find(b=>b.id===id)?.kind)){const label=el('label','ww-check',name(id)),check=el('input');check.type='checkbox';check.onchange=()=>{if(check.checked&&chosen.size<2)chosen.add(id);else{chosen.delete(id);check.checked=false;}};label.prepend(check);box.append(label);}action('Impedir estos votos',()=>this.ctx.send({kind:'building',targets:[...chosen]}));}
      if(role==='manor'&&v.phase==='execution')action('Indultar al condenado',()=>this.ctx.send({kind:'building'}));
      if(role==='bailiff'){
        const vacant=v.buildings.filter(b=>b.kind&&b.kind!=='bailiff'&&!v.players.find(p=>p.id===b.id)?.alive),people=v.buildingTargets.filter(id=>!v.buildings.find(b=>b.id===id)?.kind);
        if(vacant.length&&people.length){const target=select(people)!,build=el('select','sv-select');setDisplayAttribute(build,'aria-label',msg('Edificio disponible'));for(const b of vacant){const option=el('option','',msg(BUILDING_INFO[b.kind!]));option.value=b.kind!;build.append(option);}box.append(build);action('Asignar edificio vacío',()=>this.ctx.send({kind:'building',target:target.value,choice:build.value}));}
        else box.append(el('p','ww-muted',msg('Hace falta una casa vacía y alguien sin edificio para ofrecer alojamiento.')));
      }
    }
    if(v.settings.events&&v.phase==='day'){
      if(v.mayorId===v.me.id){const target=select(v.buildingTargets.filter(id=>id!==v.me.id));if(target)action('Nombrar pregonero',()=>this.ctx.send({kind:'warden',target:target.value}));}
      if(v.wardenId===v.me.id&&!v.event)for(const event of v.events)action(EVENT_INFO[event],()=>this.ctx.send({kind:'event',event}));
    }
  }

  private logBox(v: WerewolvesView): HTMLElement {
    const box = el('ol', 'ww-log');
    setDisplayAttribute(box, 'aria-label', msg('Narrador'));
    for (const entry of [...v.log].reverse().slice(0, 12)) {
      const li = el('li');
      li.append(colorIcon(entry.icon, 16), el('span', '', msg(entry.text, Object.fromEntries(Object.entries(entry.params ?? {}).map(([key, value]) => [key, key === 'name' || key === 'target' ? value : typeof value === 'string' ? msg(value) : value])))));
      box.append(li);
    }
    return box;
  }
}
