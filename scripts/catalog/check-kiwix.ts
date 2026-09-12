// Met à jour toutes les ressources `source.kind: kiwix` depuis le catalogue OPDS de Kiwix :
// URL datée, taille exacte, version, date, statut (active / missing).
// Updates every `source.kind: kiwix` resource from the Kiwix OPDS catalog.
//
// Usage : tsx scripts/catalog/check-kiwix.ts [--dry-run]
import { listAllKiwix, resolveKiwix, type KiwixEntry } from '../../src/core/kiwix.js';
import { loadResourceFiles, saveResourceFiles, setField, writeReport, markChecked, today, setUpdaterNote } from './lib.js';

const dry = process.argv.includes('--dry-run');

async function main() {
  const files = loadResourceFiles();
  // Un seul téléchargement du catalogue complet (≈ 3 000 entrées) plutôt qu'une requête par ressource.
  let all: KiwixEntry[] = [];
  try { all = await listAllKiwix(); console.log(`OPDS: ${all.length} entries`); } catch (e) { console.warn('OPDS full listing failed, falling back to per-name queries:', (e as Error).message); }
  const byName = new Map<string, KiwixEntry>();
  for (const e of all) { const cur = byName.get(e.name); if (!cur || e.updated > cur.updated) byName.set(e.name, e); }

  for (const rf of files) {
    for (let i = 0; i < rf.items.length; i++) {
      const r = rf.items[i];
      if (r.source.kind !== 'kiwix' || !r.source.kiwix_name) continue;
      let e = byName.get(r.source.kiwix_name) ?? null;
      if (!e && !all.length) { try { e = await resolveKiwix(r.source.kiwix_name); } catch { /* réseau */ } }
      if (!e) {
        if (r.status !== 'missing') setField(rf, i, 'status', 'missing', `absent du catalogue OPDS le ${today()}`);
        if (all.length) markChecked(rf, i);   // l'OPDS a répondu : l'absence est un fait, pas une panne
        continue;
      }
      setField(rf, i, 'source.url', e.url);
      setField(rf, i, 'size_bytes', e.size_bytes);
      setField(rf, i, 'version', e.version, e.version !== r.version ? 'nouvelle version' : undefined);
      setField(rf, i, 'updated', e.updated.slice(0, 10));
      if (r.status !== 'active' && r.status !== 'deprecated') setField(rf, i, 'status', 'active');
      markChecked(rf, i);
      // Alerte : taille qui chute de plus de 80 % = build cassé en amont (cas freecodecamp 2026-08)
      const prev = r.size_bytes ?? (r.size_estimate_gb ? r.size_estimate_gb * 1e9 : null);
      if (prev && e.size_bytes < prev * 0.2) setUpdaterNote(rf, i, `size dropped from ${(prev / 1e9).toFixed(1)} GB to ${(e.size_bytes / 1e9).toFixed(2)} GB — upstream build may be broken`, 'size drop');
    }
  }
  if (!dry) saveResourceFiles(files);
  writeReport('kiwix');
}
main().catch(e => { console.error(e); process.exit(1); });
