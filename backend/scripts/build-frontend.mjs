import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function resolveFrontendDir() {
  const candidates = [
    // If cwd is backend/
    path.resolve(process.cwd(), '../frontend'),
    // If cwd is repo root
    path.resolve(process.cwd(), 'frontend'),
    // Relative to this file: backend/scripts -> repo root/frontend
    path.resolve(__dirname, '..', '..', 'frontend'),
  ];

  for (const dir of candidates) {
    if (exists(path.join(dir, 'package.json'))) return dir;
  }

  return null;
}

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      shell: true,
      stdio: 'inherit',
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const frontendDir = resolveFrontendDir();

if (!frontendDir) {
  console.warn('[build] Skipping frontend build: frontend/ folder not found.');
  process.exit(0);
}

console.log('[build] Frontend directory:', frontendDir);

const lockPath = path.join(frontendDir, 'package-lock.json');
const hasLock = exists(lockPath);

const installArgs = hasLock ? ['ci'] : ['install'];
const installCode = await run('npm', installArgs, { cwd: frontendDir });
if (installCode !== 0) process.exit(installCode);

const buildCode = await run('npm', ['run', 'build'], { cwd: frontendDir });
process.exit(buildCode);
