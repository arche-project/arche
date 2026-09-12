# Hébergement : les ZIM qu'Arche construit et publie

> English: [HOSTING.md](../en/HOSTING.md) · Décision : [ADR 0005](../adr/0005-arche-hosted-zims.md)

## Le principe, mis à jour

Arche ne redistribue **jamais** un fichier produit par quelqu'un d'autre (les ZIM Kiwix, les modèles,
les binaires viennent de leur éditeur). Mais pour les sources qui n'ont pas de ZIM — Low-tech Lab,
Open Source Ecology, RepRap, e-NABLE… — Arche **construit** lui-même le ZIM à partir du site, et
l'héberge, **si et seulement si la licence de la source le permet ou si son auteur a donné son
accord écrit**. L'utilisateur final n'a jamais rien à crawler : il coche, il télécharge.

Rien ne transite par la machine du mainteneur : la construction se fait dans GitHub Actions, le
fichier est envoyé directement sur Internet Archive.

## Pourquoi Internet Archive

Gratuit, sans limite de taille, durable (fondation à but non lucratif, 30 ans d'existence), déjà
hébergeur de centaines de ZIM Kiwix, et il génère automatiquement un **.torrent** par item, ce qui
donne une distribution pair-à-pair sans rien faire (voir [DISTRIBUTION.md](DISTRIBUTION.md)).
GitHub Releases (2 Go max par fichier) et Cloudflare R2 (payant, sans frais de sortie) sont les
plans B, prévus dans `source.mirrors`.

## La chaîne

```
catalog/zim-recipes.yaml ──► zim-build.yml (GitHub Actions, mensuel ou à la demande)
        │                          │
        │  permission ∈ {license, written} ? sinon REFUSÉ
        │                          ▼
        │                 scripts/zim/build.sh  ── mwoffliner (MediaWiki) / zimit (site) / zimwriterfs (dossier)
        │                          ▼
        │                 zimcheck + zimdump info (contrôle)
        │                          ▼
        │                 scripts/zim/upload-ia.sh  ── archive.org/download/<ia_item>/<name>_<YYYY-MM>.zim (+ .sha256, + torrent auto)
        │                          ▼
        └────────────► scripts/zim/update-catalog.ts ── PR « zim: <recette> » : URL, taille, sha256, version, built_from
```

Une recette = un bloc YAML : outil, URL, langue, nom, licence, **`permission`**, fréquence
(`monthly` / `quarterly` / `yearly`), identifiant d'item IA, options. Le champ `permission` est le
verrou : `license` (la licence seule suffit), `written` (accord archivé dans `docs/permissions/`),
`pending` (demandé), `none` (interdit). Le workflow refuse tout ce qui n'est pas `license` ou `written`.

Côté catalogue, la ressource passe en `source.kind: arche-hosted` avec `built_from` (site d'origine,
outil, recette, date, base légale) : l'utilisateur voit toujours d'où vient le contenu.

## Qui a le droit à quoi

| Licence de la source | Peut-on publier ? | Exemples |
|---|---|---|
| CC BY, CC BY-SA, CC0, domaine public, GFDL | **Oui**, avec attribution (dans les métadonnées du ZIM et de l'item IA) | Open Source Ecology, RepRap, Appropedia, Sésamath, Wikilivres |
| CC BY-NC / BY-NC-SA | **Demander** : un projet gratuit sans pub est « non commercial » pour la plupart des auteurs, mais pas pour tous | Low-tech Lab, InMoov, iFixit, Khan Academy |
| Licence absente, mixte, ou site © | **Non** sans accord écrit | Farm Hack, e-NABLE (par design), Instructables, Hackaday, WikiHow |
| Contenu médical | Publier seulement des sources de référence (`reliability: reference`) | Hesperian (NC, demander), OMS, IFRC |

## Demander l'autorisation — mail type

> Objet : Autorisation de publier une version hors-ligne (ZIM) de <site>
>
> Bonjour,
> Je maintiens Arche (<url du dépôt>), un projet libre (MIT) et gratuit qui permet à n'importe qui de
> constituer une bibliothèque hors-ligne pour les zones sans réseau. Vos contenus sont parmi les plus
> utiles que nous connaissions pour <domaine>.
> Nous aimerions publier une copie hors-ligne de <site> au format ZIM (le format de Kiwix / Wikipédia
> hors-ligne), reconstruite <tous les trois mois> depuis votre site, hébergée sur Internet Archive,
> avec attribution complète, lien vers votre site sur la page d'accueil, sans aucune modification de
> contenu ni usage commercial. Vous pourriez demander son retrait à tout moment.
> Votre licence <CC BY-NC-SA> laisse une ambiguïté sur ce cas : auriez-vous un accord écrit à nous
> donner, ou des conditions à poser ?
> Merci pour votre travail.

Archiver la réponse dans `docs/permissions/<recette>.md` (modèle fourni), puis passer la recette en
`permission: written`.

## Limites et plan B

- GitHub Actions : 6 h et ~14 Go par job. Suffisant pour des wikis de quelques Go ; au-delà (Khan
  Academy, gros forums), un **runner auto-hébergé** sur un VPS (5 €/mois, 2 vCPU, 80 Go) fait le même
  travail — le workflow ne change pas, seul `runs-on` change.
- Internet Archive limite le débit par item ; pour les fichiers > 10 Go, préférer le torrent comme
  transport par défaut (`arche download` le fera quand le client BitTorrent intégré existera —
  voir DISTRIBUTION.md).
- Un site peut interdire les robots (`robots.txt`) : Zimit le respecte ; mwoffliner passe par l'API
  et n'est pas concerné. Un site hostile aux robots est un signal qu'il faut demander avant.
- Demander à **Kiwix** d'abord (`openzim/zim-requests`) reste la meilleure option quand c'est
  possible : hébergement, mise à jour et légalité pris en charge par eux, et la ressource arrive
  dans l'OPDS donc dans Arche sans rien changer.

## Ce que ça change pour l'utilisateur

Rien. Une ressource `arche-hosted` se télécharge comme une ressource Kiwix, avec reprise et
vérification sha256. En mode expert, la fiche affiche « construit par Arche depuis <site> le <date>,
base légale : <licence | accord écrit> ».
