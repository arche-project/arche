# Publier le dépôt — la procédure de M0-1, pas à pas

> À faire une seule fois, depuis le Mac, une vingtaine de minutes. Décisions : D6
> (`github.com/arche-project/arche`), D11 (compte Internet Archive créé, clés en main).
> Rien de ce qui suit ne met de contenu dans le dépôt : du texte, et deux secrets côté GitHub.

## 1. L'organisation et le dépôt (sur github.com, 3 minutes)

1. Connecté à GitHub, en haut à droite **+ → New organization → Free**. Nom : `arche-project`.
   Mail de contact : le tien. Appartenance : « My personal account ».
2. Dans l'organisation : **New repository**. Nom `arche`, **Public**, description :
   *Offline knowledge base for self-reliance — an aggregator plus a RAG, served over MCP to any
   local model.* Ne coche **aucune** case (pas de README, pas de .gitignore, pas de licence :
   le dépôt les a déjà).
3. Noter l'URL : `https://github.com/arche-project/arche`.

## 2. Le premier push (depuis `~/http/arche`, 5 minutes)

Le dossier n'est pas encore un dépôt git. Dans un terminal :

```bash
cd ~/http/arche
git init -b main
git add -A
git status            # relire : pas de library/, pas de .arche/, pas de node_modules/ (le .gitignore les exclut)
git commit -m "Arche — first public commit (ADR 0013, 0015; backlog v2)"
git remote add origin https://github.com/arche-project/arche.git
git push -u origin main
```

Si `git push` demande une identification : un *personal access token* (Settings → Developer
settings → Fine-grained tokens, portée : ce dépôt, permission *Contents: read and write*) tient
lieu de mot de passe. Ou `gh auth login` si le CLI GitHub est installé.

## 3. Les secrets (Settings du dépôt → Secrets and variables → Actions, 2 minutes)

**New repository secret**, deux fois, noms exacts :

- `IA_ACCESS_KEY` — la clé d'accès Internet Archive (page `archive.org/account/s3.php`)
- `IA_SECRET_KEY` — la clé secrète

Elles ne servent qu'aux workflows `index-build.yml` et `zim-build.yml`. Elles ne s'affichent
plus jamais après enregistrement ; pour changer, on remplace.

## 4. Actions et protection de branche (Settings, 3 minutes)

- **Actions → General** : « Allow all actions and reusable workflows » ; Workflow permissions :
  **Read and write**, et cocher « Allow GitHub Actions to create and approve pull requests »
  (les workflows ouvrent des PR, jamais ne les fusionnent — M2-3).
- **Branches → Add branch ruleset** sur `main` : *Require a pull request before merging* (1
  relecture), *Require status checks to pass* (choisir `ci` une fois qu'il a tourné une fois),
  *Block force pushes*. Toi et les mainteneurs passez par des PR comme tout le monde.

## 5. Vérifier (5 minutes)

1. Onglet **Actions** : `ci.yml` s'est lancé sur le push. Il doit être vert (build, tests,
   validation du catalogue, seuil de lignes du noyau). S'il est rouge, lire le log avant tout
   autre chose ; ne pas relancer d'autres workflows tant qu'il l'est.
2. Lancer à la main **catalog-update.yml** (Actions → le workflow → *Run workflow*) : il doit
   ouvrir une PR de fraîcheur, sans la fusionner. C'est le critère de M0-2.
3. Coller le badge CI dans README.md (M0-1 le demande) :
   `![CI](https://github.com/arche-project/arche/actions/workflows/ci.yml/badge.svg)`.

## 6. Le test manuel d'hébergement (M0-3, quand M1-10 aura le nouveau format)

Sur le Mac, une seule fois : `pipx install internetarchive` puis `ia configure` (mail et mot
de passe archive.org ; l'outil récupère les clés et les range dans
`~/.config/internetarchive/ia.ini`, hors du dépôt). Ensuite `scripts/index/upload-ia.sh` sur
un shard minuscule, et `arche index fetch` sur une machine vierge — la CI le fait aussi.

## Ce qui reste interdit

Aucune clé dans un fichier du dépôt, jamais — le `.gitignore` exclut `.env`, mais la règle
vaut pour tout fichier. Aucun contenu téléchargé dans le dépôt (`library/`, `.arche/` sont
exclus). Aucun `automerge` : les workflows proposent, un humain fusionne — et deux humains quand la
PR porte l'étiquette `catalog-sensitive` (url, checksum, size, licence ; voir CONTRIBUTING.md).
