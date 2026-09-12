# ADR 0011 — Arche est un serveur pour les clients IA, pas un client IA

**Statut** : accepté (recadrage de Florian, 2026-09-11 : « j'ai pas besoin d'un xème client IA /
orchestrateur IA, c'est pas notre job »). Remplace la partie « assistant » des ADR 0007 et 0010 ;
tout le reste de ces ADR tient.

**Contexte.** Le MVP prévoyait `arche assist` : une commande qui assemble garde-fous, recherche,
solveurs, prompt, appel au modèle, vérification des citations, puis `/api/ask` et un volet de
conversation dans l'interface web. C'est un client de chat de plus, avec sa boucle d'orchestration
de plus — et il en existe déjà des dizaines, libres, mûrs, hors ligne, que les gens connaissent :
Open WebUI, OpenCode, Jan, Aider, Continue… Ce n'est pas là qu'Arche a de la valeur. Sa valeur, c'est ce qu'aucun client n'a : une bibliothèque hors-ligne d'autonomie
interrogeable et citable, des calculateurs qui ne se trompent pas, des solveurs de projet, des
générateurs de schémas, des recettes avec leurs portes humaines. Et depuis 2025 il existe un
protocole standard pour donner tout ça à n'importe quel client : le **Model Context Protocol**.

**Décision.**

1. **Arche expose sa base de connaissance et ses outils par MCP ; il n'a pas de client de chat.**
   `arche mcp` est un serveur MCP sur stdio (`src/core/mcp/server.ts`), et `arche serve` sert le
   même dispatcher sur `POST /mcp` pour les clients qui parlent HTTP. JSON-RPC 2.0 écrit à la main
   (ADR 0002 : aucune dépendance), méthodes `initialize`, `ping`, `tools/list`, `tools/call`,
   `resources/list`, `resources/read`, `resources/templates/list`, `prompts/list`, `prompts/get`.

2. **Les outils sont ce qu'Arche sait faire et qu'un modèle ne doit pas improviser** :
   `search` (recherche hybride sourcée : Xapian de kiwix-serve + shards denses quand ils existent,
   extraits numérotés [n] avec lien ouvrable), `read_article`, les dix `calc_*`, `garden_plan`,
   `bom_substitute`, `project_types`, `project_recipe`, `render_diagram`, `catalog_search`. Les
   ressources sont les règles, les fiches de chiffres et de cultures, les recettes, et tout article
   de la bibliothèque (`arche://article/<livre>/<chemin>`). Les prompts sont les règles seules et
   règles + recette d'un projet ouvert.

3. **Les garde-fous deviennent des données que les outils rendent, pas un comportement qu'Arche
   impose.** `search` place en tête de son résultat, quand un sujet sensible est détecté, la
   consigne prioritaire (identification comestible, posologie, diagnostic, urgence) ; les
   recettes rendent leurs portes humaines et leurs interdits ; les calculateurs rendent leurs
   étapes et hypothèses. Le client et son modèle en font ce qu'ils veulent — Arche ne contrôle pas
   la génération et ne prétend plus le faire. Ce qu'il contrôle, il le garantit : ce qui sort de ses
   outils est sourcé, calculé, ou marqué comme non vérifié.

4. **La recherche marche dès le premier ZIM, sans index dense.** Chaque ZIM Kiwix embarque un
   index Xapian ; `search` l'interroge via kiwix-serve (`/search?format=xml`) et lit le texte des
   articles via `/raw/`. Les shards denses (ADR 0007) s'ajoutent quand ils sont installés, fusion
   RRF ; leur absence est indiquée (`dense=off`), jamais cachée. *Depuis M1-3 (ADR 0014), le canal
   dense est le canal `sqlite` — un par corpus installé, FTS5 + cosinus — et `search` rapporte
   `xapian=… sqlite=…`.* La chaîne ZIM → texte → shards
   reste à construire (trous G1–G2 du MVP) mais n'est plus bloquante pour être utile.

5. **Le client est celui de l'utilisateur, et le catalogue en propose plusieurs sans les imposer** :
   Open WebUI (pip, sans Docker), OpenCode, Aider, Jan — au catalogue — et tout autre client MCP
   **qui tourne sans réseau avec un modèle local**. Un client cloud parle MCP aussi ; il n'entre ni
   dans le catalogue ni dans la documentation : Arche est hors ligne, et le jour où le réseau
   tombe, ce client tombe avec.
   `docs/fr/CLIENTS-IA.md` dit comment brancher chacun en une ligne de configuration. L'interface
   web d'Arche reste ce qu'elle était : choisir, télécharger, servir, et **apprendre à se servir de
   la base** — pas converser.

6. **Les orchestrateurs et agents sont des clients comme les autres, sous trois lignes rouges.**
   Hermes Agent, OpenClaw, n8n, Node-RED consomment Arche par MCP ; Arche n'en écrit aucun et en
   met quelques-uns au catalogue (paquet `automation`). Pour tous : aucun modèle de langue dans une
   boucle d'actionneur (ADR 0010 — Node-RED, déterministe, tient le physique) ; aucun skill tiers
   téléchargé (hors ligne, un agent n'a que les outils d'Arche et les fichiers locaux) ; sous le
   superviseur, sur 127.0.0.1 (ADR 0008). ComfyUI entre au même titre, sous l'ADR 0009 :
   illustrer, jamais un schéma ni une identification ni une pièce fonctionnelle.

**Conséquences.**

- `arche assist`, `/api/ask` et le volet de conversation sont **abandonnés**. Le trou G3 du MVP
  devient « le serveur MCP » — et il existe, testé contre un faux kiwix-serve
  (`tests/mcp.test.ts`).
- `arche eval` (G4) mesure ce qu'Arche contrôle : rappel@5 de `search`, garde-fous rendus à
  raison, solveurs et calculateurs appelés quand l'eval l'attend. Une mesure de génération reste
  possible, en option, contre n'importe quel point OpenAI-compatible que l'utilisateur désigne —
  ce n'est pas Arche qui génère, mais Arche peut mesurer ce qu'un client fait de ses outils.
- `hasCitations` (rejet d'une réponse sans source) reste dans le code comme fonction d'évaluation,
  plus comme garde-fou en ligne : Arche ne voit plus les réponses.
- Ce qui est perdu, et assumé : Arche ne peut plus garantir qu'une réponse cite ses sources — il
  garantit que ses extraits en ont. Un client mal configuré peut ignorer les consignes ; c'est le
  choix de l'utilisateur, et c'est cohérent avec « ce qu'on propose plutôt que vendre ».

**Rejeté.** *Garder un petit client « pour les novices »* : c'est le début du xème client, et le
novice a déjà Jan ou Open WebUI. *Un proxy OpenAI-compatible qui injecte la recherche
dans chaque requête* (ce que font les « RAG servers ») : c'est un orchestrateur déguisé, invisible
pour l'utilisateur, et il n'expose ni les solveurs ni les recettes. *Un SDK MCP en dépendance* :
le protocole tient en deux cents lignes ; l'ADR 0002 tient.
