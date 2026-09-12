# No Docker: no daemon between the user and the tool

> "Imagine a world without Docker." Arche is built for people living off-grid, on a machine they
> will have to repair themselves. This document says what that imposes, what changed, and what
> Docker is still allowed to do. Français : [SANS-DOCKER.md](../fr/SANS-DOCKER.md) ·
> Decision: [ADR 0008](../adr/0008-no-daemon.md)

## Why this is an architecture problem, not a matter of taste

Docker is a **daemon**: a service that must run for the others to run, a kernel with specific
capabilities — and on macOS or Windows, an entire virtual machine — an implicit registry behind
every image, and an abstraction layer a beginner cannot open. When kiwix-serve stops at two in the
morning for someone with nobody to call, "look at `docker logs`" is not an answer. "The binary is in
`software/`, the log is in `.arche/logs/arche.log`" is.

The decisive point: **almost everything Arche needs exists as a native binary.** kiwix-serve, Ollama,
Gitea, llama.cpp, arduino-cli, SatDump, Node, standalone Python — executables you copy and run.
Docker added no capability; it added a dependency.

The catalogue audit is reassuring about the state and worrying about the trend: five of 267 entries
required Docker, only one of them `recommended` (Open WebUI) — but nothing prevented the sixth, or
the twentieth. The problem was not the catalogue; it was the absence of a rule.

## The rule, enforced by code

Every piece of software in the catalogue now declares its **`runtime`**: `static-binary`, `node`,
`python`, `jvm`, `container`, `source`, `firmware` or `none`. Anything that is not a static binary
must be satisfiable **from the catalogue itself** — Node LTS, standalone Python — or the dependency
is an empty promise.

And a `runtime: container` **can be neither `essential` nor `recommended`, nor visible to the
novice profile**. That is not a sentence in a document: `arche catalog validate` rejects the
catalogue if the rule is broken, and CI rejects the PR. Forty entries were annotated by hand; three
changed status as a result.

| Entry | Before | After | Why |
|---|---|---|---|
| **Open WebUI** | `recommended`, requires Docker | `optional`, installed with **pip** from the wheelhouse | the only piece whose "normal" path went through Docker; Arche's own UI is the primary interface |
| **Zimit** | `recommended`, requires Docker | `optional`, out of the novice profile | only exists as a container; it is **our** CI build tool, not a daily offline tool |
| **farmOS** | `optional`, requires Docker | `optional`, out of the novice profile | Drupal + database: no reasonable native path |

Docker images stay in the catalogue (`docker-kiwix-serve`, `docker-gitea`) for those who already have
Docker and prefer that format — exactly the role you leave it: downloading our containers, at most.
`skopeo`, a static binary, is enough to fetch them as archives with no daemon.

## What replaces `docker compose`: `arche serve`

What Docker really provided was not isolation — it was **launching, restarting and logging** several
services at once. That is now the job of Arche's supervisor.

`arche serve` discovers the binaries installed in the library and launches **kiwix-serve**,
**Ollama** (with its models inside the library, not in `~/.ollama`) and **Gitea** as ordinary child
processes. If one dies it is restarted after a delay that doubles each time — one second, two, four
— capped at a minute; a service that ran for more than a minute gets a fresh counter, because an
isolated crash after three days of service is not punished. After ten consecutive falls the
supervisor stops insisting and says so: a service that dies ten times needs a human, not an eleventh
attempt.

Everything goes to **one log**, `.arche/logs/arche.log`, each line timestamped and prefixed with the
service name. The web UI exposes it on `/api/services` — what `docker ps` showed, with no daemon.
`Ctrl-C` stops everything cleanly: SIGTERM, five seconds, then SIGKILL for whatever did not listen.

```
$ arche serve
  service kiwix: started (port 8080)
  service ollama: started (port 11434)
  service missing: gitea — install the matching resource (kiwix-tools, ollama, gitea)
Service log: /srv/library/.arche/logs/arche.log
```

All of it is tested on a real dying process: the test launches a script that exits with an error,
checks it is restarted with the right delay, that its output is in the log, and that shutdown is
clean.

## Starting at boot: what the machine already has

`arche service install` writes the **systemd** unit (Linux, user session:
`~/.config/systemd/user/arche.service`) or the **launchd** agent (macOS:
`~/Library/LaunchAgents/org.arche.serve.plist`) that runs `arche serve --quiet` at boot and restarts
it if it stops. These are mechanisms the system already has; we do not invent one. `--print` shows
the file without writing it, `--enable` activates it right away, `uninstall` and `status` do what
they say. On Windows the command says plainly that it generates nothing and points to Task
Scheduler.

## What we do not claim

A container isolates; the supervisor isolates nothing. Ollama and Gitea run with the user's rights,
on the user's ports, inside the user's library — on purpose, legibly, and in a way someone can
repair. If a catalogue entry ever truly requires isolation, it will stay `optional`, and that is a
signal to its authors as much as to our users.

The CI build chain keeps using containers: Zimit and mwoffliner run on GitHub Actions. That is our
workshop, not the user's machine, and the rule does not apply there.
