# Le terrain et le calcul : gérer ce que l'exploitation produit, sur la machine qu'on a

> Deux exigences, une page. Vos cartes drone, votre LiDAR, vos caméras, vos capteurs entrent dans
> Arche ; et la machine qui les traite n'est jamais « trop petite » — seulement plus lente, et on
> vous dit combien. ADR 0012. English: [FIELD-AND-COMPUTE.md](../en/FIELD-AND-COMPUTE.md)

## Ce que vous avez déjà : les données de terrain

Une exploitation automatisée produit plus de données utiles que n'importe quelle encyclopédie : une
orthophoto de drone à 3 cm/pixel, un relevé LiDAR du terrain, les tuiles satellite téléchargées
l'hiver dernier, le flux de la caméra de la serre, le journal MQTT des sondes d'humidité. Arche ne
les crée pas ; il les **déclare** dans l'inventaire (ADR 0010), pour que les outils et votre client
IA sachent qu'elles existent :

```yaml
datasets:
  - { id: ortho-2026-06, kind: orthomosaic, path: /data/parcelles/ortho.tif, crs: EPSG:2154, resolution: 3, date: 2026-06-12, source: "drone + ODM" }
  - { id: lidar-2025, kind: pointcloud, path: /data/parcelles/terrain.laz, crs: EPSG:2154, source: "LiDAR drone" }
  - { id: sentinel-2025, kind: satellite, path: /data/sat/s2-2025.mbtiles, crs: EPSG:3857, note: "téléchargé avant la coupure" }
  - { id: cam-serre, kind: camera, path: rtsp://192.168.1.20/stream }
  - { id: sondes, kind: sensor_log, path: /data/mqtt/2026.csv, source: "ESP32 + Mosquitto" }
```

Les genres : `orthomosaic`, `dsm`, `dtm`, `pointcloud`, `satellite`, `photos`, `video`, `camera`,
`sensor_log`, `gnss_track`, `field_map`, `other`. Le système de coordonnées est obligatoire dès
qu'il y en a un (`EPSG:2154` pour la France métropolitaine) : un chiffre géographique sans son
système ne vaut rien, et l'assistant n'a pas le droit d'en inventer un.

## La chaîne qui les traite — libre, native, hors ligne

| Vous avez | L'outil | Ce qu'il sort |
|---|---|---|
| des photos de drone (ou de ballon, de perche) | **OpenDroneMap** (AGPL, installation native) | orthophoto GeoTIFF, MNS/MNT, nuage LAZ, maillage 3D |
| un nuage LiDAR (drone, téléphone) | **PDAL** (BSD) | sol/végétation classés, MNT, volumes (tas, réserve, terrassement), découpe par parcelle |
| un nuage ou un maillage à regarder | **CloudCompare** (GPL) | mesures, différences avant/après, segmentation |
| tout ce qui précède, plus les tuiles satellite et les traces de tracteur | **QGIS** (GPL) | le parcellaire, les surfaces, le plan d'assolement, la vue 3D du terrain, la carte imprimée |
| des photos d'un objet ou d'un bâtiment | **Meshroom** (MPL, GPU) | un maillage 3D à mesurer ou à réimprimer |
| des capteurs, des relais | **Mosquitto** + **ESPHome** + **Node-RED** | le bus MQTT, les règles, les alertes |
| des caméras | **motion** (sans Docker) ou **Frigate** (détection d'objets, Docker → `optional`) | enregistrement, événements sur MQTT |

Tout est au catalogue (`field-data.yaml`, paquet `automation`), et le type de projet
`exploitation-automatisee` les relie : ce que l'inventaire doit contenir, ce qui manque, les
livrables (parcellaire, relevé, volumes, surveillance, note de décision) et les portes humaines —
un drone ne vole jamais sur ordre d'un modèle, une caméra alerte et n'actionne rien, toute mesure
coûteuse est relue sur la carte avant d'être suivie.

Le rôle de l'IA là-dedans est précis et petit : elle lit ce que QGIS, PDAL et ODM ont produit, le
croise avec la bibliothèque, et explique. Elle ne calcule ni une surface ni un volume ni une
coordonnée. Le physique est piloté par les outils faits pour ça.

## La machine qu'on a : le temps s'adapte, pas les capacités

Un utilisateur avec 2 To de données et 8 Go de RAM n'est pas un utilisateur « limité » ; c'est un
utilisateur qui attend plus longtemps. Arche ne lui cache donc plus rien : le planificateur ne
filtre plus un modèle sur la RAM (demandé, il est marqué *lent*, pas refusé), et un estimateur dit
combien de temps ça prendra **avant** de lancer :

```bash
arche compute estimate --model qwen3.6:27b --ram 8 --disk nvme
# ≈ 1 h 27 sur cette machine — lu depuis le disque à 0,1 tok/s ; un MoE irait 30× plus vite

arche compute estimate --model qwen3.5:35b-a3b --ram 32
# ≈ 2 min — 35 Go de poids, 3 Go relus par token : c'est ça, un MoE sur CPU

arche compute estimate --steps workflow.yaml     # quatre modèles en série : durée, rechargements, ordre
```

L'estimateur lit `knowledge/compute.yaml` — bandes passantes RAM/VRAM/disque, vitesse de lecture
du prompt, octets par paramètre, réserve système — et se calibre sur des points de référence
publics, à **×3 près** : ce sont des ordres de grandeur, pas des promesses. Il place les poids
actifs là où ils tiennent (VRAM, RAM, disque), compte les rechargements d'un workflow à plusieurs
modèles et propose l'ordre qui les groupe. Le même outil existe pour votre client IA
(`estimate_pipeline` par MCP) : « ce travail prendra une heure, on y va ? » est une question que
l'assistant peut poser.

## Et si ça prend une heure : la file qui survit

Une heure de calcul sur une petite machine ne doit pas se perdre à cause d'une coupure de courant.
`arche jobs` est une file de tâches sans démon : un fichier JSON par tâche dans `.arche/jobs/`,
écrit avant et après chaque étape, un curseur de reprise, des tentatives avec attente croissante, un
verrou qui périme quand l'exécuteur meurt. Au redémarrage, on reprend à l'étape où on en était —
jamais du début. Une parcelle de 500 photos dans ODM, un workflow à quatre modèles, une
réindexation : ce sont des tâches de file, pas des conversations ; le client IA les consulte
(`jobs_list`) et lit le résultat quand il est là.

```
arche jobs list
k2x1-7f3a  running   2/5  relevé drone parcelle nord (~90 min)
```

## Ce qui n'est pas encore là

`arche compute bench` pour mesurer votre machine et corriger `compute.yaml` par vos chiffres ; les
gestionnaires d'étapes de la file pour Ollama et ODM (la mécanique est là, les branchements
suivent) ; et l'interface qui montre la file et l'estimation avant de lancer. Les règles, elles,
sont écrites et testées : un crash simulé au milieu d'une tâche reprend à l'étape suivante, et
un 27B sur 8 Go rend un temps, pas une erreur.
