import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkArticle } from '../src/core/rag/chunk.js';
import { quantize, QUANT } from '../src/core/rag/sqlite.js';
import { rrf, diversify } from '../src/core/rag/fuse.js';
import { runCalculator, CALCULATORS, figures } from '../src/core/rag/figures.js';
import { detectRedFlags, baseRules, hasCitations } from '../src/core/rag/prompt.js';
import { pickEmbedModel, EMBED_MODELS } from '../src/core/rag/embed.js';

// --- Découpage ---------------------------------------------------------------------------------

test('chunker keeps headings and never loses text', () => {
  const text = [
    '# Pompe à corde',
    '',
    'Une pompe à corde remonte l’eau d’un puits au moyen d’une corde et de pistons.',
    '',
    '## Construction',
    '',
    'Il faut un tube PVC, une corde polypropylène et des rondelles découpées dans du cuir.',
    '',
    'Le débit dépend du diamètre du tube et de la vitesse de rotation de la manivelle.',
  ].join('\n');
  const chunks = chunkArticle('A/Pompe', 'Pompe à corde', text);
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.every(c => c.path === 'A/Pompe' && c.title === 'Pompe à corde'));
  // Les titres sont retenus comme contexte de section, pas émis comme chunks isolés.
  assert.ok(chunks.some(c => c.heading === 'Construction'));
  assert.ok(chunks.map(c => c.text).join(' ').includes('polypropylène'));
});

test('chunker splits oversized paragraphs and offsets stay ordered', () => {
  const long = Array.from({ length: 60 }, (_, i) => `Phrase numéro ${i} qui décrit une étape du montage.`).join(' ');
  const chunks = chunkArticle('A/Long', 'Long', long, { target: 400, max: 600, overlap: 0 });
  assert.ok(chunks.length > 3, `attendu plusieurs chunks, obtenu ${chunks.length}`);
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i]!.offset >= chunks[i - 1]!.offset, 'offsets non croissants');
  }
  assert.ok(chunks.every(c => c.length > 0));
});

test('chunker returns nothing for empty input', () => {
  assert.deepEqual(chunkArticle('A/x', 'x', '   \n\n  '), []);
});

// --- Encodage des vecteurs (ADR 0014 : int8 normalisé × 127, le cosinus est un produit scalaire d'entiers) ---

test('quantize normalises then quantises to int8, and the dot product is the cosine × 127²', () => {
  const out = new Int8Array(8);
  quantize([3, 4, 0, 0], out, 0);
  quantize([0, 0, 0, 0], out, 4);
  assert.deepEqual([...out], [76, 102, 0, 0, 0, 0, 0, 0], 'normalisé (0,6 ; 0,8) × 127, arrondi ; le vecteur nul reste nul');
  const a = new Int8Array(4), b = new Int8Array(4);
  quantize([1, 0, 0, 0], a, 0); quantize([0.7, 0.7, 0, 0], b, 0);
  let dot = 0; for (let i = 0; i < 4; i++) dot += a[i]! * b[i]!;
  assert.ok(Math.abs(dot / (QUANT * QUANT) - Math.SQRT1_2) < 0.01, `cosinus attendu ≈ 0,707, obtenu ${dot / (QUANT * QUANT)}`);
  assert.equal(Math.max(...a), QUANT, 'jamais au-delà de ±127');
});

// --- Fusion (le lexical est FTS5 dans la base du corpus depuis l'ADR 0014 ; le BM25 maison a disparu) ---

test('rrf rewards agreement between lists', () => {
  const dense = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
  const lex = [{ id: 'z' }, { id: 'x' }, { id: 'w' }];
  const fused = rrf([{ name: 'dense', items: dense }, { name: 'lex', items: lex }]);
  // x est 1er et 2e ; z est 3e et 1er. x doit passer devant.
  assert.equal(fused[0]!.item.id, 'x');
  assert.deepEqual(fused[0]!.ranks, { dense: 1, lex: 2 });
  assert.ok(fused.some(f => f.item.id === 'w'), 'un résultat propre à une seule liste doit survivre');
});

test('diversify caps passages from a single resource but still fills the budget', () => {
  const hits = ['a', 'a', 'a', 'a', 'b', 'c'].map((r, i) => ({
    item: { id: `${r}${i}`, resource_id: r }, score: 1 - i / 100, ranks: {},
  }));
  const out = diversify(hits, 4, 2);
  assert.equal(out.length, 4);
  assert.equal(out.filter(h => h.item.resource_id === 'a').length, 2, 'quota par source respecté');
  assert.ok(out.some(h => h.item.resource_id === 'b'));
  assert.ok(out.some(h => h.item.resource_id === 'c'));
  // S'il reste de la place après diversification, on repêche plutôt que de rendre moins d'extraits.
  const roomy = diversify(hits, 6, 2);
  assert.equal(roomy.length, 6);
  assert.equal(roomy.filter(h => h.item.resource_id === 'a').length, 4);
});

// --- Calculateurs ------------------------------------------------------------------------------

test('figures file loads and carries its uncertainty', () => {
  const f = figures();
  assert.equal(f.version, 1);
  assert.match(String(f.uncertainty), /30/);
});

test('rainwater follows the documented formula', () => {
  const r = runCalculator('eau_pluie', { roof_m2: 100, rainfall_mm: 800 });
  assert.equal(r.value, 64000); // 100 × 800 × 0,8
  assert.equal(r.unit, 'L/an');
  assert.ok(r.steps.length >= 1);
  assert.ok(r.caveat!.fr.includes('amiante'));
});

test('cistern sizes on the dry spell, not the year', () => {
  const r = runCalculator('citerne', { people: 4, dry_days: 90, litres_per_day: 40 });
  assert.equal(r.value, 14.4); // 4 × 40 × 90 = 14 400 L
  assert.equal(r.unit, 'm³');
});

test('calories plan on farm work, not on 2000 kcal', () => {
  const r = runCalculator('calories', { adults: 2, children: 2 });
  assert.ok(r.value > 9000, `attendu > 9 000 kcal, obtenu ${r.value}`);
  assert.ok(r.range.lo < r.value && r.value < r.range.hi);
});

test('solar sizing on December needs more panels than the annual average would', () => {
  const north = runCalculator('solaire', { kwh_per_day: 2, region: 'north_fr' });
  const south = runCalculator('solaire', { kwh_per_day: 2, region: 'south_fr' });
  assert.ok(north.value > south.value, 'le nord doit exiger plus de puissance que le sud');
  assert.ok(north.value >= 3 && north.value <= 8, `kWc hors plage plausible : ${north.value}`);
  assert.ok(north.steps.some(s => s.includes('décembre')));
});

test('firewood converts to coppice hectares', () => {
  const r = runCalculator('bois_chauffage', { house: 'uninsulated_120m2' });
  assert.ok(r.value >= 15 && r.value <= 25);
  assert.ok(r.steps.some(s => s.includes('ha de taillis')));
  assert.ok(r.caveat!.fr.includes('monoxyde'));
});

test('hen feed exposes the cereal area behind the flock', () => {
  const r = runCalculator('poules_grain', { hens: 6 });
  assert.equal(r.value, 270);
  assert.ok(r.steps.some(s => s.includes('m² de blé')));
});

test('seed population knows outcrossers need far more plants', () => {
  const selfers = runCalculator('semences_effectif', { group: 'selfers' });
  const out = runCalculator('semences_effectif', { group: 'outcrossers' });
  assert.equal(selfers.value, 20);
  assert.equal(out.value, 200);
});

test('one-year stores scale with people and months', () => {
  const full = runCalculator('stock_un_an', { people: 4 });
  const half = runCalculator('stock_un_an', { people: 4, months: 6 });
  assert.ok(Math.abs(full.value / 2 - half.value) < 1);
  assert.ok(full.value > 1000, `≈ 280 kg/personne attendu, obtenu ${full.value}`);
});

test('calculators reject bad input instead of inventing a number', () => {
  assert.throws(() => runCalculator('inexistant', {}), /inconnu/);
  assert.throws(() => runCalculator('citerne', {}), /people/);
  assert.throws(() => runCalculator('citerne', { people: -3 }), /invalide/);
  assert.throws(() => runCalculator('solaire', { kwh_per_day: 2, region: 'mars' }), /zone inconnue/);
});

test('every calculator declares what the MCP server exposes: a name, a bilingual description, typed params', () => {
  // Le serveur MCP (server.ts) construit `calc_<name>` depuis ces specs ; le format « outils » OpenAI du client abandonné (ADR 0011) n'existe plus.
  for (const c of Object.values(CALCULATORS)) {
    assert.ok(c.name && c.description.fr && c.description.en, `${c.name} : nom et description`);
    for (const [k, p] of Object.entries(c.params)) assert.ok(['number', 'string'].includes(p.type) && p.description.fr && p.description.en, `${c.name}.${k}`);
  }
});

// --- Garde-fous --------------------------------------------------------------------------------

test('red flags catch the questions that kill', () => {
  assert.ok(detectRedFlags('mon fils a mangé des baies rouges').some(f => f.id === 'emergency'));
  assert.ok(detectRedFlags('ce champignon est comestible ?').some(f => f.id === 'identification'));
  assert.ok(detectRedFlags("combien de gouttes d'huile essentielle donner à un enfant").some(f => f.id === 'dosage'));
  assert.ok(detectRedFlags('is this mushroom edible').some(f => f.id === 'identification'));
});

test('ordinary questions raise no flag', () => {
  assert.deepEqual(detectRedFlags('comment fendre du bois de chauffage'), []);
  assert.deepEqual(detectRedFlags('quelle citerne pour 4 personnes'), []);
  assert.deepEqual(detectRedFlags('il a mangé du pain toute la semaine'), [], 'manger sans objet à risque n’est pas une urgence');
});

// Régression : en JavaScript, `\b` ignore les lettres accentuées, donc `\bmangé\b` ne correspond
// jamais. Ce test existe parce que la règle d'urgence a réellement été silencieuse pour cette
// raison — c'est le pire mode de défaillance du projet.
test('accented verbs are detected whatever the subject and the wording', () => {
  for (const q of [
    'mon fils a mangé des baies rouges',
    'on a goûté des champignons ce midi',
    'les enfants ont mangé des graines inconnues',
    'elle a ingéré une feuille de muguet',
    'des champignons ramassés hier, mangés au dîner',
  ]) {
    assert.ok(detectRedFlags(q).some(f => f.id === 'emergency'), `non détecté : « ${q} »`);
  }
});

test('elliptical follow-ups are caught through the conversation context', () => {
  // Le message le plus urgent est souvent le plus abrégé : sans le tour précédent,
  // « elle en a avalé une » ne contient aucun mot déclencheur.
  const q = 'ma fille en a avalé une, qu’est-ce que je fais';
  assert.deepEqual(detectRedFlags(q), [], 'hors contexte, rien à détecter — c’est attendu');
  const withContext = detectRedFlags(q, ['on a trouvé des baies rouges dans le jardin']);
  assert.ok(withContext.some(f => f.id === 'emergency'));
});

test('the MCP rules prompt (ADR 0011) carries the guard-rail instructions and the sensitive-topic rules', () => {
  const flags = detectRedFlags('ce champignon est comestible ?');
  assert.ok(flags.length === 1 && flags[0]!.instruction.fr.length > 20, 'le garde-fou porte sa consigne, rendue par `search` avec les extraits');
  const p = baseRules('fr');
  assert.ok(p.includes('source') || p.includes('SOURCE'), 'les règles exigent de citer');
  assert.ok(baseRules('en').length > 100);
});

test('an answer without citations is rejected when passages were given', () => {
  assert.equal(hasCitations('Il faut environ 14 m³.', 3), false);
  assert.equal(hasCitations('Il faut environ 14 m³ [2].', 3), true);
  assert.equal(hasCitations('Rien trouvé.', 0), true, 'sans extrait, pas de citation exigible');
  assert.equal(hasCitations('Voir [9].', 3), false, 'une citation hors bornes ne compte pas');
});

// --- Modèles d'embedding -----------------------------------------------------------------------

test('embedding model is picked from available RAM', () => {
  assert.equal(pickEmbedModel(16).id, 'bge-m3');
  assert.equal(pickEmbedModel(4).dims, 768);
  assert.equal(pickEmbedModel(2).id, 'multilingual-e5-small');
});

test('every embedding model declares dims matching its family', () => {
  for (const m of Object.values(EMBED_MODELS)) {
    assert.ok(m.dims > 0 && m.dims <= 8192);
    assert.ok(m.note.fr && m.note.en);
  }
});

// --- Fichiers non textuels : STL, SVG, liens ---------------------------------------------------

import { assetKind, extractAssetLinks, describeStl, describeSvg, assetSummary } from '../src/core/rag/assets.js';
import { attachAssets } from '../src/core/rag/chunk.js';

/** Construit un STL binaire valide : un cube 10 × 20 × 30 mm en 12 triangles. */
function cubeStl(): Buffer {
  const [X, Y, Z] = [10, 20, 30];
  const v = (x: number, y: number, z: number): number[] => [x, y, z];
  const c = [v(0,0,0), v(X,0,0), v(X,Y,0), v(0,Y,0), v(0,0,Z), v(X,0,Z), v(X,Y,Z), v(0,Y,Z)];
  // Faces orientées vers l'extérieur pour que le volume signé soit positif.
  const faces = [
    [0,2,1],[0,3,2], [4,5,6],[4,6,7], [0,1,5],[0,5,4], [1,2,6],[1,6,5], [2,3,7],[2,7,6], [3,0,4],[3,4,7],
  ];
  const buf = Buffer.alloc(84 + faces.length * 50);
  buf.write('Arche test cube', 0, 'ascii');
  buf.writeUInt32LE(faces.length, 80);
  faces.forEach((f, i) => {
    const base = 84 + i * 50;
    // normale nulle : les lecteurs la recalculent
    f.forEach((vi, k) => {
      const p = c[vi]!;
      buf.writeFloatLE(p[0]!, base + 12 + k * 12);
      buf.writeFloatLE(p[1]!, base + 12 + k * 12 + 4);
      buf.writeFloatLE(p[2]!, base + 12 + k * 12 + 8);
    });
  });
  return buf;
}

test('binary STL is read without any library: bbox, triangle count, volume', () => {
  const info = describeStl(cubeStl());
  assert.equal(info.format, 'binary');
  assert.equal(info.triangles, 12);
  assert.deepEqual(info.bbox, { x: 10, y: 20, z: 30 });
  assert.ok(Math.abs(info.volume - 6000) < 1, `volume attendu 6000 mm³, obtenu ${info.volume}`);
});

test('ascii STL is read too, and "solid" does not fool the binary detection', () => {
  const ascii = Buffer.from([
    'solid tri',
    '  facet normal 0 0 1',
    '    outer loop',
    '      vertex 0 0 0', '      vertex 4 0 0', '      vertex 0 3 0',
    '    endloop', '  endfacet',
    'endsolid tri',
  ].join('\n'));
  const info = describeStl(ascii);
  assert.equal(info.format, 'ascii');
  assert.equal(info.triangles, 1);
  assert.deepEqual(info.bbox, { x: 4, y: 3, z: 0 });
});

test('empty STL yields zeros rather than NaN or Infinity', () => {
  const info = describeStl(Buffer.alloc(84));
  assert.equal(info.triangles, 0);
  assert.deepEqual(info.bbox, { x: 0, y: 0, z: 0 });
});

test('SVG exposes its title, description, visible text and size', () => {
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">
  <title>Gabarit de pale d'éolienne</title>
  <desc>À découper dans du contreplaqué 12 mm</desc>
  <text x="10" y="20">longueur 600 mm</text>
  <text x="10" y="40">corde <tspan>120 mm</tspan></text>
</svg>`;
  const info = describeSvg(svg);
  assert.equal(info.title, "Gabarit de pale d'éolienne");
  assert.ok(info.desc.includes('contreplaqué'));
  assert.deepEqual(info.texts, ['longueur 600 mm', 'corde 120 mm']);
  assert.equal(info.width, '210mm');
  assert.equal(info.viewBox, '0 0 210 297');
});

test('asset kinds are recognised by extension, case and query string ignored', () => {
  assert.equal(assetKind('parts/Piston.STL'), 'model3d');
  assert.equal(assetKind('plans/pale.svg?raw=1'), 'vector');
  assert.equal(assetKind('doc/manual.pdf#page=3'), 'document');
  assert.equal(assetKind('firmware.gcode'), 'gcode');
  assert.equal(assetKind('A/Pompe_à_corde'), null);
  assert.equal(assetKind('index.html'), null);
});

test('asset links are extracted from HTML and Markdown with their labels', () => {
  const html = `<p>Télécharger <a href="files/piston.stl">le piston</a> et voir <img src="img/montage.png" alt="schéma de montage"></p>`;
  const md = `Voir [la poulie](parts/poulie.svg) et ![photo](p.jpg). Le [wiki](Page_principale) n'est pas un fichier.`;
  const h = extractAssetLinks(html);
  assert.deepEqual(h.map(l => [l.path, l.kind, l.label]), [['files/piston.stl', 'model3d', 'le piston'], ['img/montage.png', 'image', 'schéma de montage']]);
  const m = extractAssetLinks(md);
  assert.deepEqual(m.map(l => l.path), ['parts/poulie.svg', 'p.jpg']);
});

test('assets are attached to the chunk that cites them', () => {
  const raw = [
    '# Pompe à corde', '',
    'Principe général de la pompe, sans aucun fichier ici. ' + 'x'.repeat(300), '',
    '## Pièces', '',
    'Imprimer [le piston](files/piston.stl) puis découper [la poulie](parts/poulie.svg). ' + 'y'.repeat(300),
  ].join('\n');
  const chunks = attachAssets(chunkArticle('A/Pompe', 'Pompe', raw, { overlap: 0 }), raw, extractAssetLinks(raw));
  const withAssets = chunks.filter(c => c.assets?.length);
  assert.equal(withAssets.length, 1, 'un seul chunk cite des fichiers');
  assert.deepEqual(withAssets[0]!.assets, ['files/piston.stl', 'parts/poulie.svg']);
  assert.equal(withAssets[0]!.heading, 'Pièces');
});

test('asset summaries are bilingual, carry dimensions, and survive missing metadata', () => {
  const s = assetSummary('files/piston.stl', 'model3d', describeStl(cubeStl()), 'le piston');
  assert.ok(s.includes('10.0 × 20.0 × 30.0 mm'), s);
  assert.ok(s.includes('printable') && s.includes('imprimable'));
  assert.ok(s.startsWith('le piston (piston.stl)'));
  const g = assetSummary('img/montage.png', 'image');
  assert.ok(g.includes('schéma') && g.includes('diagram'));
});
