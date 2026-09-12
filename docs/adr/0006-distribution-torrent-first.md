# ADR 0006 — Distribution : torrent d'abord, catalogue signé, pas de blockchain

**Statut** : accepté (2026-09-11).

**Contexte** : Florian veut une distribution décentralisée qui passe à l'échelle et résiste à la disparition des hébergeurs, et a évoqué une approche « web3 ».

**Décision** : BitTorrent comme transport principal des gros fichiers (torrents fournis gratuitement par Internet Archive et Kiwix ; webseed HTTP en secours ; seed par défaut plafonné depuis `arche serve`), catalogue `index.json` signé minisign et publié en plusieurs endroits (GitHub, IA, Codeberg, CID IPFS), découverte mDNS entre machines d'un même réseau local, sneakernet (`arche export`) documenté comme voie de première classe. Aucune blockchain, aucun jeton, aucune DAO.

**Alternatives écartées** : stockage « web3 » (Filecoin/Arweave/Storj) — ajoute une couche de paiement et une dépendance réseau sans améliorer l'adressage par hash que BitTorrent/IPFS fournissent déjà ; IPFS comme transport principal — trop lourd sur Raspberry Pi, gardé pour l'adressage du catalogue.

**Positionnement** : « résistant aux pannes et à la censure », jamais « hors de toute régulation ». Ce que le catalogue distribue est légal par construction (ADR 0005) ; un réseau présenté comme incensurable ferait fuir les partenaires institutionnels et attirerait des contenus indésirables.

**Conséquences** : implémenter le transport torrent dans `arche download` (webtorrent ou aria2c) ; générer et signer `index.json` dans `release.yml` ; embarquer la clé publique dans le binaire.

---

**Status**: accepted. **Decision**: BitTorrent first (IA/Kiwix torrents, HTTP webseed, capped default seeding), minisign-signed catalog published in several places incl. an IPFS CID, mDNS LAN discovery, sneakernet as a first-class path. No blockchain, token or DAO. **Positioning**: "failure- and censorship-resistant", never "outside any rule".
