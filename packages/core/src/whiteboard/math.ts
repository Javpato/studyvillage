/**
 * Turns board text into TeX. Text wrapped in $...$ is math; everything else is
 * wrapped in \text{} so a line like "Area = $\pi r^2$" renders as one piece.
 * Returns null when the text has no math at all, so plain notes stay plain.
 */
export function toTex(source: string): string | null {
  if (!/\$[^$]+\$/.test(source)) return null;
  const parts = source.split(/(\$[^$]+\$)/g).filter((part) => part.length);
  const escape = (value: string) => value.replace(/([\\{}#%&_^~])/g, (c) => c === '\\' ? '\\backslash ' : `\\${c}`);
  return parts.map((part) => part.startsWith('$') && part.endsWith('$') && part.length > 2
    ? part.slice(1, -1)
    : `\\text{${escape(part)}}`).join('');
}

