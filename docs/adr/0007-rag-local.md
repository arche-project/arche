# ADR 0007 — La base de connaissance interrogeable est le produit ; l'index est distribué par shards

**Statut** : accepté (décision de Florian, 2026-09-11). Complète l'ADR 0003 et l'ADR 0005.
**Amendé par l'[ADR 0014](0014-format-sqlite.md)** (2026-09-12) : les points 3 (pas de texte dans
l'index), 5 (index lié à son modèle) et 8 (BM25 maison) sont remplacés — une base SQLite par corpus,
texte compris, FTS5, vecteurs par modèle ajoutables.

**Contexte.** Arche livre aujourd'hui ~1 250 Go de documentation à quelqu'un qui ne sait pas par où
commencer : 248 ressources, 34 marquées `essential`, aucune réponse à une question posée en français.
La bibliothèque est un entrepôt, pas un conseiller. Or l'utilisateur visé — quelqu'un d'isolé qui monte
son projet d'autonomie sans dépendre de personne — n'a pas besoin de parcourir une encyclopédie : il a
besoin de demander *« j'ai un toit de 90 m², il tombe 700 mm par an, quelle citerne ? »* et d'obtenir
une réponse **sourcée dans les documents qu'il possède déjà**. Le catalogue n'est donc pas le produit ;
c'est le corpus. Le produit est la **base de connaissance interrogeable par un LLM local**.

**Décision.**

1. **Arche produit un index de récupération, pas seulement des ZIM.** Chaque ressource indexable porte
   un bloc `index` dans le catalogue (URL du shard, sha256, taille, modèle d'embedding, dimensions,
   nombre de chunks). Un shard est **indépendant et téléchargeable seul** : on récupère l'index d'une
   ressource si et seulement si on a la ressource.

2. **Un shard par ressource, jamais un index monolithique.** La même chaîne qui construit les ZIM
   (`zim-build.yml`) construit l'index et le publie à côté sur Internet Archive. Conséquences :
   l'indexation tient dans les limites de GitHub Actions (une ressource à la fois), une ressource
   mise à jour ne réindexe qu'elle-même, et l'utilisateur ne télécharge que ce qui correspond à sa
   sélection. La fusion des shards est faite côté client à la lecture.

3. **L'index ne stocke pas le texte.** Un chunk est un *locator* : `(resource_id, chemin d'article,
   offset, longueur)` plus son vecteur. Le texte reste dans le ZIM, qui est déjà là et déjà compressé.
   C'est ce qui rend l'index dix fois plus petit que le corpus au lieu de le doubler.

4. **Recherche hybride, pas dense seule.** BM25 (lexical, sans modèle, robuste sur les noms propres,
   les références et les unités) + recherche dense (sémantique) fusionnés par **RRF** (Reciprocal Rank
   Fusion, sans paramètre à régler). Un petit modèle d'embedding tournant sur CPU est médiocre seul ;
   il est bon en fusion. Les ZIM Kiwix embarquent déjà un index plein texte Xapian : on l'utilise
   quand il est présent plutôt que de le reconstruire.

5. **Modèle d'embedding de référence : `bge-m3`** (1024 dimensions, multilingue, très bon en
   français, servi par Ollama que nous installons déjà). Repli basse mémoire :
   `multilingual-e5-small` (384 dimensions). Les vecteurs sont quantifiés en **int8** à l'écriture.
   Un index est **lié à son modèle** : le shard déclare `model` et `dims`, et le lecteur refuse de
   fusionner deux shards de modèles différents. Changer de modèle = republier les shards.

6. **Les chiffres ne passent pas par le modèle.** Le dimensionnement (citerne, solaire, bois, surface
   nourricière, calories, semences, aliment des animaux) est calculé par des **fonctions
   déterministes** alimentées par `knowledge/figures.yaml`, et le LLM ne fait que les appeler et
   expliquer le résultat. Un modèle local qui paraphrase des ordres de grandeur se trompe ; une
   fonction non.

7. **Aucune réponse sans source, et trois sujets ne sont jamais tranchés par la machine.**
   Toute réponse cite la ressource et l'article d'où elle vient. L'assistant refuse de répondre
   au-delà du contexte récupéré, et redirige systématiquement vers vérification humaine pour
   **l'identification d'espèces destinées à être consommées**, **la posologie** et **le diagnostic**.
   Ce n'est pas de la prudence de façade : dans ce domaine une hallucination tue, et la fiche 07 dit
   déjà pourquoi.

8. **Zéro nouvelle dépendance runtime** (ADR 0002 tient). Le chunker, le format de shard, BM25 et la
   fusion sont écrits à la main ; les embeddings et la génération passent par l'API HTTP d'Ollama.

9. **Les fichiers non textuels font partie de l'index, par leur voisinage et par ce qu'on peut
    lire dedans.** Le corpus n'est pas que du texte : il y a des STL, des SVG, des DXF, du G-code,
    des images, des PDF — et pour un projet d'autonomie ce sont souvent eux la réponse (« voici la
    pièce », pas seulement « voici la page »). Un STL n'ayant rien à embarquer, on indexe (a) le
    passage qui le cite, auquel le fichier est accroché par sa position dans l'article, et (b) une
    description générée sans aucune dépendance à partir du fichier lui-même : dimensions, nombre de
    triangles et volume pour un STL (84 octets d'en-tête + 50 par triangle), titre, description,
    textes visibles et format pour un SVG. Cette description est indexée comme un passage ordinaire,
    en français et en anglais dans la même chaîne, pour que « est-ce que ça rentre sur mon plateau ? »
    trouve une réponse. Les images sont retrouvées par leur légende, leur `alt` et leur contexte —
    pas par leur contenu : un modèle de vision serait une couche optionnelle et un shard séparé,
    jamais une dépendance du noyau.

10. **L'interface graphique a pour but de devenir inutile.** Chaque réponse montre les sources à côté
   du texte et propose de les ouvrir dans Kiwix. L'objectif explicite est que l'utilisateur apprenne
   où vit la connaissance et finisse par aller la chercher directement. On mesure le succès à la
   part d'utilisateurs qui cliquent sur la source.

**Alternatives écartées.** Un index monolithique publié en un bloc (impossible à construire dans les
limites de CI, réindexation totale à chaque mise à jour, télécharge de l'inutile). Indexer entièrement
chez l'utilisateur (des heures d'embedding sur CPU avant la première réponse — on garde ce mode en
**repli** pour les ressources sans shard, pas en défaut). Une base vectorielle tierce (dépendance
lourde, contraire à l'ADR 0002, et sur-dimensionnée pour quelques millions de vecteurs lus en mémoire
mappée). Le dense seul (mauvais sur les références chiffrées et les noms latins, précisément ce que ce
corpus contient).

**Conséquences.** Arche devient responsable de la **qualité de récupération**, qui doit être mesurée :
`knowledge/eval.yaml` fixe un jeu de questions réelles avec leurs sources attendues, et la CI mesure
le rappel. Une réponse mal sourcée est un bug au même titre qu'un lien mort. Le corpus prioritaire
n'est plus « le plus gros » mais « le plus interrogeable » : Wikipédia garde son propre moteur, l'index
Arche couvre le corpus pratique. Enfin, l'assistant hérite du cadre éditorial existant — il ne peut
pas produire ce que le catalogue refuse d'héberger (`docs/fr/ZONES-GRISES.md`).

---

**Status**: accepted. **Decision**: the queryable knowledge base is the product. Per-resource index
shards (locators + int8 vectors, no duplicated text) built by the same CI that builds the ZIMs and
published alongside them; hybrid BM25 + dense retrieval fused with RRF; `bge-m3` (1024d) as the
reference embedding model with `multilingual-e5-small` (384d) as the low-memory fallback; sizing
figures computed by deterministic functions rather than generated; every answer cites its source and
species identification, dosage and diagnosis are always routed to human verification; no new runtime
dependency; non-text files (STL, SVG, DXF, G-code, images, PDF) are indexed through the passage that
cites them plus a dependency-free description read from the file itself (STL dimensions, triangles,
volume; SVG title, description, visible text), images through captions and context only; the GUI's
purpose is to make itself unnecessary. Retrieval quality is measured in CI against `knowledge/eval.yaml`.
