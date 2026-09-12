# Brancher votre client IA sur Arche

> Arche n'est pas un client de chat. C'est une base de connaissance hors-ligne et des outils, servis
> par le **Model Context Protocol** (MCP) à n'importe quel client qui le parle — le vôtre. ADR 0011.
> Règle d'entrée dans cette page : un client n'y figure que s'il tourne **sans réseau, avec un modèle
> local**. Les clients cloud n'ont pas leur place dans un projet hors ligne.
> English: [AI-CLIENTS.md](../en/AI-CLIENTS.md)

## Ce que le client reçoit

En se connectant, votre client découvre dix-neuf **outils**, des **ressources** et deux **prompts** :

| Outil | Ce qu'il fait | Ce qu'il garantit |
|---|---|---|
| `search` | recherche hybride dans la bibliothèque (Xapian de chaque ZIM + chaque corpus SQLite installé : FTS5 et vecteurs, ADR 0014) | extraits numérotés [n], source et lien ouvrable dans Kiwix ; consigne prioritaire en tête si le sujet est sensible |
| `read_article` | un article entier, en texte | lu dans le corpus SQLite (`articles`/`chunks`) s'il est installé, sinon dans le ZIM ; jamais résumé par Arche |
| `calc_*` (10) | citerne, eau de pluie, calories, surface nourricière, graisses, bois, solaire, poules, semences, stock d'un an | déterministe, depuis `knowledge/figures.yaml`, avec les étapes et les hypothèses |
| `garden_plan` | le plan du potager depuis un inventaire | calendrier, parcelles avec rotation, rendements ; valeurs non vérifiées marquées |
| `bom_substitute` | nomenclature d'un design de référence croisée avec le stock | chaque substitution signalée avec ce qu'elle change |
| `project_types`, `project_recipe` | les types de projet et leur recette | corpus à lire, solveurs, livrables, **portes humaines**, interdits |
| `render_diagram` | rend un schéma depuis sa source (schemdraw, WireViz, Mermaid, OpenSCAD, KiCad…) | écrit toujours la source ; rend si l'outil est là, sinon le dit |
| `catalog_search` | ce qui existe au catalogue | taille, licence, type — pour dire quoi télécharger |

Les ressources : `arche://rules/fr` (les règles), `arche://knowledge/figures.yaml`,
`arche://knowledge/crops.yaml`, `arche://recipes/<type>`, et `arche://article/<corpus ou livre>/<chemin>`.
Les prompts : `arche_rules` (à mettre en prompt système) et `arche_project` (règles + recette d'un
projet ouvert). Le message `initialize` porte aussi les règles dans `instructions` : la plupart des
clients les montrent au modèle sans rien configurer.

## Lancer le serveur

Deux transports, le même serveur.

**stdio** — le client lance la commande lui-même :

```bash
node dist/cli.js mcp                 # bibliothèque et kiwix-serve depuis arche.yaml
node dist/cli.js mcp --library /Volumes/ARCHE --kiwix-host http://127.0.0.1:8080 --lang fr
node dist/cli.js mcp --list-tools    # vérifier ce qui est exposé
```

**HTTP** — `arche serve` expose le même dispatcher sur `POST http://127.0.0.1:8765/mcp` (sans état,
une requête JSON-RPC par requête HTTP). Pour les clients qui préfèrent une URL à une commande.

Dans les deux cas, `search` a besoin de **kiwix-serve** (lancé par `arche serve`, ADR 0008) ; sans
lui, l'outil le dit (`xapian=error`) au lieu d'inventer.

## Configurer les clients

La plupart des clients de bureau partagent le même format de configuration :

```json
{
  "mcpServers": {
    "arche": {
      "command": "node",
      "args": ["/chemin/vers/arche/dist/cli.js", "mcp", "--library", "/Volumes/ARCHE"]
    }
  }
}
```

- **Open WebUI** (au catalogue, installé par pip, sans Docker) : Paramètres → Outils → ajouter un
  serveur MCP en HTTP avec l'URL `http://127.0.0.1:8765/mcp`. Modèles via Ollama. C'est le client
  hors ligne le plus complet pour un non-développeur.
- **OpenCode** (au catalogue) : section `mcp` de `opencode.json`, type `local`, la même commande.
  Modèles via Ollama. Le client de choix pour dériver du code (firmware, OpenSCAD, schemdraw).
- **Jan** (au catalogue, Apache-2.0, 100 % hors ligne sur llama.cpp, MCP intégré) : Paramètres →
  MCP Servers, le même bloc. Le client de bureau le plus simple pour un non-développeur qui ne
  veut pas installer Python.
- **Continue** (extension VS Code, Apache-2.0) et tout autre client libre qui parle à Ollama ou
  llama.cpp : même bloc `mcpServers`, ou l'URL HTTP — chaque client documente l'endroit exact ; le
  format ci-dessus est celui qu'ils partagent au moment où j'écris, à vérifier dans la doc du client.

Un client qui a besoin d'internet pour répondre (Claude Desktop, ChatGPT, Cursor…) parle MCP aussi,
mais il ne fait pas partie d'Arche et n'est pas documenté ici : le jour où le réseau tombe, il tombe
avec.

Un prompt système raisonnable, si le client n'utilise pas `instructions` : demander le prompt
`arche_rules`, ou coller `arche://rules/fr`. Pour un projet ouvert : `arche_project` avec le type
(`potager`, `robot-desherbeur`, `maison-bioclimatique`, `tracteur-autonome`).

## Orchestrateurs, agents, automates : des clients aussi

« Et les orchestrateurs IA ? » Même réponse, même règle. Un orchestrateur est un client d'Arche
comme un autre : il appelle `search`, `garden_plan`, `calc_*` par MCP et enchaîne. Arche n'en écrit
pas ; il en met quelques-uns au catalogue, hors ligne et libres, avec trois lignes rouges qui valent
pour tous : **aucun modèle de langue dans une boucle d'actionneur** (ADR 0010 — l'arrosage, le
moteur, la lame, c'est un automate déterministe avec watchdog) ; **aucun « skill » tiers
téléchargé** (les places de marché de skills ont déjà servi de vecteur d'exfiltration et d'injection
de prompt — hors ligne, un agent n'a que les outils d'Arche et les fichiers locaux) ; **sous le
superviseur, sur 127.0.0.1**, comme n'importe quel service (ADR 0008).

| Besoin | Outil | Pourquoi celui-là |
|---|---|---|
| Le monde physique : capteurs → règles → arrosage, alertes, journal | **Node-RED** (Apache-2.0, npm, Pi, MQTT, GPIO, Modbus, Home Assistant) — paquet `automation` | déterministe, visuel, fait pour ça depuis dix ans ; appelle `arche mcp` en HTTP pour joindre une fiche sourcée à une alerte, et c'est tout ce que l'IA fait dans la boucle |
| Des tâches récurrentes avec un modèle local : « chaque matin, relève la station météo et dis-moi quoi arroser » | **Hermes Agent** (MIT, Python, Ollama, MCP natif, interface Home Assistant) — paquet `automation` | l'agent le plus propre à brancher : il parle MCP nativement, tourne sur Qwen3.5, et son lien Home Assistant est un pont vers le physique — en lecture |
| Un agent piloté depuis une messagerie | **OpenClaw** (MIT, Node, Ollama) — `optional` | populaire, mais ses interfaces (Signal, Telegram, Discord) supposent internet et son écosystème de skills a eu des incidents ; pour qui le connaît déjà, sous les trois lignes rouges |
| Des flux avec nœuds IA, client et serveur MCP | **n8n** (fair-code, `npx n8n`) — `optional` | pour qui le maîtrise ; licence Sustainable Use (usage personnel libre, pas de service commercial) ; la plupart de ses 1 500 intégrations supposent internet |
| Des images, de la vidéo, du 3D, de l'audio par diffusion | **ComfyUI** (GPL-3.0, Python + PyTorch, carte graphique réaliste) — `optional` | la référence des interfaces de diffusion, hors ligne ; sous l'ADR 0009 : illustrer, jamais un schéma technique, jamais une identification d'espèce, jamais une pièce fonctionnelle (un maillage Hunyuan3D n'est pas un OpenSCAD) |

Un exemple qui tient en une phrase : Node-RED lit la sonde d'humidité, décide d'arroser ou non
(règle fixe), et — seulement pour le message — demande à `arche mcp` la fiche sourcée « stress
hydrique de la tomate » à joindre à l'alerte. L'IA explique ; elle n'ouvre pas la vanne.

## Ce qu'Arche ne fait plus, et pourquoi

Arche ne génère pas de réponse, ne vérifie pas que le modèle a cité ses sources, ne refuse rien à
votre place. Il **rend** des extraits sourcés, des chiffres calculés, des plans résolus, des recettes
avec leurs portes — et c'est le client, avec le modèle que vous avez choisi, qui en fait une réponse.
Un client mal réglé peut ignorer une consigne : c'est votre machine et votre choix. Ce qu'Arche
garantit, c'est que tout ce qui sort de ses outils est sourcé, calculé ou marqué comme non vérifié.

## Vérifier à la main

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"calc_citerne","arguments":{"people":4,"dry_days":60}}}' \
  | node dist/cli.js mcp 2>/dev/null
```

Deux lignes JSON en retour : la première dit qui répond, la seconde donne le volume de citerne avec
ses étapes. Si la seconde ligne contient `isError`, le message dit pourquoi.
