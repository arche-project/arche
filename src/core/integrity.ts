// Vérification d'intégrité : hash en streaming, fichiers sidecar (.sha256 / .md5), comparaison.
// Integrity checks: streaming hash, sidecar files (.sha256 / .md5), comparison.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

export async function hashFile(file: string, algo: 'sha256' | 'sha1' | 'md5' = 'sha256', onProgress?: (bytes: number) => void): Promise<string> {
  const h = crypto.createHash(algo);
  let done = 0;
  await pipeline(fs.createReadStream(file), async function* (src) {
    for await (const chunk of src) { h.update(chunk as Buffer); done += (chunk as Buffer).length; onProgress?.(done); yield; }
  });
  return h.digest('hex');
}

/** Parse "abc123  filename" ou "abc123" ; retourne le hash hex ou null. */
export function parseSidecar(text: string): string | null {
  const m = text.trim().match(/^([0-9a-fA-F]{32,128})/);
  return m ? m[1].toLowerCase() : null;
}

/** Essaie de récupérer un checksum en ligne : URL explicite, sinon <url>.sha256 puis <url>.md5. */
export async function fetchExpectedChecksum(fileUrl: string, explicitUrl?: string | null): Promise<{ algo: 'sha256' | 'md5'; value: string } | null> {
  const candidates: Array<[string, 'sha256' | 'md5']> = [];
  if (explicitUrl) candidates.push([explicitUrl, explicitUrl.endsWith('.md5') ? 'md5' : 'sha256']);
  candidates.push([fileUrl + '.sha256', 'sha256'], [fileUrl + '.md5', 'md5']);
  for (const [url, algo] of candidates) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const v = parseSidecar(await r.text());
      if (v && ((algo === 'sha256' && v.length === 64) || (algo === 'md5' && v.length === 32))) return { algo, value: v };
    } catch { /* suivant */ }
  }
  return null;
}

export async function verifyFile(file: string, expected: { algo: 'sha256' | 'sha1' | 'md5'; value: string }, onProgress?: (b: number) => void): Promise<boolean> {
  const actual = await hashFile(file, expected.algo, onProgress);
  return actual === expected.value.toLowerCase();
}
