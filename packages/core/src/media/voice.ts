import { z } from 'zod';

const person = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/);
export const VOICE_GAMES = ['werewolves', 'gartic', 'study'] as const;
export const voiceCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('call'), target: person.nullable() }),
  z.strictObject({ action: z.literal('create'), name: z.string().trim().min(1).max(48) }),
  z.strictObject({ action: z.literal('invite'), target: person }),
  z.strictObject({ action: z.literal('respond'), invitation: id, accept: z.boolean() }),
  z.strictObject({ action: z.literal('cancel'), invitation: id }),
  z.strictObject({ action: z.literal('remove'), target: person }),
  z.strictObject({ action: z.literal('leave') }),
  z.strictObject({ action: z.literal('game'), game: z.enum(VOICE_GAMES) }),
  z.strictObject({ action: z.literal('game.end'), game: z.enum(VOICE_GAMES) }),
]);
export type VoiceCommand = z.infer<typeof voiceCommandSchema>;
export const voiceChannelSchema = z.strictObject({ id, kind: z.enum(['call', 'party', 'game']), name: z.string().max(48), owner: person, members: z.array(person).max(24), game: z.enum(VOICE_GAMES).optional(), origin: z.string().max(80).optional() });
export type VoiceChannel = z.infer<typeof voiceChannelSchema>;
const invitationSchema = z.strictObject({ id, from: person, to: person, kind: z.enum(['call', 'party']), channel: id.nullable(), name: z.string().max(48) });
export type VoiceInvitation = z.infer<typeof invitationSchema>;
const eventSchema = invitationSchema.extend({ status: z.enum(['accepted', 'declined', 'canceled']) });
export const voiceViewSchema = z.strictObject({ selected: voiceChannelSchema.nullable(), invitations: z.array(invitationSchema).max(48), outgoing: z.array(invitationSchema).max(48), busy: z.array(person).max(24), events: z.array(eventSchema).max(8).default([]) });
export type VoiceView = z.infer<typeof voiceViewSchema>;
export const emptyVoice = (): VoiceView => ({ selected: null, invitations: [], outgoing: [], busy: [], events: [] });

/** Host/server authority. Membership is exclusive and never inferred from an invitation. */
export class VoiceHub {
  private channels = new Map<string, VoiceChannel>();
  private events: z.infer<typeof eventSchema>[] = [];
  private invitations = new Map<string, VoiceInvitation>();
  selected(who: string): VoiceChannel | null { return [...this.channels.values()].find(c => c.members.includes(who)) ?? null; }
  same(a: string, b: string): boolean { const channel = this.selected(a); return !!channel && channel.members.includes(b); }
  view(who: string): VoiceView {
    return structuredClone({ selected: this.selected(who), invitations: [...this.invitations.values()].filter(i => i.to === who), outgoing: [...this.invitations.values()].filter(i => i.from === who), busy: [...new Set([...this.channels.values()].flatMap(c => c.members))], events: this.events.filter(e => e.from === who || e.to === who).slice(-8) });
  }
  endGame(origin: string, game: string): void { this.channels.delete(`game:${origin}:${game}`); }
  private event(invitation: VoiceInvitation, status: 'accepted' | 'declined' | 'canceled'): void {
    this.events.push({ ...invitation, status }); if (this.events.length > 192) this.events.shift();
  }
  leave(who: string): void {
    const channel = this.selected(who);
    if (channel) {
      channel.members = channel.members.filter(m => m !== who);
      if (!channel.members.length || channel.kind === 'call') this.channels.delete(channel.id);
      else if (channel.owner === who) channel.owner = channel.members[0];
    }
    for (const [key, invitation] of this.invitations) if (invitation.from === who || (invitation.channel && !this.channels.has(invitation.channel))) this.invitations.delete(key);
  }
  disconnect(who: string): void { this.leave(who); for (const [key, invitation] of this.invitations) if (invitation.to === who) this.invitations.delete(key); }
  prune(online: string[]): void {
    const active = new Set(online);
    for (const id of new Set([...this.channels.values()].flatMap(c => c.members))) if (!active.has(id)) this.disconnect(id);
    for (const [key, invitation] of this.invitations) if (!active.has(invitation.from) || !active.has(invitation.to)) this.invitations.delete(key);
  }
  apply(who: string, raw: VoiceCommand, online: string[], origin: string): void {
    const command = voiceCommandSchema.parse(raw);
    const requireTarget = (target: string) => { if (target === who || !online.includes(target)) throw new Error('Esa persona ya no está en la aldea.'); };
    const invite = (target: string, kind: 'call' | 'party', channel: string | null, name: string) => {
      requireTarget(target);
      if ([...this.invitations.values()].some(i => i.from === who && i.to === target && i.kind === kind && i.channel === channel)) return;
      if ([...this.invitations.values()].filter(i => i.from === who).length >= 24) throw new Error('Hay demasiadas invitaciones pendientes.');
      const id = crypto.randomUUID(); this.invitations.set(id, { id, from: who, to: target, kind, channel, name });
    };
    if (command.action === 'call') {
      if (!command.target) { this.leave(who); return; }
      requireTarget(command.target);
      const incoming = [...this.invitations.values()].find(i => i.to === who && i.from === command.target && i.kind === 'call');
      if (incoming) return this.apply(who, { action: 'respond', invitation: incoming.id, accept: true }, online, origin);
      invite(command.target, 'call', null, ''); return;
    }
    if (command.action === 'create') {
      this.leave(who);
      const id = crypto.randomUUID(); this.channels.set(id, { id, kind: 'party', name: command.name, owner: who, members: [who] }); return;
    }
    if (command.action === 'leave') { this.leave(who); return; }
    if (command.action === 'invite') {
      const channel = this.selected(who);
      if (!channel || channel.kind !== 'party' || channel.owner !== who) throw new Error('Solo quien dirige el grupo puede hacer eso.');
      if (channel.members.includes(command.target)) return;
      invite(command.target, 'party', channel.id, channel.name); return;
    }
    if (command.action === 'respond') {
      const invitation = this.invitations.get(command.invitation);
      if (!invitation || invitation.to !== who) throw new Error('La invitación ya no está disponible.');
      this.invitations.delete(invitation.id);
      this.event(invitation, command.accept ? 'accepted' : 'declined');
      if (!command.accept) return;
      if (!online.includes(invitation.from)) throw new Error('Esa persona ya no está en la aldea.');
      if (invitation.kind === 'call') {
        this.leave(who); this.leave(invitation.from);
        const id = crypto.randomUUID(); this.channels.set(id, { id, kind: 'call', name: '', owner: invitation.from, members: [invitation.from, who] });
      } else {
        const channel = this.channels.get(invitation.channel!);
        if (!channel || channel.owner !== invitation.from) throw new Error('La invitación ya no está disponible.');
        this.leave(who); channel.members.push(who);
      }
      return;
    }
    if (command.action === 'cancel') {
      const invitation = this.invitations.get(command.invitation);
      if (invitation?.from !== who) throw new Error('La invitación ya no está disponible.');
      this.event(invitation, 'canceled'); this.invitations.delete(invitation.id); return;
    }
    if (command.action === 'remove') {
      const channel = this.selected(who);
      if (!channel || channel.owner !== who || command.target === who || !channel.members.includes(command.target)) throw new Error('Solo quien dirige el grupo puede hacer eso.');
      this.leave(command.target); return;
    }
    if (command.action === 'game.end') { this.endGame(origin, command.game); return; }
    if (command.action === 'game') {
      const key = `game:${origin}:${command.game}`;
      if (this.selected(who)?.id === key) return;
      this.leave(who);
      let channel = this.channels.get(key);
      if (!channel) { channel = { id: key, kind: 'game', name: command.game, game: command.game, origin, owner: who, members: [] }; this.channels.set(key, channel); }
      channel.members.push(who);
    }
  }
}
