import FR from './i18n/fr.json';
import ES from './i18n/es.json';
import EN from './i18n/en.json';
export type Language = 'es' | 'en' | 'fr';
export type MessageKey = keyof typeof ES;
export const LANGUAGE_KEY = 'studyvillage-language';
const MESSAGE = Symbol('interface-message');
export interface MessageRef { readonly [MESSAGE]: true; readonly source: string; readonly params: Readonly<Record<string, FormatValue>> }
export type FormatValue = string | number | boolean | null | undefined | MessageRef;
export type DisplayText = string | MessageRef;
function readLanguage(): Language { try { const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_KEY) : null; return saved === 'en' || saved === 'fr' ? saved : 'es'; } catch { return 'es'; } }
let language: Language = readLanguage();
const listeners = new Set<(language: Language) => void>();
interface Binding { element: WeakRef<Element>; node?: WeakRef<Text>; attribute?: string; message: MessageRef }
const bindings = new Set<WeakRef<Binding>>();
const elementBindings = new WeakMap<Element, Map<string, Binding>>();
let registrations = 0;
export function getLanguage(): Language { return language; }
export function getLocale(): string { return language === 'fr' ? 'fr-FR' : language === 'en' ? 'en-GB' : 'es-ES'; }
export function msg(source: string, params: Readonly<Record<string, FormatValue>> = {}): MessageRef { return { [MESSAGE]: true, source, params }; }
export function isMessage(value: unknown): value is MessageRef { return !!value && typeof value === 'object' && MESSAGE in value; }
export function t(source: string | MessageRef, params: Readonly<Record<string, FormatValue>> = {}): string {
  if (isMessage(source)) return t(source.source, source.params);
  const catalogue: Record<string,string> = language === 'fr' ? FR : language === 'en' ? EN : ES;
  const template = catalogue[source] ?? source;
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, key: string) => {
    if (!(key in params)) return token;
    const value = params[key];
    return isMessage(value) ? t(value) : value == null ? '' : String(value);
  });
}
function removeBinding(element: Element, slot: string): void { elementBindings.get(element)?.delete(slot); }
function register(element: Element, binding: Binding, slot: string): void {
  let slots = elementBindings.get(element); if (!slots) { slots = new Map(); elementBindings.set(element, slots); }
  slots.set(slot, binding); bindings.add(new WeakRef(binding));
  if (++registrations % 500 === 0) for (const reference of bindings) if (!reference.deref()) bindings.delete(reference);
}
/** Raw strings are user content. Only explicit msg() values are localized. */
export function setDisplayText(element: Element, value: DisplayText | null | undefined): void {
  if (!isMessage(value)) { removeBinding(element, 'text'); const text = value ?? ''; if (element.textContent !== text) element.textContent = text; return; }
  const existing = elementBindings.get(element)?.get('text'); const node = existing?.node?.deref();
  if (existing && node?.parentNode === element) { existing.message = value; const text = t(value); if (node.textContent !== text) node.textContent = text; return; }
  const textNode = document.createTextNode(t(value)); element.replaceChildren(textNode);
  register(element, { element: new WeakRef(element), node: new WeakRef(textNode), message: value }, 'text');
}
/** Labels bind their own text node, leaving appended inputs and sprites intact. */
export function setDisplayAttribute(element: Element, attribute: string, value: DisplayText): void {
  const slot = `attr:${attribute}`;
  if (!isMessage(value)) { removeBinding(element, slot); element.setAttribute(attribute, value); return; }
  element.setAttribute(attribute, t(value));
  register(element, { element: new WeakRef(element), attribute, message: value }, slot);
}
export function subscribeLanguage(listener: (language: Language) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function setLanguage(next: Language): void {
  if (next !== 'es' && next !== 'en' && next !== 'fr') return;
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, next);
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const reference of bindings) {
    const binding = reference.deref(); const element = binding?.element.deref();
    if (!binding || !element) { bindings.delete(reference); continue; }
    if (binding.attribute) {
      if (elementBindings.get(element)?.get(`attr:${binding.attribute}`) === binding) element.setAttribute(binding.attribute, t(binding.message));
    } else {
      const node = binding.node?.deref();
      if (node?.parentNode === element && elementBindings.get(element)?.get('text') === binding) node.textContent = t(binding.message);
      else bindings.delete(reference);
    }
  }
  for (const listener of listeners) { try { listener(next); } catch { /* One screen cannot prevent other labels from updating. */ } }
}
export function formatNumber(value: number): string { return new Intl.NumberFormat(getLocale()).format(value); }
export function formatDate(value: number | Date, options?: Intl.DateTimeFormatOptions): string { return new Intl.DateTimeFormat(getLocale(), options).format(value); }
if (typeof document !== 'undefined') document.documentElement.lang = language;
let reverse: Map<string, string> | null = null;
/** Spanish source key for a text that is an app default in either language, or null. */
export function defaultKey(value: string): string | null {
  if (!value) return null;
  if (value in ES) return value;
  if (!reverse) { reverse = new Map(); for (const [key, text] of [...Object.entries(EN), ...Object.entries(FR)]) if (!reverse.has(text)) reverse.set(text, key); }
  return reverse.get(value) ?? null;
}
/**
 * Values people can edit (names, house, furniture aliases, notebooks, decks) but that may still be the
 * app's default. Unchanged defaults follow the language; anything a person typed is shown exactly as typed.
 */
export function defaultText(value: string): string { const key = defaultKey(value); return key ? t(key) : value; }
/** Live-updating version of defaultText for DOM text. */
export function defaultMsg(value: string): DisplayText { const key = defaultKey(value); return key ? msg(key) : value; }
