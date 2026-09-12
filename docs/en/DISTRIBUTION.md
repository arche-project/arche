# Decentralised distribution: how Arche survives the loss of its servers

> Français : [DISTRIBUTION.md](../fr/DISTRIBUTION.md) · Decision: [ADR 0006](../adr/0006-distribution-torrent-first.md)

## What we actually want

Three properties, in this order:

1. **Resilience** — if Internet Archive, GitHub or download.kiwix.org vanish, the library stays
   downloadable from the people who have it.
2. **Verifiability** — a file received from a stranger is proven identical to the original (the
   catalog carries every file's sha256, and the catalog itself is signed).
3. **Scale without a bill** — 10,000 people downloading 500 GB must not cost one server 5 PB of bandwidth.

These three properties have existed for twenty years under the name **BitTorrent**. They need no
blockchain, no token, no account. That is Arche's choice.

## On "web3" and the idea of escaping regulation

Two frank remarks, since you asked for critique.

Technically first: a blockchain exists to agree on the *order* of events between parties who don't
trust each other (who owns what, who paid). Distributing files has no such problem: we want *the
same* file everywhere, and a hash proves it. "Web3 storage" projects (Filecoin, Arweave, Storj) all
end up using content-addressed data + a peer-to-peer network — i.e. what BitTorrent and IPFS already
do — and add a token payment layer Arche doesn't need, which requires a connection to the
blockchain's network (exactly what we lack in an outage), and which ties data survival to the price
of a speculative asset. For a survival kit that is one more dependency, not one less.

Then the goal: "escaping all regulation" is not a goal this project can pursue, and I advise
against writing it. What the catalog distributes is **legal by construction** (free licenses,
written permissions) and has nothing to hide; a network that markets itself as uncensorable attracts
exactly the content we don't want on it and drives away the partners that matter (libraries,
schools, municipalities, Kiwix, Internet Archive, the Wikimedia Foundation). The right framing is
**"censorship- and failure-resistant"** — a free file stays available even if a host goes down or
takes it down, for whatever reason. That is exactly what BitTorrent provides, and it is defensible
in front of anyone.

There is one legitimate off-grid use of "web3" ideas: **signing** the catalog (a public key, not a
blockchain) and, later, exchanging updates between two machines that never met, via **sneakernet**
or a mesh network. Neither needs a token.

## The chosen architecture

### Level 0 — today, no extra code

- Internet Archive generates a `.torrent` for every Arche-hosted item. The catalog carries it in
  `source.torrent`. Any BitTorrent client (qBittorrent, Transmission) can download and **share** the library.
- Kiwix ZIMs also have an official `.torrent` (`<url>.torrent`) and `.magnet`.
- `arche export` + disk-to-disk copy = sneakernet. The most resilient distribution there is: a disk in a bag.

### Level 1 — to implement in `arche download` (next step)

Built-in torrent transport, in Node (**webtorrent** library, or a wrapper around `aria2c`, which
handles HTTP + BitTorrent + resume + verification on all three OSes). Rules:

- if `source.torrent` exists and the file is > 1 GB → torrent first, HTTP (IA) as **webseed**
  fallback: the user always gets at least the server's speed, often more.
- after download, **seed by default** while `arche serve` runs, with a configurable upload cap
  (`serve.seed_upload_kbps`) and a visible "don't share" switch in the UI. An "Arche point" (an
  always-on Pi) naturally becomes a seed.
- on Raspberry Pi, `aria2c` is in apt and weighs 3 MB; reference it as a `software` resource.

### Level 2 — signed catalog and catalog mirrors

The catalog is the only thing that must be obtained "from a trusted source"; everything else is
verified by hash. Hence:

- `catalog/index.json` generated at every release, **signed with minisign** (public key in the
  README and baked into the binary). `arche` refuses a catalog whose signature doesn't match.
- The signed catalog is published in 4 independent places: GitHub, Internet Archive, Codeberg, and
  an **IPFS** CID (a content hash, free through a pinning service or through IA itself, which
  exposes its items over IPFS). The binary embeds the last known catalog: an offline machine always has one.
- Anyone can host a full mirror (`arche mirror --to /srv/www`): a static folder + the signed
  catalog. The catalog accepts a `mirrors` list that a user or a local community extends
  (`~/.config/arche/mirrors.yaml`).

### Level 3 — off-grid between neighbours

Two Arche machines on the same LAN (a building's Wi-Fi; Meshtastic lacks the bandwidth) discover
each other via **mDNS** (`_arche._tcp.local`) and offer: "Marie has Wikipedia FR 2026-08, you have
2026-05, update from Marie?". Local HTTP + hash, nothing more. It makes the "Arche point"
contagious: one up-to-date disk in a neighbourhood updates the whole neighbourhood.

## What it doesn't solve

- A file no peer has any more is lost: redundancy comes from people and institutions (libraries,
  fablabs) that keep disks powered, not from a protocol. Hence COMMUNITY.md.
- BitTorrent traffic is throttled or blocked by some ISPs and in many workplaces; the HTTP webseed
  remains the safety net.
- IPFS is slow and heavy on a Pi; we use it to **address** (the catalog's CID), not as main transport.

## Decision

Torrent first (IA provides torrents for free), HTTP as webseed, minisign-signed catalog published
in several places with an IPFS CID, local mDNS discovery. No blockchain, no token. Public wording:
*failure- and censorship-resistant*, never *outside any rule*.
