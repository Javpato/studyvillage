const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const FORBIDDEN_SCRIPT_PATTERN = /(?:<\s*\/?\s*(?:script|iframe|object|embed|svg)|javascript:|vbscript:|onload\s*=|onerror\s*=)/i;

export function isValidCustomSpriteDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 524_288 &&
    SAFE_DATA_IMAGE_REGEX.test(value) &&
    !FORBIDDEN_SCRIPT_PATTERN.test(value)
  );
}

export function sanitizeObjectDisplayName(raw: string, fallback = 'Objeto'): string {
  const cleaned = raw
    .replace(FORBIDDEN_SCRIPT_PATTERN, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 48);
  return cleaned || fallback;
}

