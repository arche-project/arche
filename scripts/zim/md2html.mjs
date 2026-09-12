// Convertit docs/ (Markdown) en un mini-site HTML statique pour zimwriterfs. Zéro dépendance : conversion Markdown minimale
// (titres, paragraphes, listes, tableaux, code, liens, gras/italique) — suffisante pour nos guides et fiches.
import fs from 'node:fs'; import path from 'node:path';
const [src, out] = process.argv.slice(2);
const md = (t) => {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,a,b)=>`<a href="${b.replace(/\.md(#.*)?$/,'.html$1')}">${a}</a>`);
  const lines = t.split('\n'); const o = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) { const b=[]; i++; while(i<lines.length && !lines[i].startsWith('```')) b.push(esc(lines[i++])); i++; o.push(`<pre>${b.join('\n')}</pre>`); continue; }
    if (/^#{1,6} /.test(l)) { const n=l.match(/^#+/)[0].length; o.push(`<h${n}>${inline(l.slice(n+1))}</h${n}>`); i++; continue; }
    if (/^\|/.test(l)) { const rows=[]; while(i<lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]); const cells=r=>r.replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
      const body=rows.filter(r=>!/^\|[\s:-]+\|$/.test(r)); o.push('<table>'+body.map((r,k)=>'<tr>'+cells(r).map(c=>k?`<td>${c}</td>`:`<th>${c}</th>`).join('')+'</tr>').join('')+'</table>'); continue; }
    if (/^\s*[-*] /.test(l)) { const it=[]; while(i<lines.length && /^\s*[-*] /.test(lines[i])) it.push(inline(lines[i++].replace(/^\s*[-*] /,''))); o.push('<ul>'+it.map(x=>`<li>${x}</li>`).join('')+'</ul>'); continue; }
    if (/^\s*\d+\. /.test(l)) { const it=[]; while(i<lines.length && /^\s*\d+\. /.test(lines[i])) it.push(inline(lines[i++].replace(/^\s*\d+\. /,''))); o.push('<ol>'+it.map(x=>`<li>${x}</li>`).join('')+'</ol>'); continue; }
    if (/^> /.test(l)) { const b=[]; while(i<lines.length && /^> /.test(lines[i])) b.push(inline(lines[i++].slice(2))); o.push(`<blockquote>${b.join(' ')}</blockquote>`); continue; }
    if (l.trim()==='' || l.trim()==='---') { i++; continue; }
    const p=[]; while(i<lines.length && lines[i].trim() && !/^(#|```|\||\s*[-*] |\s*\d+\. |> )/.test(lines[i])) p.push(inline(lines[i++])); o.push(`<p>${p.join(' ')}</p>`);
  }
  return o.join('\n');
};
const css = 'body{max-width:800px;margin:2em auto;padding:0 1em;font:16px/1.5 sans-serif}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}pre{background:#f4f4f4;padding:8px;overflow:auto}';
const index = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) {
  const rel = path.relative(src, p).replace(/\.md$/, '.html'); const html = md(fs.readFileSync(p, 'utf8'));
  const title = (fs.readFileSync(p,'utf8').match(/^# (.+)$/m)||[,rel])[1];
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${css}</style>${html}`);
  index.push(`<li><a href="${rel}">${rel}</a></li>`); } } };
walk(src);
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Arche</title><style>${css}</style><h1>Arche — docs</h1><ul>${index.sort().join('')}</ul>`);
// favicon 48x48 PNG minimal (1 px transparent suffit à zimwriterfs)
fs.writeFileSync(path.join(out, 'favicon.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAAAIklEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAPgNGkAAAdOr5gAAAAAASUVORK5CYII=', 'base64'));
console.log(`${index.length} pages → ${out}`);
