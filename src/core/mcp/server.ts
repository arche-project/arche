// Le serveur MCP d'Arche : la base de connaissance et ses outils, exposés à N'IMPORTE QUEL client IA
// hors ligne (Open WebUI, OpenCode, Jan, Aider…) par le Model Context Protocol (ADR 0011).
// Arche n'est pas un client de chat ni un orchestrateur : il fournit la recherche sourcée, les
// calculateurs, les solveurs de projet, les générateurs et les règles. Le client, c'est le vôtre.
//
// Arche's MCP server: the knowledge base and its tools, exposed to ANY AI client through the Model
// Context Protocol (ADR 0011). Arche is neither a chat client nor an orchestrator: it provides
// sourced retrieval, calculators, project solvers, generators and the rules. The client is yours.
//
// JSON-RPC 2.0 écrit à la main (ADR 0002 : aucune dépendance) : initialize, ping, tools/list,
// tools/call, resources/list, resources/read, prompts/list, prompts/get. Transport stdio (une ligne
// JSON par message) et HTTP (POST /mcp, sans état) — le même dispatcher.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { loadCatalog } from '../catalog.js';
import { knowledgeDir } from '../paths.js';
import { CALCULATORS, runCalculator, formatResult } from '../rag/figures.js';
import { GENERATORS, renderDiagram, type DiagramKind } from '../rag/diagrams.js';
import { baseRules } from '../rag/prompt.js';
import { retrieve, fetchArticleText, corpusFile, readCorpusArticle, type RetrieveOptions } from '../rag/retrieve.js';
import { openCorpus } from '../rag/sqlite.js';
import { validateInventory, type Inventory } from '../project/inventory.js';
import { loadRecipes, getRecipe, missingInventory, recipePrompt } from '../project/recipes.js';
import { planGarden, renderGardenMarkdown } from '../project/garden.js';
import { substituteBom, renderBomMarkdown, type BomEntry } from '../project/bom.js';
import { estimatePipeline, formatPipeline, modelShapeFromTags, type ComputeHardware, type PipelineStep } from '../compute.js';
import { detectHardware } from '../hardware.js';
import { listJobs, describeJob } from '../jobs.js';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_VERSION = '0.1.0';

export interface McpOptions {
  lib: string;
  lang: 'fr' | 'en';
  kiwixHost?: string;
  /** Pour les tests : remplace fetch dans la recherche. */
  fetchImpl?: typeof fetch;
}

interface JsonRpcRequest { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown> }
interface JsonRpcResponse { jsonrpc: '2.0'; id: number | string | null; result?: unknown; error?: { code: number; message: string; data?: unknown } }

type Args = Record<string, unknown>;
interface Tool { name: string; description: string; inputSchema: Record<string, unknown>; run(a: Args): Promise<{ text: string; structured?: unknown; isError?: boolean }> }

const str = (a: Args, k: string): string | undefined => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
const num = (a: Args, k: string): number | undefined => (typeof a[k] === 'number' ? (a[k] as number) : typeof a[k] === 'string' && a[k] !== '' ? Number(a[k]) : undefined);

/** Lit un inventaire donné soit en chemin, soit en YAML inline ; erreurs lisibles. */
function inventoryFrom(a: Args): Inventory {
  const inline = str(a, 'inventory_yaml');
  const file = str(a, 'inventory');
  if (!inline && !file) throw new Error('inventory (chemin) ou inventory_yaml (texte YAML) requis');
  const raw = parse(inline ?? fs.readFileSync(file!, 'utf8')) as unknown;
  const errs = validateInventory(raw);
  if (errs.length) throw new Error(`inventaire invalide :\n- ${errs.join('\n- ')}`);
  return raw as Inventory;
}

/** Un article entier : dans le corpus SQLite `<lib>/index/<book>.arche.sqlite` s'il existe (articles/chunks, ADR 0014), sinon dans le ZIM via kiwix-serve. */
async function readArticle(o: McpOptions, book: string, p: string): Promise<{ title: string; text: string }> {
  const file = corpusFile(o.lib, book);
  if (!file) return fetchArticleText(book, p, { ...(o.kiwixHost ? { host: o.kiwixHost } : {}), ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}) });
  const db = openCorpus(file, { readonly: true });
  try { const a = readCorpusArticle(db, p); if (!a) throw new Error(`${book} : article introuvable dans le corpus — ${p}`); return a; } finally { db.close(); }
}

export function buildTools(o: McpOptions): Tool[] {
  const fr = o.lang === 'fr';
  const L = (f: string, e: string) => (fr ? f : e);
  const ro: RetrieveOptions = { lib: o.lib, lang: o.lang, ...(o.kiwixHost ? { host: o.kiwixHost } : {}), ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}) };
  const tools: Tool[] = [];

  tools.push({
    name: 'search',
    description: L(
      'Recherche dans la bibliothèque hors-ligne d’Arche (ZIM servis par kiwix-serve + corpus SQLite installés : FTS5 et vecteurs). Rend des extraits numérotés [n] avec leur source et un lien ouvrable. TOUJOURS appeler avant d’affirmer quoi que ce soit ; ne citer que ces extraits. Signale les sujets sensibles (identification comestible, posologie, diagnostic, urgence) avec la consigne à suivre.',
      'Searches Arche’s offline library (ZIMs served by kiwix-serve + installed SQLite corpora: FTS5 and vectors). Returns numbered passages [n] with source and an openable link. ALWAYS call before asserting anything; cite only these passages. Flags sensitive topics (edible identification, dosage, diagnosis, emergency) with the instruction to follow.'),
    inputSchema: { type: 'object', required: ['query'], properties: {
      query: { type: 'string', description: L('la question, en langage courant', 'the question, in plain words') },
      k: { type: 'number', description: L('nombre d’extraits (défaut 8)', 'number of passages (default 8)') },
      books: { type: 'array', items: { type: 'string' }, description: L('restreindre à ces ZIM (noms kiwix) ou corpus (resource_id)', 'restrict to these ZIMs (kiwix names) or corpora (resource_id)') },
      context: { type: 'array', items: { type: 'string' }, description: L('messages précédents, pour les garde-fous', 'previous messages, for guard rails') },
    } },
    async run(a) {
      const r = await retrieve(str(a, 'query') ?? '', { ...ro, k: num(a, 'k'), books: Array.isArray(a.books) ? (a.books as string[]) : undefined, context: Array.isArray(a.context) ? (a.context as string[]) : undefined });
      const lines: string[] = [];
      if (r.flags.length) {
        lines.push(L('⚠ SUJET SENSIBLE — consignes prioritaires sur tout le reste :', '⚠ SENSITIVE TOPIC — instructions overriding everything else:'));
        for (const f of r.flags) lines.push(`- ${f.instruction[o.lang]}${f.sheet ? ` (${f.sheet})` : ''}`);
        lines.push('');
      }
      if (!r.passages.length) lines.push(L('(aucun extrait trouvé — dis-le explicitement et ne réponds pas de mémoire)', '(no passage found — say so explicitly and do not answer from memory)'));
      for (const p of r.passages) lines.push(`[${p.n}] ${p.resource_id} — ${p.title}${p.heading ? ` › ${p.heading}` : ''}\n${p.url}${p.assets?.length ? `\n${L('fichiers', 'files')} : ${p.assets.join(', ')}` : ''}\n${p.text.trim()}\n`);
      lines.push(`${L('canaux', 'channels')} : xapian=${r.channels.xapian} sqlite=${r.channels.sqlite}${r.channels.detail ? ` (${r.channels.detail})` : ''}`);
      return { text: lines.join('\n'), structured: { passages: r.passages, flags: r.flags.map(f => f.id), channels: r.channels }, isError: r.channels.xapian !== 'ok' && r.channels.sqlite !== 'ok' };
    },
  });

  tools.push({
    name: 'read_article',
    description: L('Lit un article entier de la bibliothèque (texte), par corpus (resource_id) ou livre kiwix, et chemin — pour approfondir un extrait de `search`.', 'Reads a whole library article (text) by corpus (resource_id) or kiwix book, and path — to go deeper than a `search` passage.'),
    inputSchema: { type: 'object', required: ['book', 'path'], properties: { book: { type: 'string' }, path: { type: 'string' }, max_chars: { type: 'number', description: L('tronquer au-delà (défaut 12000)', 'truncate beyond (default 12000)') } } },
    async run(a) {
      const art = await readArticle(o, str(a, 'book') ?? '', str(a, 'path') ?? '');
      const max = num(a, 'max_chars') ?? 12_000;
      return { text: `# ${art.title}\n\n${art.text.slice(0, max)}${art.text.length > max ? `\n\n[… ${L('tronqué', 'truncated')} ${art.text.length - max} ${L('caractères', 'chars')}]` : ''}` };
    },
  });

  for (const c of Object.values(CALCULATORS)) {
    tools.push({
      name: `calc_${c.name}`,
      description: `${c.description[o.lang]} ${L('(calcul déterministe depuis knowledge/figures.yaml : reprendre les valeurs telles quelles)', '(deterministic, from knowledge/figures.yaml: use the values verbatim)')}`,
      inputSchema: { type: 'object', required: Object.entries(c.params).filter(([, p]) => p.required).map(([k]) => k),
        properties: Object.fromEntries(Object.entries(c.params).map(([k, p]) => [k, { type: p.type, description: p.description[o.lang], ...(p.enum ? { enum: p.enum } : {}), ...(p.default !== undefined ? { default: p.default } : {}) }])) },
      async run(a) { const r = runCalculator(c.name, a as Record<string, number | string>); return { text: formatResult(r, o.lang), structured: r }; },
    });
  }

  tools.push({
    name: 'garden_plan',
    description: L('Planifie un potager depuis un inventaire (parcelles, semences, gel, personnes) : calendrier semis/repiquage/récolte, attribution des parcelles avec rotation, rendements, cultures inconnues, avertissements. Le plan vient du solveur ; explique-le, ne le réinvente pas.', 'Plans a vegetable garden from an inventory (plots, seeds, frost, people): sowing/transplant/harvest calendar, plot assignment with rotation, yields, unknown crops, warnings. The plan comes from the solver; explain it, never reinvent it.'),
    inputSchema: { type: 'object', properties: { inventory: { type: 'string', description: L('chemin du fichier YAML d’inventaire', 'path to the YAML inventory') }, inventory_yaml: { type: 'string', description: L('ou l’inventaire en YAML inline', 'or the inventory as inline YAML') }, year: { type: 'number' } } },
    async run(a) { const plan = planGarden(inventoryFrom(a), { year: num(a, 'year') }); return { text: renderGardenMarkdown(plan, o.lang), structured: plan }; },
  });

  tools.push({
    name: 'bom_substitute',
    description: L('Croise la nomenclature d’un design de référence avec les composants de l’inventaire : en stock, manquant, substitué (chaque substitution signalée avec ce qu’elle change). Ne jamais décider seul qu’un composant en remplace un autre.', 'Crosses a reference design’s BOM with the inventory’s components: in stock, missing, substituted (every substitution flagged with what it changes). Never decide alone that a part replaces another.'),
    inputSchema: { type: 'object', required: ['bom'], properties: {
      bom: { type: 'array', description: L('lignes {ref, qty, description?, equivalents?: [{ref, changes?}], sourcing?}', 'lines {ref, qty, description?, equivalents?: [{ref, changes?}], sourcing?}'), items: { type: 'object' } },
      inventory: { type: 'string' }, inventory_yaml: { type: 'string' },
      components: { type: 'array', items: { type: 'object' }, description: L('ou directement [{ref, quantity}]', 'or directly [{ref, quantity}]') },
    } },
    async run(a) {
      const stock = Array.isArray(a.components) ? (a.components as Inventory['components']) : inventoryFrom(a).components;
      const r = substituteBom(a.bom as BomEntry[], stock ?? []);
      return { text: renderBomMarkdown(r, o.lang), structured: r };
    },
  });

  tools.push({
    name: 'project_types',
    description: L('Les types de projet qu’Arche sait accompagner (potager, robot désherbeur, maison bioclimatique, tracteur…) avec leur statut : solveur en code ou recette.', 'The project types Arche can support (garden, weeding robot, bioclimatic house, tractor…) with their status: coded solver or recipe.'),
    inputSchema: { type: 'object', properties: {} },
    async run() { const rs = loadRecipes(); return { text: rs.map(r => `- ${r.id} (${r.status}) : ${r.name[o.lang]} — ${r.scenario[o.lang]}`).join('\n'), structured: rs.map(r => ({ id: r.id, status: r.status, name: r.name, solvers: r.solvers })) }; },
  });

  tools.push({
    name: 'project_recipe',
    description: L('La recette d’un type de projet : inventaire requis, corpus à lire d’abord, solveurs, générateurs, livrables et qui les produit, PORTES HUMAINES et interdits. À appeler dès qu’un projet est ouvert, et à citer avant de livrer.', 'A project type’s recipe: required inventory, corpus to read first, solvers, generators, deliverables and who produces them, HUMAN GATES and prohibitions. Call as soon as a project is opened, and cite before delivering.'),
    inputSchema: { type: 'object', required: ['type'], properties: { type: { type: 'string' }, inventory: { type: 'string' }, inventory_yaml: { type: 'string' } } },
    async run(a) {
      const r = getRecipe(str(a, 'type') ?? '');
      if (!r) throw new Error(`${L('type de projet inconnu', 'unknown project type')} : ${str(a, 'type')} — ${loadRecipes().map(x => x.id).join(', ')}`);
      let text = recipePrompt(r, o.lang);
      if (a.inventory || a.inventory_yaml) {
        const m = missingInventory(r, inventoryFrom(a));
        text += `\n\n${L('Inventaire — manque (requis)', 'Inventory — missing (required)')} : ${m.required.join(', ') || '—'} ; ${L('manque (recommandé)', 'missing (recommended)')} : ${m.recommended.join(', ') || '—'}`;
      }
      return { text, structured: r };
    },
  });

  tools.push({
    name: 'render_diagram',
    description: L('Rend un schéma depuis sa SOURCE (schemdraw, wireviz, mermaid, graphviz, openscad, cadquery, kicad-sch, plantuml). Écrit toujours le fichier source ; rend si l’outil est installé, sinon le dit. La source est le livrable.', 'Renders a diagram from its SOURCE (schemdraw, wireviz, mermaid, graphviz, openscad, cadquery, kicad-sch, plantuml). Always writes the source file; renders when the tool is installed, otherwise says so. The source is the deliverable.'),
    inputSchema: { type: 'object', required: ['kind', 'source'], properties: { kind: { type: 'string', enum: Object.keys(GENERATORS) }, source: { type: 'string' }, format: { type: 'string' }, name: { type: 'string' }, out_dir: { type: 'string', description: L('dossier de sortie (défaut : <bibliothèque>/projects/diagrams)', 'output folder (default: <library>/projects/diagrams)') } } },
    async run(a) {
      const kind = str(a, 'kind') as DiagramKind;
      if (!(kind in GENERATORS)) throw new Error(`${L('générateur inconnu', 'unknown generator')} : ${String(a.kind)}`);
      const r = await renderDiagram(kind, str(a, 'source') ?? '', { lib: o.lib, outDir: str(a, 'out_dir') ?? path.join(o.lib, 'projects', 'diagrams'), format: str(a, 'format'), name: str(a, 'name') });
      return { text: `${L('source', 'source')} : ${r.sourceFile}\n${r.outputFile ? `${L('rendu', 'rendering')} : ${r.outputFile}` : `${L('pas de rendu', 'no rendering')} : ${r.reason}`}`, structured: r };
    },
  });

  tools.push({
    name: 'estimate_pipeline',
    description: L(
      'Estime le temps ET l’énergie (Wh) d’un modèle ou d’un workflow à plusieurs modèles sur CETTE machine (RAM, VRAM, disque, classe de consommation). Jamais « impossible » : un modèle trop gros tourne depuis le disque, lentement, et l’estimation dit combien. À appeler avant de lancer un travail long, pour que l’utilisateur décide (ADR 0012).',
      'Estimates the time AND energy (Wh) of a model or a multi-model workflow on THIS machine (RAM, VRAM, disk, power class). Never "impossible": a model too big runs from disk, slowly, and the estimate says how slowly. Call before launching long work, so the user decides (ADR 0012).'),
    inputSchema: { type: 'object', required: ['steps'], properties: {
      steps: { type: 'array', items: { type: 'object', properties: { model: { type: 'string', description: L('id catalogue, tag Ollama ou taille en Go', 'catalogue id, Ollama tag or size in GB') }, prompt_tokens: { type: 'number' }, output_tokens: { type: 'number' }, label: { type: 'string' } }, required: ['model'] } },
      hardware: { type: 'object', description: L('sinon détecté sur la machine', 'otherwise detected on this machine'), properties: { ram_gb: { type: 'number' }, vram_gb: { type: 'number' }, cpu_cores: { type: 'number' }, disk_kind: { type: 'string', enum: ['nvme', 'sata_ssd', 'usb3_ssd', 'hdd', 'sd_card'] }, machine_kind: { type: 'string', enum: ['raspberry_pi_5', 'laptop_cpu', 'apple_silicon', 'desktop_cpu', 'desktop_gpu_laptop', 'desktop_gpu_desktop', 'desktop_gpu_high_end'], description: L('classe de consommation électrique', 'power-consumption class') } } },
    } },
    async run(a) {
      const cat = loadCatalog({ strict: false });
      const resolve = (spec: string): PipelineStep['model'] => {
        const gb = Number(spec);
        if (Number.isFinite(gb) && gb > 0) return { id: `${gb} Go`, size_gb: gb };
        const r = cat.byId.get(spec) ?? cat.resources.find(x => x.type === 'ai-model' && (x.source as { ollama_model?: string }).ollama_model === spec);
        if (!r) throw new Error(`${L('modèle inconnu', 'unknown model')} : ${spec}`);
        return modelShapeFromTags(r.id, r.size_estimate_gb ?? 4, r.tags ?? []);
      };
      const steps = (a.steps as Array<{ model: string; prompt_tokens?: number; output_tokens?: number; label?: string }>).map(s => ({ model: resolve(s.model), prompt_tokens: s.prompt_tokens ?? 2000, output_tokens: s.output_tokens ?? 500, ...(s.label ? { label: s.label } : {}) }));
      const given = (a.hardware ?? {}) as Partial<ComputeHardware>;
      const det = given.ram_gb !== undefined ? null : await detectHardware(o.lib, { skipOnlineCheck: true });
      const hw: ComputeHardware = { ram_gb: given.ram_gb ?? det!.ram_gb, vram_gb: given.vram_gb ?? det?.vram_gb ?? 0, ...(given.cpu_cores ? { cpu_cores: given.cpu_cores } : {}), ...(given.disk_kind ? { disk_kind: given.disk_kind } : {}), ...(given.machine_kind ? { machine_kind: given.machine_kind } : {}) };
      const p = estimatePipeline(steps, hw, o.lang);
      return { text: formatPipeline(p, o.lang), structured: { hardware: hw, ...p } };
    },
  });

  tools.push({
    name: 'jobs_list',
    description: L('Les tâches longues en file (traitement ODM, workflow multi-modèles…) : statut, étape en cours, erreurs. Une tâche interrompue par une coupure reprend là où elle était.', 'Queued long jobs (ODM processing, multi-model workflow…): status, current step, errors. A job interrupted by an outage resumes where it was.'),
    inputSchema: { type: 'object', properties: {} },
    async run() { const js = listJobs(o.lib); return { text: js.map(j => describeJob(j, o.lang)).join('\n') || L('(aucune tâche)', '(no jobs)'), structured: js }; },
  });

  tools.push({
    name: 'catalog_search',
    description: L('Cherche une ressource dans le catalogue d’Arche (nom, description, tags) : ce qui existe, sa taille, sa licence — pour dire quoi télécharger quand la bibliothèque ne répond pas.', 'Searches Arche’s catalogue (name, description, tags): what exists, its size, its licence — to say what to download when the library does not answer.'),
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'number' } } },
    async run(a) {
      const cat = loadCatalog({ strict: false });
      const q = (str(a, 'query') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const hits = cat.resources.filter(r => { const hay = `${r.id} ${r.name.fr} ${r.name.en} ${r.description.fr} ${r.description.en} ${(r.tags ?? []).join(' ')}`.toLowerCase(); return q.every(w => hay.includes(w)); }).slice(0, num(a, 'limit') ?? 10);
      return { text: hits.map(r => `- ${r.id} (${r.type}, ${r.size_estimate_gb ?? '?'} Go, ${r.license.spdx}) : ${r.name[o.lang]}`).join('\n') || L('(rien dans le catalogue)', '(nothing in the catalogue)'), structured: hits.map(r => ({ id: r.id, type: r.type, size_gb: r.size_estimate_gb, license: r.license.spdx, name: r.name })) };
    },
  });

  return tools;
}

/** Le dispatcher : une requête JSON-RPC → une réponse (ou null pour une notification). */
export function createMcpServer(o: McpOptions) {
  const tools = buildTools(o);
  const byName = new Map(tools.map(t => [t.name, t]));
  const recipes = () => loadRecipes();
  const resources = () => [
    { uri: `arche://rules/${o.lang}`, name: 'arche-rules', mimeType: 'text/plain', description: o.lang === 'fr' ? 'Les règles de l’assistant : sources, calculateurs, schémas en code, sujets sensibles' : 'The assistant rules: sources, calculators, diagrams as code, sensitive topics' },
    { uri: 'arche://knowledge/figures.yaml', name: 'figures', mimeType: 'application/yaml', description: o.lang === 'fr' ? 'Les chiffres de l’autonomie (source des calculateurs)' : 'The self-reliance figures (calculators’ source)' },
    { uri: 'arche://knowledge/crops.yaml', name: 'crops', mimeType: 'application/yaml', description: o.lang === 'fr' ? 'Les cultures du potager (source du planificateur)' : 'Garden crops (planner’s source)' },
    ...recipes().map(r => ({ uri: `arche://recipes/${r.id}`, name: `recipe-${r.id}`, mimeType: 'text/plain', description: r.name[o.lang] })),
  ];
  const readResource = async (uri: string): Promise<{ mimeType: string; text: string }> => {
    let m: RegExpMatchArray | null;
    if ((m = uri.match(/^arche:\/\/rules\/(fr|en)$/))) return { mimeType: 'text/plain', text: baseRules(m[1] as 'fr' | 'en') };
    if ((m = uri.match(/^arche:\/\/knowledge\/(figures|crops)\.yaml$/))) return { mimeType: 'application/yaml', text: fs.readFileSync(path.join(knowledgeDir(), `${m[1]}.yaml`), 'utf8') };
    if ((m = uri.match(/^arche:\/\/recipes\/([a-z0-9-]+)$/))) { const r = getRecipe(m[1]!); if (!r) throw new Error(`recette inconnue : ${m[1]}`); return { mimeType: 'text/plain', text: recipePrompt(r, o.lang) }; }
    if ((m = uri.match(/^arche:\/\/article\/([^/]+)\/(.+)$/))) { const a = await readArticle(o, m[1]!, m[2]!); return { mimeType: 'text/plain', text: `# ${a.title}\n\n${a.text}` }; }
    throw new Error(`ressource inconnue : ${uri}`);
  };
  const prompts = () => [
    { name: 'arche_rules', description: o.lang === 'fr' ? 'Les règles de l’assistant Arche (à mettre en prompt système)' : 'The Arche assistant rules (use as system prompt)', arguments: [{ name: 'lang', required: false }] },
    { name: 'arche_project', description: o.lang === 'fr' ? 'Règles + recette d’un type de projet ouvert' : 'Rules + recipe of an open project type', arguments: [{ name: 'type', required: true }, { name: 'lang', required: false }] },
  ];
  const getPrompt = (name: string, args: Record<string, string> = {}) => {
    const lang = (args.lang === 'en' || args.lang === 'fr' ? args.lang : o.lang);
    if (name === 'arche_rules') return { messages: [{ role: 'user', content: { type: 'text', text: baseRules(lang) } }] };
    if (name === 'arche_project') {
      const r = getRecipe(args.type ?? '');
      if (!r) throw new Error(`type de projet inconnu : ${args.type}`);
      return { description: r.name[lang], messages: [{ role: 'user', content: { type: 'text', text: baseRules(lang) + '\n\n' + recipePrompt(r, lang) } }] };
    }
    throw new Error(`prompt inconnu : ${name}`);
  };

  async function handle(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = req.id ?? null;
    const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
    const err = (code: number, message: string, data?: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
    if (req.method.startsWith('notifications/')) return null;
    const p = req.params ?? {};
    try {
      switch (req.method) {
        case 'initialize': {
          const asked = String(p.protocolVersion ?? '');
          return ok({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'arche', version: SERVER_VERSION }, instructions: baseRules(o.lang) });
        }
        case 'ping': return ok({});
        case 'tools/list': return ok({ tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
        case 'tools/call': {
          const t = byName.get(String(p.name));
          if (!t) return err(-32602, `outil inconnu : ${String(p.name)}`);
          try {
            const r = await t.run((p.arguments as Args) ?? {});
            return ok({ content: [{ type: 'text', text: r.text }], ...(r.structured !== undefined ? { structuredContent: r.structured } : {}), isError: r.isError === true });
          } catch (e) {
            return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
          }
        }
        case 'resources/list': return ok({ resources: resources() });
        case 'resources/templates/list': return ok({ resourceTemplates: [{ uriTemplate: 'arche://article/{book}/{path}', name: 'article', mimeType: 'text/plain', description: o.lang === 'fr' ? 'Un article de la bibliothèque, par corpus (resource_id) ou livre kiwix, et chemin' : 'A library article by corpus (resource_id) or kiwix book, and path' }] });
        case 'resources/read': { const uri = String(p.uri ?? ''); const r = await readResource(uri); return ok({ contents: [{ uri, mimeType: r.mimeType, text: r.text }] }); }
        case 'prompts/list': return ok({ prompts: prompts() });
        case 'prompts/get': return ok(getPrompt(String(p.name ?? ''), (p.arguments as Record<string, string>) ?? {}));
        default: return err(-32601, `méthode inconnue : ${req.method}`);
      }
    } catch (e) {
      return err(-32603, (e as Error).message);
    }
  }

  /** Une ligne de texte (stdio ou corps HTTP) → la réponse sérialisée, ou null. */
  async function handleText(line: string): Promise<string | null> {
    let msg: JsonRpcRequest | JsonRpcRequest[];
    try { msg = JSON.parse(line) as JsonRpcRequest; } catch { return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } }); }
    if (Array.isArray(msg)) { const rs = (await Promise.all(msg.map(m => handle(m)))).filter(Boolean); return rs.length ? JSON.stringify(rs) : null; }
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return JSON.stringify({ jsonrpc: '2.0', id: (msg as JsonRpcRequest)?.id ?? null, error: { code: -32600, message: 'requête JSON-RPC 2.0 attendue' } });
    const r = await handle(msg);
    return r ? JSON.stringify(r) : null;
  }

  return { handle, handleText, tools };
}

/** Transport stdio : une requête JSON par ligne sur stdin, une réponse par ligne sur stdout, journal sur stderr. */
export async function serveStdio(o: McpOptions, io: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = {}): Promise<void> {
  const srv = createMcpServer(o);
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  let buf = '';
  // Les réponses sortent dans l'ordre des requêtes : une file sérielle, pas un handler async par chunk.
  let queue: Promise<void> = Promise.resolve();
  const push = (line: string) => { queue = queue.then(async () => { const r = await srv.handleText(line); if (r) output.write(r + '\n'); }); };
  await new Promise<void>(resolve => {
    input.setEncoding?.('utf8');
    input.on('data', (chunk: string | Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) push(line);
      }
    });
    input.on('end', () => { if (buf.trim()) push(buf.trim()); queue.then(resolve); });
  });
}
