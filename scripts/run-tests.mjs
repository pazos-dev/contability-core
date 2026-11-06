import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? discover(file) : file.endsWith('.test.mjs') ? [file] : [];
  });
}

const files = discover('tests').sort();
if (files.length === 0) {
  console.error('PENDIENTE: no hay pruebas de negocio. Implementar docs/tasks/001-money.md.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
