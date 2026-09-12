import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GENERATORS, renderDiagram, generatorsPrompt } from '../src/core/rag/diagrams.js';
import { baseRules } from '../src/core/rag/prompt.js';
import { loadCatalog } from '../src/core/catalog.js';

test('every generator is complete, has a working example and maps to a catalogue resource', () => {
  const cat = loadCatalog({ strict: true });
  for (const g of Object.values(GENERATORS)) {
    assert.ok(g.produces.fr && g.produces.en && g.when.fr && g.when.en, `${g.kind}: descriptions`);
    assert.ok(g.outputs.length > 0 && g.ext.startsWith('.'), `${g.kind}: sorties`);
    assert.ok(g.example.trim().length > 20, `${g.kind}: exemple`);
    assert.ok(cat.byId.has(g.resource), `${g.kind}: ressource ${g.resource} absente du catalogue`);
    const argv = g.argv('/bin/tool', '/tmp/in' + g.ext, '/tmp/out.' + g.outputs[0]);
    assert.equal(argv[0], '/bin/tool');
    assert.ok(argv.some(a => a.includes('/tmp/in')), `${g.kind}: la source doit être dans argv`);
  }
});

test('rendering without the tool returns the source file and a reason, never throws', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arche-diag-'));
  try {
    const r = await renderDiagram('mermaid', 'flowchart TD\n  A --> B', { lib: dir, outDir: path.join(dir, 'out'), name: 'proc' });
    assert.ok(existsSync(r.sourceFile), 'la source est écrite même sans outil');
    assert.equal(r.outputFile, null);
    // Selon la machine, l'outil est absent (« n'est pas installé ») ou présent mais cassé (« a échoué ») :
    // dans les deux cas le contrat est le même — une raison, pas une exception.
    assert.match(r.reason ?? '', /n'est pas installé|a échoué/);
    assert.equal(readFileSync(r.sourceFile, 'utf8'), 'flowchart TD\n  A --> B\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rendering with a (fake) tool in the library produces the output next to the source', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arche-diag-'));
  try {
    // Un faux `dot` qui écrit un SVG minimal là où on lui dit : -Tsvg src -o out
    const bin = path.join(dir, 'software', 'graphviz', 'dot'); mkdirSync(path.dirname(bin), { recursive: true });
    writeFileSync(bin, '#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; shift; fi; shift; done\necho "<svg xmlns=\\"http://www.w3.org/2000/svg\\"/>" > "$out"\n'); chmodSync(bin, 0o755);
    const r = await renderDiagram('graphviz', 'digraph { a -> b }', { lib: dir, outDir: path.join(dir, 'out'), name: 'net' });
    assert.equal(r.reason, undefined);
    assert.ok(r.outputFile && existsSync(r.outputFile));
    assert.ok(readFileSync(r.outputFile!, 'utf8').includes('<svg'));
    assert.ok(r.sourceFile.endsWith('net.dot'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unsupported output format is refused with the list of supported ones', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arche-diag-'));
  try {
    const r = await renderDiagram('mermaid', 'flowchart TD\n A', { lib: dir, outDir: dir, format: 'stl' });
    assert.match(r.reason ?? '', /stl non supporté/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the MCP rules prompt tells the model to write sources, and lists the generators', () => {
  // ADR 0011 : Arche est un serveur ; les règles partent par `prompts/get arche_rules`, pas par un prompt système maison.
  const p = baseRules('fr');
  assert.ok(p.includes('SOURCE dans un bloc typé'));
  assert.ok(p.includes('```wireviz') && p.includes('```openscad'));
  assert.ok(generatorsPrompt('en').includes('deliverable'));
});

test('diffusion models are optional, bunker-only, and declare generated-only use in their description', () => {
  const cat = loadCatalog({ strict: true });
  for (const id of ['stable-diffusion-cpp', 'hf-flux1-schnell-gguf', 'hf-sdxl-base']) {
    const r = cat.byId.get(id)!;
    assert.equal(r.priority, 'optional', id);
    assert.deepEqual(r.profiles, ['bunker'], id);
    assert.match(r.description.fr, /illustr/i, `${id}: doit dire qu'il illustre`);
  }
});
