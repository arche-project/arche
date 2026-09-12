import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Reranker, parseRerankResponse, orderByScore, rerankRequestBody } from '../src/core/rag/rerank.js';
import { EMBED_MODELS } from '../src/core/rag/embed.js';
import { loadCatalog } from '../src/core/catalog.js';

const docs = [
  { id: 'a', text: 'Le noyer produit 20 à 50 kg de noix par arbre adulte.' },
  { id: 'b', text: 'La citerne se dimensionne sur la plus longue période sèche.' },
  { id: 'c', text: "L'amanite phalloïde a des lames blanches et une volve." },
];

/** Lance un faux serveur HTTP et rend son URL ; `handler` décide de la réponse. */
function fakeServer(handler: (path: string, body: string) => { status: number; json: unknown }): Promise<{ url: string; close: () => void; calls: string[] }> {
  const calls: string[] = [];
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        calls.push(req.url ?? '');
        const r = handler(req.url ?? '', body);
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(r.json));
      });
    });
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => srv.close(), calls });
    });
  });
}

test('rerank request and response follow the llama-server / Jina shape', () => {
  const body = rerankRequestBody('citerne', ['x', 'y'], 5);
  assert.deepEqual(body, { model: 'reranker', query: 'citerne', documents: ['x', 'y'], top_n: 5 });
  const scores = parseRerankResponse({ results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.1 }, { index: 7, relevance_score: 1 }] }, 2);
  assert.deepEqual(scores, [0.1, 0.9], 'index hors bornes ignoré');
  assert.throws(() => parseRerankResponse({}, 2), /results/);
});

test('ordering is by score, stable on ties, and tolerates missing scores', () => {
  const ordered = orderByScore(docs, [0.2, 0.9, 0.2]);
  assert.deepEqual(ordered.map(o => o.item.id), ['b', 'a', 'c']);
  const partial = orderByScore(docs, [0.5]);
  assert.equal(partial[0]!.item.id, 'a');
  assert.equal(partial[2]!.score, Number.NEGATIVE_INFINITY);
});

test('with llama-server up, the reranker reorders by relevance and reports its backend', async () => {
  const srv = await fakeServer((path, body) => {
    const q = JSON.parse(body) as { query: string; documents: string[] };
    // Le faux serveur « lit » : l'extrait qui contient le mot de la question gagne.
    const results = q.documents.map((d, i) => ({ index: i, relevance_score: d.toLowerCase().includes(q.query.toLowerCase()) ? 0.95 : 0.05 }));
    return { status: 200, json: { results } };
  });
  try {
    const rr = new Reranker({ llamaHost: srv.url, ollamaHost: 'http://127.0.0.1:1' });
    const out = await rr.rerank('volve', docs);
    assert.equal(out[0]!.item.id, 'c');
    assert.equal(rr.lastBackend, 'llama-server');
    assert.deepEqual(srv.calls, ['/v1/rerank']);
  } finally { srv.close(); }
});

test('with llama-server down and Ollama up, the yes/no fallback is used', async () => {
  const srv = await fakeServer((path, body) => {
    if (path !== '/api/chat') return { status: 404, json: {} };
    const msgs = (JSON.parse(body) as { messages: Array<{ content: string }> }).messages;
    // Le message contient la question ET l'extrait : le faux juge ne regarde que l'extrait.
    const extract = msgs[1]!.content.split('Extrait :')[1] ?? '';
    const yes = extract.includes('citerne');
    return { status: 200, json: { message: { content: yes ? 'oui' : 'non' } } };
  });
  try {
    const rr = new Reranker({ llamaHost: 'http://127.0.0.1:1', ollamaHost: srv.url, timeoutMs: 2000 });
    const out = await rr.rerank('citerne', docs);
    assert.equal(out[0]!.item.id, 'b');
    assert.equal(rr.lastBackend, 'ollama-yesno');
  } finally { srv.close(); }
});

test('with nothing up, the reranker returns the input order and never throws', async () => {
  const rr = new Reranker({ llamaHost: 'http://127.0.0.1:1', ollamaHost: 'http://127.0.0.1:1', timeoutMs: 500 });
  const out = await rr.rerank('quoi que ce soit', docs);
  assert.deepEqual(out.map(o => o.item.id), ['a', 'b', 'c']);
  assert.equal(rr.lastBackend, 'none');
  assert.deepEqual(await rr.rerank('x', []), []);
});

test('topN truncates after reranking', async () => {
  const srv = await fakeServer((_p, body) => {
    const q = JSON.parse(body) as { documents: string[] };
    return { status: 200, json: { results: q.documents.map((_d, i) => ({ index: i, relevance_score: i })) } };
  });
  try {
    const out = await new Reranker({ llamaHost: srv.url, topN: 2 }).rerank('q', docs);
    assert.deepEqual(out.map(o => o.item.id), ['c', 'b']);
  } finally { srv.close(); }
});

test('Qwen3-Embedding is registered with its dimensions, and the new models are in the catalog tiers', () => {
  assert.equal(EMBED_MODELS['qwen3-embedding:0.6b']!.dims, 1024);
  assert.equal(EMBED_MODELS['qwen3-embedding:4b']!.dims, 2560);
  const cat = loadCatalog({ strict: true });
  for (const id of ['ollama-qwen3-5-9b', 'ollama-qwen3-5-35b-a3b', 'ollama-qwen3-6-27b', 'qwen3-reranker-0-6b', 'ollama-deepseek-ocr', 'whisper-cpp', 'piper-tts']) {
    assert.ok(cat.byId.has(id), id);
  }
  const medium = cat.ai_tiers.find(t => t.id === 'medium')!;
  assert.ok(medium.models.includes('ollama-qwen3-5-9b') && medium.models.includes('qwen3-reranker-0-6b'));
  const large = cat.ai_tiers.find(t => t.id === 'large')!;
  assert.ok(large.models.includes('ollama-qwen3-5-35b-a3b'), 'le MoE est le choix CPU dès 32 Go');
});
