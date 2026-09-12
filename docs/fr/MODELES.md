# Modèles : par capacité, pas par nationalité

> « Il y a des nouveaux modèles chinois open source qui sont très malins. » Oui — et le catalogue le
> montrait déjà : sept LLM sur quatorze sont des Qwen, et bge-m3 vient de BAAI. Mais « malin » n'est
> pas le critère. Ce document dit lequel l'est, ce qui a été ajouté le 11 septembre 2026 après
> vérification sur les sources officielles, et ce qui change dans la chaîne.
> English: [MODELS.md](../en/MODELS.md)

## Le critère

Un modèle entre au catalogue s'il comble une **capacité qui manque** à la bibliothèque, s'il tourne
**sur la machine cible** (un CPU avec 16 ou 32 Go de RAM, sans carte graphique, souvent un
Raspberry Pi), s'il parle **français** au niveau requis, et si sa **licence** permet de le copier de
main en main. La nationalité du laboratoire n'entre pas dans l'équation — sauf pour une chose : les
laboratoires chinois publient aujourd'hui les meilleurs poids ouverts dans plusieurs de ces
capacités, et ne pas le dire serait malhonnête.

Ce qui a été vérifié aujourd'hui, directement sur `ollama.com` : **Qwen3.5** (février–mars 2026,
nativement multimodal à toutes les tailles, 201 langues, Apache-2.0), **Qwen3.6** (avril 2026, code
agentique et préservation du raisonnement), **Qwen3-Embedding** (0,6B/4B/8B, dimensions ajustables),
**DeepSeek-OCR** (3B, un scan devient du Markdown). Les grands modèles du moment — DeepSeek V4,
GLM-5.2, Kimi K3 — ont des centaines de milliards de paramètres et **ne tournent pas** sur nos
machines ; ils n'entrent pas, et ce n'est pas une opinion sur leur qualité.

## Ce que ça change, capacité par capacité

**Chat et raisonnement.** Qwen3.5 remplace Qwen3 aux paliers 8 et 16 Go : même empreinte, mais il
*voit* — une photo de panne, un schéma existant, une étiquette. Le défaut d'Arche devient
`qwen3.5:9b`. Règle inchangée et rappelée dans la fiche : il lit une image, il ne valide **jamais**
qu'une espèce est comestible.

**Le point d'équilibre pour une machine sans GPU : le MoE.** `qwen3.5:35b-a3b` a 35 milliards de
paramètres sur le disque et **3 milliards actifs** par mot. Sur un CPU avec 32 Go de RAM, il répond à
la vitesse d'un petit modèle avec la qualité d'un gros. C'est la découverte architecturale de 2026
pour l'usage hors ligne, et c'est désormais le premier choix du palier 32 Go. `qwen3.6:27b`, dense,
reste préférable avec un GPU et pour écrire les sources de schémas (ADR 0009).

**Reclassement — le levier de qualité le moins cher du RAG.** La recherche hybride (BM25 + dense)
rapproche ; elle ne *lit* pas. Un reclasseur prend le couple (question, extrait) et rend une
pertinence — il lit vraiment. **Qwen3-Reranker 0.6B** fait ça sur CPU en quelques centaines de
millisecondes pour trente extraits. Il est servi par `llama-server --reranking` (point `/v1/rerank`)
parce qu'Ollama n'a pas d'API de reclassement ; `src/core/rag/rerank.ts` l'appelle, se rabat sur un
oui/non via Ollama si llama-server est absent, et garde l'ordre de la fusion si rien ne répond. Le
reclasseur est un bonus ; son absence n'est jamais une panne. Testé contre un faux serveur.

**Embeddings — candidat, pas remplaçant.** Qwen3-Embedding 0.6B est plus petit que bge-m3 et couvre
plus de langues. Mais l'ADR 0007 tient : *un index est lié à son modèle*. On ne change de référence
qu'après l'avoir **mesuré** sur `knowledge/eval.yaml`, et en republiant tous les shards. Les deux
tailles sont enregistrées dans `embed.ts` avec leurs dimensions ; bge-m3 reste la référence tant que
la mesure n'a pas parlé.

**OCR — l'organe manquant de l'ingestion.** Une part énorme du corpus utile est *scannée* : la
Survivor Library (manuels du XIXe), les planches de la BHL, les PDF Hesperian, un carnet de semences
manuscrit. Sans OCR, rien de tout ça n'entre dans l'index. **DeepSeek-OCR** (Ollama, MIT) sort une
page en Markdown avec ses tableaux ; **PaddleOCR-VL** (0,9B, Apache-2.0, pip) tient les scans de
travers et les pages gondolées — exactement l'état des vieux manuels. Les deux se complètent.

**Voix — et le critère qui tranche.** Quelqu'un qui lit mal, qui a les mains prises ou qui voit
peu doit pouvoir *poser* sa question et *entendre* la réponse. Les modèles vocaux chinois
(SenseVoice, CosyVoice) sont excellents — et **ne couvrent pas le français**. Donc **whisper.cpp**
(99 langues, très bon français, binaire natif, tourne sur un Pi 5) et **Piper** (voix françaises
libres, rapide sur un Pi). C'est le cas d'école du critère : ce n'est pas le plus malin qui entre,
c'est celui qui parle la langue de l'utilisateur.

**Ce qui n'entre pas, et pourquoi.** Les distillations DeepSeek-R1 (mai 2025) : dépassées par
Qwen3.5/3.6 en mode réflexion, sans rien apporter de plus. Qwen3.8 27B : annoncé pour août 2026 par
une seule source, pas encore vérifié sur Ollama — à réévaluer au prochain passage du tracker.
GLM-4.x et Kimi en petites tailles : rien de vérifié qui batte Qwen3.5 à taille égale au moment où
j'écris.

## Les paliers, revus

| RAM | Ce qui est proposé |
|---|---|
| 4 Go | Qwen3 1.7B, nomic-embed |
| 8 Go | **Qwen3.5 4B** (multimodal), Gemma 3 4B, nomic-embed |
| 16 Go | **Qwen3.5 9B** (défaut), Qwen2.5-Coder 7B, bge-m3, **Qwen3-Reranker**, **DeepSeek-OCR** |
| 32 Go | **Qwen3.5 35B-A3B** (MoE, CPU), **Qwen3.6 27B**, Qwen3 14B, bge-m3, reclasseur, OCR |
| 64 Go | Qwen3.6 27B, Qwen3.5 35B-A3B, Qwen3 32B, Gemma 3 27B, Qwen2.5-Coder 32B, bge-m3, reclasseur, OCR |

Depuis l'ADR 0012, un palier est *ce qui tourne confortablement*, pas une limite : un modèle
au-dessus reste installable et tourne depuis le disque, lentement — `arche compute estimate` dit
combien avant de lancer.

Le paquet `ai` devient : Ollama, llama.cpp (pour le reclassement), whisper.cpp, Piper, embeddings —
et l'interface d'Arche. Open WebUI n'y est plus, conformément à l'ADR 0008.

## Ce que ça ne règle pas

Un modèle de 9 milliards de paramètres se trompera sur des valeurs de composants, des posologies et
des dimensions — c'est pour ça que les chiffres passent par les calculateurs, les schémas par les
générateurs, et les trois sujets sensibles par un humain (ADR 0007, 0009). Un modèle plus malin
réduit la fréquence des erreurs ; il ne change pas l'architecture qui les rend inoffensives. Et
« vérifié aujourd'hui » vaut aujourd'hui : c'est le tracker `ollama` qui, deux fois par semaine,
dira si ces tags existent encore et ce qu'ils pèsent.

**Sources consultées** — [ollama.com/library/qwen3.5](https://ollama.com/library/qwen3.5) ·
[ollama.com/library/qwen3.6](https://ollama.com/library/qwen3.6) ·
[ollama.com/library/qwen3-embedding](https://ollama.com/library/qwen3-embedding) ·
[ollama.com/library/deepseek-ocr](https://ollama.com/library/deepseek-ocr) ·
[ollama.com/library/deepseek-r1](https://ollama.com/library/deepseek-r1) ·
[Qwen models guide (InsiderLLM)](https://insiderllm.com/guides/qwen-models-guide/) ·
[Best open-source LLMs, Sept. 2026 (Thunder Compute)](https://www.thundercompute.com/blog/best-open-source-llms) ·
[OCR benchmark 2026 (Regolo)](https://regolo.ai/deepseek-ocr-vs-glm-ocr-vs-paddleocr-benchmark-2026/) ·
[Qwen3 reranker via Ollama (Apidog)](https://apidog.com/blog/qwen-3-embedding-reranker-ollama/).
