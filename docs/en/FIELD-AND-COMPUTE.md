# Field and compute: handling what the farm produces, on the machine you have

> Two requirements, one page. Your drone maps, LiDAR, cameras and sensors enter Arche; and the
> machine that processes them is never "too small" — only slower, and you are told how much.
> ADR 0012. Français : [TERRAIN-ET-CALCUL.md](../fr/TERRAIN-ET-CALCUL.md)

## What you already have: field data

An automated farm produces more useful data than any encyclopedia: a 3 cm/pixel drone orthophoto,
a LiDAR survey of the land, satellite tiles downloaded last winter, the greenhouse camera stream,
the MQTT log of the moisture probes. Arche does not create them; it **declares** them in the
inventory (ADR 0010), so the tools and your AI client know they exist:

```yaml
datasets:
  - { id: ortho-2026-06, kind: orthomosaic, path: /data/fields/ortho.tif, crs: EPSG:2154, resolution: 3, date: 2026-06-12, source: "drone + ODM" }
  - { id: lidar-2025, kind: pointcloud, path: /data/fields/terrain.laz, crs: EPSG:2154, source: "drone LiDAR" }
  - { id: sentinel-2025, kind: satellite, path: /data/sat/s2-2025.mbtiles, crs: EPSG:3857, note: "downloaded before the outage" }
  - { id: cam-greenhouse, kind: camera, path: rtsp://192.168.1.20/stream }
  - { id: probes, kind: sensor_log, path: /data/mqtt/2026.csv, source: "ESP32 + Mosquitto" }
```

Kinds: `orthomosaic`, `dsm`, `dtm`, `pointcloud`, `satellite`, `photos`, `video`, `camera`,
`sensor_log`, `gnss_track`, `field_map`, `other`. The coordinate system is mandatory as soon as
there is one (`EPSG:2154` for metropolitan France): a geographic figure without its system is
worthless, and the assistant is not allowed to invent one.

## The chain that processes them — free, native, offline

| You have | The tool | What it outputs |
|---|---|---|
| drone (or balloon, or pole) photos | **OpenDroneMap** (AGPL, native install) | GeoTIFF orthophoto, DSM/DTM, LAZ cloud, 3D mesh |
| a LiDAR cloud (drone, phone) | **PDAL** (BSD) | ground/vegetation classified, DTM, volumes (piles, reserves, earthworks), clip by field |
| a cloud or a mesh to look at | **CloudCompare** (GPL) | measurements, before/after differences, segmentation |
| all of the above, plus satellite tiles and tractor tracks | **QGIS** (GPL) | the field map, areas, rotation plan, 3D terrain view, printed map |
| photos of an object or a building | **Meshroom** (MPL, GPU) | a 3D mesh to measure or reprint |
| sensors, relays | **Mosquitto** + **ESPHome** + **Node-RED** | the MQTT bus, rules, alerts |
| cameras | **motion** (no Docker) or **Frigate** (object detection, Docker → `optional`) | recording, events on MQTT |

All in the catalogue (`field-data.yaml`, `automation` bundle), and the `exploitation-automatisee`
project type ties them together: what the inventory must contain, what is missing, the deliverables
(field map, survey, volumes, monitoring, decision note) and the human gates — a drone never flies
on a model's order, a camera alerts and actuates nothing, every costly measurement is checked on
the map before being acted on.

The AI's role in this is precise and small: it reads what QGIS, PDAL and ODM produced, crosses it
with the library, and explains. It computes neither an area, nor a volume, nor a coordinate. The
physical world is driven by the tools built for it.

## The machine you have: time adapts, not capability

A user with 2 TB of data and 8 GB of RAM is not a "limited" user; they are a user who waits longer.
So Arche hides nothing from them any more: the planner no longer filters a model on RAM (requested,
it is marked *slow*, not refused), and an estimator says how long it will take **before** launching:

```bash
arche compute estimate --model qwen3.6:27b --ram 8 --disk nvme
# ≈ 1 h 27 on this machine — read from disk at 0.1 tok/s; a MoE would be 30× faster

arche compute estimate --model qwen3.5:35b-a3b --ram 32
# ≈ 2 min — 35 GB of weights, 3 GB re-read per token: that is a MoE on CPU

arche compute estimate --steps workflow.yaml     # four models in series: duration, reloads, order
```

The estimator reads `knowledge/compute.yaml` — RAM/VRAM/disk bandwidths, prompt-reading speed,
bytes per parameter, system reserve — and is calibrated on public reference points, to **within
×3**: orders of magnitude, not promises. It places the active weights where they fit (VRAM, RAM,
disk), counts the reloads of a multi-model workflow and proposes the order that groups them. The
same tool exists for your AI client (`estimate_pipeline` over MCP): "this will take an hour, go
ahead?" is a question the assistant can ask.

## And if it takes an hour: the queue that survives

An hour of compute on a small machine must not be lost to a power cut. `arche jobs` is a job queue
with no daemon: one JSON file per job in `.arche/jobs/`, written before and after every step, a
resume cursor, retries with growing waits, a lock that expires when the runner dies. On restart, it
resumes at the step it was on — never from the beginning. A 500-photo field in ODM, a four-model
workflow, a reindex: these are queued jobs, not conversations; the AI client checks on them
(`jobs_list`) and reads the result when it is there.

```
arche jobs list
k2x1-7f3a  running   2/5  drone survey north field (~90 min)
```

## What is not there yet

`arche compute bench` to measure your machine and correct `compute.yaml` with your own numbers; the
queue's step handlers for Ollama and ODM (the mechanism is there, the wiring follows); and the UI
that shows the queue and the estimate before launching. The rules, though, are written and tested:
a simulated crash in the middle of a job resumes at the next step, and a 27B on 8 GB returns a
time, not an error.
