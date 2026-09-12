// Copie l'UI web statique dans dist/ après tsc (tsc ne copie pas les .html).
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/web/static', { recursive: true });
cpSync('src/web/static', 'dist/web/static', { recursive: true });
console.log('static assets copied');
