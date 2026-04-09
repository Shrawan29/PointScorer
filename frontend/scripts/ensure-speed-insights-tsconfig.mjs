import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const shimPath = path.join(rootDir, 'node_modules', 'tsconfig.json');
const speedInsightsTsconfigPath = path.join(rootDir, 'node_modules', '@vercel', 'speed-insights', 'tsconfig.json');

const ensureShim = async () => {
  await mkdir(path.dirname(shimPath), { recursive: true });

  if (!existsSync(shimPath)) {
    await writeFile(
      shimPath,
      '{\n  "compilerOptions": {}\n}\n',
      'utf8'
    );
    console.info('[postinstall] Created node_modules/tsconfig.json shim.');
  }

  if (existsSync(speedInsightsTsconfigPath)) {
    const rawTsconfig = await readFile(speedInsightsTsconfigPath, 'utf8');
    const parsedTsconfig = JSON.parse(rawTsconfig);
    if (parsedTsconfig?.extends === '../../tsconfig.json') {
      delete parsedTsconfig.extends;
      parsedTsconfig.compilerOptions = {
        ...(parsedTsconfig.compilerOptions || {}),
        module: 'esnext',
      };

      await writeFile(
        speedInsightsTsconfigPath,
        `${JSON.stringify(parsedTsconfig, null, 2)}\n`,
        'utf8'
      );
      console.info('[postinstall] Patched @vercel/speed-insights tsconfig extends for editor diagnostics.');
    }
  }
};

ensureShim().catch((error) => {
  console.error('[postinstall] Failed to create tsconfig shim.', error);
  process.exitCode = 1;
});
