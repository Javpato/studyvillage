/** The same gesture rules for a mouse, a finger and an Apple Pencil. */
export interface TapPoint { x: number; y: number; time: number; target: string | null }
export class DoubleTap {
  private previous: TapPoint | null = null;
  reset(): void { this.previous = null; }
  accept(tap: TapPoint): boolean {
    const old = this.previous;
    if (old && tap.target !== null && tap.target === old.target && tap.time >= old.time && tap.time-old.time <= 360 && Math.hypot(tap.x-old.x,tap.y-old.y) <= 24) {
      this.previous = null; return true;
    }
    this.previous = tap; return false;
  }
}
export interface ControlPreferences { touch: 'auto' | 'on' | 'off' }
const KEY='studyvillage-controls-v2';
export function loadControls(): ControlPreferences {
  try { const value=JSON.parse(localStorage.getItem(KEY)||'null'); if(value && ['auto','on','off'].includes(value.touch))return {touch:value.touch}; } catch { /* Preserve unreadable data. */ }
  return {touch:'auto'};
}
export function saveControls(value: ControlPreferences): void { localStorage.setItem(KEY,JSON.stringify(value)); }
export function touchEnabled(preference: ControlPreferences['touch'], touches: number): boolean { return preference==='on'||(preference==='auto'&&touches>0); }
