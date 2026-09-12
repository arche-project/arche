// `arche mcp` : le serveur MCP sur stdio, pour brancher N'IMPORTE QUEL client IA (ADR 0011).
// Open WebUI, OpenCode, Jan, Aider… lancent cette commande et parlent JSON-RPC. Hors ligne, modèle local.
// Le journal va sur stderr : stdout est réservé au protocole.
import { loadConfig } from '../core/config.js';
import { libraryDir } from '../core/paths.js';
import { getLang } from '../core/i18n.js';
import { serveStdio, createMcpServer } from '../core/mcp/server.js';

export async function mcpCommand(o: { config?: string; library?: string; kiwixHost?: string; lang?: string; listTools?: boolean }) {
  const cfg = loadConfig(o.config);
  const lib = libraryDir(o.library ?? cfg.library);
  const kiwixHost = o.kiwixHost ?? process.env['KIWIX_HOST'] ?? `http://127.0.0.1:${cfg.serve?.kiwix_port ?? 8080}`;
  const lang = (o.lang === 'en' || o.lang === 'fr') ? o.lang : getLang();
  if (o.listTools) {
    const srv = createMcpServer({ lib, lang, kiwixHost });
    for (const t of srv.tools) console.log(`${t.name.padEnd(28)} ${t.description.split(/[.。]/)[0]}.`);
    return;
  }
  process.stderr.write(`arche mcp — ${lang} — ${lib} — kiwix ${kiwixHost}\n`);
  await serveStdio({ lib, lang, kiwixHost });
}
