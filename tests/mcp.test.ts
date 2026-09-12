import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { parseKiwixSearchXml, htmlToText, retrieve } from '../src/core/rag/retrieve.js';
import { createMcpServer, serveStdio, PROTOCOL_VERSIONS } from '../src/core/mcp/server.js';

// Un faux kiwix-serve : /search rend le RSS de Xapian, /raw rend l'article.
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
<channel><title>Search: citerne</title>
<item><title>Citerne d'eau de pluie</title><link>/content/zimgit-water_fr/A/Citerne</link><description>La citerne se dimensionne sur la plus longue &lt;b&gt;période sèche&lt;/b&gt;.</description><book>zimgit-water_fr</book><wordCount>812</wordCount></item>
<item><title>Amanite phalloïde</title><link>/content/wikipedia_fr_medicine/A/Amanite_phallo%C3%AFde</link><description>Lames blanches, volve, anneau.</description><book>wikipedia_fr_medicine</book><wordCount>1200</wordCount></item>
<item><title>Sans livre</title><link>/other_book/A/Page</link><description>lien ancien format</description></item>
</channel></rss>`;

const fakeFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes('/search?')) return new Response(RSS, { status: 200 });
  if (url.includes('/raw/zimgit-water_fr/content/A/Citerne')) return new Response('<html><head><title>Citerne d\'eau de pluie</title></head><body><h1>Citerne</h1><p>Volume = jours secs &times; consommation.</p><script>x()</script></body></html>', { status: 200 });
  if (url.includes('/raw/')) return new Response('<html><title>t</title><body>corps</body></html>', { status: 200 });
  return new Response('nope', { status: 404 });
}) as unknown as typeof fetch;

test('kiwix-serve search XML is parsed, link formats tolerated, entities decoded', () => {
  const hits = parseKiwixSearchXml(RSS);
  assert.equal(hits.length, 3);
  assert.deepEqual({ book: hits[0]!.book, path: hits[0]!.path, wc: hits[0]!.wordCount }, { book: 'zimgit-water_fr', path: 'A/Citerne', wc: 812 });
  assert.equal(hits[0]!.snippet, 'La citerne se dimensionne sur la plus longue période sèche.');
  assert.equal(hits[2]!.book, 'other_book', 'livre déduit du lien quand <book> manque');
  assert.equal(htmlToText('<p>a &amp; b</p><script>no()</script><div>c</div>'), 'a & b\nc');
});

test('retrieve works on Xapian alone, numbers passages, keeps links and raises flags', async () => {
  const r = await retrieve('citerne', { fetchImpl: fakeFetch, host: 'http://kiwix.test', k: 5 });
  assert.equal(r.channels.xapian, 'ok');
  assert.equal(r.channels.sqlite, 'off', 'pas de corpus installé : le canal sqlite est absent, pas en erreur');
  assert.equal(r.passages[0]!.n, 1);
  assert.equal(r.passages[0]!.url, 'http://kiwix.test/content/zimgit-water_fr/A/Citerne');
  assert.ok(r.passages[0]!.text.includes('période sèche'));
  assert.deepEqual(r.flags, []);
  const f = await retrieve('est-ce que ce champignon est comestible ?', { fetchImpl: fakeFetch, host: 'http://kiwix.test' });
  assert.ok(f.flags.some(x => x.id === 'identification'));
  const down = await retrieve('citerne', { fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch });
  assert.equal(down.channels.xapian, 'error');
  assert.deepEqual(down.passages, []);
});

test('MCP dispatcher: initialize, tools/list, tools/call (search, calculator, garden, recipe), resources, prompts', async () => {
  const srv = createMcpServer({ lib: '/tmp/arche-test-lib', lang: 'fr', kiwixHost: 'http://kiwix.test', fetchImpl: fakeFetch });
  const call = (method: string, params: Record<string, unknown> = {}, id: number | string = 1) => srv.handle({ jsonrpc: '2.0', id, method, params });

  const init = (await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } }))!;
  const initRes = init.result as { protocolVersion: string; serverInfo: { name: string }; capabilities: Record<string, unknown>; instructions: string };
  assert.equal(initRes.protocolVersion, '2025-03-26', 'on répond dans la version demandée quand on la connaît');
  assert.equal(initRes.serverInfo.name, 'arche');
  assert.ok(initRes.instructions.includes('Règles absolues'));
  assert.equal((await call('initialize', { protocolVersion: '1999-01-01' }))!.result && ((await call('initialize', { protocolVersion: '1999-01-01' }))!.result as { protocolVersion: string }).protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.equal(await srv.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'une notification n’a pas de réponse');
  assert.deepEqual((await call('ping'))!.result, {});

  const list = (await call('tools/list'))!.result as { tools: Array<{ name: string; inputSchema: { type: string } }> };
  const names = list.tools.map(t => t.name);
  for (const n of ['search', 'read_article', 'calc_citerne', 'garden_plan', 'bom_substitute', 'project_recipe', 'render_diagram', 'catalog_search']) assert.ok(names.includes(n), n);
  assert.ok(list.tools.every(t => t.inputSchema.type === 'object'));

  const s = (await call('tools/call', { name: 'search', arguments: { query: 'citerne', k: 3 } }))!.result as { content: Array<{ text: string }>; isError: boolean; structuredContent: { passages: unknown[] } };
  assert.equal(s.isError, false);
  assert.ok(s.content[0]!.text.includes('[1] zimgit-water_fr'));
  assert.ok(s.content[0]!.text.includes('canaux : xapian=ok sqlite=off'));
  const flagged = (await call('tools/call', { name: 'search', arguments: { query: 'quelle dose de teinture donner à un enfant ?' } }))!.result as { content: Array<{ text: string }> };
  assert.ok(flagged.content[0]!.text.startsWith('⚠ SUJET SENSIBLE'));

  const c = (await call('tools/call', { name: 'calc_citerne', arguments: { people: 4, dry_days: 60 } }))!.result as { content: Array<{ text: string }>; isError: boolean; structuredContent: { value: number } };
  assert.equal(c.isError, false);
  assert.ok(c.structuredContent.value > 0 && /\d/.test(c.content[0]!.text));

  const g = (await call('tools/call', { name: 'garden_plan', arguments: { inventory_yaml: 'people: 2\nplots: [{ id: A, area_m2: 20, sun: full }]\nseeds: [{ crop: tomate, plants: 4 }, { crop: ail }]', year: 2027 } }))!.result as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(g.isError, false);
  assert.ok(g.content[0]!.text.includes('# Plan du potager 2027') && g.content[0]!.text.includes('| Tomate'));
  const bad = (await call('tools/call', { name: 'garden_plan', arguments: { inventory_yaml: 'plots: [{ id: A, area_m2: -3 }]' } }))!.result as { isError: boolean; content: Array<{ text: string }> };
  assert.equal(bad.isError, true);
  assert.ok(bad.content[0]!.text.includes('area_m2'));

  const rc = (await call('tools/call', { name: 'project_recipe', arguments: { type: 'tracteur-autonome', inventory_yaml: 'tools: [clé de 13]' } }))!.result as { content: Array<{ text: string }> };
  assert.ok(rc.content[0]!.text.includes('Portes humaines') && rc.content[0]!.text.includes('manque (requis) : machines, components'));
  const unknownTool = (await call('tools/call', { name: 'nope' }))!;
  assert.equal(unknownTool.error?.code, -32602);

  const res = (await call('resources/list'))!.result as { resources: Array<{ uri: string }> };
  assert.ok(res.resources.some(r => r.uri === 'arche://rules/fr') && res.resources.some(r => r.uri === 'arche://recipes/potager'));
  const read = (await call('resources/read', { uri: 'arche://article/zimgit-water_fr/A/Citerne' }))!.result as { contents: Array<{ text: string }> };
  assert.ok(read.contents[0]!.text.startsWith("# Citerne d'eau de pluie"));
  const crops = (await call('resources/read', { uri: 'arche://knowledge/crops.yaml' }))!.result as { contents: Array<{ mimeType: string; text: string }> };
  assert.ok(crops.contents[0]!.text.includes('tomato:'));

  const pr = (await call('prompts/get', { name: 'arche_project', arguments: { type: 'robot-desherbeur', lang: 'en' } }))!.result as { messages: Array<{ content: { text: string } }> };
  assert.ok(pr.messages[0]!.content.text.includes('Absolute rules') && pr.messages[0]!.content.text.includes('git-openweedlocator'));
  assert.equal((await call('nope/method'))!.error?.code, -32601);
});

test('stdio transport frames one JSON message per line and ignores blank lines', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let out = '';
  output.on('data', d => { out += d.toString(); });
  const done = serveStdio({ lib: '/tmp/arche-test-lib', lang: 'en', kiwixHost: 'http://kiwix.test', fetchImpl: fakeFetch }, { input, output });
  input.write('{"jsonrpc":"2.0","id":"a","method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n\n');
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"project_types","arguments":{}}}\n');
  input.write('not json\n');
  input.end();
  await done;
  await new Promise(r => setTimeout(r, 50));
  const lines = out.trim().split('\n').map(l => JSON.parse(l) as { id: unknown; result?: unknown; error?: { code: number } });
  assert.equal(lines.length, 3, 'deux réponses + une erreur de parse, pas de réponse à la notification');
  assert.equal(lines[0]!.id, 'a');
  assert.ok(JSON.stringify(lines[1]!.result).includes('potager'));
  assert.equal(lines[2]!.error?.code, -32700);
});
