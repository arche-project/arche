# L'IA locale comme interface d'accessibilité

> English: [ai-assistant.md](../en/ai-assistant.md)
>
> **Mise à jour (ADR 0011)** : Arche n'écrit pas ce client. Il sert sa bibliothèque et ses outils par
> MCP au client IA que vous avez déjà — voir [CLIENTS-IA.md](CLIENTS-IA.md). Le rôle décrit ici
> reste le bon ; c'est le prompt `arche_rules` qui le porte.

## Le rôle qu'on lui donne

Pour un non-maker, la bibliothèque est intimidante : 40 ZIM, des centaines de milliers d'articles,
un vocabulaire technique. L'IA locale n'est pas là pour *remplacer* la bibliothèque mais pour
**servir de bibliothécaire** : comprendre une question posée avec des mots de tous les jours, dire
*où* chercher, résumer, traduire, reformuler pour un enfant, et — surtout — **citer la page** pour
que l'utilisateur vérifie.

Trois usages, du plus sûr au plus risqué :

1. **Orienter** : « j'ai une question sur les conserves » → « ouvre *Préparation et conservation des
   aliments*, section stérilisation ; ou Wikilivres › Conserves ». Aucune hallucination possible :
   l'IA renvoie vers des documents qui existent.
2. **Expliquer** un article trouvé : vulgariser, traduire l'anglais, convertir des unités, adapter
   à un contexte (« j'ai pas de bocaux, seulement des bouteilles »).
3. **Répondre directement** — utile pour le bricolage, dangereux pour la santé. On l'encadre.

## Architecture retenue : RAG sur les ZIM via kiwix-serve

Pas besoin d'extraire ou de convertir les ZIM. `kiwix-serve` expose déjà une **API de recherche
plein texte** (`/search?content=<zim>&pattern=<mots>`) et le contenu HTML de chaque article. Le
pipeline :

```
question → (1) reformulation en mots-clés par le LLM
         → (2) kiwix-serve /search sur les ZIM pertinents (choisis par catégorie)
         → (3) top-k articles, texte extrait (HTML → texte, 2–3 000 caractères chacun)
         → (4) prompt : « réponds uniquement à partir des extraits, cite [source] » → LLM
         → réponse + liens cliquables vers les pages Kiwix
```

Ça tourne sur un Pi 5 avec un modèle 4B : la recherche est faite par Kiwix (Xapian, instantané),
le LLM ne fait que lire et rédiger. Les embeddings (`nomic-embed-text`, `bge-m3`) sont une
**amélioration optionnelle** : indexer les ZIM prioritaires (médecine, eau, alimentation) une fois,
pour une recherche sémantique (« mon enfant a la diarrhée depuis 3 jours » → réhydratation orale)
que la recherche par mots-clés rate.

Implémentation prévue : `arche assist` (commande) et un onglet dans l'UI web, en s'appuyant sur
Open WebUI quand il est installé (il sait faire du RAG sur documents et accepte des « outils ») ou
sur un petit serveur intégré sinon. **Non implémenté dans cette version** — voir DECISIONS.md.

## Ce qu'on met dans le prompt système

- Langue de l'utilisateur ; niveau « explique comme à quelqu'un qui n'a jamais fait ça ».
- « Tu n'as pas accès à internet. Tes sources sont les documents fournis. Si la réponse n'y est pas,
  dis-le et propose où chercher dans la bibliothèque. »
- « Pour tout ce qui touche à la santé, aux médicaments, aux doses, à l'électricité domestique, aux
  armes, aux produits chimiques : cite la source exacte et rappelle de vérifier dans le document. »
- La liste des ZIM installés avec une phrase chacun (générée depuis `state.json` + catalogue).

## Garde-fous

- **Citation obligatoire** : une réponse sans source est affichée avec un bandeau « non vérifié ».
- **Domaines sensibles** (santé, sécurité) : le prompt exige la citation *et* l'UI affiche l'extrait
  source à côté de la réponse, pas seulement un lien.
- **Modèle adapté à la machine** : un 1.7B hallucine beaucoup ; en dessous du palier `small`, l'UI
  n'active que l'usage 1 (orienter).
- **Pas de mémoire longue** par défaut : chaque conversation part de zéro, pour éviter l'accumulation
  d'erreurs.

## Pour le profil néophyte, concrètement

Page d'accueil de l'UI Arche : un champ « Posez votre question » au-dessus de la liste des
bibliothèques. Trois exemples cliquables (« Comment rendre l'eau potable ? », « Une plaie qui
s'infecte, que faire ? », « Réparer un vélo qui déraille »). La réponse arrive avec 2–3 cartes
« Lire la page complète » qui ouvrent Kiwix. Aucun réglage de modèle, de température, de contexte.

## Pour le profil expert

Open WebUI complet, modèles interchangeables, RAG sur vos propres PDF, et Aider/OpenCode pour le
code. Les ZIM DevDocs et StackExchange peuvent être branchés comme « outil » de recherche pour
l'agent de code (recherche kiwix → extrait → contexte), ce qui donne un Claude Code-like avec la
documentation à jour du dernier téléchargement.
