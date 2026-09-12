// Enchaîne tous les vérificateurs, valide le catalogue, et assemble le corps de la PR.
// Runs every checker, validates the catalog, and assembles the PR body.
//
// Usage : tsx scripts/catalog/update-all.ts [--dry-run]
// Sortie : .catalog-reports/PR_BODY.md (+ un .md/.json par vérificateur)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_DIR } from './lib.js';

const dry = process.argv.includes('--dry-run') ? ['--dry-run'] : [];
const here = path.dirname(new URL(import.meta.url).pathname);
const reports = path.join(CATALOG_DIR, '..', '.catalog-reports');
fs.rmSync(reports, { recursive: true, force: true });

const steps = ['check-kiwix', 'check-github', 'check-models', 'check-registries', 'check-links'];
const failed: string[] = [];
for (const s of steps) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync('npx', ['tsx', path.join(here, `${s}.ts`), ...dry], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed.push(s);
}

console.log('\n=== validate ===');
const v = spawnSync('npx', ['tsx', path.join(here, '..', '..', 'src', 'cli.ts'), 'catalog', 'validate'], { stdio: 'inherit' });
if (v.status !== 0) failed.push('validate');

const sections = steps.map(s => {
  const f = path.join(reports, `${s.replace('check-', '')}.md`);
  return `### ${s}\n\n${fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '_non exécuté / not run_'}`;
});
const body = [
  '## Mise à jour automatique du catalogue / Automatic catalog update',
  '',
  `Généré le ${new Date().toISOString()} par \`scripts/catalog/update-all.ts\`.`,
  failed.length ? `\n> ⚠️ Étapes en échec / failed steps: **${failed.join(', ')}** — vérifier les logs du workflow.` : '',
  '',
  '**Fraîcheur après mise à jour / freshness after update :** voir `freshness.md` dans les artefacts du run ; la CI échoue sous 70 %.',
  '',
  '**À vérifier avant de merger / check before merging :**',
  '- [ ] les champs sensibles listés en tête (url, checksum, size, licence) sont relus à deux : URL ouverte sur la source officielle, hachage recoupé — jamais fusionné par un robot',
  '- [ ] les ressources passées en `missing` sont bien disparues en amont (et pas un incident réseau)',
  '- [ ] les chutes de taille signalées (`size drop`) ne sont pas des builds cassés',
  '- [ ] les nouveaux modèles Ollama listés dans les logs méritent-ils une entrée ?',
  '- [ ] les notes `[updater …: aucune version stable]` ou `[… fin de vie]` demandent un arbitrage humain, pas un merge',
  '',
  ...sections,
].join('\n');
fs.mkdirSync(reports, { recursive: true });
fs.writeFileSync(path.join(reports, 'PR_BODY.md'), body);
console.log(`\nPR body → ${path.join(reports, 'PR_BODY.md')}`);
process.exit(failed.includes('validate') ? 1 : 0);
