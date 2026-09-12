import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInventory, inventoryFields, type Inventory } from '../src/core/project/inventory.js';
import { loadRecipes, validateRecipe, missingInventory, recipePrompt, PROJECT_SOLVERS } from '../src/core/project/recipes.js';
import { planGarden, resolveCrop, renderGardenMarkdown, renderGardenIcs, cropsFile } from '../src/core/project/garden.js';
import { substituteBom, renderBomMarkdown } from '../src/core/project/bom.js';
import { loadCatalog } from '../src/core/catalog.js';

const inv: Inventory = {
  people: 2,
  climate: { last_frost: '05-10', first_frost: '10-25' },
  plots: [
    { id: 'A', area_m2: 20, sun: 'full', last_family: 'Solanaceae' },
    { id: 'B', area_m2: 20, sun: 'full', last_family: 'Fabaceae' },
    { id: 'C', area_m2: 6, sun: 'partial' },
  ],
  seeds: [{ crop: 'tomate', plants: 10 }, { crop: 'petit pois' }, { crop: 'Épinard' }, { crop: 'ail', plants: 30 }, { crop: 'fraisier' }],
};

test('inventory validation reports readable errors and accepts a good file', () => {
  assert.deepEqual(validateInventory(inv), []);
  const bad = validateInventory({ people: 0, climate: { last_frost: '5 mai' }, plots: [{ id: 'A', area_m2: -1, sun: 'north' }, { id: 'A', area_m2: 3 }], seeds: [{}], components: [{}] });
  assert.ok(bad.some(e => e.includes('people')));
  assert.ok(bad.some(e => e.includes('MM-JJ')));
  assert.ok(bad.some(e => e.includes('en double')));
  assert.ok(bad.some(e => e.includes('sun')));
  assert.ok(bad.some(e => e.includes('crop manquant')));
  assert.ok(bad.some(e => e.includes('ref manquante')));
  assert.equal(validateInventory([]).length, 1);
  const fields = inventoryFields(inv);
  assert.ok(fields.has('plots') && fields.has('climate.last_frost') && fields.has('plots.last_family') && !fields.has('components'));
});

test('crop names resolve through FR/EN aliases, accents and spaces', () => {
  assert.equal(resolveCrop('Tomate')?.key, 'tomato');
  assert.equal(resolveCrop('petit pois')?.key, 'pea');
  assert.equal(resolveCrop('Épinard')?.key, 'spinach');
  assert.equal(resolveCrop('winter_squash')?.key, 'winter_squash');
  assert.equal(resolveCrop('fraisier'), undefined);
  const f = cropsFile();
  for (const [k, c] of Object.entries(f.crops)) {
    assert.ok(c.family && c.spacing_cm.row > 0 && c.spacing_cm.plant > 0 && c.days_to_harvest > 0, k);
    assert.ok(c.sow.indoor !== undefined || c.sow.direct !== undefined, `${k} : aucune fenêtre de semis`);
    assert.ok(c.yield_kg_per_m2.lo <= c.yield_kg_per_m2.hi, k);
  }
  for (const target of Object.values(f.aliases ?? {})) assert.ok(f.crops[target], `alias vers ${target} inexistant`);
});

test('the garden plan respects rotation, dates from frost, autumn planting, and lists unknown crops', () => {
  const plan = planGarden(inv, { year: 2027 });
  const tomatoBed = plan.beds.find(b => b.crop === 'tomato')!;
  assert.equal(tomatoBed.plot, 'B', 'la tomate évite la parcelle qui a porté des Solanacées');
  const peaBed = plan.beds.find(b => b.crop === 'pea')!;
  assert.notEqual(peaBed.plot, 'B', 'le pois évite la parcelle qui a porté des Fabacées');
  const ev = (crop: string, action: string) => plan.calendar.find(e => e.crop === crop && e.action === action)!.date;
  assert.equal(ev('tomato', 'transplant'), '2027-05-17', 'repiquage = dernière gelée + 1 semaine');
  assert.equal(ev('tomato', 'sow_indoor'), '2027-03-22', 'semis au chaud = dernière gelée − 7 semaines');
  assert.equal(ev('tomato', 'harvest_start'), '2027-07-26');
  assert.equal(ev('garlic', 'sow_direct'), '2026-10-11', 'ail planté deux semaines avant la première gelée de l’automne précédent');
  assert.ok(ev('garlic', 'harvest_start').startsWith('2027-06'));
  assert.deepEqual(plan.unknown, ['fraisier']);
  assert.equal(plan.crops.find(c => c.crop === 'pea')!.plants_wanted, 60, '30 plants par personne × 2');
  assert.ok(plan.crops.every(c => c.plants_planned === c.plants_wanted), 'assez de place : tout est planifié');
  assert.ok(plan.assumptions.some(a => a.includes('unsourced')), 'les fiches sans locator (M4-1) sont dites dans les hypothèses');
  assert.equal(plan.climate.defaulted, false);
  // Le calendrier est trié et chaque récolte commence avant de finir.
  for (let i = 1; i < plan.calendar.length; i++) assert.ok(plan.calendar[i]!.date >= plan.calendar[i - 1]!.date);
  for (const c of plan.crops) assert.ok(ev(c.crop, 'harvest_start') <= ev(c.crop, 'harvest_end'));
});

test('too little area reduces plants with a warning; a late frost pushes a tender crop past the first frost', () => {
  const small = planGarden({ plots: [{ id: 'X', area_m2: 1, sun: 'full' }], seeds: [{ crop: 'courge', plants: 10 }] }, { year: 2027 });
  const squash = small.crops[0]!;
  assert.ok(squash.plants_planned < 10 && squash.plants_planned >= 0);
  assert.ok(small.warnings.some(w => w.includes('sans place')));
  assert.ok(small.assumptions.some(a => a.includes('défaut')), 'gel par défaut signalé');
  const cold = planGarden({ climate: { last_frost: '07-15', first_frost: '09-15' }, plots: [{ id: 'X', area_m2: 50 }], seeds: [{ crop: 'courge', plants: 2 }] }, { year: 2027 });
  assert.ok(cold.warnings.some(w => w.includes('après la première gelée')));
  const shade = planGarden({ plots: [{ id: 'S', area_m2: 50, sun: 'shade' }], seeds: [{ crop: 'tomate', plants: 2 }] }, { year: 2027 });
  assert.equal(shade.crops[0]!.plants_planned, 0, 'pas de tomate à l’ombre');
  const forced = planGarden({ plots: [{ id: 'A', area_m2: 50, sun: 'full', last_family: 'Solanaceae' }], seeds: [{ crop: 'tomate', plants: 2 }] }, { year: 2027 });
  assert.equal(forced.crops[0]!.plants_planned, 2);
  assert.ok(forced.warnings.some(w => w.includes('rotation rompue')));
});

test('markdown, ics and the tool spec render the same plan', () => {
  const plan = planGarden(inv, { year: 2027 });
  const md = renderGardenMarkdown(plan, 'fr');
  assert.ok(md.includes('# Plan du potager 2027') && md.includes('| Tomate') && md.includes('fraisier') && md.includes('comestible'));
  const en = renderGardenMarkdown(plan, 'en');
  assert.ok(en.includes('# Garden plan 2027') && en.includes('| Tomato'));
  const ics = renderGardenIcs(plan);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trim().endsWith('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, plan.calendar.length);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270517'));
});

test('project recipes are consistent with the catalog, the calculators and the generators', () => {
  const cat = loadCatalog({ strict: true });
  const ids = new Set(cat.byId.keys());
  const recipes = loadRecipes();
  assert.ok(recipes.length >= 4);
  for (const r of recipes) assert.deepEqual(validateRecipe(r, ids), [], r.id);
  assert.deepEqual(recipes.map(r => r.id).sort(), ['exploitation-automatisee', 'maison-bioclimatique', 'potager', 'robot-desherbeur', 'tracteur-autonome']);
  const potager = recipes.find(r => r.id === 'potager')!;
  assert.equal(potager.status, 'solver');
  assert.ok(potager.solvers.includes('garden_plan') && PROJECT_SOLVERS.includes('garden_plan'));
  // Une recette cassée est détectée : ressource absente, solveur inconnu, aucune porte.
  const broken = { ...potager, corpus: ['nope'], solvers: ['magie'], gates: [] };
  const p = validateRecipe(broken, ids);
  assert.ok(p.some(x => x.includes('absent du catalogue')) && p.some(x => x.includes('solveur')) && p.some(x => x.includes('porte')));
  // Le tracteur et le robot ont un interdit sur le pilotage par LLM / la conception de zéro.
  const tractor = recipes.find(r => r.id === 'tracteur-autonome')!;
  assert.ok(tractor.never.some(n => /modèle de langage/.test(n.fr)));
  const prompt = recipePrompt(tractor, 'fr');
  assert.ok(prompt.includes('Portes humaines') && prompt.includes('git-agopengps'));
  const m = missingInventory(tractor, inv);
  assert.deepEqual(m.required, ['machines', 'components', 'tools']);
  assert.deepEqual(missingInventory(potager, inv).required, []);
});

test('the substitution BOM crosses a reference design with the stock and flags every substitution', () => {
  const bom = [
    { ref: 'TB6612FNG', description: 'pont en H', qty: 1, equivalents: [{ ref: 'L298N', changes: 'chute de tension ~2 V, dissipateur requis' }], sourcing: 'récup’ de robot jouet' },
    { ref: 'Raspberry Pi 4', qty: 1, equivalents: [{ ref: 'Raspberry Pi 3B+', changes: 'détection plus lente' }] },
    { ref: 'M3x10', qty: 8 },
  ];
  const r = substituteBom(bom, [{ ref: 'l298n', quantity: 2 }, { ref: 'M3x10', quantity: 5 }]);
  assert.equal(r.lines[0]!.substitute?.ref, 'L298N');
  assert.equal(r.lines[0]!.missing, 0);
  assert.equal(r.lines[1]!.missing, 1);
  assert.equal(r.lines[2]!.from_stock, 5);
  assert.equal(r.lines[2]!.missing, 3);
  assert.equal(r.substitutions, 1);
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing_refs, ['Raspberry Pi 4', 'M3x10']);
  const md = renderBomMarkdown(r);
  assert.ok(md.includes('⚠ chute de tension') && md.includes('Il manque 2'));
  assert.equal(substituteBom(bom.slice(2), [{ ref: 'M3x10', quantity: 8 }]).complete, true);
});
