// Le corpus fixture partagé par index.test.ts et retrieve.test.ts : trois documents lisibles, un trop
// court, un long manuel (au-delà d'un lot d'embedding). Écrit dans un dossier temporaire, jamais dans le dépôt.
// The shared fixture corpus: three readable documents, one too short, one long manual.
import fs from 'node:fs';
import path from 'node:path';

export const CITERNE_SENTENCE = 'La citerne se dimensionne sur la plus longue période sèche : jours secs × consommation quotidienne. ';
export const FLUSH_SENTENCE = 'Détourner le premier flux de toiture, chargé de poussière et de fientes, avant de remplir la citerne. ';

export function writeFixtureDocs(docs: string): void {
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'citerne.md'), '# Dimensionner une citerne\n\n' + CITERNE_SENTENCE.repeat(12) + '\n\n## Premier flush\n\n' + FLUSH_SENTENCE.repeat(10));
  fs.writeFileSync(path.join(docs, 'amanite.html'), '<html><head><title>Amanite phalloïde</title></head><body><p>' + 'Lames blanches, volve en sac, anneau : le champignon le plus mortel d’Europe. '.repeat(15) + '</p><a href="amanite.jpg">photo</a></body></html>');
  fs.writeFileSync(path.join(docs, 'vide.txt'), 'trop court');
  fs.writeFileSync(path.join(docs, 'manuel.md'), '# Manuel du sol\n\n' + Array.from({ length: 45 }, (_, i) => `## Section ${i + 1}\n\n` + `Le sol de la section ${i + 1} demande du compost mûr, un paillage épais et une rotation stricte des familles. `.repeat(14)).join('\n\n'));
}
