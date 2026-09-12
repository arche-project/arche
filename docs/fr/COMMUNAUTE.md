# Communauté : comment le catalogue se met à jour sans dépendre d'une personne

> English: [COMMUNITY.md](../en/COMMUNITY.md)

## Le problème

Un catalogue de 110 ressources vieillit chaque semaine : URL qui bougent, ZIM renommés, licences
qui changent, nouveaux modèles. Les robots (`catalog-update.yml`, `zim-build.yml`) font 80 % du
travail mécanique. Les 20 % restants — *faut-il ajouter ceci, retirer cela, ce contenu est-il
fiable ?* — demandent des humains, et ne doivent pas dépendre d'un seul (bus factor, angle mort F1).

## Trois cercles, trois niveaux de confiance

| Cercle | Qui | Peut | Comment on y entre |
|---|---|---|---|
| **Utilisateurs** | tout le monde | signaler un lien mort, proposer une ressource, voter 👍 sur une proposition, tester une release | rien à faire : un formulaire d'issue GitHub |
| **Curateurs** | 5 à 15 personnes, une par domaine (santé, agriculture, énergie, électronique, IA, éducation, juridique, cartes…) | relire et approuver les PR de catalogue de leur domaine ; le fichier `CODEOWNERS` route automatiquement | proposé par un curateur existant après 3 contributions acceptées, validé par un mainteneur |
| **Mainteneurs** | 2 minimum (bus factor), 4 idéalement | merger, publier une release, gérer les secrets, décider des règles | cooptation, un vote des curateurs |

Pas de comité, pas de DAO, pas de vote pondéré par jeton : un dépôt GitHub avec des règles écrites,
comme Debian, Home Assistant ou Kiwix. Ça marche depuis trente ans.

## Le flux d'une contribution

```
Issue « Proposer une ressource » (formulaire : URL, licence, pourquoi hors-ligne, profil)
   → étiquette auto `proposal` + domaine
   → 👍 des utilisateurs (signal, pas décision)
   → un curateur du domaine répond sous 30 jours : accepte / refuse / demande des précisions
   → si accepté : PR (par le proposant ou le curateur) = une entrée YAML, status: unverified
   → CI : schéma, validate, liens ; robots : taille, version
   → review par un second curateur si domaine santé/sécurité (règle des deux yeux)
   → merge → l'updater la vérifie la semaine suivante → status: active
```

Une ressource `missing` trois semaines de suite est proposée à la suppression par le robot dans sa
PR hebdomadaire ; un curateur tranche.

## Ce que les robots ne fusionnent jamais

Les robots proposent, les humains fusionnent — **aucun workflow ne fusionne une PR**. La première
version de ce document prévoyait une fusion automatique des « faits » (taille, version, URL datée,
hachage) après sept jours sans objection ; l'audit d'architecture (erreur 7) l'a retirée (M2-3) :
une URL ou un hachage fusionné sans regard humain est précisément ce qu'un attaquant veut, et un
catalogue qui se tient tout seul ne vaut rien s'il peut s'empoisonner tout seul.

- **Champs sensibles** : `source.*` (url, mirrors, torrent, magnet, ia_item…), `checksum.*`,
  `size_bytes`, `license.*`, `index.url` / `index.sha256` / `index.size_bytes` — tout ce qui décide de
  ce qui est téléchargé et d'où. Le script `scripts/catalog/sensitive-diff.ts` les compare avec la
  branche cible ; le workflow `catalog-review.yml` pose l'étiquette **`catalog-sensitive`** sur
  toute PR qui en change un, et `catalog-update.yml`, `zim-build.yml`, `index-build.yml` la posent
  sur leurs propres PR, avec le tableau des champs en tête du corps.
- **Relecture à deux** : une PR `catalog-sensitive` attend deux humains (auteur + relecteur, ou
  deux relecteurs pour une PR robot). Le relecteur ouvre l'URL sur la source officielle et recoupe
  le hachage. La règle exacte est dans [CONTRIBUTING.md](../../CONTRIBUTING.md).
- **Le catalogue reste vivant autrement** : les vérificateurs tournent deux fois par semaine et
  mettent la PR à jour ; la fraîcheur ([FRAICHEUR.md](FRAICHEUR.md)) mesure ce qui n'a pas été
  relu. Une PR robot qui attend un mois est un signal pour trouver un second curateur, pas une
  raison de la fusionner sans regarder.

## Règles éditoriales, écrites une fois

1. **Utile sans réseau** : pas de service en ligne déguisé, pas de contenu qui suppose une connexion.
2. **Source officielle ou construite par Arche avec base légale** — jamais de ré-hébergement pirate.
3. **Licence honnête** : `unclear` vaut mieux qu'un `allowed` inventé.
4. **Santé et sécurité = sources de référence seulement** (`reliability: reference`), deux relecteurs.
5. **Bilingue** : `name` et `description` en FR et EN, sinon la CI refuse.
6. **Petit et sûr avant gros et douteux** : une ressource de 200 Mo fiable passe avant un ZIM de
   100 Go non vérifié.
7. **Pas d'armes, pas d'explosifs, pas de contournement de sécurité** : la ligne du projet, non négociable.

## Points Arche

La communauté n'est pas que sur GitHub. Un **point Arche** est un lieu physique (fablab,
bibliothèque, association, ferme, école) qui :

- garde un disque à jour (`arche download` mensuel) et le **duplique** pour qui vient avec un disque vide ;
- fait tourner un Pi qui **seede** les torrents et sert le LAN (voir DISTRIBUTION.md) ;
- tient un **carnet** : ce qui a été utile, ce qui manque → remonte des propositions.

Le dépôt liste les points Arche volontaires dans `docs/points-arche.md` (ville, lieu, contact,
horaires), sans obligation. C'est aussi la réponse à l'angle mort A1 (« je n'ai pas téléchargé avant
la coupure »).

## Outils dans le dépôt

- `.github/ISSUE_TEMPLATE/` : *Proposer une ressource*, *Signaler un lien mort*, *Demander un ZIM*
  (site sans ZIM → recette + demande d'autorisation), *Devenir point Arche*.
- `.github/CODEOWNERS` : routage des PR par fichier de catalogue vers les curateurs du domaine.
- `catalog-review.yml` : l'étiquette `catalog-sensitive` (ci-dessus) ; rien ne fusionne.
- `docs/GOUVERNANCE.md` (à écrire ensemble) : comment on décide, comment on se sépare, qui détient
  les clés (secrets IA, clé minisign), protocole de succession en une page.

## Ce que je ne recommande pas

- **Un jeton ou une DAO** pour gouverner : ça transforme un problème de confiance humaine (qui
  relit une fiche médicale ?) en problème de trésorerie, et ça exclut précisément les
  contributeurs qu'on veut (infirmières, agriculteurs, profs).
- **Un wiki ouvert en écriture** pour le catalogue : le YAML validé par CI + PR relue est plus
  lent, mais c'est ce qui rend la fiche santé fiable.
- **Attendre d'avoir une communauté pour écrire les règles** : les règles ci-dessus sont le
  minimum ; les écrire avant que les conflits arrivent est ce qui les évite.
