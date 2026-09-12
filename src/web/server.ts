// Serveur HTTP minimal (node:http, zéro dépendance) : sert l'UI statique et une API JSON.
// Minimal HTTP server (node:http, zero deps): serves the static UI and a JSON API.
//
// API :
//   GET  /api/catalog                     → catalogue complet (JSON)
//   GET  /api/hardware                    → matériel détecté
//   GET  /api/state                       → état de la bibliothèque
//   POST /api/plan   {profile,languages,bundles,include,exclude,budget,preset}
//   POST /api/download {ids:[...]}        → lance les installations en arrière-plan
//   GET  /api/events                      → Server-Sent Events de progression
//   POST /mcp                             → serveur MCP (JSON-RPC, sans état) pour un client IA en HTTP (ADR 0011)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../core/catalog.js';
import { detectHardware } from '../core/hardware.js';
import { plan } from '../core/recommend.js';
import { loadState } from '../core/state.js';
import { install, type Progress } from '../core/downloader.js';
import { webStaticDir } from '../core/paths.js';
import type { Hardware, PlanOptions } from '../core/types.js';

import type { Supervisor } from '../core/supervisor.js';
import { createMcpServer } from '../core/mcp/server.js';
import { getLang } from '../core/i18n.js';

export interface ServeOptions { lib: string; port: number; bind: string; kiwixPort: number; supervisor?: Supervisor; kiwixHost?: string }

export async function startWebServer(o: ServeOptions): Promise<http.Server> {
  const catalog = loadCatalog({ strict: true });
  const clients = new Set<http.ServerResponse>();
  const progress = new Map<string, Progress>();
  const broadcast = (p: Progress) => { progress.set(p.id, p); const line = `data: ${JSON.stringify(p)}\n\n`; for (const c of clients) c.write(line); };
  let running = false;
  // MCP en HTTP (ADR 0011) : le même dispatcher que `arche mcp`, sans état, une requête JSON par POST.
  const mcp = createMcpServer({ lib: o.lib, lang: getLang(), kiwixHost: o.kiwixHost ?? `http://127.0.0.1:${o.kiwixPort}` });

  const json = (res: http.ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const readBody = (req: http.IncomingMessage) => new Promise<string>(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/mcp') {
        if (req.method === 'GET') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
        if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
        const out = await mcp.handleText(await readBody(req));
        if (out === null) { res.writeHead(202); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(out);
      }
      if (url.pathname === '/api/catalog') return json(res, 200, { resources: catalog.resources, profiles: catalog.profiles, hardware_presets: catalog.hardware_presets, ai_tiers: catalog.ai_tiers, bundles: catalog.bundles, kiwixPort: o.kiwixPort, library: o.lib });
      if (url.pathname === '/api/hardware') return json(res, 200, await detectHardware(o.lib));
      // État des services supervisés (kiwix, ollama, gitea) : ce que `docker ps` montrait, sans démon.
      if (url.pathname === '/api/services') return json(res, 200, { services: o.supervisor?.status() ?? [], log: o.supervisor?.logFile ?? null });
      if (url.pathname === '/api/state') return json(res, 200, { state: loadState(o.lib), progress: [...progress.values()], running });
      if (url.pathname === '/api/plan' && req.method === 'POST') {
        const b = JSON.parse(await readBody(req) || '{}') as PlanOptions & { preset?: string; budget?: number; hardware?: Partial<Hardware> };
        const hw = await detectHardware(o.lib, { skipOnlineCheck: true });
        if (b.preset) { const h = catalog.hardware_presets.find(p => p.id === b.preset); if (h) Object.assign(hw, { ram_gb: h.assumed.ram_gb ?? hw.ram_gb, vram_gb: h.assumed.vram_gb ?? hw.vram_gb, disk_free_gb: h.assumed.disk_gb ?? hw.disk_free_gb }); }
        if (b.hardware) Object.assign(hw, b.hardware);
        const p = plan(catalog, hw, { profile: b.profile ?? 'novice', languages: b.languages, bundles: b.bundles, include: b.include, exclude: b.exclude, diskBudgetGb: b.budget });
        return json(res, 200, { ...p, items: p.items.map(i => ({ id: i.resource.id, selected: i.selected, sizeGb: i.sizeGb, reason: i.reason, viaBundle: i.viaBundle })), hardware: hw });
      }
      if (url.pathname === '/api/download' && req.method === 'POST') {
        if (running) return json(res, 409, { error: 'already running' });
        const { ids } = JSON.parse(await readBody(req) || '{}') as { ids: string[] };
        const targets = ids.map(id => catalog.byId.get(id)).filter(Boolean);
        running = true;
        (async () => {
          for (const r of targets) { try { await install(r!, o.lib, broadcast); } catch { /* déjà signalé via progress */ } }
          running = false; broadcast({ id: '*', phase: 'done', message: 'all' });
        })();
        return json(res, 202, { started: targets.length });
      }
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(':ok\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      // statique
      const file = path.join(webStaticDir(), url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''));
      if (!file.startsWith(webStaticDir()) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });
  await new Promise<void>(r => server.listen(o.port, o.bind, r));
  return server;
}
