// Suit les releases (tag, date, taille de l'asset correspondant) et les derniers commits des dépôts GitHub.
// Tracks releases (tag, date, matching asset size) and latest commits of GitHub repositories.
//
// Usage : tsx scripts/catalog/check-github.ts [--dry-run]   (GITHUB_TOKEN conseillé : 60 req/h sans, 5 000 avec)
import { loadResourceFiles, saveResourceFiles, setField, writeReport, ghHeaders, markChecked, today } from './lib.js';
import { latestStable } from '../../src/core/versions.js';

const dry = process.argv.includes('--dry-run');

async function gh<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(30000) });
  if (r.status === 404) return null;
  if (r.status === 403 || r.status === 429) throw new Error(`GitHub rate-limited (${r.status}) — set GITHUB_TOKEN`);
  if (!r.ok) throw new Error(`GitHub ${r.status} for ${url}`);
  return r.json() as Promise<T>;
}

interface Release { tag_name: string; published_at: string; assets: Array<{ name: string; size: number; browser_download_url: string }> }
interface Commit { sha: string; commit: { committer: { date: string } } }

async function main() {
  const files = loadResourceFiles();
  for (const rf of files) {
    for (let i = 0; i < rf.items.length; i++) {
      const r = rf.items[i];
      const repo = r.source.github_repo;
      if (!repo) continue;
      const tracker = r.update?.tracker;
      try {
        if (tracker === 'github-release' || r.source.kind === 'github-release' || r.source.include_releases) {
          const rel = await gh<Release>(`https://api.github.com/repos/${repo}/releases/latest`);
          if (!rel) { if (r.status !== 'missing') setField(rf, i, 'status', 'missing', 'no release / repo gone'); continue; }
          setField(rf, i, 'version', rel.tag_name, rel.tag_name !== r.version ? 'nouvelle release' : undefined);
          setField(rf, i, 'updated', rel.published_at.slice(0, 10));
          if (r.source.github_asset_pattern) {
            const re = new RegExp(r.source.github_asset_pattern);
            const assets = rel.assets.filter(a => re.test(a.name));
            if (!assets.length) setField(rf, i, 'notes.en', `${r.notes?.en ?? ''} [updater ${today()}: asset pattern matches nothing in ${rel.tag_name}]`.trim(), 'asset pattern broken');
            else setField(rf, i, 'size_bytes', Math.max(...assets.map(a => a.size)));
          }
          if (r.status === 'unverified') setField(rf, i, 'status', 'active');
          markChecked(rf, i);
        } else if (tracker === 'github-tag') {
          // Projets qui taguent sans créer de « release » (OpenWrt, beaucoup de firmwares) : on lit les
          // tags et on applique la politique « dernière stable » — jamais le tag le plus récent tel quel.
          const tags = await gh<Array<{ name: string }>>(`https://api.github.com/repos/${repo}/tags?per_page=100`);
          if (!tags) { if (r.status !== 'missing') setField(rf, i, 'status', 'missing', 'repo gone'); continue; }
          const pick = latestStable(tags.map(t => t.name), r.update?.stability ?? 'stable');
          if (!pick) { console.warn(`${r.id}: aucun tag lisible`); continue; }
          setField(rf, i, 'version', pick.tag, pick.tag !== r.version ? 'nouveau tag stable' : undefined);
          if (pick.fallback) setField(rf, i, 'notes.en', `${(r.notes?.en ?? '').replace(/\s*\[updater [^\]]*\]/g, '')} [updater ${today()}: ${pick.fallback}]`.trim(), pick.fallback);
          if (r.status === 'unverified') setField(rf, i, 'status', 'active');
          markChecked(rf, i);
        } else if (tracker === 'github-commit' || r.source.kind === 'github-repo') {
          const info = await gh<{ default_branch: string; size: number; archived: boolean }>(`https://api.github.com/repos/${repo}`);
          if (!info) { if (r.status !== 'missing') setField(rf, i, 'status', 'missing', 'repo gone'); continue; }
          if (info.archived && r.status !== 'deprecated') setField(rf, i, 'status', 'deprecated', 'repo archived upstream');
          const commits = await gh<Commit[]>(`https://api.github.com/repos/${repo}/commits?sha=${info.default_branch}&per_page=1`);
          if (commits?.[0]) { setField(rf, i, 'version', commits[0].sha.slice(0, 12)); setField(rf, i, 'updated', commits[0].commit.committer.date.slice(0, 10)); }
          setField(rf, i, 'size_bytes', info.size * 1024);   // taille du dépôt en Ko d'après l'API (approximation du clone)
          if (r.status === 'unverified' && !info.archived) setField(rf, i, 'status', 'active');
          markChecked(rf, i);
        }
      } catch (e) { console.warn(`${r.id}: ${(e as Error).message}`); if ((e as Error).message.includes('rate-limited')) break; }
    }
  }
  if (!dry) saveResourceFiles(files);
  writeReport('github');
}
main().catch(e => { console.error(e); process.exit(1); });
