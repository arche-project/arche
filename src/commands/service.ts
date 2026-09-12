// `arche service install|uninstall|status` : démarrer Arche au boot avec ce que la machine a déjà.
// Start Arche at boot with what the machine already has (systemd / launchd) — ADR 0008.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serviceInstallPlan } from '../core/service-files.js';
import { libraryDir } from '../core/paths.js';
import { loadConfig } from '../core/config.js';
import { t } from '../core/i18n.js';

function plan(o: { library?: string }) {
  const cfg = loadConfig();
  const lib = libraryDir(o.library ?? cfg.library);
  // Exécutable : le SEA `arche` si c'est lui qui tourne, sinon `node dist/cli.js`.
  const isSea = !/node(\.exe)?$/i.test(process.execPath);
  const execPath = process.execPath;
  const args = isSea ? ['serve', '--quiet'] : [process.argv[1]!, 'serve', '--quiet'];
  return { lib, p: serviceInstallPlan(process.platform, os.homedir(), { execPath, args, library: lib }) };
}

const run = (cmd: string[]): boolean => spawnSync(cmd[0]!, cmd.slice(1), { stdio: 'inherit' }).status === 0;

export function serviceInstall(o: { library?: string; enable?: boolean; print?: boolean }) {
  const { p } = plan(o);
  if (!p) { console.error(t('service.unsupported')); process.exitCode = 1; return; }
  if (o.print) { console.log(p.content); return; }
  fs.mkdirSync(path.dirname(p.file), { recursive: true });
  fs.writeFileSync(p.file, p.content);
  console.log(t('service.written', { file: p.file }));
  if (o.enable) { if (!run(p.enable)) process.exitCode = 1; }
  else console.log(t('service.enable_hint', { cmd: p.enable.join(' ') }));
}

export function serviceUninstall(o: { library?: string }) {
  const { p } = plan(o);
  if (!p) { console.error(t('service.unsupported')); process.exitCode = 1; return; }
  if (fs.existsSync(p.file)) { run(p.disable); fs.rmSync(p.file); console.log(t('service.removed', { file: p.file })); }
  else console.log(t('service.absent', { file: p.file }));
}

export function serviceStatus(o: { library?: string }) {
  const { p } = plan(o);
  if (!p) { console.error(t('service.unsupported')); process.exitCode = 1; return; }
  console.log(fs.existsSync(p.file) ? t('service.installed', { file: p.file }) : t('service.absent', { file: p.file }));
  run(p.status);
}
