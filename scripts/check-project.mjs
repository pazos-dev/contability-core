import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const root = process.cwd();
const errors = [];
const required = [
  'AGENTS.md', 'README.md', 'LEEME-PRIMERO.md', 'PROMPTS.md', 'SKILLS-INCLUIDAS.md',
  'VALIDACION.md', 'MANIFEST.json', 'package.json', 'tsconfig.json', 'tsconfig.build.json',
  'src/index.ts', 'docs/ARCHITECTURE.md', 'docs/DOMAIN.md', 'docs/STATUS.md',
  'docs/SCOPE.md', 'docs/QUALITY.md', 'docs/INTEGRATION.md', 'docs/ROADMAP.md',
];
const skills = ['accounting-spec', 'accounting-implement', 'accounting-review',
  'typescript-best-practices', 'nodejs-best-practices', 'clean-code-architecture'];
for (const name of skills) required.push(`.agents/skills/${name}/SKILL.md`);
for (const name of ['money', 'account', 'journal', 'entries', 'period']) {
  required.push(`src/core/domain/${name}/README.md`, `src/core/domain/${name}/index.ts`, `docs/specs/${name}.md`);
}
for (const path of [
  'src/core/application/README.md',
  'src/core/application/index.ts',
  'src/core/application/ports/index.ts',
  'src/core/application/contracts/registration.ts',
  'src/core/application/use-cases/register-account.ts',
  'src/adapters/README.md',
  'src/adapters/memory/README.md',
  'src/adapters/memory/index.ts',
]) {
  required.push(path);
}
for (const file of required) if (!existsSync(file)) errors.push(`Falta ${file}`);

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) return [];
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

// Solo enlaces Markdown locales con destino simple; no pretende analizar Markdown completo.
for (const file of filesIn(root).filter((item) => extname(item) === '.md')) {
  const contents = readFileSync(file, 'utf8');
  for (const match of contents.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (target.startsWith('#') || /^[a-z]+:/i.test(target)) continue;
    const relative = target.split('#')[0];
    if (relative && !existsSync(resolve(dirname(file), relative))) {
      errors.push(`Enlace roto en ${file.slice(root.length + 1)}: ${target}`);
    }
  }
}

for (const name of skills) {
  const file = `.agents/skills/${name}/SKILL.md`;
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (!text.startsWith('---\n') || !text.includes(`name: ${name}\n`) || !/^description:/m.test(text)) {
    errors.push(`Metadatos incompletos: ${file}`);
  }
}
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const ts = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  if (pkg.type !== 'module' || pkg.private !== true) errors.push('El scaffold debe ser ESM y privado.');
  if (ts.compilerOptions.strict !== true) errors.push('TypeScript debe ser estricto.');
} catch (error) {
  errors.push(`Configuración JSON inválida: ${error.message}`);
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('Preparación verificada: rutas, enlaces locales, configuración y seis skills.');
  console.log('Esta validación no verifica implementación, tipos ni reglas contables.');
}
