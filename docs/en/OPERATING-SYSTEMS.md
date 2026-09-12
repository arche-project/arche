# Operating systems: one use, one distribution

> The library lives on a disk; the machine that reads it can die. With no system to reinstall,
> everything else is unreachable. This document says which ones we keep, why so few, and what we
> refuse. Français : [SYSTEMES.md](../fr/SYSTEMES.md)

## The rule that decides everything

**A distribution without its package repository is a dead end.** The ISO installs a base — a
kernel, a desktop, a terminal. Everything wanted afterwards — Docker for Gitea, `hostapd` for
Wi-Fi, KiCad, FreeCAD, `ros-jazzy-desktop` — comes from the repository. Offline, with no mirror,
you have a computer that boots and is good for nothing. So every catalogue entry names its
repository in `depends_on`, or explains why it needs none (SystemRescue: everything is in the ISO,
by design).

The consequence is counter-intuitive: **fewer distributions, not more.** Each one costs a 2–6 GB
ISO, a 15–80 GB mirror, a version checker, and someone who can administer it when it breaks. We
choose by use, never by taste.

## What we keep, and for what

| Use | Distribution | Repository | Why this one |
|---|---|---|---|
| **the Arche node**, a server, a salvaged old PC | **Debian stable** (DVD-1) | `apt-mirror-debian` | lives five years, changes least, amd64 and arm64, and the DVD-1 image installs a full desktop **with no network** — the netinst does not |
| **the Raspberry Pi** | **Raspberry Pi OS Lite** | Debian + `archive.raspberrypi.com` | Debian with the Pi kernel; no desktop because it is a node, not a workstation |
| **ROS 2 robotics** | **Ubuntu LTS** | `ros2-apt-mirror` + an Ubuntu mirror | only because ROS 2 binaries exist for Ubuntu LTS alone; without ROS, Debian is enough |
| **repair, recover, clone** | **SystemRescue** | none (live) | boots any PC from a stick without installing; used *before* any reinstall |
| **routers, access points, mesh** | **OpenWrt** | its own stable-release feed | it provides the node's Wi-Fi, the hamlet network, the bridge between two buildings |
| **one stick for every ISO** | **Ventoy** | — | install once, then *copy* ISOs onto it as files; a menu at boot |
| **primary school, in French** | PrimTux | Debian | a child's computer that works with no network and no setup; answers the "organised home schooling" gap |

Three are `essential` in the novice profile: Debian, SystemRescue, Ventoy. Together they fit on a
32 GB stick and form **the physical object** a beginner must own, labelled, in the library's box:
"if the computer no longer boots, plug this in".

## What we refuse, and why

**Arch and derivatives**: rolling release — there is no "stable version" to track, and a frozen
Arch mirror ages badly. **Fedora**: thirteen months of life; by the time a mirror is built it is
nearly expired. **NixOS**: reproducibility is exactly what we want, but an offline Nix cache is a
project of its own and nobody here will maintain it. **Tails, Qubes**: excellent, different subject
— privacy is not self-reliance. **DragonOS and the radio distributions**: Debian with preinstalled
packages; `apt-mirror-debian` + SatDump do the same without doubling the mirror. **Windows**:
impossible to redistribute, and a system you cannot reinstall from the disk has no place in a
self-reliance library.

## How versions are tracked

A distribution is where "latest" and "latest stable" diverge most. Each entry therefore has its
checker, all reading the source the project itself uses:

| System | Tracker | Reads |
|---|---|---|
| Debian | `debian` | the `Release` file of `stable`: version and codename |
| Ubuntu | `ubuntu-lts` | `meta-release-lts`, the file Ubuntu consults to offer upgrades — last **supported** LTS |
| Raspberry Pi OS | `raspios` | the Raspberry Pi Imager list: URL, date, **sha256** identical to the official tool's |
| OpenWrt | `github-tag` | Git tags, filtered by the "stable" policy — `rc` tags are skipped |
| Ventoy | `github-release` | `/releases/latest` |
| SystemRescue, PrimTux | `http-head` | the download page's presence; the version is still read by hand |

The `github-tag` tracker is new and generic: many projects tag without creating a GitHub
"release", so `/releases/latest` answers 404 — which, before, marked the resource as gone.

## What is left

The Ubuntu apt mirror (≈ 60 GB, `main` + `universe`, amd64 and arm64) has no entry of its own: it
is described in `ubuntu-lts`'s note and deserves a recipe like `apt-mirror-debian`. SystemRescue
and PrimTux versions are read by hand until they expose a machine-readable feed. And the printable
"if the computer no longer boots" sheet — plug the stick, pick SystemRescue, where the files are —
does not exist yet; sheet 06 is the one to extend.
