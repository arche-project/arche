// `arche eval` (audit, décision 3 : mesurer avant d'ajouter) : chaque question de knowledge/eval.yaml est
// posée à la recherche comme un client MCP la pose ; on compte ce qui revient — rappel@5 et MRR par canal
// (xapian, sqlite, fusion, rerank), par corpus, par sujet ; les mots obligatoires dans les cinq premiers
// extraits ; les garde-fous rendus à raison ; « je ne trouve pas » sur les négatives. Une question n'est
// mesurable que si l'un de ses corpus attendus est installé : l'absence d'un shard n'est pas un échec de la
// recherche. Seuil : `threshold` du jeu, appliqué en CI sur le corpus fixture. / Runs the evaluation set.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir } from '../paths.js';
import { retrieve, listCorpora, type RetrieveOptions, type Passage } from './retrieve.js';
import { rrf, diversify } from './fuse.js';
import { openCorpus, readMeta } from './sqlite.js';
import type { Reranker } from './rerank.js';

export interface EvalQuestion { id: string; q: string; lang: 'fr' | 'en'; topic: string; expect: string[]; must: string[]; flag?: string; negative?: boolean; locator?: { resource: string; where: string; status: 'pending' | 'resolved'; article?: string; chunk?: string } }
export interface EvalSet { version: number; updated: string; threshold: { recall_at_5: number; must_at_5?: number }; questions: EvalQuestion[] }
export type Channel = 'xapian' | 'sqlite' | 'fusion' | 'rerank';
export const CHANNELS: Channel[] = ['xapian', 'sqlite', 'fusion', 'rerank']; interface Rate { n: number; recall_at_5: number; mrr: number }

export interface EvalRow {
  id: string; topic: string; resource: string | null; negative: boolean; measurable: boolean;
  /** Rang (1-indexé) du premier extrait d'une ressource attendue, par canal ; 0 = aucun ; null = canal muet. */
  rank: Record<Channel, number | null>;
  /** Un extrait attendu, dans les 5 premiers de la fusion, porte tous les mots obligatoires ; le garde-fou attendu est rendu, et rien d'autre. */
  must_at_5: boolean; flags: string[]; flags_ok: boolean;
  /** Négative : la recherche n'a rien rendu (ce que le serveur MCP dit « aucun extrait trouvé »). */
  not_found: boolean | null;
  /** Locator `pending` : le chunk que l'eval propose (premier extrait de sa ressource portant les mots obligatoires) ; `resolved` : est-il dans les 5 premiers ? */
  proposed_chunk?: string; locator_at_5?: boolean;
}
export interface EvalReport {
  generated_at: string; set_version: number; set_updated: string; corpora: string[];
  questions: { total: number; positives: number; measurable: number; negatives: number; flagged: number };
  channels: Record<Channel, Rate | null>; must_at_5: { n: number; ok: number; rate: number }; negatives: { total: number; not_found: number; rate: number };
  guardrails: { total: number; correct: number; missed: number; false_positives: number }; by_corpus: Record<string, Rate & { must_at_5: number }>; by_topic: Record<string, Rate & { must_at_5: number }>;
  threshold: EvalSet['threshold']; pass: boolean; detail?: string; rows: EvalRow[];
}
/** `set` : le jeu (défaut knowledge/eval.yaml) ; `installed` : ressources installées en plus des corpus SQLite (ZIM servis par kiwix-serve, d'après l'état). */
export interface EvalOptions extends RetrieveOptions { set?: string; installed?: string[]; reranker?: Pick<Reranker, 'rerank' | 'lastBackend'> }

export const loadEvalSet = (file = path.join(knowledgeDir(), 'eval.yaml')): EvalSet => parse(fs.readFileSync(file, 'utf8')) as EvalSet;
/** Comparaison insensible à la casse et aux accents ; « a|b » = l'un des deux. */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
export const hasMust = (text: string, must: string): boolean => must.split('|').some(alt => fold(text).includes(fold(alt)));
const resourceOf = (id: string) => id.split('/')[0]!;
const rankIn = (ids: readonly string[], expect: readonly string[]): number => ids.findIndex(id => expect.includes(resourceOf(id))) + 1;
const rate = (rows: EvalRow[], ch: Channel): Rate => ({ n: rows.length, recall_at_5: rows.filter(r => r.rank[ch]! >= 1 && r.rank[ch]! <= 5).length / (rows.length || 1), mrr: rows.reduce((s, r) => s + (r.rank[ch] ? 1 / r.rank[ch]! : 0), 0) / (rows.length || 1) });
/** Le seuil (rappel@5 de la fusion, et mots@5 s'il est fixé) sur les positives mesurables ; rien de mesurable = non tenu. */
export const passes = (r: Pick<EvalReport, 'questions' | 'channels' | 'must_at_5' | 'threshold'>): boolean => r.questions.measurable > 0 && (r.channels.fusion?.recall_at_5 ?? 0) >= r.threshold.recall_at_5 && (r.threshold.must_at_5 === undefined || r.must_at_5.rate >= r.threshold.must_at_5);
/** Les corpus SQLite installés, par resource_id (une base illisible est ignorée : retrieve la nomme dans `detail`). */
export const installedCorpora = (lib: string): string[] =>
  listCorpora(lib).flatMap(f => { try { const db = openCorpus(f, { readonly: true }); try { return [readMeta(db)['resource_id'] ?? path.basename(f, '.arche.sqlite')]; } finally { db.close(); } } catch { return []; } });

export async function runEval(o: EvalOptions = {}): Promise<EvalReport> {
  const set = loadEvalSet(o.set), corpora = [...new Set([...(o.lib ? installedCorpora(o.lib) : []), ...(o.installed ?? [])])].sort();
  const rows: EvalRow[] = [], details = new Set<string>(), items = (ids: string[] = []) => ids.map(id => ({ id, resource_id: resourceOf(id) }));
  for (const q of set.questions) {
    const r = await retrieve(q.q, o);
    if (r.channels.detail) details.add(r.channels.detail);
    // Le canal sqlite seul = ses deux listes (fts, vec) fusionnées comme retrieve le fait ; la fusion = ce que le client reçoit.
    const sq = r.lists.fts || r.lists.vec ? diversify(rrf([{ name: 'fts', items: items(r.lists.fts) }, { name: 'vec', items: items(r.lists.vec) }]), 5, 3).map(h => h.item.id) : null;
    let rerank: string[] | null = null; if (o.reranker && r.passages.length) { const rr = await o.reranker.rerank(q.q, r.passages); if (o.reranker.lastBackend !== 'none') rerank = rr.map(x => x.item.id); }
    const flags: string[] = r.flags.map(f => f.id), answer = (p: Passage) => q.must.every(m => hasMust(p.text, m));
    const row: EvalRow = {
      id: q.id, topic: q.topic, resource: q.locator?.resource ?? null, negative: !!q.negative, measurable: !q.negative && q.expect.some(id => corpora.includes(id)),
      rank: { xapian: r.lists.xapian ? rankIn(r.lists.xapian, q.expect) : null, sqlite: sq ? rankIn(sq, q.expect) : null, fusion: r.channels.xapian === 'ok' || r.channels.sqlite === 'ok' ? rankIn(r.passages.map(p => p.id), q.expect) : null, rerank: rerank ? rankIn(rerank, q.expect) : null },
      must_at_5: r.passages.slice(0, 5).some(p => q.expect.includes(p.resource_id) && answer(p)), flags, flags_ok: q.flag ? flags.length === 1 && flags[0] === q.flag : flags.length === 0, not_found: q.negative ? r.passages.length === 0 : null,
    };
    if (q.locator?.status === 'resolved') row.locator_at_5 = r.passages.slice(0, 5).some(p => p.id === q.locator!.chunk);
    else if (q.locator) { const c = r.passages.find(p => p.resource_id === q.locator!.resource && answer(p)); if (c) row.proposed_chunk = c.id; }
    rows.push(row);
  }
  const measurable = rows.filter(r => r.measurable), negatives = rows.filter(r => r.negative), flagged = new Set(set.questions.filter(q => q.flag).map(q => q.id));
  const group = (key: (r: EvalRow) => string | null) => Object.fromEntries([...new Set(measurable.map(key).filter((k): k is string => !!k))].sort().map(k => { const g = measurable.filter(r => key(r) === k); return [k, { ...rate(g, 'fusion'), must_at_5: g.filter(r => r.must_at_5).length / g.length }]; }));
  const mustOk = measurable.filter(r => r.must_at_5).length, notFound = negatives.filter(r => r.not_found).length, wrong = rows.filter(r => !r.flags_ok);
  const report: EvalReport = {
    generated_at: new Date().toISOString(), set_version: set.version, set_updated: set.updated, corpora,
    questions: { total: rows.length, positives: rows.length - negatives.length, measurable: measurable.length, negatives: negatives.length, flagged: flagged.size },
    // Un canal muet sur une question (kiwix-serve absent, aucun corpus) ne compte ni pour ni contre lui : n = questions où il a répondu.
    channels: Object.fromEntries(CHANNELS.map(ch => { const a = measurable.filter(r => r.rank[ch] !== null); return [ch, a.length ? rate(a, ch) : null]; })) as Record<Channel, Rate | null>,
    must_at_5: { n: measurable.length, ok: mustOk, rate: mustOk / (measurable.length || 1) }, negatives: { total: negatives.length, not_found: notFound, rate: notFound / (negatives.length || 1) },
    guardrails: { total: rows.length, correct: rows.length - wrong.length, missed: wrong.filter(r => flagged.has(r.id)).length, false_positives: wrong.filter(r => !flagged.has(r.id)).length },
    by_corpus: group(r => r.resource), by_topic: group(r => r.topic), threshold: set.threshold, pass: false, ...(details.size ? { detail: [...details].join(' ; ') } : {}), rows,
  };
  report.pass = passes(report);
  return report;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
/** Le tableau publié dans docs/fr/EVAL.md. */
export function renderMarkdown(r: EvalReport): string {
  const ch = (c: Channel) => r.channels[c] ? `| ${c} | ${pct(r.channels[c]!.recall_at_5)} | ${r.channels[c]!.mrr.toFixed(2)} | ${r.channels[c]!.n} |` : `| ${c} | — | — | 0 (canal muet) |`;
  const table = (title: string, g: Record<string, Rate & { must_at_5: number }>) => ['', `| ${title} | questions | rappel@5 | MRR | mots@5 |`, '|---|---|---|---|---|', ...Object.entries(g).map(([k, v]) => `| ${k} | ${v.n} | ${pct(v.recall_at_5)} | ${v.mrr.toFixed(2)} | ${pct(v.must_at_5)} |`)];
  const ids = (f: (x: EvalRow) => boolean) => r.rows.filter(x => x.measurable && f(x)).map(x => x.id).join(', ');
  return [
    `Mesure du ${r.generated_at.slice(0, 10)} — jeu v${r.set_version} (${r.set_updated}) — corpus installés : ${r.corpora.length ? r.corpora.map(c => `\`${c}\``).join(', ') : 'aucun'} — **${r.questions.measurable}/${r.questions.positives} positives mesurables**, ${r.questions.negatives} négatives, ${r.questions.flagged} garde-fous.${r.detail ? `\nCanaux : ${r.detail}` : ''}`,
    '', '| Canal | rappel@5 | MRR | n |', '|---|---|---|---|', ...CHANNELS.map(ch), '',
    `- Mots obligatoires dans les 5 premiers extraits (fusion) : **${pct(r.must_at_5.rate)}** (${r.must_at_5.ok}/${r.must_at_5.n})${r.must_at_5.ok < r.must_at_5.n ? ` — manquent : ${ids(x => !x.must_at_5)}` : ''}`,
    `- Garde-fous justes : **${r.guardrails.correct}/${r.guardrails.total}** (${r.guardrails.missed} manqués, ${r.guardrails.false_positives} faux positifs)`,
    `- « Je ne trouve pas » juste sur les négatives : **${r.negatives.not_found}/${r.negatives.total}** (aucun extrait rendu)`,
    `- Rappel@5 manqué (fusion) : ${ids(x => !(x.rank.fusion! >= 1 && x.rank.fusion! <= 5)) || 'aucune question'}`,
    ...table('Corpus (locator)', r.by_corpus), ...table('Sujet', r.by_topic),
    '', `Seuil : rappel@5 ≥ ${pct(r.threshold.recall_at_5)}${r.threshold.must_at_5 !== undefined ? `, mots@5 ≥ ${pct(r.threshold.must_at_5)}` : ''} → **${r.pass ? 'tenu' : 'non tenu'}**.`,
  ].join('\n');
}

/** Remplace le bloc `<!-- eval --> … <!-- /eval -->` d'un fichier Markdown (docs/fr/EVAL.md) par le tableau ; `tag` pour un autre bloc (`knowledge` dans le README, M4-1). */
export function writeEvalDoc(file: string, markdown: string, tag = 'eval'): void {
  const src = fs.readFileSync(file, 'utf8'), block = new RegExp(`<!-- ${tag} -->[\\s\\S]*<!-- /${tag} -->`);
  if (!block.test(src)) throw new Error(`${file} : pas de bloc <!-- ${tag} --> … <!-- /${tag} -->`);
  fs.writeFileSync(file, src.replace(block, `<!-- ${tag} -->\n${markdown}\n<!-- /${tag} -->`));
}
