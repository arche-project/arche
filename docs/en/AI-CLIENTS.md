# Connecting your AI client to Arche

> Arche is not a chat client. It is an offline knowledge base and a set of tools, served through the
> **Model Context Protocol** (MCP) to any client that speaks it — yours. ADR 0011.
> Rule for this page: a client is listed only if it runs **with no network, on a local model**. Cloud
> clients have no place in an offline project.
> Français : [CLIENTS-IA.md](../fr/CLIENTS-IA.md)

## What the client gets

On connecting, your client discovers nineteen **tools**, some **resources** and two **prompts**:

| Tool | What it does | What it guarantees |
|---|---|---|
| `search` | hybrid search over the library (each ZIM's Xapian + the dense index when installed) | numbered passages [n], source and a link that opens in Kiwix; an overriding instruction on top when the topic is sensitive |
| `read_article` | a whole article, as text | read from the ZIM, never summarised by Arche |
| `calc_*` (10) | cistern, rainwater, calories, food area, fats, firewood, solar, hens, seed stock, one-year store | deterministic, from `knowledge/figures.yaml`, with steps and assumptions |
| `garden_plan` | the garden plan from an inventory | calendar, plots with rotation, yields; unverified values flagged |
| `bom_substitute` | a reference design's BOM crossed with the stock | every substitution flagged with what it changes |
| `project_types`, `project_recipe` | the project types and their recipe | corpus to read, solvers, deliverables, **human gates**, prohibitions |
| `render_diagram` | renders a diagram from its source (schemdraw, WireViz, Mermaid, OpenSCAD, KiCad…) | always writes the source; renders if the tool is there, otherwise says so |
| `catalog_search` | what exists in the catalogue | size, licence, type — to say what to download |

Resources: `arche://rules/en` (the rules), `arche://knowledge/figures.yaml`,
`arche://knowledge/crops.yaml`, `arche://recipes/<type>`, and `arche://article/<book>/<path>`.
Prompts: `arche_rules` (use as system prompt) and `arche_project` (rules + recipe of an open
project). The `initialize` reply also carries the rules in `instructions`: most clients show them to
the model with no configuration.

## Running the server

Two transports, one server.

**stdio** — the client launches the command itself:

```bash
node dist/cli.js mcp                 # library and kiwix-serve from arche.yaml
node dist/cli.js mcp --library /Volumes/ARCHE --kiwix-host http://127.0.0.1:8080 --lang en
node dist/cli.js mcp --list-tools    # check what is exposed
```

**HTTP** — `arche serve` exposes the same dispatcher at `POST http://127.0.0.1:8765/mcp` (stateless,
one JSON-RPC request per HTTP request). For clients that prefer a URL to a command.

Either way, `search` needs **kiwix-serve** (started by `arche serve`, ADR 0008); without it the tool
says so (`xapian=error`) instead of inventing.

## Configuring clients

Most desktop clients share the same configuration shape:

```json
{
  "mcpServers": {
    "arche": {
      "command": "node",
      "args": ["/path/to/arche/dist/cli.js", "mcp", "--library", "/Volumes/ARCHE"]
    }
  }
}
```

- **Open WebUI** (in the catalogue, installed with pip, no Docker): Settings → Tools → add an MCP
  server over HTTP with the URL `http://127.0.0.1:8765/mcp`. Models through Ollama. The most
  complete offline client for a non-developer.
- **OpenCode** (in the catalogue): the `mcp` section of `opencode.json`, type `local`, the same
  command. Models through Ollama. The client of choice for deriving code (firmware, OpenSCAD,
  schemdraw).
- **Jan** (in the catalogue, Apache-2.0, 100 % offline on llama.cpp, MCP built in): Settings → MCP
  Servers, the same block. The simplest desktop client for a non-developer who does not want to
  install Python.
- **Continue** (VS Code extension, Apache-2.0) and any other free client that talks to Ollama or
  llama.cpp: the same `mcpServers` block, or the HTTP URL — each client documents the exact place;
  the shape above is the one they share as I write, to be checked against the client's docs.

A client that needs the internet to answer (Claude Desktop, ChatGPT, Cursor…) speaks MCP too, but it
is not part of Arche and is not documented here: the day the network goes down, it goes with it.

A reasonable system prompt, if the client does not use `instructions`: ask for the `arche_rules`
prompt, or paste `arche://rules/en`. For an open project: `arche_project` with the type (`potager`,
`robot-desherbeur`, `maison-bioclimatique`, `tracteur-autonome`).

## Orchestrators, agents, automation: clients too

"What about AI orchestrators?" Same answer, same rule. An orchestrator is a client of Arche like
any other: it calls `search`, `garden_plan`, `calc_*` over MCP and chains them. Arche writes none;
it lists a few in the catalogue, offline and free, with three red lines that apply to all: **no
language model in an actuator loop** (ADR 0010 — watering, a motor, a blade is a deterministic
automaton with a watchdog); **no downloaded third-party "skills"** (skill marketplaces have already
served as vectors for exfiltration and prompt injection — offline, an agent gets Arche's tools and
local files, nothing else); **under the supervisor, on 127.0.0.1**, like any service (ADR 0008).

| Need | Tool | Why that one |
|---|---|---|
| The physical world: sensors → rules → watering, alerts, logs | **Node-RED** (Apache-2.0, npm, Pi, MQTT, GPIO, Modbus, Home Assistant) — `automation` bundle | deterministic, visual, built for this for ten years; calls `arche mcp` over HTTP to attach a sourced sheet to an alert, and that is all the AI does in the loop |
| Recurring tasks with a local model: "every morning, read the weather station and tell me what to water" | **Hermes Agent** (MIT, Python, Ollama, native MCP, Home Assistant interface) — `automation` bundle | the cleanest agent to plug in: native MCP, runs on Qwen3.5, and its Home Assistant link is a bridge to the physical — read-only |
| An agent driven from a messaging app | **OpenClaw** (MIT, Node, Ollama) — `optional` | popular, but its interfaces (Signal, Telegram, Discord) assume the internet and its skills ecosystem has had incidents; for those who already know it, under the three red lines |
| Flows with AI nodes, MCP client and server | **n8n** (fair-code, `npx n8n`) — `optional` | for those who master it; Sustainable Use License (personal use free, no commercial service); most of its 1,500 integrations assume the internet |
| Images, video, 3D, audio by diffusion | **ComfyUI** (GPL-3.0, Python + PyTorch, GPU realistic) — `optional` | the reference diffusion interface, offline; under ADR 0009: illustrate, never a technical diagram, never a species identification, never a functional part (a Hunyuan3D mesh is not an OpenSCAD) |

One example in a sentence: Node-RED reads the moisture probe, decides whether to water (fixed rule),
and — for the message only — asks `arche mcp` for the sourced "tomato water stress" sheet to attach
to the alert. The AI explains; it does not open the valve.

## What Arche no longer does, and why

Arche does not generate an answer, does not check that the model cited its sources, refuses nothing
on your behalf. It **returns** sourced passages, computed figures, solved plans, recipes with their
gates — and the client, with the model you chose, turns them into an answer. A badly configured
client can ignore an instruction: it is your machine and your choice. What Arche guarantees is that
everything leaving its tools is sourced, computed, or flagged as unverified.

## Checking by hand

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"calc_citerne","arguments":{"people":4,"dry_days":60}}}' \
  | node dist/cli.js mcp 2>/dev/null
```

Two JSON lines back: the first says who answers, the second gives the cistern volume with its steps.
If the second contains `isError`, the message says why.
