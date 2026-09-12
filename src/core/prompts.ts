// Prompts interactifs minimalistes sur node:readline — zéro dépendance, fonctionne dans n'importe quel terminal
// (y compris cmd.exe et un TTY série). Numéros plutôt que flèches : plus robuste, et un néophyte comprend « tapez 2 ».
// Minimal interactive prompts on node:readline — zero deps, works in any terminal.
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export interface Choice<T> { value: T; name: string; description?: string; checked?: boolean }

let rl: readline.Interface | null = null;
const io = () => rl ?? (rl = readline.createInterface({ input: stdin, output: stdout }));
export const closePrompts = () => { rl?.close(); rl = null; };

export async function select<T>(o: { message: string; choices: Choice<T>[]; default?: T }): Promise<T> {
  console.log(`\n${o.message}`);
  o.choices.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}) ${c.name}${c.description ? `\n      ${c.description}` : ''}`));
  const defIdx = o.default !== undefined ? o.choices.findIndex(c => c.value === o.default) : 0;
  for (;;) {
    const a = (await io().question(`> [${defIdx + 1}] `)).trim();
    if (a === '') return o.choices[defIdx].value;
    const n = Number(a);
    if (Number.isInteger(n) && n >= 1 && n <= o.choices.length) return o.choices[n - 1].value;
  }
}

export async function checkbox<T>(o: { message: string; choices: Choice<T>[] }): Promise<T[]> {
  console.log(`\n${o.message}`);
  o.choices.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}) [${c.checked ? 'x' : ' '}] ${c.name}${c.description ? `\n      ${c.description}` : ''}`));
  const def = o.choices.map((c, i) => c.checked ? i + 1 : 0).filter(Boolean);
  console.log(`  (numéros séparés par des virgules ; Entrée = ${def.join(',') || 'aucun'} / comma-separated numbers; Enter = default)`);
  for (;;) {
    const a = (await io().question('> ')).trim();
    if (a === '') return def.map(n => o.choices[n - 1].value);
    const ns = a.split(/[,\s]+/).map(Number);
    if (ns.every(n => Number.isInteger(n) && n >= 1 && n <= o.choices.length)) return [...new Set(ns)].map(n => o.choices[n - 1].value);
  }
}

export async function input(o: { message: string; default?: string }): Promise<string> {
  const a = (await io().question(`\n${o.message}${o.default ? ` [${o.default}]` : ''}\n> `)).trim();
  return a || o.default || '';
}

export async function confirm(o: { message: string; default?: boolean }): Promise<boolean> {
  const d = o.default ?? true;
  const a = (await io().question(`\n${o.message} ${d ? '[O/n]' : '[o/N]'} `)).trim().toLowerCase();
  if (a === '') return d;
  return ['o', 'y', 'oui', 'yes'].includes(a);
}
