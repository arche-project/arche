#!/usr/bin/env node
// Miroir Trello du backlog : déplace chaque carte dans la colonne qui correspond au `status`
// de backlog/tickets.yaml (doing → En cours, done → Fait, sinon sa colonne d'origine).
//
// Besoin : TRELLO_KEY et TRELLO_TOKEN dans l'environnement (https://trello.com/power-ups/admin →
// clé API → jeton). Ne lit rien d'autre, n'écrit rien d'autre. Sans clés : affiche le plan.
//
//   node scripts/orchestrate/trello-sync.mjs            applique
//   node scripts/orchestrate/trello-sync.mjs --dry-run  montre

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tickets = parse(readFileSync(resolve(ROOT, 'backlog', 'tickets.yaml'), 'utf8'));
const trello = JSON.parse(readFileSync(resolve(ROOT, 'backlog', 'trello.json'), 'utf8'));
const dry = process.argv.includes('--dry-run') || !process.env.TRELLO_KEY || !process.env.TRELLO_TOKEN;

const objectId = (ari) => ari.split('/').pop();
const listFor = (t) => {
  if (t.status === 'doing') return 'doing';
  if (t.status === 'done') return 'done';
  return t.list;
};

const plan = tickets.tickets.map((t) => ({ id: t.id, status: t.status, list: listFor(t), card: trello.card_ids[t.id] }));
for (const p of plan) console.log(`${p.id.padEnd(6)} ${p.status.padEnd(9)} → ${p.list}`);
if (dry) {
  console.log('\n(dry-run : pas de clés TRELLO_KEY/TRELLO_TOKEN ou --dry-run)');
  process.exit(0);
}

const auth = `key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
for (const p of plan) {
  if (!p.card) continue;
  const idList = objectId(trello.lists[p.list]);
  const r = await fetch(`https://api.trello.com/1/cards/${p.card}?idList=${idList}&${auth}`, { method: 'PUT' });
  if (!r.ok) console.error(`${p.id}: HTTP ${r.status}`);
}
console.log('Trello synchronisé.');
