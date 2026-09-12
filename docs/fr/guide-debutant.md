# Guide débutant — votre bibliothèque hors-ligne en une heure

> Vous n'avez jamais ouvert un terminal ? Ce guide est pour vous. Aucune commande à taper.
> English: [guide-beginner.md](../en/guide-beginner.md)

## Ce que vous allez obtenir

Un disque (interne ou externe) qui contient Wikipédia, un dictionnaire, des guides de santé, de
réparation, de jardinage, d'énergie, et une intelligence artificielle qui tourne **sur votre
ordinateur** et répond à vos questions **sans internet**. Une fois en place, tout marche même si le
réseau tombe pour des semaines.

## Ce qu'il vous faut

- Un ordinateur (Windows, Mac ou Linux) avec au moins **8 Go de mémoire**. Un vieux portable suffit.
- **De la place** : 150 Go pour l'essentiel, 500 Go pour être confortable, 1 To pour tout prendre.
  Un **SSD externe USB de 1 To** (≈ 60–90 €) est le meilleur choix : vous le branchez sur n'importe
  quelle machine, vous le prêtez, vous le rangez dans un tiroir.
- Une **connexion internet** pour la préparation (une nuit pour 500 Go avec une fibre ; plusieurs
  jours en ADSL — c'est normal, ça reprend tout seul si ça coupe).

## Étape 1 — Télécharger Arche

1. Allez sur la page des **releases** du projet.
2. Téléchargez le fichier qui correspond à votre ordinateur :
   `arche-windows-x64.zip`, `arche-macos-arm64.zip` ou `arche-linux-x64.zip`.
3. Décompressez-le **sur le disque où vous voulez la bibliothèque** (par exemple sur le SSD externe).

> Sur Mac, la première ouverture peut afficher « application non identifiée » : clic droit → Ouvrir.
> Sur Windows, SmartScreen peut demander « Exécuter quand même ». C'est parce que le projet ne paie
> pas de certificat de signature, pas parce qu'il est dangereux — le code est public.

## Étape 2 — Répondre à trois questions

Double-cliquez sur `arche` (ou `arche.exe`). Une fenêtre s'ouvre dans votre navigateur.

1. **« Qu'est-ce qui vous ressemble le plus ? »** → *Je débute*.
2. **« Où va vivre la bibliothèque ? »** → choisissez « Cet ordinateur » ou « portable + SSD USB ».
   Si vous préparez un disque pour un Raspberry Pi ou pour quelqu'un d'autre, choisissez le preset
   correspondant : Arche adaptera la taille et le modèle d'IA.
3. **« Dans quelles langues lisez-vous ? »** → cochez au moins Français. L'anglais ajoute beaucoup de
   contenu technique.
4. **« Quels sujets voulez-vous absolument ? »** → *Le socle* est déjà coché. Ajoutez *Santé*,
   *Autonomie*, *IA locale* si vous avez la place. Le reste est choisi pour vous.

Arche affiche alors **votre sélection** : chaque ligne dit *pourquoi* elle est cochée
(« indispensable », « recommandé, tient sur le disque »…). La barre du haut montre la place utilisée.
Vous pouvez décocher ce que vous ne voulez pas. Puis **Lancer les téléchargements**.

## Étape 3 — Attendre (et faire autre chose)

Les téléchargements se font dans l'ordre : d'abord les petits outils, ensuite les gros fichiers.
Au bout de quelques minutes vous avez déjà la médecine, l'eau, la réparation. Wikipédia complet
arrive en dernier.

Vous pouvez **fermer la fenêtre, éteindre l'ordinateur, débrancher le disque** : au prochain
lancement, Arche reprend exactement là où il s'est arrêté. Chaque fichier est vérifié à l'arrivée ;
un fichier abîmé est retéléchargé automatiquement.

## Étape 4 — Utiliser la bibliothèque

Lancez `arche` à nouveau. Le bouton **Ouvrir la bibliothèque** ouvre Kiwix dans votre navigateur :
une page d'accueil avec toutes vos encyclopédies et guides, avec une recherche. Marquez la page en
favori. Sur le réseau local (Wi-Fi de la maison), les autres appareils — téléphones compris — y ont
aussi accès à l'adresse indiquée.

Pour l'IA : ouvrez **Open WebUI** (adresse indiquée dans Arche). Posez vos questions en français :
« comment purifier de l'eau de rivière ? », « comment conserver des haricots sans frigo ? ». Elle
répond à partir de ce qu'elle sait et, si vous l'activez, à partir de la bibliothèque (voir
[assistant-ia.md](assistant-ia.md)). **Elle peut se tromper** : pour la santé, vérifiez toujours dans
WikiMed ou *Là où il n'y a pas de docteur*.

## Étape 5 — Ne pas attendre la coupure pour tester

Le week-end suivant, **coupez la box** et essayez d'utiliser la bibliothèque une heure. Cherchez
comment réparer quelque chose chez vous. Si ça marche coupé, ça marchera le jour où ça compte.

## Mettre à jour

Une fois par saison, avec internet : lancez `arche`, cliquez **Vérifier les mises à jour**. Seuls les
fichiers qui ont changé sont retéléchargés (Wikipédia est refait chaque mois ou deux).

## Si ça ne marche pas

- **« Pas assez de mémoire pour une IA locale »** : votre machine a moins de 4 Go. La bibliothèque
  fonctionne quand même, sans l'IA.
- **La barre de place est rouge** : décochez *Wikipédia EN* ou *Wikipédia FR complet* et gardez la
  version « sans images ».
- **Un téléchargement échoue toujours** : la source est peut-être indisponible ce jour-là ; le
  catalogue est vérifié chaque semaine. Réessayez, ou décochez cet élément.
- **Vous êtes déjà hors-ligne** : demandez à quelqu'un de préparer un disque avec Arche et de vous
  l'apporter (voir « Préparer un disque pour quelqu'un d'autre » dans le guide expert). Tout
  fonctionne sans réseau à partir de là.

## Ce qu'Arche ne fait pas

Il ne prévoit pas la météo, ne remplace pas un médecin, ne fabrique pas d'électricité. Il vous met à
portée de main ce que l'humanité sait faire — le reste dépend de vous. Lisez
[ANGLES-MORTS.md](ANGLES-MORTS.md) pour savoir ce qui manque.
