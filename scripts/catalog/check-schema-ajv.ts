// Validation complète du catalogue avec Ajv (draft 2020-12) — CI uniquement, garantit que le validateur maison
// (src/core/schema.ts) n'a pas laissé passer quelque chose que le schéma officiel refuserait.
// Full catalog validation with Ajv — CI only.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { CATALOG_DIR, RES_DIR } from './lib.js';

async function main() {
  const Ajv = (await import('ajv/dist/2020.js')).default;
  const addFormats = (await import('ajv-formats')).default;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const vRes = ajv.compile(JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'schema', 'resource.schema.json'), 'utf8')));
  const vProf = ajv.compile(JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'schema', 'profile.schema.json'), 'utf8')));
  let errors = 0;
  for (const f of fs.readdirSync(RES_DIR).filter(f => f.endsWith('.yaml'))) {
    const list = parse(fs.readFileSync(path.join(RES_DIR, f), 'utf8')) as unknown[];
    list.forEach((r, i) => { if (!vRes(r)) { errors++; console.error(f, i, (r as { id?: string }).id, ajv.errorsText(vRes.errors)); } });
  }
  const p = parse(fs.readFileSync(path.join(CATALOG_DIR, 'profiles.yaml'), 'utf8'));
  if (!vProf(p)) { errors++; console.error('profiles.yaml', ajv.errorsText(vProf.errors)); }
  console.log(errors ? `${errors} error(s)` : 'ajv: catalog OK');
  process.exit(errors ? 1 : 0);
}
main();
