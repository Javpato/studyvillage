import { describe, expect, it } from 'vitest';
import { VoiceHub } from '../../packages/runtime/src/media/voice';
const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64), online = [a, b, c];
describe('exclusive voice authority', () => {
  it('requires mutual consent for calls and leaves everyone in location voice while ringing', () => {
    const hub = new VoiceHub(); hub.apply(a, { action: 'call', target: b }, online, '0');
    expect(hub.selected(a)).toBeNull(); expect(hub.selected(b)).toBeNull();
    hub.apply(b, { action: 'call', target: a }, online, '1');
    expect(hub.same(a, b)).toBe(true); expect(hub.same(a, c)).toBe(false);
    hub.leave(a); expect(hub.selected(b)).toBeNull();
  });
  it('requires party invitations, restricts management, transfers leadership and preserves membership across origins', () => {
    const hub = new VoiceHub(); hub.apply(a, { action: 'create', name: 'Friends' }, online, '0');
    hub.apply(a, { action: 'invite', target: b }, online, '0');
    const invitation = hub.view(b).invitations[0];
    expect(hub.selected(b)).toBeNull();
    expect(() => hub.apply(c, { action: 'respond', invitation: invitation.id, accept: true }, online, '1')).toThrow();
    hub.apply(b, { action: 'respond', invitation: invitation.id, accept: true }, online, '1');
    expect(hub.same(a, b)).toBe(true); expect(hub.view(a).events.at(-1)?.status).toBe('accepted');
    expect(() => hub.apply(b, { action: 'invite', target: c }, online, '1')).toThrow();
    hub.disconnect(a); expect(hub.selected(b)?.owner).toBe(b);
    hub.apply(b, { action: 'invite', target: c }, online, '1');
    hub.apply(c, { action: 'respond', invitation: hub.view(c).invitations[0].id, accept: false }, online, '1');
    expect(hub.view(b).events.at(-1)?.status).toBe('declined'); expect(hub.selected(c)).toBeNull();
  });
  it('separates game instances, cleans up ended games, and cancels invitations', () => {
    const hub = new VoiceHub();
    hub.apply(a, { action: 'game', game: 'gartic' }, online, '0'); hub.apply(b, { action: 'game', game: 'gartic' }, online, '1');
    expect(hub.same(a, b)).toBe(false);
    hub.endGame('0', 'gartic'); expect(hub.selected(a)).toBeNull(); expect(hub.selected(b)).not.toBeNull();
    hub.apply(a, { action: 'call', target: c }, online, '0');
    hub.apply(a, { action: 'cancel', invitation: hub.view(a).outgoing[0].id }, online, '0');
    expect(hub.view(c).invitations).toHaveLength(0); expect(hub.view(c).events.at(-1)?.status).toBe('canceled');
    hub.prune([a, c]); expect(hub.view(c).busy).toHaveLength(0);
  });
});
