/**
 * Ajustes → Servidores: save a self-hosted server, check it, connect, and (for
 * its administrator) manage capacity and private invitations. The form is
 * built once; only the status area changes, so typed values survive updates
 * and language changes.
 */
import { msg, t, setDisplayText, setDisplayAttribute, formatDate, type DisplayText } from '../i18n';
import { errorMessage } from '../errors/messages';
import { MAX_NEIGHBORHOODS, MAX_ONLINE, neighborhoodsFor, type InviteView } from '../../../packages/runtime/src/server/contracts';
import type { AppActions, AppView, BoardStroke } from '../../../packages/core/src/protocol/types';

const SAVED_KEY = 'studyvillage-servers-v1';
interface SavedServer { url: string; name: string }
function loadSaved(): SavedServer[] {
  try { const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(list) ? list.filter(s => typeof s?.url === 'string').slice(0, 20) : []; } catch { return []; }
}
function storeSaved(list: SavedServer[]): void { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* Private mode: the list lives for this session only. */ } }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: DisplayText = '', cls = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); if (text) setDisplayText(e, text); if (cls) e.className = cls; return e; }
function button(text: DisplayText, fn: () => void, cls = 'sv-button'): HTMLButtonElement { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
function field(label: DisplayText, control: HTMLElement, hint?: DisplayText): HTMLLabelElement {
  const l = el('label', '', 'sv-field'); const span = el('span', label); l.append(span, control); if (hint) l.append(el('small', hint, 'sv-subtle')); return l;
}
function input(type: string, label: DisplayText, max = 200): HTMLInputElement { const i = el('input', '', 'sv-input'); i.type = type; i.maxLength = max; i.autocomplete = 'off'; i.spellcheck = false; setDisplayAttribute(i, 'aria-label', label); return i; }

export interface ServersContext { actions: AppActions; notify(message: string): void; ownBoards(): { ref: string; strokes: BoardStroke[] }[] }

export class ServersPanel {
  readonly root = el('div', '', 'sv-servers');
  private readonly status = el('div', '', 'sv-servers-status');
  private readonly connectBox = el('div', '', 'sv-servers-connect');
  private readonly connectedBox = el('div', '', 'sv-servers-connected');
  private readonly adminBox = el('details', '', 'sv-servers-admin');
  private readonly savedList = el('div', '', 'sv-servers-saved');
  private readonly url = input('url', msg('Dirección del servidor'));
  private readonly invite = input('text', msg('Invitación del servidor'), 64);
  private readonly claim = input('password', msg('Secreto de instalación'), 128);
  private readonly claimField: HTMLLabelElement;
  private readonly info = el('p', '', 'sv-subtle');
  private readonly identityNote = el('p', '', 'sv-subtle');
  private readonly placeLine = el('p');
  private readonly devices = el('div','','sv-server-devices');
  private readonly travelRow = el('div', '', 'sv-inline');
  private readonly importButton: HTMLButtonElement;
  private readonly capacity = input('number', msg('Personas conectadas a la vez'), 2);
  private readonly capacityHint = el('small', '', 'sv-subtle');
  private readonly inviteLabel = input('text', msg('Nombre de la invitación'), 40);
  private readonly inviteUses = input('number', msg('Usos'), 3);
  private readonly inviteHours = input('number', msg('Horas de validez'), 3);
  private readonly invitesList = el('ul', '', 'sv-servers-invites');
  private readonly created = el('div', '', 'sv-servers-created');
  private view: AppView | null = null;
  private busy = false;
  private lastRole: string | null = null;

  constructor(private readonly ctx: ServersContext) {
    this.url.placeholder = 'https://aldea.ejemplo.org';
    this.claimField = field(msg('Secreto de instalación (solo la primera vez)'), this.claim, msg('Lo muestra el servidor al instalarse. Convierte tu identidad guardada en la administradora.'));
    this.claimField.hidden = true;
    const check = button(msg('Comprobar'), () => void this.check());
    const connect = button(msg('Conectar'), () => void this.connect(), 'sv-button sv-button-primary');
    const row = el('div', '', 'sv-inline'); row.append(check, connect);
    this.connectBox.append(
      el('h3', msg('Servidor propio')),
      el('p', msg('Un servidor propio mantiene casas y pizarras aunque el administrador no esté. Lo instala y gestiona su dueño; esta app solo se conecta.'), 'sv-subtle'),
      this.savedList,
      field(msg('Dirección del servidor'), this.url),
      field(msg('Invitación del servidor'), this.invite, msg('Necesario la primera vez. Después vuelves sin invitación.')),
      this.claimField, this.identityNote, row, this.info,
    );
    this.importButton = button(msg('Importar mi casa y pizarras'), () => void this.importOwn());
    const leave = button(msg('Salir del servidor'), () => void this.run(() => this.ctx.actions.leave()));
    const actions = el('div', '', 'sv-inline'); actions.append(this.importButton, leave);
    this.connectedBox.append(el('h3', msg('Conectado')), this.placeLine, this.travelRow, el('p', msg('Importar copia tu casa y tus pizarras en el servidor. Los originales siguen en este equipo.'), 'sv-subtle'), actions);

    this.capacity.min = '1'; this.capacity.max = String(MAX_ONLINE); this.capacity.oninput = () => this.capacityPreview();
    this.inviteUses.min = '1'; this.inviteUses.max = '100'; this.inviteUses.value = '10';
    this.inviteHours.min = '1'; this.inviteHours.max = String(24 * 30); this.inviteHours.value = '72';
    const saveCapacity = button(msg('Guardar capacidad'), () => void this.saveCapacity());
    const createInvite = button(msg('Crear invitación privada'), () => void this.createInvite());
    const refresh = button(msg('Actualizar lista'), () => void this.loadInvites());
    const inviteRow = el('div', '', 'sv-servers-grid'); inviteRow.append(field(msg('Nombre de la invitación'), this.inviteLabel), field(msg('Usos'), this.inviteUses), field(msg('Horas de validez'), this.inviteHours));
    this.adminBox.append(el('summary', msg('Administrar servidor')),
      field(msg('Personas conectadas a la vez (1–24)'), this.capacity), this.capacityHint, saveCapacity,
      el('h4', msg('Invitaciones privadas')), inviteRow, createInvite, this.created, refresh, this.invitesList);
    this.adminBox.ontoggle = () => { if (this.adminBox.open) void this.loadInvites(); };
    this.root.append(this.status, this.devices, this.connectBox, this.connectedBox, this.adminBox);
    this.renderSaved();
  }

  update(view: AppView): void {
    this.view = view;
    const server = view.network.server;
    const connected = !!server && view.network.phase === 'JOINED';
    this.connectBox.hidden = connected;
    this.connectedBox.hidden = !connected;
    this.adminBox.hidden = !connected || server?.role !== 'admin';
    setDisplayText(this.identityNote, view.identitySaved
      ? (view.lockedIdentity ? msg('Desbloquea tu identidad guardada para entrar como residente.') : msg('Entrarás con tu identidad guardada: puedes tener parcela.'))
      : msg('Tu identidad es temporal: entrarás como visitante. Guárdala cifrada en Identidad para tener parcela.'));
    if (view.network.server && ['RECONNECTING', 'CONNECTING', 'AUTHENTICATING'].includes(view.network.phase)) setDisplayText(this.status, msg('Conectando con el servidor…'));
    else setDisplayText(this.status, '');
    this.devices.replaceChildren();
    const devices=server?.devices??view.network.devices??[];
    if(devices.length){
      this.devices.append(el('h4',msg('Mis dispositivos')));
      for(const device of devices){
        const row=el('p');row.textContent=`${device.name}${device.current?' · '+t('Este dispositivo'):''}${device.media?' · '+t('Voz y cámara'):''}`;this.devices.append(row);
        if(device.current&&!device.media)this.devices.append(button(msg('Usar voz y cámara aquí'),()=>this.ctx.actions.selectMediaDevice?.(device.id)));
      }
      this.devices.append(el('small',msg('Una sola casa y hasta tres dispositivos. La voz y la cámara se activan en uno a la vez.')));
    }
    if (!connected || !server) { this.syncBusy(); return; }
    const roles = { admin: msg('Administración'), resident: msg('Residente'), visitor: msg('Visitante') } as const;
    setDisplayText(this.placeLine, msg('{name} · {role} · Barrio {n} de {total} · {online}/{max} conectadas', {
      name: server.name, role: server.role ? roles[server.role] : '', n: server.neighborhood + 1, total: server.neighborhoods, online: server.online, max: server.maxOnline,
    }));
    this.importButton.hidden = server.role === 'visitor';
    setDisplayText(this.importButton, server.houseOnServer ? msg('Volver a importar mi casa y pizarras') : msg('Importar mi casa y pizarras'));
    this.travelRow.replaceChildren();
    if (server.neighborhood > 0) this.travelRow.append(button(msg('← Barrio {n}', { n: server.neighborhood }), () => void this.run(() => this.ctx.actions.travel(server.neighborhood - 1))));
    if (server.neighborhood < server.neighborhoods - 1) this.travelRow.append(button(msg('Barrio {n} →', { n: server.neighborhood + 2 }), () => void this.run(() => this.ctx.actions.travel(server.neighborhood + 1))));
    if (server.role !== this.lastRole || document.activeElement !== this.capacity) { this.capacity.value = String(server.maxOnline); this.capacityPreview(); }
    this.lastRole = server.role;
    this.syncBusy();
  }

  private syncBusy(): void {
    this.root.setAttribute('aria-busy', String(this.busy));
    for (const button of this.root.querySelectorAll('button')) button.disabled = this.busy;
  }

  private async run(work: () => Promise<unknown>): Promise<void> {
    if (this.busy) return; this.busy = true; this.syncBusy();
    try { await work(); } catch (error) { this.ctx.notify(errorMessage(error)); } finally { this.busy = false; this.syncBusy(); }
  }

  private renderSaved(): void {
    const saved = loadSaved(); this.savedList.replaceChildren();
    if (!saved.length) return;
    const list = el('ul', '', 'sv-servers-list');
    for (const item of saved) {
      const li = el('li');
      const use = button(item.name ? `${item.name} · ${item.url}` : item.url, () => { this.url.value = item.url; this.info.textContent = ''; }, 'sv-button sv-button-small');
      const forget = button(msg('Olvidar'), () => { storeSaved(loadSaved().filter(s => s.url !== item.url)); this.renderSaved(); }, 'sv-button sv-button-small');
      setDisplayAttribute(forget, 'aria-label', msg('Olvidar {url}', { url: item.url }));
      li.append(use, forget); list.append(li);
    }
    this.savedList.append(el('h4', msg('Servidores guardados')), list);
    this.syncBusy();
  }

  private async check(): Promise<boolean> {
    try {
      const info = await this.ctx.actions.checkServer(this.url.value);
      setDisplayText(this.info, msg('{name}: compatible · {online}/{max} conectadas', { name: info.name, online: info.online, max: info.maxOnline }));
      this.claimField.hidden = !info.needsClaim;
      const saved = loadSaved().filter(s => s.url !== this.url.value.trim());
      storeSaved([{ url: this.url.value.trim(), name: info.name }, ...saved]); this.renderSaved();
      return true;
    } catch (error) { this.info.textContent = errorMessage(error); return false; }
  }

  private async connect(): Promise<void> {
    await this.run(async () => {
      if (!await this.check()) return;
      await this.ctx.actions.connectServer(this.url.value, { invite: this.invite.value.trim(), claim: this.claim.value.trim() });
      this.claim.value = '';
      this.ctx.notify(t('Conectado al servidor.'));
    });
  }

  private async importOwn(): Promise<void> {
    await this.run(async () => {
      const result = await this.ctx.actions.importToServer(this.ctx.ownBoards());
      this.ctx.notify(t('Copiados tu casa y {objects} objetos de pizarra. Los originales siguen en este equipo.', { objects: result.objects }));
    });
  }

  private capacityPreview(): void {
    const value = Number(this.capacity.value);
    if (!Number.isInteger(value) || value < 1 || value > MAX_ONLINE) { setDisplayText(this.capacityHint, msg('Elige un número entre 1 y 24.')); return; }
    const existing = this.view?.network.server?.neighborhoods ?? 1;
    const needed = neighborhoodsFor(value);
    setDisplayText(this.capacityHint, msg('Necesita {needed} barrio(s) de seis parcelas (máximo {max}). Hay {existing}. Bajar la capacidad no borra barrios ni expulsa a nadie.', { needed, max: MAX_NEIGHBORHOODS, existing: Math.max(existing, needed) }));
  }

  private async saveCapacity(): Promise<void> {
    const value = Number(this.capacity.value);
    if (!Number.isInteger(value) || value < 1 || value > MAX_ONLINE) { this.ctx.notify(t('Elige un número entre 1 y 24.')); return; }
    await this.run(async () => { await this.ctx.actions.serverRequest({ op: 'admin.capacity', maxOnline: value }); this.ctx.notify(t('Capacidad guardada.')); });
  }

  private async createInvite(): Promise<void> {
    const uses = Number(this.inviteUses.value), hours = Number(this.inviteHours.value);
    if (!Number.isInteger(uses) || uses < 1 || uses > 100 || !Number.isInteger(hours) || hours < 1 || hours > 720) { this.ctx.notify(t('Revisa los usos (1–100) y las horas (1–720).')); return; }
    await this.run(async () => {
      const created = await this.ctx.actions.serverRequest({ op: 'admin.invite.create', label: this.inviteLabel.value.trim(), uses, hours }) as InviteView & { code: string };
      const address = this.view?.network.server?.url ?? '';
      const text = `${t('Servidor')}: ${address}\n${t('Invitación')}: ${created.code}`;
      this.created.replaceChildren();
      const box = el('textarea', '', 'sv-input'); box.readOnly = true; box.rows = 2; box.value = text; setDisplayAttribute(box, 'aria-label', msg('Invitación creada'));
      const copy = button(msg('Copiar invitación'), () => { void navigator.clipboard.writeText(text).then(() => this.ctx.notify(t('Invitación copiada.'))).catch(() => { box.select(); this.ctx.notify(t('Selecciona y copia el texto.')); }); });
      this.created.append(el('p', msg('Compártela solo con quien quieras invitar. No se volverá a mostrar.'), 'sv-subtle'), box, copy);
      this.syncBusy();
      await this.loadInvites();
    });
  }

  private async loadInvites(): Promise<void> {
    try {
      const invites = await this.ctx.actions.serverRequest({ op: 'admin.invite.list' }) as InviteView[];
      this.invitesList.replaceChildren();
      if (!invites.length) { this.invitesList.append(el('li', msg('Todavía no hay invitaciones.'))); return; }
      for (const invite of invites) {
        const state = invite.revoked ? msg('revocada') : invite.expiresAt <= Date.now() ? msg('caducada') : invite.used >= invite.uses ? msg('agotada') : msg('activa');
        const li = el('li');
        li.append(el('span', msg('{label} · {used}/{uses} usos · hasta {date} · {state}', { label: invite.label || '—', used: invite.used, uses: invite.uses, date: formatDate(invite.expiresAt, { dateStyle: 'short', timeStyle: 'short' }), state })));
        if (!invite.revoked) li.append(button(msg('Revocar'), () => void this.run(async () => { await this.ctx.actions.serverRequest({ op: 'admin.invite.revoke', id: invite.id }); await this.loadInvites(); }), 'sv-button sv-button-small'));
        this.invitesList.append(li);
      }
    } catch (error) { this.ctx.notify(errorMessage(error)); }
    finally { this.syncBusy(); }
  }
}
