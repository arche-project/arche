# ADR 0002 — Deux dépendances d'exécution, tout le reste maison

**Statut** : accepté.

**Contexte** : un kit de survie doit se reconstruire dans dix ans, sur une machine hors-ligne, avec un `node_modules` copié sur clé USB. Chaque dépendance transitive est un risque (disparition, licence, incompatibilité de version de Node).

**Décision** : dépendances d'exécution limitées à `commander` (CLI) et `yaml` (parse + round-trip avec commentaires). Réécrits en interne : prompts terminal (`src/core/prompts.ts`, node:readline), validateur JSON Schema minimal (`src/core/schema.ts`), serveur HTTP (node:http), i18n. Ajv reste en devDependency pour la CI seulement.

**Conséquences** : ~150 lignes de code en plus à maintenir ; le validateur maison ne couvre qu'un sous-ensemble du schéma (documenté) ; toute nouvelle dépendance passe par un ADR.

---

**Status**: accepted. **Decision**: runtime deps limited to `commander` and `yaml`; prompts, schema validator, HTTP server and i18n written in-house; Ajv is CI-only. **Consequences**: ~150 more lines to maintain; any new dependency requires an ADR.
