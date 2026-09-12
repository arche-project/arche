#!/usr/bin/env node
// Orchestrateur de tickets d'Arche.
//
// Lit backlog/tickets.yaml, choisit les tickets `todo` dont les dépendances sont `done`
// (et dont la décision bloquante, s'il y en a une, est `done`), et pour chacun :
//   1. construit un prompt complet (règles + ticket + critères + format de rapport) ;
//   2. l'envoie à un agent de code sur son entrée standard (ARCHE_AGENT_CMD, ou --agent) ;
//   3. vérifie : npm test, npm run catalog:validate, puis les `verify` du ticket ;
//   4. écrit backlog/reports/<id>.md et met `status: done | failed` dans tickets.yaml.
//
// Aucun client IA n'est imposé : l'agent est une commande qui lit le prompt sur stdin et
// travaille dans le dépôt. Exemples :
//   ARCHE_AGENT_CMD="claude -p --permission-mode acceptEdits"   (Claude Code)
//   ARCHE_AGENT_CMD="opencode run"                              (OpenCode, modèle local)
//   ARCHE_AGENT_CMD="cat > /tmp/prompt.md"                      (juste écrire le prompt)
//
// Usage :
//   node scripts/orchestrate/run.mjs --status            état du backlog, tickets prêts
//   node scripts/orchestrate/run.mjs --prompt M1-1       affiche le prompt (à coller ailleurs)
//   node scripts/orchestrate/run.mjs --ticket M1-1       exécute un ticket
//   node scripts/orchestrate/run.mjs --list m1 --max 3   exécute jusqu'à 3 tickets prêts de M1
//   node scripts/orchestrate/run.mjs --all --continue    tout ce qui est prêt, sans s'arrêter
//   node scripts/orchestrate/run.mjs --dry-run --all     montre ce qui serait lancé
//
// Aucune dépendance hors `yaml` (déjà requise par Arche). Node ≥ 22.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, parse } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TICKETS = resolve(ROOT, 'backlog', 'tickets.yaml');
const REPORTS = resolve(ROOT, 'backlog', 'reports');
const LOGS = resolve(ROOT, 'backlog', 'logs');

const BASE_VERIFY = ['npm test --silent', 'npm run --silent catalog:validate'];

// ───────────────────────────── arguments ─────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const AGENT = opt('--agent', process.env.ARCHE_AGENT_CMD ?? '');
const MAX = Number(opt('--max', '1'));
const DRY = flag('--dry-run');
const CONTINUE = flag('--continue');
const TIMEOUT_MIN = Number(opt('--timeout', '90'));

// ───────────────────────────── lecture ─────────────────────────────
function load() {
  const text = readFileSync(TICKETS, 'utf8');
  return { doc: parseDocument(text), data: parse(text) };
}

function byId(data) {
  return new Map(data.tickets.map((t) => [t.id, t]));
}

function isReady(t, map) {
  if (t.status !== 'todo') return false;
  for (const dep of t.depends_on ?? []) if (map.get(dep)?.status !== 'done') return false;
  if (t.decision && map.get(t.decision)?.status !== 'done') return false;
  return true;
}

function blockers(t, map) {
  const out = [];
  for (const dep of t.depends_on ?? []) if (map.get(dep)?.status !== 'done') out.push(dep);
  if (t.decision && map.get(t.decision)?.status !== 'done') out.push(t.decision);
  return out;
}

// ───────────────────────────── prompt ─────────────────────────────
export function buildPrompt(t, data) {
  const accept = t.accept.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const verify = [...BASE_VERIFY, ...(t.verify ?? [])].map((v) => `- \`${v}\``).join('\n');
  const deps = (t.depends_on ?? []).map((d) => `${d} (${data.tickets.find((x) => x.id === d)?.title})`).join(', ') || 'aucune';
  return `# Ticket ${t.id} — ${t.title}

Tu travailles dans le dépôt Arche (racine : le répertoire courant). Lis d'abord README.md,
docs/adr/0013-base-pas-logiciel.md, docs/fr/AUDIT-ARCHITECTURE.md et docs/fr/MVP.md : le
ticket en découle et ne doit pas les contredire.

## Règles du dépôt
${data.rules.trim()}

## Description
${t.desc.trim()}

Colonne : ${data.lists[t.list]} · Taille : ${t.size} · Dépend de : ${deps}

## Critères d'acceptation — tous doivent être vrais avant de t'arrêter
${accept}

## Vérification (doit être verte)
${verify}

## Livrables obligatoires
- Le code, les tests et la doc FR du ticket (docs/fr/… ; un ADR dans docs/adr/ si le ticket
  change une décision d'architecture).
- Un rapport \`backlog/reports/${t.id}.md\` avec : ce qui a été fait, les critères cochés un par
  un (avec la preuve : commande + sortie résumée), ce qui n'a pas pu l'être et pourquoi, les
  décisions prises en cours de route, et le diff net en lignes (\`+x / −y\`).
- Ne modifie pas backlog/tickets.yaml : l'orchestrateur le fait après vérification.

## Ce que tu ne fais pas
- Pas de nouvelle dépendance d'exécution npm (vendor/ avec licence si vraiment nécessaire).
- Pas de téléchargement de corpus, de modèle ou de gros fichier dans le dépôt : les tests
  utilisent des fixtures minuscules (tests/fixtures/).
- Pas de client IA, pas de Docker, rien qui contredise les ADR. En cas de doute : écris le
  doute dans le rapport et choisis l'option la plus petite.

Quand tout est vert, termine par une ligne seule : \`TICKET ${t.id} DONE\`.
`;
}

// ───────────────────────────── exécution ─────────────────────────────
function sh(cmd, { input, timeoutMin } = {}) {
  const r = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    input,
    encoding: 'utf8',
    timeout: (timeoutMin ?? 30) * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: '1' },
  });
  return { ok: r.status === 0, code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function tail(s, n = 40) {
  const lines = s.trimEnd().split('\n');
  return lines.slice(-n).join('\n');
}

function setStatus(doc, id, status) {
  const list = doc.get('tickets');
  for (const item of list.items) {
    if (item.get('id') === id) {
      item.set('status', status);
      return;
    }
  }
}

function runTicket(t, data, doc) {
  const prompt = buildPrompt(t, data);
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(LOGS, { recursive: true });
  const started = new Date();
  console.log(`\n▶ ${t.id} — ${t.title}`);

  if (!AGENT) {
    console.error('  aucun agent : passe --agent "<cmd>" ou ARCHE_AGENT_CMD. Le prompt est ci-dessous.\n');
    console.log(prompt);
    return 'skipped';
  }
  setStatus(doc, t.id, 'doing');
  writeFileSync(TICKETS, doc.toString({ lineWidth: 0 }));

  const agent = sh(AGENT, { input: prompt, timeoutMin: TIMEOUT_MIN });
  writeFileSync(resolve(LOGS, `${t.id}.log`), agent.out);
  console.log(`  agent : code ${agent.code}, ${agent.out.length} caractères de sortie`);

  const checks = [];
  for (const cmd of [...BASE_VERIFY, ...(t.verify ?? [])]) {
    const r = sh(cmd, { timeoutMin: 20 });
    checks.push({ cmd, ok: r.ok, out: tail(r.out, 25) });
    console.log(`  ${r.ok ? '✓' : '✗'} ${cmd}`);
  }
  const reportPath = resolve(REPORTS, `${t.id}.md`);
  const agentWroteReport = existsSync(reportPath);
  const allOk = checks.every((c) => c.ok) && agent.ok && agent.out.includes(`TICKET ${t.id} DONE`);
  const status = allOk ? 'done' : 'failed';

  const orchestratorSection = `

---
## Vérification par l'orchestrateur (${started.toISOString()} → ${new Date().toISOString()})

Statut : **${status}** · agent : code ${agent.code} · rapport de l'agent : ${agentWroteReport ? 'présent' : 'ABSENT'}

${checks.map((c) => `### ${c.ok ? '✓' : '✗'} \`${c.cmd}\`\n\n\`\`\`\n${c.out}\n\`\`\``).join('\n\n')}

### Fin de la sortie de l'agent
\`\`\`
${tail(agent.out, 30)}
\`\`\`
`;
  const existing = agentWroteReport ? readFileSync(reportPath, 'utf8') : `# Rapport ${t.id} — ${t.title}\n\n_(l'agent n'a pas écrit de rapport)_\n`;
  writeFileSync(reportPath, existing + orchestratorSection);
  setStatus(doc, t.id, status);
  writeFileSync(TICKETS, doc.toString({ lineWidth: 0 }));
  console.log(`  → ${status} (${reportPath.replace(ROOT + '/', '')})`);
  return status;
}

// ───────────────────────────── commandes ─────────────────────────────
function printStatus(data) {
  const map = byId(data);
  const counts = {};
  for (const t of data.tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;
  console.log('Backlog :', Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · '));
  const ready = data.tickets.filter((t) => isReady(t, map));
  console.log(`\nPrêts (${ready.length}) :`);
  for (const t of ready) console.log(`  ${t.id.padEnd(6)} ${t.size}  ${t.title}`);
  const decisions = data.tickets.filter((t) => t.status === 'decision');
  if (decisions.length) {
    console.log(`\nDécisions en attente (${decisions.length}) — bloquent :`);
    for (const d of decisions) {
      const blocked = data.tickets.filter((t) => t.decision === d.id).map((t) => t.id);
      console.log(`  ${d.id.padEnd(6)} ${d.title}  →  ${blocked.join(', ') || '—'}`);
    }
  }
  const waiting = data.tickets.filter((t) => t.status === 'todo' && !isReady(t, map));
  console.log(`\nEn attente de dépendances (${waiting.length}) :`);
  for (const t of waiting) console.log(`  ${t.id.padEnd(6)} ← ${blockers(t, map).join(', ')}`);
}

function main() {
  const { doc, data } = load();
  const map = byId(data);

  if (flag('--status')) return printStatus(data);
  if (opt('--prompt')) {
    const t = map.get(opt('--prompt'));
    if (!t) throw new Error(`ticket inconnu : ${opt('--prompt')}`);
    return console.log(buildPrompt(t, data));
  }

  let selected;
  if (opt('--ticket')) {
    const t = map.get(opt('--ticket'));
    if (!t) throw new Error(`ticket inconnu : ${opt('--ticket')}`);
    if (!isReady(t, map) && !flag('--force')) {
      throw new Error(`${t.id} n'est pas prêt (statut ${t.status}, bloqué par ${blockers(t, map).join(', ') || 'rien'}) — --force pour passer outre`);
    }
    selected = [t];
  } else if (opt('--list') || flag('--all')) {
    const list = opt('--list');
    selected = data.tickets.filter((t) => isReady(t, map) && (!list || t.list === list)).slice(0, MAX);
  } else {
    return printStatus(data);
  }

  if (!selected.length) return console.log('Rien de prêt.');
  if (DRY) {
    console.log('Serait lancé :');
    for (const t of selected) console.log(`  ${t.id}  ${t.title}`);
    return;
  }
  for (const t of selected) {
    const st = runTicket(t, data, doc);
    if (st === 'failed' && !CONTINUE) {
      console.error(`\nArrêt sur échec de ${t.id} (--continue pour poursuivre).`);
      process.exitCode = 1;
      return;
    }
    if (st === 'skipped') return;
  }
}

main();
