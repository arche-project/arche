# ADR 0003 — Orchestrateur, jamais hébergeur de contenu tiers

**Statut** : accepté (principe fondateur du brief), **amendé par l'ADR 0005** : Arche héberge les ZIM qu'il construit lui-même à partir de sources sous licence libre ou avec accord écrit.

**Contexte** : les contenus font des centaines de Go, portent des licences variées (CC BY-SA, NC, propriétaires « ouvertes »), et changent chaque mois.

**Décision** : le dépôt ne contient que le catalogue (métadonnées + URL officielles) et le code. Tout téléchargement se fait chez l'éditeur, par l'utilisateur, pour lui-même. Le champ `license.redistribution` guide l'utilisateur qui voudrait copier un disque pour quelqu'un d'autre. Le projet peut publier ce qu'il **produit** (index `catalog.json`, un jour des index d'embeddings) — voir DECISIONS D3 pour la règle exacte.

**Conséquences** : dépendance forte aux sources amont (Kiwix surtout) → miroirs multiples et sources des lecteurs dans le catalogue (angles morts A2/A3) ; pas de responsabilité de redistribution ; un utilisateur déjà hors-ligne dépend d'un tiers (angle mort A1).

---

**Status**: accepted. **Decision**: the repo holds only catalog + code; every download happens at the publisher, by the user, for themselves; the project may publish what it *produces* (indexes). **Consequences**: strong upstream dependency (mirrors needed), no redistribution liability, already-offline users depend on a third party.
