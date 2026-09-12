# Package mirrors: the mechanism, not the list

> "Some will need Alpine, others another distribution. I know you can't put every package in the
> world into one repository." Exactly — which is why Arche does not ship a list of distributions,
> but a **mechanism** to add one in thirty lines. Français : [MIROIRS.md](../fr/MIROIRS.md)

## What cannot be done, and what can

A full Debian mirror is 400 GB per architecture; Ubuntu, more; and there are dozens of
distributions. Copying everything is impossible, and copying "the important packages" by hand gives
a mirror that does not install — because `hostapd` needs `libssl3t64`, which needs `libc6`, which
needs `libgcc-s1`, and one was forgotten.

What can be done is **computing** that chain. From a short list of root packages, read the
repository index and derive exactly the packages needed for `apt install` or `apk add` to succeed
offline — and not one more. That is the dependency closure, and it is
`src/core/mirror/packages.ts`: a pure function, tested on real formats, that understands
alternatives (`lsb-base | sysvinit-utils`), virtual packages (`Provides:`), Alpine's `so:` and
`cmd:`, Debian's optional Recommends, and which **says** what it could not find rather than hiding it.

## A recipe, thirty lines

```yaml
id: alpine-stable
resource: alpine-standard          # the catalogue resource this mirror feeds
type: apk                          # apt | apk
base_url: https://dl-cdn.alpinelinux.org/alpine
suite: latest-stable
components: [main, community]
architectures: [x86_64, aarch64]
packages: [alpine-base, linux-lts, openssh, hostapd, dnsmasq, git, python3, nodejs, build-base]
```

`arche mirror plan catalog/mirrors/alpine.yaml --arch aarch64` reads the index, computes the
closure and answers: how many packages, what size, what is missing. `--urls file.txt` writes the
download list for `wget -i` or `arche download`. If the closure is twice the recipe's estimate, the
command says so: a root pulls too much — a meta-package, or Recommends.

Four reference recipes ship: **Debian stable** (the base: ~6 GB for a node + a workshop + a light
desktop), **Ubuntu LTS** and **ROS 2** (which go together: ROS's system dependencies resolve in the
Ubuntu mirror), and **Alpine** — the easiest distribution of all to mirror: flat repository, an
index of a few MB, no Recommends so the closure is exact.

## Adding yours

A file in `catalog/mirrors/`, a resource in `catalog/resources/operating-systems.yaml` referencing
it, and that is all: validation checks the resource exists, the freshness tracker follows the
distribution's version, and `arche mirror plan` does the rest. `apt` and `apk` cover Debian,
Ubuntu, Raspberry Pi OS, Mint, Alpine, postmarketOS and their derivatives; `pacman` (Arch), `dnf`
(Fedora) and `opkg` (OpenWrt) are parsers to write on the same model — a hundred lines each, tested
on an index excerpt.

The rule from [OPERATING-SYSTEMS.md](OPERATING-SYSTEMS.md) stands: **an ISO without its repository
is a dead end**, and every distribution costs a mirror, a tracker and someone who can administer it.
The mechanism does not remove that cost; it makes it payable by the person who needs it, instead of
by everyone.

## And the "stable VM"?

You are right that Arche needs a stable environment underneath. Two ways to get there, and it is
not settled:

**The Debian base + the supervisor** (ADR 0008): Arche runs on what the machine has, as native
binaries, and Debian stable is what changes least. That is the current path.

**A virtual-machine image** built in CI — Debian + Arche + services preinstalled, shipped as
qcow2/OVA/raw — for whoever has an arbitrary host (Windows, macOS, a NAS) and wants the same
environment as everyone else. Reproducible, testable, and slightly against the "no daemon" spirit:
a hypervisor is heavier than Docker. Logged as a decision to make (D18 in
[DECISIONS.md](DECISIONS.md)) rather than built now. My view: useful for the *bunker* profile with a
powerful machine, not for the Raspberry Pi node, and never the recommended path for a beginner.
