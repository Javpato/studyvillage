import type { AppActions, AppView, PublicIdentity } from '../../../packages/core/src/protocol/types';
import { msg, t, getLanguage, setDisplayText, type DisplayText } from '../i18n';
import { emptyVoice, VOICE_GAMES } from '../../../packages/runtime/src/media/voice';
const node = (tag: string, text?: DisplayText) => { const e = document.createElement(tag); if (text) setDisplayText(e, text); return e; };
const button = (text: DisplayText, action: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sv-button sv-button-small'; setDisplayText(b, text); b.onclick = action; return b; };
const games = { tetris:msg('Bloques del Bosque'), werewolves: msg('Hombres lobo'), gartic: msg('Gartic Phone'), study: msg('Quiz de estudio') };
export class VoicePanel {
  readonly root = node('section');
  private signature = '';
  private draft = '';
  constructor(private actions: Pick<AppActions, 'voiceCommand'>) { this.root.className = 'sv-voice-channels'; }
  refresh(view: AppView): void {
    const voice = view.network.voice ?? emptyVoice(), me = view.identity.fingerprint;
    const directory = view.network.voiceDirectory ?? view.network.members.filter(m => m.connected).map(m => m.identity);
    const signature = JSON.stringify([voice, directory, view.network.phase, getLanguage()]);
    if (signature === this.signature) return; this.signature = signature;
    this.root.replaceChildren(); this.root.hidden = view.network.phase !== 'JOINED'; if (this.root.hidden) return;
    const name = (id: string) => directory.find(p => p.fingerprint === id)?.displayName ?? id.slice(0, 8);
    const send = this.actions.voiceCommand.bind(this.actions);
    this.root.append(node('h3', msg('Canales de voz')));
    const current = voice.selected;
    const title = current?.kind === 'call' ? msg('Llamada directa con {name}', { name: name(current.members.find(id => id !== me) ?? '') })
      : current?.kind === 'party' ? msg('Grupo: {name}', { name: current.name })
      : current?.game ? msg('Juego: {name}', { name: games[current.game] }) : msg('Ubicación');
    this.root.append(node('strong', title));
    if (current) {
      this.root.append(button(msg('Volver a voz de ubicación'), () => send({ action: 'leave' })));
      const members = node('div'); members.className = 'sv-private-list';
      for (const id of current.members) {
        const row = node('div', name(id));
        if (current.owner === me && id !== me && current.kind === 'party') row.append(button(msg('Quitar del grupo'), () => send({ action: 'remove', target: id })));
        members.append(row);
      }
      this.root.append(members);
    }
    for (const invitation of voice.invitations) {
      const row = node('div'); row.className = 'sv-private-request';
      row.append(node('span', invitation.kind === 'call' ? msg('{name} te llama', { name: name(invitation.from) }) : msg('{name} te invita a {party}', { name: name(invitation.from), party: invitation.name })),
        button(msg('Aceptar'), () => send({ action: 'respond', invitation: invitation.id, accept: true })),
        button(msg('Rechazar'), () => send({ action: 'respond', invitation: invitation.id, accept: false })));
      this.root.append(row);
    }
    for (const invitation of voice.outgoing) this.root.append(node('p', msg('Esperando a {p0}…', { p0: name(invitation.to) })), button(msg('Cancelar'), () => send({ action: 'cancel', invitation: invitation.id })));
    for (const event of voice.events) this.root.append(node('p', event.status === 'accepted' ? msg('Invitación aceptada: {name}', { name: name(event.from === me ? event.to : event.from) }) : event.status === 'declined' ? msg('Invitación rechazada: {name}', { name: name(event.from === me ? event.to : event.from) }) : msg('Invitación cancelada: {name}', { name: name(event.from === me ? event.to : event.from) })));
    const callList = node('details'); callList.append(node('summary', msg('Llamada directa')));
    this.people(callList, directory.filter(p => p.fingerprint !== me), p => send({ action: 'call', target: p.fingerprint }));
    this.root.append(callList);
    if (current?.kind === 'party' && current.owner === me) {
      const invite = node('details'); invite.append(node('summary', msg('Invitar al grupo')));
      this.people(invite, directory.filter(p => p.fingerprint !== me && !current.members.includes(p.fingerprint)), p => send({ action: 'invite', target: p.fingerprint }));
      this.root.append(invite);
    }
    const create = node('details'); create.append(node('summary', msg('Crear grupo')));
    const input = document.createElement('input'); input.className = 'sv-input'; input.maxLength = 48; input.value = this.draft;
    input.setAttribute('aria-label', t('Nombre del grupo')); input.oninput = () => { this.draft = input.value; };
    create.append(input, button(msg('Crear grupo'), () => { const name = input.value.trim(); if (name) send({ action: 'create', name }); }));
    this.root.append(create);
    const gameList = node('details'); gameList.append(node('summary', msg('Voz de juegos')));
    for (const game of VOICE_GAMES) gameList.append(button(games[game], () => send({ action: 'game', game })));
    this.root.append(gameList, node('p', msg('Solo el canal seleccionado te escucha. Los grupos y llamadas siguen conectados al cambiar de lugar.')));
  }
  private people(parent: HTMLElement, people: PublicIdentity[], action: (person: PublicIdentity) => void): void {
    if (!people.length) parent.append(node('p', msg('No hay más personas conectadas.')));
    for (const person of people) parent.append(button(person.displayName, () => action(person)));
  }
}
