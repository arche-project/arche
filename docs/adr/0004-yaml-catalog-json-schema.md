# ADR 0004 — Catalogue en YAML, contrat en JSON Schema, mis à jour par des robots

**Statut** : accepté.

**Contexte** : le catalogue est écrit par des humains (commentaires, lisibilité, revue en PR) et réécrit chaque semaine par l'updater (tailles, versions, statuts).

**Décision** : un fichier YAML par thème dans `catalog/resources/`, validé par `catalog/schema/*.json` (JSON Schema 2020-12, utilisable par n'importe quel outil). L'updater utilise `yaml.parseDocument` pour modifier des champs sans perdre les commentaires. Identifiants stables (`kiwix_name`, `github_repo`, `ollama_model`) plutôt que des URL datées ; les URL sont dérivées. Statuts explicites (`unverified` → `active` → `missing`/`deprecated`) plutôt que suppression silencieuse.

**Conséquences** : les PR automatiques restent lisibles (diff par champ) ; deux validateurs (maison + Ajv en CI) ; un index JSON plat est généré (`arche catalog index`) pour les consommateurs tiers.

---

**Status**: accepted. **Decision**: one YAML file per theme validated by JSON Schema; comment-preserving rewrites by the updater; stable identifiers rather than dated URLs; explicit statuses rather than silent deletion. **Consequences**: readable auto-PRs; two validators; a generated flat JSON index for third parties.
