// Fichiers de service pour démarrer `arche serve` au boot : systemd (Linux) et launchd (macOS).
// Service files to start `arche serve` at boot: systemd (Linux) and launchd (macOS).
//
// Ce sont les mécanismes que la machine a déjà. On les génère, on n'en invente pas un (ADR 0008).
// Fonctions pures : elles rendent du texte, testable sans toucher au système.

export interface ServiceFileOptions {
  /** Chemin de l'exécutable : le SEA `arche`, ou `node` avec `dist/cli.js` en premier argument. */
  execPath: string;
  args: string[];
  /** Dossier de la bibliothèque, passé en `--library` et utilisé comme répertoire de travail. */
  library: string;
  /** Utilisateur système (Linux uniquement, pour une unité système ; omis pour une unité utilisateur). */
  user?: string;
  /** Identifiant du service ; `arche` par défaut. */
  id?: string;
}

const q = (s: string): string => (/[\s"'\\$]/.test(s) ? `"${s.replace(/(["\\$])/g, '\\$1')}"` : s);

/** Unité systemd. Utilisateur (`~/.config/systemd/user/`) si `user` est absent, système sinon. */
export function systemdUnit(o: ServiceFileOptions): string {
  const id = o.id ?? 'arche';
  const exec = [o.execPath, ...o.args, '--library', o.library].map(q).join(' ');
  return [
    '[Unit]',
    `Description=Arche — bibliothèque hors-ligne (${id})`,
    'Documentation=https://github.com/arche-project/arche',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    ...(o.user ? [`User=${o.user}`] : []),
    `WorkingDirectory=${o.library}`,
    `ExecStart=${exec}`,
    'Restart=on-failure',
    'RestartSec=5',
    // Le superviseur d'Arche relance ses enfants ; systemd ne relance qu'Arche lui-même.
    'KillMode=mixed',
    'TimeoutStopSec=20',
    'Environment=NODE_ENV=production',
    '',
    '[Install]',
    `WantedBy=${o.user ? 'multi-user.target' : 'default.target'}`,
    '',
  ].join('\n');
}

/** Agent launchd (`~/Library/LaunchAgents/<id>.plist`). */
export function launchdPlist(o: ServiceFileOptions): string {
  const id = o.id ?? 'org.arche.serve';
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const argv = [o.execPath, ...o.args, '--library', o.library];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${esc(id)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...argv.map(a => `    <string>${esc(a)}</string>`),
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${esc(o.library)}</string>`,
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <dict>',
    '    <key>SuccessfulExit</key>',
    '    <false/>',
    '  </dict>',
    '  <key>StandardOutPath</key>',
    `  <string>${esc(o.library)}/.arche/logs/launchd.out.log</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${esc(o.library)}/.arche/logs/launchd.err.log</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** Où écrire, et quoi lancer ensuite — par plateforme. / Where to write, and what to run next. */
export function serviceInstallPlan(platform: NodeJS.Platform, home: string, o: ServiceFileOptions):
  { file: string; content: string; enable: string[]; disable: string[]; status: string[] } | null {
  if (platform === 'linux') {
    const id = o.id ?? 'arche';
    return {
      file: `${home}/.config/systemd/user/${id}.service`,
      content: systemdUnit({ ...o, user: undefined }),
      enable: ['systemctl', '--user', 'enable', '--now', id],
      disable: ['systemctl', '--user', 'disable', '--now', id],
      status: ['systemctl', '--user', 'status', id],
    };
  }
  if (platform === 'darwin') {
    const id = o.id ?? 'org.arche.serve';
    const file = `${home}/Library/LaunchAgents/${id}.plist`;
    return {
      file,
      content: launchdPlist({ ...o, id }),
      enable: ['launchctl', 'load', '-w', file],
      disable: ['launchctl', 'unload', '-w', file],
      status: ['launchctl', 'list', id],
    };
  }
  return null; // Windows : tâche planifiée ou service NSSM — documenté, pas généré (pour l'instant)
}
