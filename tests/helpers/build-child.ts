// Processus enfant du test « SIGTERM au milieu » : construit un corpus depuis un dossier avec le faux
// embedder ralenti (un commit tous les deux lots), écrit sa progression sur stdout ; le test parent le
// tue pendant l'embedding : ce qui est commis reste, le lot ouvert est annulé par le journal.
// Child process for the SIGTERM test: builds a corpus slowly, prints progress, gets killed mid-way.
import { buildShard } from '../../src/core/rag/build.js';
import { extractDir } from '../../src/core/rag/extract.js';
import { fakeEmbedder } from './fake-embedder.js';

const [docs, out] = process.argv.slice(2) as [string, string];
await buildShard({
  resourceId: 'sigterm', articles: extractDir(docs), embedder: fakeEmbedder({ delayMs: 150 }), out, checkpointEvery: 2,
  meta: { license_spdx: 'CC0-1.0', license_redistribution: 'allowed', languages: ['fr'] },
  onProgress: p => { if (p.phase === 'embed') process.stdout.write(`embed ${p.done}\n`); },
});
process.stdout.write('done\n');
