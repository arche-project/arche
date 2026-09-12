# Le noyau, mesuré — `npm run loc`

> « On ne peut pas soustraire sans mesurer. » Ce document dit ce qu'on compte, pourquoi, quel seuil
> la CI applique et quand il baisse. Il découle de l'ADR 0013 (la base, pas le logiciel) et de la
> décision 4 de l'[audit d'architecture](AUDIT-ARCHITECTURE.md) : *petit noyau, grande base* —
> `src/` sous 3 000 lignes, `knowledge/` au-dessus.

## Ce qu'on compte

`scripts/loc.sh` (alias `npm run loc`) affiche trois nombres, séparément :

```
src/         6934 lignes
examples/       0 lignes
vendor/         0 lignes
```

- **`src/`** est le noyau : ce que le binaire embarque et que le novice double-clique.
- **`examples/`** reçoit les solveurs et recettes (M3-2) : des exemples génériques de ce qu'un agent
  fait avec la base, pas le périmètre. Leur taille est visible, pas plafonnée.
- **`vendor/`** reçoit les dépendances vendues (M3-4) : copiées, épinglées, avec leur licence. Leur
  taille est visible pour rappeler qu'on préfère *vendre* que *réécrire* — et que ça a un coût.

Compte : les fichiers `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`. Ne compte pas : les tests (`*.test.ts`),
les déclarations (`*.d.ts`), `node_modules/`, `fixtures/`, `dist/`, et tout ce qui n'est pas du code
(HTML, CSS, YAML, Markdown, JSON). On mesure le *logiciel* ; la connaissance se mesure ailleurs et
doit, elle, grandir. Le chiffre de `src/` est le même que celui de l'audit (« 6 934 lignes de
TypeScript ») : c'est la référence dont on part.

Le script est du bash 3.2 sans `find`, `sed` ni `awk` (seulement `wc`), pour tourner tel quel sous
Linux, macOS et Git Bash — la CI passe sur les trois.

## Le seuil, et son calendrier

`ci.yml` exécute `bash scripts/loc.sh --max N` sur chaque push et chaque PR ; au-dessus de N, la CI
est rouge. N ne remonte jamais ; il baisse à trois moments :

| Seuil | Quand | Ce qui est sorti du noyau |
|---|---|---|
| **7 000** | maintenant (M3-1) | rien encore — on part de 6 934 |
| **5 000** | après M3-3 | solveurs et recettes vers `examples/` (M3-2) ; miroirs, visuels, schémas, wizard, calculateurs vers `packages/` (M3-3) |
| **3 000** | après M3-6 | le CLI n'enregistre que le noyau ; les extensions sont déclarées dans `arche.yaml` |

Le noyau visé : *catalog · download · serve · index · search · mcp* — ce qui **sert** la base sans
réseau. Le critère pour qu'un fichier reste dans `src/` est celui de l'ADR 0013 : *est-ce que ça sert
la base, ou est-ce que ça la remplace ?*

Changer le seuil = éditer une seule ligne de `.github/workflows/ci.yml` (`--max`) et la phrase du
README qui l'annonce. Un ticket qui *monte* le seuil doit dire pourquoi dans son rapport ; par défaut
la réponse est non.

## Publier le chiffre

Le README affiche les trois nombres entre les marqueurs `<!-- loc -->` et `<!-- /loc -->`. Pour les
rafraîchir :

```bash
npm run loc -- --readme
```

Le script ne touche que ce bloc. Il n'est pas vérifié en CI (un chiffre en retard n'est pas une
régression, un dépassement l'est) ; on le rafraîchit avec chaque ticket M3 et à chaque release.

## Options

```
scripts/loc.sh                 affiche src/, examples/, vendor/
scripts/loc.sh --max 7000      échoue (code 1) si src/ dépasse le seuil — c'est l'appel de la CI
scripts/loc.sh --readme        réécrit le bloc <!-- loc --> du README.md
scripts/loc.sh --root DIR      mesure un autre dépôt (les tests s'en servent sur une arborescence minuscule)
```
