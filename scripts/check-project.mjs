import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const root = process.cwd();
const errors = [];
const required = [
  'AGENTS.md', 'README.md', 'LEEME-PRIMERO.md', 'PROMPTS.md', 'SKILLS-INCLUIDAS.md',
  'VALIDACION.md', 'MANIFEST.json', 'package.json', 'pnpm-workspace.yaml',
  'packages/core/package.json', 'packages/core/tsconfig.json', 'packages/core/tsconfig.build.json',
  'packages/core/src/index.ts', 'packages/core/README.md',
  'packages/core/scripts/run-tests.mjs', 'packages/core/scripts/sync-iso4217.mjs', 'docs/ARCHITECTURE.md', 'docs/DOMAIN.md', 'docs/STATUS.md',
  'docs/SCOPE.md', 'docs/QUALITY.md', 'docs/INTEGRATION.md', 'docs/ROADMAP.md',
];
const skills = ['accounting-spec', 'accounting-implement', 'accounting-review',
  'typescript-best-practices', 'nodejs-best-practices', 'clean-code-architecture'];
for (const name of skills) required.push(`.agents/skills/${name}/SKILL.md`);
// The four bounded contexts: one folder per aggregate, each with its own spec.
for (const name of ['ledger', 'account', 'journal', 'entries', 'period']) {
  required.push(
    `packages/core/src/core/domain/${name}/README.md`,
    `packages/core/src/core/domain/${name}/index.ts`,
    `docs/specs/${name}.md`,
  );
}
// money is the shared kernel of the domain, not a bounded context: same barrel and spec, other place.
required.push(
  'packages/core/src/core/domain/shared/README.md',
  'packages/core/src/core/domain/shared/money/README.md',
  'packages/core/src/core/domain/shared/money/index.ts',
  'docs/specs/money.md',
);
for (const path of [
  'core/application/README.md',
  'core/application/index.ts',
  'core/application/ports.ts',
  'core/application/facade/accounting.ts',
  'core/application/dto.ts',
  'core/application/use-cases/accounts/accounts.ts',
  'core/application/use-cases/accounts/rules.ts',
  'core/application/use-cases/journals/journals.ts',
  'core/application/use-cases/journals/rules.ts',
  'core/application/use-cases/periods/periods.ts',
  'core/application/use-cases/periods/rules.ts',
  'core/application/use-cases/entries/entries.ts',
  'core/application/use-cases/entries/rules.ts',
  'core/application/use-cases/entries/result.ts',
  'core/application/use-cases/shared/rules.ts',
  'core/application/use-cases/shared/idempotency.ts',
  'adapters/README.md',
  'adapters/memory/README.md',
  'adapters/memory/index.ts',
  'adapters/memory/store.ts',
  'adapters/memory/repositories.ts',
  'adapters/memory/in-memory-accounting.ts',
]) {
  required.push(`packages/core/src/${path}`);
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
// Two packages with two different jobs: the workspace root is private and never publishes, while the core
// is the artifact a host installs, so it has to declare ESM and the entry point of both its code and types.
try {
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  const core = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));
  const ts = JSON.parse(readFileSync('packages/core/tsconfig.json', 'utf8'));
  if (root.type !== 'module' || root.private !== true) errors.push('La raíz del workspace debe ser ESM y privada.');
  if (core.type !== 'module') errors.push('El paquete del core debe ser ESM.');
  if (typeof core.exports?.['.']?.import !== 'string') errors.push('El core debe publicar su entrada ESM en exports.');
  if (typeof core.exports?.['.']?.types !== 'string') errors.push('El core debe publicar sus tipos en exports.');
  if (!Array.isArray(core.files) || !core.files.includes('dist')) errors.push('El core debe publicar solo dist.');
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
