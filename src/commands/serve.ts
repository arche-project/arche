// `arche serve` : interface web locale + superviseur des services de la bibliothèque (ADR 0008).
// Local web UI + supervisor of the library's services — what `docker compose` used to be.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startWebServer } from '../web/server.js';
import { loadConfig } from '../core/config.js';
import { libraryDir, stateDir } from '../core/paths.js';
import { loadState } from '../core/state.js';
import { Supervisor, discoverServices } from '../core/supervisor.js';
import { t } from '../core/i18n.js';

export async function serveCommand(o: {
  config?: string; library?: string; port?: string; bind?: string; open?: boolean;
  // commander : `--no-kiwix` donne `kiwix: false` (et non `noKiwix`) — l'ancien code testait le mauvais nom.
  kiwix?: boolean; ollama?: boolean; gitea?: boolean; quiet?: boolean;
}) {
  const cfg = loadConfig(o.config);
  const lib = libraryDir(o.library ?? cfg.library);
  const port = Number(o.port ?? cfg.serve?.port ?? 8765);
  const bind = o.bind ?? cfg.serve?.bind ?? '127.0.0.1';
  const kiwixPort = cfg.serve?.kiwix_port ?? 8080;

  const state = loadState(lib);
  const zims = Object.values(state.installed).map(e => path.join(lib, e.path)).filter(p => p.endsWith('.zim') && fs.existsSync(p));
  const disable = [o.kiwix === false && 'kiwix', o.ollama === false && 'ollama', o.gitea === false && 'gitea'].filter((x): x is string => Boolean(x));
  const { specs, missing } = discoverServices(lib, { bind, kiwixPort, zims, disable });

  const sup = new Supervisor({ logDir: path.join(stateDir(lib), 'logs'), echo: !o.quiet });
  sup.start(specs);
  for (const s of specs) console.log(t('serve.service', { name: s.name, port: s.port ? ` (port ${s.port})` : '' }));
  for (const m of missing) console.log(t('serve.missing', { name: m }));
  if (!zims.length && o.kiwix !== false) console.log(t('serve.no_zim'));

  const shutdown = async (): Promise<void> => { await sup.stop(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await startWebServer({ lib, port, bind, kiwixPort, supervisor: sup });
  console.log(t('serve.listening', { port }));
  console.log(t('serve.log', { file: sup.logFile }));
  if (o.open) {
    const url = `http://localhost:${port}`;
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { shell: process.platform === 'win32', stdio: 'ignore', detached: true }).unref();
  }
}
