// i18n minimaliste : locales/<lang>.json, clés à points, interpolation {name}.
// Minimal i18n: locales/<lang>.json, dotted keys, {name} interpolation.
import fs from 'node:fs';
import path from 'node:path';
import { localesDir } from './paths.js';
import type { Lang, I18n } from './types.js';

let current: Lang = 'fr';
const cache = new Map<Lang, Record<string, string>>();

export function detectLang(): Lang {
  const env = process.env.ARCHE_LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? '';
  return env.toLowerCase().startsWith('en') ? 'en' : 'fr';
}
export function setLang(l: Lang) { current = l; }
export function getLang(): Lang { return current; }

function table(l: Lang): Record<string, string> {
  if (!cache.has(l)) {
    const f = path.join(localesDir(), `${l}.json`);
    cache.set(l, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
  }
  return cache.get(l)!;
}

export function t(key: string, vars: Record<string, string | number> = {}, lang: Lang = current): string {
  let s = table(lang)[key] ?? table('en')[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Traduit une raison de plan ("reason.bundle:health") en phrase. */
export function reason(r: string, lang: Lang = current): string {
  const [key, arg] = r.split(':', 2);
  return t(key, { arg: arg ?? '' }, lang);
}

export const pick = (x: I18n | undefined, lang: Lang = current): string => x ? (x[lang] ?? x.en ?? x.fr) : '';
