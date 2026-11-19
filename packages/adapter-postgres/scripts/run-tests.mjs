import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? discover(file) : file.endsWith('.test.mjs') ? [file] : [];
  });
}

// Same rule as the engine's runner: an adapter with no test is worse than an adapter with a failing test,
// because the suite stays green while nothing is proved. Zero files is a failure, never a pass.
const files = discover('tests').sort();
if (files.length === 0) {
  console.error('PENDIENTE: no hay pruebas del adaptador. Implementar odd/tasks/postgres-adapter.md, T1.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
