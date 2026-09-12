# ADR 0001 — Node 22 + TypeScript, exécutable SEA pour le néophyte

**Statut** : accepté (choix de Florian, 2026-09-11).

**Contexte** : le wizard doit tourner sur Windows/macOS/Linux/Raspberry Pi, servir une UI web locale, et rester compilable longtemps.

**Décision** : Node ≥ 22 (fetch, statfs, readline/promises, node:test, SEA natifs), TypeScript strict, ESM. Pour le profil néophyte, un exécutable autonome via Node SEA (`scripts/build-sea.sh`, `release.yml`).

**Alternatives** : Go (binaire statique, moins de contributeurs), Python (packaging fragile sur Windows/Pi).

**Conséquences** : runtime ~100 Mo embarqué dans l'exécutable ; Pi OS livre Node 18 → SEA ou NodeSource. Node 22 est LTS jusqu'en 2027 ; réévaluer à ce moment-là.

---

**Status**: accepted (Florian's choice). **Decision**: Node ≥ 22 + strict TypeScript + ESM; SEA executable for beginners. **Alternatives**: Go, Python. **Consequences**: ~100 MB runtime in the executable; Pi OS ships Node 18.
