// Nomenclature par substitution : un design de référence dit ce qu'il faut ; l'inventaire dit ce
// qu'on a ; le solveur dit ce qui manque et ce qui peut remplacer quoi — et le signale (ADR 0010).
// Substitution BOM: a reference design says what is needed; the inventory says what we have; the
// solver says what is missing and what may replace what — and flags it (ADR 0010).
//
// Le modèle ne « devine » pas qu'un L298N remplace un TB6612 : c'est la fiche de référence qui
// liste ses équivalents, avec ce qui change. Le solveur ne fait que croiser.

import type { Component } from './inventory.js';

export interface BomEntry {
  ref: string;
  description?: string;
  qty: number;
  /** Équivalents acceptés par le design de référence, avec ce qui change quand on les prend. */
  equivalents?: Array<{ ref: string; changes?: string }>;
  /** Où le trouver quand on ne l'a pas : « récup' d'imprimante », « n'importe quel magasin », etc. */
  sourcing?: string;
}

export interface BomLine { ref: string; description?: string; qty: number; from_stock: number; missing: number; substitute?: { ref: string; changes?: string; from_stock: number }; sourcing?: string }
export interface BomResult { lines: BomLine[]; complete: boolean; substitutions: number; missing_refs: string[] }

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Croise la nomenclature de référence avec les composants de l'inventaire. Déterministe. */
export function substituteBom(bom: BomEntry[], stock: Component[] = []): BomResult {
  const have = new Map<string, number>();
  for (const c of stock) have.set(norm(c.ref), (have.get(norm(c.ref)) ?? 0) + (c.quantity ?? 1));
  const take = (ref: string, n: number): number => {
    const k = norm(ref);
    const got = Math.min(n, have.get(k) ?? 0);
    if (got > 0) have.set(k, (have.get(k) ?? 0) - got);
    return got;
  };
  const lines: BomLine[] = [];
  let substitutions = 0;
  for (const e of bom) {
    const fromStock = take(e.ref, e.qty);
    let missing = e.qty - fromStock;
    const line: BomLine = { ref: e.ref, qty: e.qty, from_stock: fromStock, missing, ...(e.description ? { description: e.description } : {}), ...(e.sourcing ? { sourcing: e.sourcing } : {}) };
    if (missing > 0) {
      for (const eq of e.equivalents ?? []) {
        const got = take(eq.ref, missing);
        if (got > 0) {
          line.substitute = { ref: eq.ref, from_stock: got, ...(eq.changes ? { changes: eq.changes } : {}) };
          missing -= got; substitutions++;
          break;
        }
      }
      line.missing = missing;
    }
    lines.push(line);
  }
  const missingRefs = lines.filter(l => l.missing > 0).map(l => l.ref);
  return { lines, complete: missingRefs.length === 0, substitutions, missing_refs: missingRefs };
}

export function renderBomMarkdown(r: BomResult, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  const out = [fr ? '| Référence | Qté | En stock | Substitut | Manque | Où trouver |' : '| Ref | Qty | In stock | Substitute | Missing | Sourcing |', '|---|---|---|---|---|---|'];
  for (const l of r.lines) {
    const sub = l.substitute ? `${l.substitute.ref} ×${l.substitute.from_stock}${l.substitute.changes ? ` ⚠ ${l.substitute.changes}` : ''}` : '';
    out.push(`| ${l.ref}${l.description ? ` — ${l.description}` : ''} | ${l.qty} | ${l.from_stock} | ${sub} | ${l.missing || ''} | ${l.missing ? (l.sourcing ?? '') : ''} |`);
  }
  out.push('', fr
    ? `${r.complete ? 'Nomenclature complète avec le stock.' : `Il manque ${r.missing_refs.length} référence(s) : ${r.missing_refs.join(', ')}.`} ${r.substitutions ? `${r.substitutions} substitution(s) — chacune change quelque chose (⚠) : à valider avant de câbler.` : ''}`
    : `${r.complete ? 'BOM complete from stock.' : `${r.missing_refs.length} reference(s) missing: ${r.missing_refs.join(', ')}.`} ${r.substitutions ? `${r.substitutions} substitution(s) — each changes something (⚠): validate before wiring.` : ''}`);
  return out.join('\n') + '\n';
}
