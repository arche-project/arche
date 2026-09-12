// Détecte les liens morts (source.url, homepage, mirrors, checksum.url, printable.url, license.url) sur tout le catalogue.
// Dead-link detection over the whole catalog. Marque `status: missing` uniquement pour source.url ;
// les autres liens cassés sont seulement rapportés (un homepage mort n'empêche pas le téléchargement).
//
// Usage : tsx scripts/catalog/check-links.ts [--dry-run] [--concurrency 8]
import { loadResourceFiles, saveResourceFiles, setField, writeReport, head, markChecked, today, changes } from './lib.js';

const dry = process.argv.includes('--dry-run');
const conc = Number(process.argv[process.argv.indexOf('--concurrency') + 1]) || 8;

async function main() {
  const files = loadResourceFiles();
  const jobs: Array<() => Promise<void>> = [];
  const broken: string[] = [];
  for (const rf of files) {
    for (let i = 0; i < rf.items.length; i++) {
      const r = rf.items[i];
      const links: Array<[string, string | undefined]> = [
        ['source.url', r.source.url], ['source.homepage', r.source.homepage], ['checksum.url', r.checksum?.url ?? undefined],
        ['printable.url', r.printable?.url], ['license.url', r.license.url], ...(r.source.mirrors ?? []).map((m, k) => [`source.mirrors.${k}`, m] as [string, string]),
      ];
      for (const [field, url] of links) {
        if (!url || !/^https?:/.test(url)) continue;
        // Les ZIM datés sont vérifiés par check-kiwix (ils changent chaque mois) ; ici on vérifie seulement l'URL stable.
        if (r.source.kind === 'kiwix' && field === 'source.url' && r.source.kiwix_name) continue;
        jobs.push(async () => {
          const h = await head(url);
          if (h.ok) {
            if (field === 'source.url' && h.size && r.source.kind === 'http') setField(rf, i, 'size_bytes', h.size);
            // http-head est le seul tracker de ces ressources : une URL source qui répond vaut vérification.
            if (field === 'source.url' && r.update?.tracker === 'http-head') markChecked(rf, i);
            return;
          }
          broken.push(`${r.id} ${field} ${url} → HTTP ${h.status}`);
          // Seuls 404/410 prouvent une disparition. 403/429/0 = anti-bot, quota ou réseau : rapporté, pas d'action automatique.
          if (field === 'source.url' && r.status !== 'missing' && [404, 410].includes(h.status)) setField(rf, i, 'status', 'missing', `HTTP ${h.status} le ${today()}`);
        });
      }
    }
  }
  // pool de concurrence
  let idx = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (idx < jobs.length) await jobs[idx++](); }));
  if (!dry) saveResourceFiles(files);
  if (broken.length) { console.log(`\n${broken.length} broken link(s):\n  ` + broken.join('\n  ')); changes.push({ id: '*', field: 'broken_links', from: null, to: broken.length, note: broken.slice(0, 20).join('<br>') }); }
  writeReport('links');
}
main().catch(e => { console.error(e); process.exit(1); });
