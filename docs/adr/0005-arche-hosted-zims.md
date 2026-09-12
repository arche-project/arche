# ADR 0005 — Arche construit et héberge les ZIM absents de Kiwix (sous condition de licence)

**Statut** : accepté (décision de Florian, 2026-09-11). Amende l'ADR 0003.

**Contexte** : la valeur d'Arche pour un néophyte est de ne rien avoir à crawler. Or plusieurs sources majeures (Low-tech Lab, Open Source Ecology, RepRap, e-NABLE, InMoov…) n'existent pas en ZIM chez Kiwix. Florian ne veut rien héberger ni construire sur sa machine.

**Décision** : un pipeline `catalog/zim-recipes.yaml` → GitHub Actions (mwoffliner / Zimit / zimwriterfs dans Docker) → Internet Archive → PR de catalogue. Verrou légal : une recette ne se construit que si `permission` vaut `license` ou `written` (accord archivé dans `docs/permissions/`). Les ressources produites portent `source.kind: arche-hosted` et un bloc `built_from` (provenance et base légale). Demander à Kiwix (`openzim/zim-requests`) reste préféré quand c'est possible.

**Alternatives** : rester pur orchestrateur (chaque utilisateur crawle — inacceptable pour le néophyte) ; héberger sur GitHub Releases (2 Go/fichier) ou un bucket payant (coût, pérennité).

**Conséquences** : Arche devient éditeur pour une partie du catalogue → responsabilité de retrait sur demande, attribution systématique, et une règle claire : *Arche n'héberge que ce qu'il construit lui-même à partir de sources dont la licence ou l'auteur l'autorise ; jamais de contenu dont la licence l'interdit.* Dépendance à Internet Archive (miroirs prévus dans `source.mirrors`, torrent automatique).

---

**Status**: accepted (amends ADR 0003). **Decision**: recipes → GitHub Actions build → Internet Archive → catalog PR; legal lock on `permission`; `source.kind: arche-hosted` + `built_from`. **Rule**: Arche hosts only what it builds itself from sources whose license or author allows it, never content whose license forbids it.
