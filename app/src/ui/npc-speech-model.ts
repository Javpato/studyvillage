export const NPC_DIALOGUE_KEY = 'studyvillage-npc-dialogue-v1';
export interface NpcDialoguePreferences {
  opacity: number;
  textSize: 'normal' | 'large';
  lines: 2 | 3;
  progressive: boolean;
}
export const DEFAULT_DIALOGUE: NpcDialoguePreferences = { opacity: .9, textSize: 'normal', lines: 2, progressive: true };
export function parseDialoguePreferences(value: unknown): NpcDialoguePreferences {
  const raw = value && typeof value === 'object' ? value as Partial<NpcDialoguePreferences> : {};
  return {
    opacity: typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? Math.max(.35, Math.min(1, raw.opacity)) : DEFAULT_DIALOGUE.opacity,
    textSize: raw.textSize === 'large' ? 'large' : 'normal',
    lines: raw.lines === 3 ? 3 : 2,
    progressive: typeof raw.progressive === 'boolean' ? raw.progressive : true,
  };
}
/** Word wrapping also splits long unbroken words, without splitting Unicode code points. */
export function dialoguePages(text: string, width: number, lineLimit: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = ''; }
    if (line) line += ' ';
    for (const char of word) {
      if (line && measure(line + char) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  const pages: string[] = [];
  for (let n = 0; n < lines.length; n += lineLimit) pages.push(lines.slice(n, n + lineLimit).join('\n'));
  return pages.length ? pages : [''];
}
