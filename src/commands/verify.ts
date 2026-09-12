// `arche verify` : re-hache tout ce qui est installé et compare à l'état. Fonctionne 100 % hors-ligne.
import fs from 'node:fs';
import path from 'node:path';
import { loadState, saveState } from '../core/state.js';
import { hashFile } from '../core/integrity.js';
import { libraryDir } from '../core/paths.js';
import { pct } from '../core/format.js';

export async function verifyCommand(o: { library?: string; fix?: boolean }) {
  const lib = libraryDir(o.library);
  const state = loadState(lib);
  let ok = 0, bad = 0, unknown = 0, missing = 0;
  for (const e of Object.values(state.installed)) {
    const abs = path.join(lib, e.path);
    if (!fs.existsSync(abs)) { console.log(`MISSING  ${e.id}  (${e.path})`); missing++; if (o.fix) delete state.installed[e.id]; continue; }
    if (fs.statSync(abs).isDirectory()) { console.log(`DIR      ${e.id}`); ok++; continue; }
    if (!e.checksum) {
      const size = fs.statSync(abs).size;
      if (size !== e.size_bytes) { console.log(`SIZE?    ${e.id}  ${size} != ${e.size_bytes}`); bad++; } else { console.log(`NOHASH   ${e.id}  (size ok)`); unknown++; }
      continue;
    }
    process.stdout.write(`hash     ${e.id} `);
    const h = await hashFile(abs, e.checksum.algo as 'sha256', d => process.stdout.write(`\rhash     ${e.id} ${pct(d, e.size_bytes)}   `));
    if (h === e.checksum.value) { console.log(`\rOK       ${e.id}                 `); ok++; e.verified_at = new Date().toISOString(); }
    else { console.log(`\rCORRUPT  ${e.id}                 `); bad++; if (o.fix) { fs.unlinkSync(abs); delete state.installed[e.id]; } }
  }
  saveState(lib, state);
  console.log(`\nok ${ok} · corrupt ${bad} · missing ${missing} · no-hash ${unknown}` + (o.fix ? '  (fixed: corrupt/missing entries removed, run `arche download` to refetch)' : ''));
  if (bad || missing) process.exitCode = 1;
}
