# Sauvegarde d'urgence — sites qui peuvent disparaître

> Ordre de priorité au 11 septembre 2026. English: [EMERGENCY-RESCUE.md](../en/EMERGENCY-RESCUE.md)

| Priorité | Site | Pourquoi c'est urgent | Recette | Ce qu'on a le droit de faire |
|---|---|---|---|---|
| **1** | **L'Atelier Paysan** — latelierpaysan.org/Outils-et-plans | coopérative **en liquidation depuis avril 2026** ; le site est encore en ligne, le nom de domaine et l'hébergement peuvent s'arrêter du jour au lendemain | `atelierpaysan-fr` | CC BY-NC-SA : copie privée **oui**, publication **après accord écrit** |
| **2** | **Practical Plants** — practicalplants.org | en **lecture seule depuis une panne serveur en 2022**, plus personne ne maintient ; ~7 400 fiches de plantes utiles | `practicalplants-en` | CC BY-NC-SA : idem |
| 3 | Plants For A Future — pfaf.org | association vivante mais petite ; texte CC BY | `pfaf-en` | copie et publication **oui** (texte seul, images exclues) |
| 4 | Farm Hack — farmhack.org | vivant (mises à jour juin 2026) mais licence par outil, souvent CC BY 4.0 | `farmhack-en` | copie privée oui ; publication : demander |
| 5 | Solar Cooking wiki (Fandom) | Fandom est stable ; licence à confirmer | `solarcooking-en` | copie privée oui |

Tout ce qui est sur GitHub (LeRobot, OSE sur GitHub, Libre Solar…) n'est pas urgent : un
`git clone --mirror` se fait quand on veut et GitHub ne disparaît pas cette semaine. L'urgence, ce
sont les **sites web sans dépôt**, tenus par des structures fragiles.

## Ce soir, dans l'ordre

### 1. Lancer la sauvegarde en CI (10 minutes de ton temps, zéro sur ton Mac)

Le dépôt contient `.github/workflows/rescue.yml`. Une fois le dépôt poussé sur GitHub :
onglet **Actions → rescue → Run workflow**, `recipe = atelierpaysan-fr`, laisser `pdf_only`
décoché. Le crawl tourne dans GitHub (jusqu'à 6 h), produit le miroir wget des PDF **et** un ZIM,
et les dépose comme **artefact conservé 90 jours**. Relancer avec `practicalplants-en`.

Pas de compte Internet Archive nécessaire. Rien ne touche ton Mac. Dans 90 jours, ou dès que le
compte IA existe, `scripts/zim/upload-ia.sh` publie ce qui a reçu une autorisation.

### 2. Demander à Internet Archive de sauvegarder aussi (5 minutes)

Deux voies complémentaires, publiques, qui ne dépendent pas de nous :

- **Wayback Machine « Save Page Now »** : sur https://web.archive.org/save, entrer
  `https://www.latelierpaysan.org/Outils-et-plans` en cochant *Save outlinks* (nécessite d'être
  connecté à un compte archive.org — gratuit, 2 minutes à créer, même sans les clés S3). Ça
  capture les pages et les PDF liés.
- **Archive Team** : c'est le collectif qui sauve les sites en fin de vie. Signaler le site sur
  https://wiki.archiveteam.org/index.php/Deathwatch ou dans le canal IRC `#archivebot` (réseau
  hackint) avec l'URL et la mention « coopérative en liquidation depuis avril 2026 ». Leur ArchiveBot
  fait un crawl complet versé dans la Wayback Machine.

### 3. Envoyer la demande d'autorisation (5 minutes)

Le mail est prêt dans `docs/permissions/atelierpaysan-fr.md`. Pour une structure en liquidation,
écrire **à la fois** à l'adresse générique de la coopérative et, si elle est publiée dans l'annonce
de liquidation (BODACC), au **liquidateur** : c'est lui qui détient les droits pendant la procédure.
Proposer aussi d'héberger une copie « telle quelle » du site sur Internet Archive — c'est ce que les
liquidateurs acceptent le plus facilement, ça ne leur coûte rien.

### 4. Si tu veux une copie sur un disque à toi (optionnel)

Sur n'importe quelle machine avec Docker (ton Mac ou une autre), disque externe branché :

```bash
cd ~/http/arche && npm ci
scripts/rescue/rescue.sh atelierpaysan-fr /Volumes/SSD/rescue          # ZIM + PDF
scripts/rescue/rescue.sh practicalplants-en /Volumes/SSD/rescue
# ou seulement les PDF/plans, sans Docker :
scripts/rescue/rescue.sh atelierpaysan-fr /Volumes/SSD/rescue --pdf-only
```

Deux copies, deux disques. `sha256sum -c SHA256SUMS` pour vérifier plus tard.

## Ce que ça change dans le catalogue

- `catalog/zim-recipes.yaml` : les recettes urgentes ont `schedule: asap` (construites à chaque
  lancement de `zim-build.yml` dès que la permission passe à `written`).
- Les ressources correspondantes portent le tag `urgent` ; le rapport hebdomadaire du robot les
  vérifie en tête (`check_interval_days: 7`).
- Le jour où le site meurt : la ressource passe en `missing`, mais le ZIM hébergé par Arche (une
  fois publié) prend le relais via `source.kind: arche-hosted`. C'est exactement le scénario pour
  lequel le projet existe.
