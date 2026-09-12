# Orchestration — le backlog, le board, l'orchestrateur

> Comment le travail d'Arche v2 est découpé, suivi et exécuté. La source de vérité est un
> fichier du dépôt ; Trello en est le miroir ; l'orchestrateur fait tourner les tickets avec
> l'agent de code de votre choix, et n'accepte un ticket que si la vérification est verte.

## Trois objets

**`backlog/tickets.yaml`** — les 41 tickets d'Arche v2, dérivés des six décisions de
[l'audit](AUDIT-ARCHITECTURE.md) et des trous G1–G7 du [MVP](MVP.md). Chaque ticket porte : une
colonne (`decisions`, `m0`…`m4`), un statut, ses dépendances, la décision de Florian qui le
bloque s'il y en a une, une taille (S/M/L), une description, des critères d'acceptation, et
des commandes de vérification en plus des deux obligatoires (`npm test`,
`npm run catalog:validate`). C'est un fichier texte relu par git : on le modifie en PR comme le
reste.

**Le board Trello** — <https://trello.com/b/ffaRr5aF/arche-v2-la-base-pas-le-logiciel>. Huit
colonnes : *Décisions à trancher (Florian)*, *M0 · Exister*, *M1 · Format SQLite & mesure*,
*M2 · Confiance*, *M3 · Noyau & soustraction*, *M4 · Base & connaissance*, *En cours*, *Fait*.
Une carte par ticket, avec sa description et ses critères en checklist. La correspondance
ticket ↔ carte est dans `backlog/trello.json` ; `scripts/orchestrate/trello-sync.mjs` déplace
les cartes selon le statut du YAML (il faut `TRELLO_KEY` et `TRELLO_TOKEN` ; sans, il montre
ce qu'il ferait).

**L'orchestrateur** — `scripts/orchestrate/run.mjs`. Il lit le YAML, choisit les tickets
`todo` dont toutes les dépendances sont `done` (et dont la décision bloquante est prise),
construit un prompt complet, l'envoie à un agent de code, vérifie, écrit un rapport, met à
jour le statut. Il ne connaît aucun client IA : l'agent est une commande qui lit le prompt sur
son entrée standard et travaille dans le dépôt.

## Les jalons, dans l'ordre

| Jalon | Ce qu'il prouve | Tickets |
|---|---|---|
| **M0 · Exister** | Le dépôt est public, la CI est verte, la fraîcheur du catalogue est mesurée, un premier shard est sur Internet Archive. | M0-1 → M0-3 |
| **M1 · Format SQLite & mesure** | Le produit devient réel : une base SQLite par corpus (ADR 0014), lisible sans Arche ; `arche eval` mesure avant qu'on ajoute quoi que ce soit ; on route puis on cherche ; les vecteurs tiennent sur un SSD. | M1-1 → M1-10 |
| **M2 · Confiance** | Catalogue signé, téléchargeur qui vérifie, plus d'automerge d'URL ou de hachage, lockfile d'édition, catalogue réellement vérifié, trois hébergeurs. | M2-1 → M2-6 |
| **M3 · Noyau & soustraction** | `src/` sous 3 000 lignes : solveurs et recettes en exemples, le reste en paquets, dépendances vendues, une seule langue source. | M3-1 → M3-6 |
| **M4 · Base & connaissance** | Provenance ou rien ; les 20 premiers shards ; les méthodes (dont l'entraînement local) ; un vrai client léger ; l'objet (l'Édition Autonomiste sur SSD). | M4-1 → M4-10 |

Les six décisions (D6, D11, D20, D21, D22, D23) sont des cartes à part : elles ne demandent pas
de code, elles demandent Florian. Chacune bloque des tickets précis, listés sur sa carte. Une
décision prise passe `status: done` dans le YAML (avec la réponse écrite dans
[DECISIONS.md](DECISIONS.md)) et débloque le reste.

## Lancer l'orchestrateur

```bash
# Où en est-on ? tickets prêts, décisions en attente, dépendances
node scripts/orchestrate/run.mjs --status

# Le prompt d'un ticket, à coller dans n'importe quel agent (OpenCode, Claude Code, un modèle local)
node scripts/orchestrate/run.mjs --prompt M1-1

# Un ticket, avec un agent
ARCHE_AGENT_CMD="opencode run" node scripts/orchestrate/run.mjs --ticket M1-1

# Jusqu'à trois tickets prêts de M1, à la suite, arrêt au premier échec
ARCHE_AGENT_CMD="claude -p --permission-mode acceptEdits" \
  node scripts/orchestrate/run.mjs --list m1 --max 3

# Tout ce qui est prêt, sans s'arrêter aux échecs
node scripts/orchestrate/run.mjs --all --max 50 --continue
```

Ce qui se passe pour chaque ticket :

1. le statut passe à `doing` ;
2. l'agent reçoit le prompt (règles du dépôt, description, critères, vérification, livrables) et
   travaille ; sa sortie est gardée dans `backlog/logs/<id>.log` ;
3. l'orchestrateur exécute `npm test`, `npm run catalog:validate` et les `verify` du ticket ;
4. il ajoute sa section « Vérification par l'orchestrateur » au rapport
   `backlog/reports/<id>.md` (que l'agent doit avoir écrit) ;
5. le statut devient `done` si tout est vert **et** que l'agent a conclu par
   `TICKET <id> DONE`, sinon `failed`. Un `failed` se relit dans le rapport, se corrige à la
   main ou se relance (`--ticket <id> --force` après avoir remis `status: todo`).

L'orchestrateur ne pousse rien, ne fusionne rien, ne déplace pas les cartes. Après une session :
relire les rapports, relire le diff, `trello-sync.mjs`, commit.

## Ce que l'orchestrateur exige de l'agent

Le prompt le dit, et la vérification le tient : pas de nouvelle dépendance d'exécution ; pas
de corpus, de modèle ni de gros fichier dans le dépôt (fixtures minuscules seulement) ; pas de
client IA, pas de Docker, rien qui contredise un ADR ; un rapport avec les critères cochés un
par un et la preuve ; et la règle de la maison — [ADR 0013](../adr/0013-base-pas-logiciel.md) :
on crée la base, pas le logiciel. Un ticket qui grossit `src/` sans servir la base hors ligne
est un ticket mal fait, même vert.

## Avec quel agent ?

N'importe lequel qui lit un prompt sur stdin et peut éditer des fichiers : OpenCode sur un
modèle local (cohérent avec [CLIENTS-IA.md](CLIENTS-IA.md)), Claude Code ou un autre agent en
ligne côté mainteneur — le dépôt se construit en ligne ; c'est le *produit* qui est hors ligne.
Les gros tickets (L) demandent un modèle fort ; les S et la doc passent avec un modèle local.
Rien n'oblige à automatiser : `--prompt` donne le texte, et un humain peut faire le ticket.

## Pourquoi pas un outil de plus

Parce que c'est du texte : un YAML, des rapports Markdown, un script de 250 lignes sans
dépendance. Il se lit sans réseau, se relit dans git, et disparaît sans regret le jour où le
backlog est vide. C'est la même règle que pour tout le reste d'Arche.
