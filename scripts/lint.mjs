import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const eslint = fileURLToPath(
  new URL('../node_modules/eslint/bin/eslint.js', import.meta.url),
);
// Release each TypeScript project graph before loading the next one.
const batches = [
  ['client'],
  ['server', 'database', 'cli'],
  [
    '.',
    ...['client', 'server', 'database', 'cli'].flatMap((name) => [
      '--ignore-pattern',
      `${name}/**`,
    ]),
  ],
];

for (const batch of batches) {
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=8192',
      eslint,
      ...batch,
      '--max-warnings',
      '0',
      ...process.argv.slice(2),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
