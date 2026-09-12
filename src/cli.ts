#!/usr/bin/env node
// Point d'entrée CLI. Deux publics : `arche` seul lance le wizard néophyte ; toutes les sous-commandes sont scriptables.
// CLI entry point. Two audiences: bare `arche` starts the beginner wizard; every sub-command is scriptable.
import { Command } from 'commander';
import { setLang, detectLang, t } from './core/i18n.js';
import { initCommand } from './commands/init.js';
import { planCommand } from './commands/plan.js';
import { downloadCommand } from './commands/download.js';
import { verifyCommand } from './commands/verify.js';
import { serveCommand } from './commands/serve.js';
import { serviceInstall, serviceUninstall, serviceStatus } from './commands/service.js';
import { mirrorPlan } from './commands/mirror.js';
import { visualsCoverage, visualsValidate } from './commands/visuals.js';
import { exportCommand, importCommand } from './commands/bundle.js';
import { catalogValidate, catalogList, catalogShow, catalogIndex, catalogFreshness, knowledgeVerify } from './commands/catalog.js';
import { projectTypes, projectCheck, projectPlan } from './commands/project.js';
import { mcpCommand } from './commands/mcp.js';
import { computeEstimate, jobsList, jobsShow, jobsCancel } from './commands/compute.js';
import { indexBuild, indexAdd, indexList, indexFetch, indexEstimate } from './commands/index.js';
import { evalCommand } from './commands/eval.js';

// node:sqlite est marqué expérimental sur Node 22 (stable en 24) : l'avertissement n'apporte rien à l'utilisateur (ADR 0014).
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning' || !/SQLite/.test(w.message)) console.error(`${w.name}: ${w.message}`); });

const program = new Command();
program
  .name('arche')
  .description(t('app.tagline'))
  .version('0.1.0')
  .option('--lang <fr|en>', 'interface language / langue de l\'interface')
  .hook('preAction', cmd => { const l = cmd.opts().lang ?? detectLang(); setLang(l === 'en' ? 'en' : 'fr'); });

program.command('init', { isDefault: true })
  .description('wizard interactif / interactive wizard')
  .option('-l, --library <dir>')
  .action(initCommand);

const planOpts = (c: Command) => c
  .option('-c, --config <file>', 'arche.yaml')
  .option('-l, --library <dir>')
  .option('-p, --profile <novice|bunker|lowtech>')
  .option('-b, --bundles <ids>', 'comma-separated')
  .option('--include <ids>').option('--exclude <ids>')
  .option('--budget <gb>', 'disk budget in GB')
  .option('--offline', 'skip online check');

planOpts(program.command('plan').description('compute the selection without downloading / calcule la sélection sans télécharger'))
  .option('--json').action(planCommand);

planOpts(program.command('download').description('download the plan (resumable) / télécharge le plan (reprise auto)'))
  .option('-y, --yes', 'non-interactive').option('--only <ids>', 'comma-separated ids, ignore the plan').option('--parallel <n>', 'concurrent downloads', '2')
  .action(downloadCommand);

program.command('verify').description('re-hash installed files / re-vérifie les fichiers installés (offline)')
  .option('-l, --library <dir>').option('--fix', 'drop corrupt/missing entries from state').action(verifyCommand);

program.command('serve').description('local web UI + supervised services (kiwix, ollama, gitea) / interface web + services supervisés')
  .option('-c, --config <file>').option('-l, --library <dir>').option('--port <n>').option('--bind <addr>')
  .option('--no-kiwix').option('--no-ollama').option('--no-gitea').option('--quiet', 'log to file only').option('--open', 'open the browser')
  .action(serveCommand);

const svc = program.command('service').description('start Arche at boot without any daemon of its own / démarrer Arche au boot, sans démon supplémentaire');
svc.command('install').description('write the systemd unit (Linux) or launchd agent (macOS) for `arche serve`')
  .option('-l, --library <dir>').option('--enable', 'also enable and start it now').option('--print', 'print the file instead of writing it').action(serviceInstall);
svc.command('uninstall').option('-l, --library <dir>').action(serviceUninstall);
svc.command('status').option('-l, --library <dir>').action(serviceStatus);

const mirror = program.command('mirror').description('partial package-repository mirrors with dependency closure / miroirs partiels de dépôts de paquets');
mirror.command('plan <recipe>').description('resolve the closure and report size; --urls writes the download list')
  .option('--arch <arch>').option('--urls <file>').option('--json').action(mirrorPlan);

const vis = program.command('visuals').description('visual manifests: required views per concept, licences, coverage / manifestes visuels');
vis.command('validate').description('licences, provenance, and the diagnostic-means-real-photo rule').action(visualsValidate);
vis.command('coverage').description('share of required views covered by verified files').option('--json').option('--min <pct>').action(visualsCoverage);

program.command('mcp').description('MCP server on stdio for your offline AI client (Open WebUI, OpenCode, Jan, Aider…) / serveur MCP pour votre client IA hors ligne')
  .option('-c, --config <file>').option('-l, --library <dir>').option('--kiwix-host <url>').option('--lang <fr|en>').option('--list-tools', 'print the tools and exit').action(mcpCommand);

const idx = program.command('index').description('one SQLite corpus per resource (text, FTS5, vectors — ADR 0014): build, add your own documents, fetch published ones / index de recherche');
idx.command('build <resource-id>').description('build the .arche.sqlite corpus of a catalog resource from its installed file (ZIM…) or --source; .zst next to it when zstd is installed')
  .option('--source <file|dir>').option('--out <file>').option('--model <embed-model>').option('--ollama-host <url>').option('--limit <n>').option('--no-compress', 'skip the zstd transport file').option('--no-vectors', 'FTS5 only, no Ollama needed (vectors can be added later)')
  .option('-l, --library <dir>').option('-c, --config <file>').option('--json').action(indexBuild);
idx.command('add <file|dir>').description('index YOUR documents (pdf, epub, md, html, txt, folder) into a .arche.sqlite corpus, text included, searchable offline')
  .option('--id <name>').option('--model <embed-model>').option('--ollama-host <url>').option('--no-vectors', 'FTS5 only, no Ollama needed').option('-l, --library <dir>').option('-c, --config <file>').action(indexAdd);
idx.command('list').option('-l, --library <dir>').option('-c, --config <file>').action(indexList);
idx.command('fetch [ids...]').description('download the published shards of installed resources (Internet Archive)').option('-l, --library <dir>').option('-c, --config <file>').action(indexFetch);
idx.command('estimate <resource-id>').description('size of the corpus database (text + FTS5 + int8 vectors) and embedding time on this machine').option('--source <file|dir>').option('--model <embed-model>').option('-l, --library <dir>').option('-c, --config <file>').option('--json').action(indexEstimate);

program.command('eval').description('run knowledge/eval.yaml against the installed corpora: recall@5, MRR, guard rails, negatives, per channel — exit 1 below the threshold / mesure la recherche')
  .option('-l, --library <dir>').option('-c, --config <file>').option('--kiwix-host <url>').option('--json').option('--markdown', 'Markdown table (default)').option('--write <file>', 'rewrite the <!-- eval --> block of a Markdown file (docs/fr/EVAL.md)').option('--rerank', 'also measure the reranker (llama-server or Ollama)').option('--min <pct>', 'recall@5 threshold, overrides eval.yaml').option('--set <file>', 'another eval.yaml').option('-k <n>', 'passages per question (default 8)').action(evalCommand);

const comp = program.command('compute').description('time adapts to the machine, never capability (ADR 0012) / le temps s’adapte à la machine');
comp.command('estimate').description('how long a model or a multi-model workflow takes on THIS machine (never "impossible")')
  .option('--model <id|tag|Go>').option('--steps <file.yaml>').option('--prompt <tokens>').option('--output <tokens>')
  .option('--ram <Go>').option('--vram <Go>').option('--cores <n>').option('--disk <nvme|sata_ssd|usb3_ssd|hdd|sd_card>').option('--machine <raspberry_pi_5|laptop_cpu|apple_silicon|desktop_cpu|desktop_gpu_laptop|desktop_gpu_desktop|desktop_gpu_high_end>')
  .option('-l, --library <dir>').option('-c, --config <file>').option('--json').action(computeEstimate);

const jobs = program.command('jobs').description('the job queue that survives outages / la file de tâches qui survit aux coupures');
jobs.command('list').option('-l, --library <dir>').option('-c, --config <file>').option('--json').action(jobsList);
jobs.command('show <id>').option('-l, --library <dir>').option('-c, --config <file>').action(jobsShow);
jobs.command('cancel <id>').option('-l, --library <dir>').option('-c, --config <file>').action(jobsCancel);

const proj = program.command('project').description('project types and their solvers: inventory in, deliverables out / types de projet et solveurs');
proj.command('types').description('list the project recipes, validated against the catalog').option('--json').action(projectTypes);
proj.command('check <inventory>').description('what an inventory still lacks for a project type').option('--type <id>').action(projectCheck);
proj.command('plan <inventory>').description('garden plan: calendar, plot assignment, yields (md + ics + json)')
  .option('--year <y>').option('--out <dir>').option('--json').option('--ics').action(projectPlan);

program.command('export').description('copy library + Arche to a USB drive / copie bibliothèque + Arche sur une clé USB')
  .requiredOption('--to <dir>').option('-l, --library <dir>').action(exportCommand);
program.command('import').description('import a USB bundle on an offline machine / importe un bundle USB sur une machine hors-ligne')
  .requiredOption('--from <dir>').option('-l, --library <dir>').action(importCommand);

const cat = program.command('catalog').description('inspect the catalog / inspecter le catalogue');
cat.command('validate').description('schemas, rules, and knowledge/ provenance (every value has a locator or an explicit grace) / schémas, règles, provenance de knowledge/').action(catalogValidate);
cat.command('list').option('--type <t>').option('--category <c>').option('--profile <p>').option('--json').action(catalogList);
cat.command('show <id>').action(catalogShow);
cat.command('index').description('print a flat JSON index').action(catalogIndex);
cat.command('freshness').description('share of resources verified within their interval / part des ressources vérifiées à temps')
  .option('--json').option('--stale', 'list every stale or never-checked resource').option('--min <pct>', 'exit 1 below this percentage (CI gate)').action(catalogFreshness);

program.command('knowledge').description('the knowledge files (figures, crops, compute): provenance or nothing / les fichiers de connaissance : provenance ou rien')
  .command('verify').description('compute `verified`: open the installed shards, find each source article and quote; exit 1 on a missing provenance or a quote that does not resolve / calcule `verified` contre les shards installés')
  .option('-l, --library <dir>').option('-c, --config <file>').option('--json').option('--write <file>', 'rewrite the <!-- knowledge --> block of a Markdown file (README.md)').action(knowledgeVerify);

program.parseAsync(process.argv).catch(e => { console.error(e.message ?? e); process.exit(1); });
