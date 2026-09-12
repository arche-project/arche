# ADR 0014 — Le format de corpus : une base SQLite par corpus, lisible sans Arche

**Statut** : accepté (décision 1 de l'[audit d'architecture](../fr/AUDIT-ARCHITECTURE.md), ticket
M1-1, 2026-09-12). Remplace les points 3, 5 et 8 de l'ADR 0007 ; complète l'ADR 0013 (la base, pas
le logiciel) et l'ADR 0002 (dépendances : `node:sqlite` est intégré à Node 22, rien à installer).

## Contexte

Le format d'index d'aujourd'hui, `.arche-idx`, est un fichier binaire maison : un en-tête JSON, des
locators gzippés, des vecteurs int8, **aucun texte**, et un modèle d'embedding figé dans le fichier.
L'audit y voit trois erreurs en une (erreur 2) : changer de modèle oblige à republier des centaines
de corpus ; sans texte, l'index est mort sans le ZIM *et* sans kiwix-serve *et* sans le code
d'Arche ; et un format que seul Arche sait lire ne vaut rien en 2040 pour quelqu'un qui n'a plus que
Python et `sqlite3`. S'y ajoutent le BM25 maison (67 lignes à maintenir, erreur 9) et le texte des
documents de l'utilisateur copié à côté dans `index/text/` — trois fichiers pour une seule chose.

Ce que l'ADR 0007 a bien vu reste : découper sur la structure, chercher en hybride, fusionner par
RRF, diversifier par source. C'est le **contenant** qui était faux.

## Décision

1. **Un corpus = un fichier SQLite, `<resource_id>.arche.sqlite`.** Il contient le texte des
   chunks, leurs locators, les articles, un index plein texte FTS5, les métadonnées et la licence
   **héritée** du corpus, et — optionnellement — une table de vecteurs par modèle d'embedding. Le
   disque est la ressource bon marché ; le couplage est la ressource chère : le texte est *dedans*.
   Un ZIM reste lisible par kiwix-serve, un PDF par son lecteur ; mais la base se suffit.
2. **Lisible avec `sqlite3` seul.** Aucune extension, aucune fonction utilisateur, aucun format
   binaire hors les blobs de vecteurs dont la disposition est décrite ici. Un utilisateur avec
   Python, R, Go, Rust ou le shell `sqlite3` de sa distribution pose une question au corpus sans
   une ligne d'Arche (exemple plus bas). SQLite est le format de fichier le plus durable qui existe
   (recommandé par la Library of Congress, engagement de compatibilité jusqu'en 2050).
3. **Le lexical, c'est FTS5.** BM25 intégré, éprouvé, avec `snippet()` et `highlight()`, tokenizer
   `porter unicode61 remove_diacritics 2` : insensible à la casse et aux accents (« deshydratation »
   trouve « déshydratation »), racines anglaises par Porter. FTS5 n'a pas de racinisation française ;
   c'est `arche eval` (M1-7) qui dira si la perte est mesurable, et `trigram` (index trois fois plus
   gros) ou un stemmer Snowball vendu sont les options si oui. `bm25.ts` disparaît.
4. **Les vecteurs sont une table dérivée, par modèle, optionnelle.** `vectors_<modèle>` avec une
   ligne dans le registre `vectors` (table, dimensions, type). On peut en avoir zéro (le corpus se
   cherche en FTS5), une, ou plusieurs ; en ajouter une **sans toucher au texte ni republier** le
   corpus (M1-4) ; la publier à part comme fichier compagnon (voir « Transport »). Les vecteurs sont
   normalisés L2 puis encodés `int8` (× 127) ou `f16` : le cosinus est un produit scalaire d'entiers.
5. **Transport : zstd.** `<resource_id>.arche.sqlite.zst`, sha256 du `.zst` dans le catalogue,
   décompressé à l'installation dans `<bibliothèque>/index/`. Le texte et le FTS5 se compressent
   4 à 6 fois ; les vecteurs int8 presque pas — raison de plus pour qu'ils soient à part et petits
   (M1-9).
6. **Ce qui disparaît** : `.arche-idx` et son parseur (`shard.ts`), `index/text/` et ses manifestes,
   `bm25.ts`, la règle « les shards doivent être du même modèle » (`assertFusable`) — chaque base
   porte ses propres tables ; une base sans la table du modèle demandé répond en FTS5 seul et le dit.

## Schéma SQL

Le schéma complet, tel que `src/core/rag/sqlite.ts` le pose (`SCHEMA_SQL` ; un test vérifie que les
deux sont identiques). En tête de fichier, `PRAGMA application_id = 0x41524348` (« ARCH » en ASCII)
et `PRAGMA user_version = 1` (la version du format) : `sqlite3 x.arche.sqlite 'PRAGMA user_version'`
suffit à reconnaître un corpus Arche et sa version sans lire une table.

```sql
-- Métadonnées en clé/valeur : ajouter une clé ne change jamais le schéma. Clés obligatoires :
-- format_version, resource_id, built_at, license_spdx, license_redistribution, languages.
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
-- Un article = une page de la source (ZIM, PDF, EPUB, Markdown). url : où l'ouvrir hors ligne (kiwix-serve, arche://).
CREATE TABLE articles (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, url TEXT, lang TEXT);
-- Un chunk = un passage AVEC son texte. byte_offset/byte_length : sa place dans le texte de l'article (le locator).
-- assets : fichiers cités (JSON, chemins) ; kind : NULL = texte, 'asset' = description générée d'un fichier.
CREATE TABLE chunks (id INTEGER PRIMARY KEY, article INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL, heading TEXT NOT NULL DEFAULT '', byte_offset INTEGER NOT NULL, byte_length INTEGER NOT NULL,
  text TEXT NOT NULL, assets TEXT, kind TEXT, UNIQUE (article, ordinal));
-- Lexical : FTS5 (BM25 intégré) sur le texte et le titre de section, sans dupliquer le texte (content=chunks).
-- porter unicode61 : insensible à la casse et aux accents (remove_diacritics 2), racines EN ; le FR est mesuré par eval.
CREATE VIRTUAL TABLE chunks_fts USING fts5(text, heading, content='chunks', content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, text, heading) VALUES (new.id, new.text, new.heading); END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text, heading) VALUES ('delete', old.id, old.text, old.heading); END;
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text, heading) VALUES ('delete', old.id, old.text, old.heading);
  INSERT INTO chunks_fts (rowid, text, heading) VALUES (new.id, new.text, new.heading); END;
-- Registre des vecteurs : une ligne par modèle d'embedding — sa table, dims, type. Le lecteur ne devine
-- jamais un nom de table : il lit ce registre. Aucune ligne = corpus cherchable en FTS5 seul.
CREATE TABLE vectors (model TEXT PRIMARY KEY, "table" TEXT NOT NULL UNIQUE, dims INTEGER NOT NULL,
  dtype TEXT NOT NULL CHECK (dtype IN ('int8', 'f16')), built_at TEXT NOT NULL, count INTEGER NOT NULL) WITHOUT ROWID;
-- Un passage cité : locator = resource_id/path#byte_offset, stable d'une version du format à l'autre.
CREATE VIEW passages AS SELECT c.id AS chunk_id,
  (SELECT value FROM meta WHERE key = 'resource_id') || '/' || a.path || '#' || c.byte_offset AS locator,
  a.path, a.title, a.url, c.heading, c.ordinal, c.byte_offset, c.byte_length, c.text, c.assets, c.kind
  FROM chunks c JOIN articles a ON a.id = c.article;
```

### `meta` — les clés

| Clé | Obligatoire | Valeur |
|---|---|---|
| `format_version` | oui | `1` — la même que `PRAGMA user_version`, en clair pour `SELECT` |
| `resource_id` | oui | l'`id` du catalogue (`pdf-ou-il-ny-a-pas-de-docteur`) ou le nom donné à `arche index add` |
| `built_at` | oui | ISO 8601 UTC |
| `license_spdx` | oui | **héritée du corpus** (`LicenseRef-Hesperian-Open-Copyright`), jamais « MIT » par défaut |
| `license_redistribution` | oui | `allowed` · `allowed-nc` · `attribution` · `forbidden` · `unclear` (vocabulaire du catalogue) |
| `languages` | oui | codes ISO séparés par des virgules (`fr`, `fr,en`, `mul`) |
| `source_sha256` | si connu | sha256 du fichier source indexé : la base ne vaut que pour cette version |
| `source_kind` | conseillé | `zim` · `pdf` · `epub` · `markdown` · `html` · `dir` |
| `attribution` | si la licence l'exige | le texte à afficher (« Hesperian Health Guides, hesperian.org ») |
| `title` | conseillé | le nom humain de la ressource |
| `built_by`, `chunker` | conseillé | `arche 0.1.0` ; `structure/1200/2000/150/200` (méthode et réglages du découpage) |
| `articles`, `chunks` | conseillé | comptes, informatifs (la vérité est `count(*)`) |

### `vectors_<modèle>` — une table par modèle

```sql template
CREATE TABLE IF NOT EXISTS "vectors_<modèle>" (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  vec  BLOB NOT NULL,   -- dims × 1 octet (int8) ou dims × 2 octets (f16 little-endian), vecteur normalisé L2
  norm REAL             -- la norme L2 du vecteur AVANT normalisation (NULL si le modèle ne la rend pas)
);
INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES ('bge-m3', 'vectors_bge_m3', 1024, 'int8', '…', …);
```

- **Nom** : `vectors_` + l'identifiant du modèle en minuscules, tout ce qui n'est pas `[a-z0-9]`
  remplacé par `_` (`bge-m3` → `vectors_bge_m3`, `nomic-embed-text:v1.5@256` →
  `vectors_nomic_embed_text_v1_5_256`). Un modèle tronqué (Matryoshka, M1-9) est un modèle
  distinct : `<modèle>@<dims>`. Le lecteur ne construit jamais ce nom : il lit `vectors."table"`.
- **Encodage** : le vecteur est normalisé L2, puis `int8` = `round(x × 127)` dans [−127, 127], ou
  `f16` = IEEE 754 demi-précision little-endian. `dims` et `dtype` sont dans le registre, une fois,
  pas par ligne. Un `vec` doit faire exactement `dims × (1 | 2)` octets.
- **Cosinus** : pour deux vecteurs int8 normalisés, `cos = dot(a, b) / 127²` ; pour une question en
  flottants normalisés contre un int8, `cos = dot / 127`. Aucune racine carrée à la requête.
- **Ajouter un modèle** = `CREATE TABLE` + `INSERT` dans `vectors` + remplir : `meta`, `articles`,
  `chunks`, `chunks_fts` ne bougent pas. **Retirer un modèle** = `DROP TABLE` + `DELETE FROM vectors`.

## Requêtes de référence

Toutes sont exécutées par `tests/sqlite-format.test.ts` sur un corpus minuscule construit à la volée
(elles sont donc vraies, pas décoratives). Les identifiants et termes sont ceux de cette fixture.

**Lexical (BM25 par FTS5).** Plus petit = meilleur ; le titre de section pèse double ; `snippet()`
rend l'extrait avec les termes marqués. `MATCH` accepte `OR`, `AND`, `NOT`, `"phrase exacte"`,
`préfixe*` et `NEAR(a b, 5)`.

```sql
SELECT p.locator, p.title, p.heading,
       snippet(chunks_fts, 0, '[', ']', '…', 12) AS extrait,
       bm25(chunks_fts, 1.0, 2.0) AS score
FROM chunks_fts JOIN passages p ON p.chunk_id = chunks_fts.rowid
WHERE chunks_fts MATCH 'deshydratation OR rehydratation'
ORDER BY score LIMIT 5;
```

**Quels modèles cette base porte-t-elle ?** (zéro ligne : FTS5 seul.)

```sql
SELECT model, "table", dims, dtype, count, built_at FROM vectors ORDER BY model;
```

**Lire un article entier** (ce que `read_article` et `arche://article/…` font depuis M1-3, par
`readCorpusArticle` dans `retrieve.ts`). Les chunks se recouvrent : le découpage copie en tête de
chaque chunk les 150 derniers caractères du précédent (`meta.chunker` = `structure/…/150/…`) ; le
lecteur retire ce préfixe par la même règle en sens inverse et réinsère les titres de section.

```sql
SELECT c.ordinal, c.heading, c.text
FROM chunks c JOIN articles a ON a.id = c.article
WHERE a.path = 'A/Diarrhee' ORDER BY c.ordinal;
```

**D'où vient cette base, sous quelle licence ?**

```sql
SELECT key, value FROM meta ORDER BY key;
```

**Le passage derrière un locator** (une citation dans `knowledge/` pointe ici — audit, décision 2).

```sql
SELECT locator, title, heading, text FROM passages
WHERE locator = 'pdf-ou-il-ny-a-pas-de-docteur/A/Diarrhee#0';
```

**Dense (cosinus), sans Arche.** Le cosinus n'est pas du SQL : on lit les blobs et on fait un produit
scalaire dans le langage hôte — dix lignes en Python, standard library seule. Le vecteur de la
question vient d'Ollama (`POST /api/embed`) sur l'entrée standard :

```python
import json, sqlite3, struct, sys
db, model = sqlite3.connect(sys.argv[1]), sys.argv[2]        # corpus.arche.sqlite  bge-m3
q = json.load(sys.stdin)                                       # [0.01, -0.2, …] : la question embarquée
table, dims, dtype = db.execute('SELECT "table", dims, dtype FROM vectors WHERE model = ?', (model,)).fetchone()
q = q[:dims]; n = sum(x * x for x in q) ** 0.5 or 1.0; q = [x / n for x in q]
fmt, scale = (f'{dims}b', 127.0) if dtype == 'int8' else (f'<{dims}e', 1.0)
best = sorted(((sum(a * b for a, b in zip(struct.unpack(fmt, vec), q)) / scale, cid)
               for cid, vec in db.execute(f'SELECT chunk_id, vec FROM "{table}"')), reverse=True)[:5]
for score, cid in best:
    locator, title, text = db.execute('SELECT locator, title, text FROM passages WHERE chunk_id = ?', (cid,)).fetchone()
    print(f'{score:.3f}\t{locator}\t{title}\t{text[:80]}')
```

```bash
curl -s localhost:11434/api/embed -d '{"model":"bge-m3","input":"comment traiter une déshydratation ?"}' \
  | jq '.embeddings[0]' | python3 cosinus.py pdf-ou-il-ny-a-pas-de-docteur.arche.sqlite bge-m3
```

La même chose en TypeScript, telle que `retrieve.ts` la fait (`vectorSearch`, M1-3) — balayage
exhaustif par blocs de 4 096 lignes, un tas de taille *k* tenu à plat, quatre accumulateurs. Mesuré
(`scripts/index/bench-retrieve.ts`, 100 000 chunks, Xeon 2,8 GHz, Node 22) : le produit scalaire
coûte 56 ms à 384 dims et 150 ms à 1 024 dims ; c'est la **lecture des lignes** par `node:sqlite`
(un objet et une copie par blob, ~4 µs la ligne) qui domine : 370 à 770 ms pour 100 000 lignes.
D'où le choix du lecteur : les blocs d'une table sont gardés en mémoire par processus
(`ARCHE_VECTOR_CACHE_MB`, 512 Mo par défaut ; entrée invalidée si le fichier change) — la première
question d'un processus paie la lecture, les suivantes ne paient que le calcul. Un corpus au-delà du
budget est relu à chaque question. FTS5 répond en 16–23 ms sur le même corpus. Rapport M1-3.

```ts
const { table, dims } = db.prepare('SELECT "table", dims FROM vectors WHERE model = ?').get(model);
const q = new Int8Array(dims); quantize(queryVector, q, 0);                       // normalisé × 127
for (const { chunk_id, vec } of db.prepare(`SELECT chunk_id, vec FROM "${table}"`).iterate()) {
  const v = new Int8Array(vec.buffer, vec.byteOffset, dims);
  let dot = 0; for (let i = 0; i < dims; i++) dot += v[i] * q[i];
  heap.push(chunk_id, dot / (127 * 127));                                          // cosinus
}
```

**Hybride.** Les deux listes (FTS5, cosinus) se fusionnent par RRF comme aujourd'hui (`fuse.ts`) :
`score = Σ 1 / (60 + rang)`, puis diversification (au plus trois passages par article). Rien de
nouveau ; seul le contenant change.

## Une question sans Arche

Un utilisateur qui n'a que le shell `sqlite3` de sa distribution (compilé avec FTS5 partout :
Debian, Fedora, Alpine, macOS, Windows), et un corpus sur une clé USB :

```bash
sqlite3 -readonly -box pdf-ou-il-ny-a-pas-de-docteur.arche.sqlite "
SELECT p.title, p.heading, snippet(chunks_fts, 0, '>', '<', '…', 20) AS reponse
FROM chunks_fts JOIN passages p ON p.chunk_id = chunks_fts.rowid
WHERE chunks_fts MATCH 'rehydratation' ORDER BY bm25(chunks_fts) LIMIT 3;"
```

```
┌────────────────────────────┬───────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│           title            │    heading    │                                                            reponse                                                            │
├────────────────────────────┼───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Diarrhée et déshydratation │ Réhydratation │ …Préparez une solution de >réhydratation< orale : un litre d'eau bouillie et refroidie, huit cuillères à café rases de sucre… │
└────────────────────────────┴───────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Pas de modèle, pas de réseau, pas d'Arche : la réponse, sa source et l'endroit exact. C'est le test
de durabilité du format — `tests/sqlite-format.test.ts` exécute cette requête sur le corpus
fixture (via `node:sqlite`, et par le shell `sqlite3` quand il est installé) ; l'extrait ci-dessus
est celui que la fixture rend.

## Transport et publication

- **Fichier publié** : `<resource_id>.arche.sqlite.zst` (`zstd -19 -T0`), et son sha256 dans le
  bloc `index` du catalogue avec `format: arche-sqlite-1`, `bytes` (compressé) et
  `bytes_unpacked` (M1-10). Trois hébergeurs (Internet Archive, torrent + webseed, IPFS — M2-5) ;
  la licence du fichier est celle de `meta.license_spdx`, jamais celle d'Arche.
- **Avant publication** : `PRAGMA journal_mode = DELETE` (pas de `-wal`/`-shm` à côté),
  `page_size = 4096`, `INSERT INTO chunks_fts(chunks_fts) VALUES ('optimize')`, `VACUUM`,
  `PRAGMA integrity_check` = `ok`.
- **À l'installation** : décompressé dans `<bibliothèque>/index/<resource_id>.arche.sqlite`, ouvert
  en lecture seule par `arche mcp`/`serve`. Une clé USB en lecture seule fonctionne.
- **Vecteurs à part** : une table de vecteurs peut être publiée comme fichier compagnon
  `<resource_id>.vectors.<modèle>.arche.sqlite.zst` — même `meta` (`resource_id`, `source_sha256`,
  `format_version`), le registre `vectors` à une ligne, la table. `arche index fetch` l'`ATTACH`e et
  la copie dans le corpus (`INSERT INTO main."vectors_x" SELECT * FROM v."vectors_x"`). C'est ce qui
  permet de publier un nouveau modèle pour cent corpus sans retransférer un octet de texte.
- **Documents de l'utilisateur** (`arche index add`) : un fichier par source ajoutée, même format,
  `resource_id` = le nom donné ; pas de `.zst`, jamais publié.
- **Tailles, à mesurer par `arche index estimate` (M1-2)** : texte ≈ 1 × le texte extrait, FTS5
  ≈ 0,5–0,7 ×, int8 = `dims` octets par chunk. Wikipédia FR (4,5 M de chunks) : ≈ 5 Go de texte,
  ≈ 3 Go de FTS5, 4,6 Go de vecteurs à 1 024 dims — d'où M1-9 (256 dims : 1,2 Go) et le fichier
  compagnon. Compressé : le texte et le FTS5 ≈ 4–6 ×, les vecteurs ≈ 1 ×.

## Écriture (ce que M1-2 respecte — `src/core/rag/build.ts`)

Transactions par lot d'articles (50 par défaut), **un article et ses chunks dans la même
transaction** ; `PRAGMA synchronous = OFF` et `journal_mode = TRUNCATE` pendant la construction —
et non `MEMORY` comme d'abord écrit ici : avec un journal en mémoire, un processus tué au milieu
d'une transaction (SIGTERM, runner CI qui expire) corrompt le fichier, alors qu'un journal remis à
l'OS survit à tout sauf à une coupure de courant. Dans ce dernier cas, le fichier est jetable : une
base illisible ou d'un autre corpus est supprimée et reconstruite. La reprise après coupure lit ce
qui est commis : les articles déjà présents (`articles.path`) sont sautés à la ré-extraction,
l'embedding repart de `max(chunk_id)` de la table de vecteurs (`count(*)` la vérifie) — le point de
contrôle, c'est la base elle-même, rien à côté du fichier. À la fin : `optimize` de FTS5,
`journal_mode = DELETE`, `VACUUM`, `integrity_check`, puis `meta.built_at`, écrit en dernier : une
base sans `built_at` est incomplète et `arche index build` la reprend ; une base finie est
reconstruite de zéro. `arche index estimate` prédit la taille sans embarquer : les articles sont
découpés et insérés (texte + FTS5) dans une base en mémoire dont on lit `page_count` — exact
jusqu'à 2 000 articles, extrapolé au-delà — et les vecteurs se comptent (`dims` + 12 octets par
chunk) ; mesuré à ±5 % sur les fixtures, le critère est ±30 %.

## Rejeté

- **Garder `.arche-idx` et ajouter le texte à côté** : deux fichiers, un parseur maison, et toujours
  un modèle par fichier. Non.
- **Une extension vectorielle (`sqlite-vec`, `sqlite-vss`)** : un binaire natif par plateforme,
  donc un téléchargement de plus et une chaîne de compilation à maintenir dix ans. Le balayage
  exhaustif sur des vecteurs petits, corpus par corpus, après routage (M1-8), suffit à l'échelle
  visée ; et le format n'interdit pas d'en construire un index `vec0` localement plus tard : les
  blobs sont déjà au format attendu.
- **Parquet / Arrow / Lance** : lisibles seulement avec une bibliothèque ; aucune n'est dans une
  distribution Linux de base.
- **Une seule base pour tous les corpus** : l'audit (décision 6) veut des RAG, pas un RAG ; un
  corpus mis à jour ne republie que lui.
- **Vecteurs en `float32`** : quatre fois la taille des int8 pour une perte non mesurable avec un
  vecteur normalisé ; `f16` est le compromis si un modèle y perd (mesuré par eval).
- **`meta` en colonnes** : chaque nouvelle métadonnée aurait changé le schéma ; le clé/valeur est
  lu par tout le monde et ne migre jamais.
- **`trigram` comme tokenizer** : tolère les fautes et ignore la langue, mais triple l'index et
  rend `snippet()` moins lisible. À reconsidérer si eval montre que Porter + unicode61 perd en
  français.

## Conséquences

- M1-2 écrit la base (`build.ts` → `openCorpus` + `INSERT`), M1-3 la lit (`retrieve.ts` : FTS5 +
  cosinus, un canal `sqlite` par corpus, `read_article` et `arche://article/…` depuis
  `articles`/`chunks`), M1-4 ajoute des vecteurs sans republier, M1-9 les rétrécit, M1-10 publie
  et installe le `.zst` ; `shard.ts`, `bm25.ts`, `index/text/` et `assertFusable` ont été supprimés
  (M1-2 puis M1-3, `src/` en baisse à chaque fois). `src/core/rag/sqlite.ts` porte le schéma, son
  ouverture et l'encodage int8 (`quantize`) ; un test vérifie que l'ADR et le code disent la même
  chose et que chaque requête de cette page s'exécute.
- La question est convertie en expression FTS5 sûre (`ftsQuery`) : chaque mot entre guillemets,
  reliés par `OR` — la ponctuation et les opérateurs tapés par l'utilisateur ne sont jamais
  interprétés, BM25 fait le tri. Les canaux rapportés par `search` sont `xapian` et `sqlite`
  (`ok` · `off` · `error`), et `detail` nomme ce qui manque : un corpus sans la table du modèle
  demandé répond en FTS5 seul, Ollama absent aussi. Seul `int8` est lu ; `f16` reste réservé.
- ADR 0007 : le point 3 (« l'index ne stocke pas le texte ») est inversé ; le point 5 (« un index
  est lié à son modèle ; changer de modèle = republier ») est inversé ; le point 8 (BM25 maison)
  est remplacé par FTS5. Le reste tient.
- Le bloc `index` du schéma du catalogue gagne `format`, `dims`, `vector_type`, `mirrors[]` (M1-10).
- `node:sqlite` affiche un `ExperimentalWarning` sur Node 22 (stable en Node 24) ; la CLI le
  filtre (un écouteur `warning` posé dans `cli.ts` avant la première ouverture, M1-2 — un
  `#!/usr/bin/env node` ne peut pas porter `--no-warnings`). L'API utilisée
  (`DatabaseSync`, `prepare`, `exec`) est la même dans les deux.
- Le format est versionné par `user_version` ; une version 2 sera lisible par un lecteur 1 tant
  qu'elle n'ajoute que des tables et des clés `meta` — c'est la règle : **on ajoute, on ne renomme
  pas**.

---

**Status**: accepted. **Decision**: one SQLite file per corpus (`<resource_id>.arche.sqlite`) holding
chunk text, locators, articles, an FTS5 index (`porter unicode61 remove_diacritics 2`), key/value
metadata with the corpus' *inherited* license, and zero or more per-model vector tables
(`vectors_<model>`, L2-normalised int8 or f16 blobs, listed in a `vectors` registry) that can be added
or shipped separately without republishing the text. Readable with plain `sqlite3`; transported as
`.arche.sqlite.zst`. Replaces `.arche-idx`, `index/text/` and the hand-written BM25; supersedes
ADR 0007 points 3, 5 and 8. Every query in this page is executed by `tests/sqlite-format.test.ts`.
