// `arche eval` : le jeu knowledge/eval.yaml contre les corpus installés (et kiwix-serve s'il tourne).
// Markdown (défaut) ou JSON ; `--write docs/fr/EVAL.md` publie le tableau ; code 1 sous le seuil
// (`threshold` du jeu, ou `--min <pct>`) — c'est ce que la CI exécute sur le corpus fixture.
import { loadConfig } from '../core/config.js';
import { libraryDir } from '../core/paths.js';
import { loadState } from '../core/state.js';
import { getLang } from '../core/i18n.js';
import { runEval, renderMarkdown, writeEvalDoc, passes } from '../core/rag/eval.js';
import { Reranker } from '../core/rag/rerank.js';

export async function evalCommand(o: { library?: string; config?: string; kiwixHost?: string; json?: boolean; markdown?: boolean; write?: string; rerank?: boolean; min?: string; set?: string; k?: string }) {
  const fr = getLang() === 'fr', cfg = loadConfig(o.config), lib = libraryDir(o.library ?? cfg.library);
  const report = await runEval({ lib, host: o.kiwixHost ?? process.env['KIWIX_HOST'] ?? `http://127.0.0.1:${cfg.serve?.kiwix_port ?? 8080}`, installed: Object.keys(loadState(lib).installed),
    ...(o.set ? { set: o.set } : {}), ...(o.k ? { k: Number(o.k) } : {}), ...(o.rerank ? { reranker: new Reranker() } : {}) });
  if (o.min !== undefined) { report.threshold = { ...report.threshold, recall_at_5: Number(o.min) / 100 }; report.pass = passes(report); }
  const md = renderMarkdown(report); console.log(o.json ? JSON.stringify(report, null, 2) : md);
  if (o.write) { writeEvalDoc(o.write, md); console.error(`${o.write} : ${fr ? 'tableau réécrit' : 'table rewritten'}`); }
  if (report.pass) return;
  const p = (x: number) => `${Math.round(x * 100)} %`, t = report.threshold, got = report.channels.fusion?.recall_at_5 ?? 0;
  const why = [...(got < t.recall_at_5 ? [`${fr ? 'rappel' : 'recall'}@5 ${p(got)} < ${p(t.recall_at_5)}`] : []), ...(t.must_at_5 !== undefined && report.must_at_5.rate < t.must_at_5 ? [`${fr ? 'mots' : 'must'}@5 ${p(report.must_at_5.rate)} < ${p(t.must_at_5)}`] : [])];
  console.error(`eval${fr ? ' : sous le seuil' : ': below threshold'} (${why.join(', ')}${report.questions.measurable ? '' : fr ? ' — aucune question mesurable : aucun corpus attendu n’est installé' : ' — no measurable question: no expected corpus is installed'})`);
  process.exitCode = 1;
}
