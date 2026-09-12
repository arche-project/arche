// `arche project …` : les types de projet et leurs solveurs (ADR 0010).
// `arche project types`          — les recettes, validées contre le catalogue
// `arche project check <inv>`    — ce qui manque dans un inventaire pour un type donné
// `arche project plan <inv>`     — le plan du potager (md + ics + json)
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../core/catalog.js';
import { getLang, pick } from '../core/i18n.js';
import { loadInventory } from '../core/project/inventory.js';
import { loadRecipes, getRecipe, missingInventory, validateRecipe } from '../core/project/recipes.js';
import { planGarden, renderGardenIcs, renderGardenMarkdown } from '../core/project/garden.js';

export function projectTypes(opts: { json?: boolean }): void {
  const cat = loadCatalog({ strict: false });
  const recipes = loadRecipes();
  const problems = recipes.flatMap(r => validateRecipe(r, new Set(cat.byId.keys())));
  if (opts.json) { console.log(JSON.stringify({ recipes, problems }, null, 2)); if (problems.length) process.exit(1); return; }
  const lang = getLang();
  for (const r of recipes) {
    console.log(`${r.id.padEnd(22)} ${r.status === 'solver' ? '● solveur' : '○ recette'}  ${pick(r.name, lang)}`);
    console.log(`  ${lang === 'fr' ? 'livrables' : 'deliverables'} : ${r.deliverables.map(d => `${d.id} (${d.by})`).join(', ')}`);
  }
  if (problems.length) { console.error(`\n${problems.length} problème(s) :\n  - ${problems.join('\n  - ')}`); process.exit(1); }
  console.log(`\n${recipes.length} ${lang === 'fr' ? 'types de projet, recettes cohérentes avec le catalogue' : 'project types, recipes consistent with the catalog'}.`);
}

export function projectCheck(file: string, opts: { type?: string }): void {
  const inv = loadInventory(file);
  const type = opts.type ?? inv.project?.type;
  if (!type) throw new Error('type de projet manquant : --type <id> ou project.type dans l’inventaire');
  const r = getRecipe(type);
  if (!r) throw new Error(`type de projet inconnu : ${type} (voir arche project types)`);
  const m = missingInventory(r, inv);
  const lang = getLang();
  console.log(pick(r.name, lang));
  if (!m.required.length) console.log(lang === 'fr' ? '✓ tout ce que le solveur exige est là' : '✓ everything the solver requires is there');
  else console.log(`${lang === 'fr' ? '✗ manque (requis)' : '✗ missing (required)'} : ${m.required.join(', ')}`);
  if (m.recommended.length) console.log(`${lang === 'fr' ? '· manque (recommandé)' : '· missing (recommended)'} : ${m.recommended.join(', ')}`);
  if (m.required.length) process.exit(1);
}

export function projectPlan(file: string, opts: { year?: string; out?: string; json?: boolean; ics?: boolean }): void {
  const inv = loadInventory(file);
  const lang = getLang();
  const plan = planGarden(inv, { year: opts.year ? Number(opts.year) : undefined });
  if (opts.json) { console.log(JSON.stringify(plan, null, 2)); return; }
  const md = renderGardenMarkdown(plan, lang);
  if (opts.out) {
    fs.mkdirSync(opts.out, { recursive: true });
    const base = path.join(opts.out, `potager-${plan.year}`);
    fs.writeFileSync(`${base}.md`, md);
    fs.writeFileSync(`${base}.ics`, renderGardenIcs(plan, lang));
    fs.writeFileSync(`${base}.json`, JSON.stringify(plan, null, 2));
    console.log(`${lang === 'fr' ? 'écrit' : 'written'} : ${base}.md, .ics, .json`);
  } else {
    process.stdout.write(md);
    if (opts.ics) process.stdout.write('\n' + renderGardenIcs(plan, lang));
  }
  if (plan.unknown.length || plan.warnings.length) process.exitCode = 2;
}
