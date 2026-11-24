import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// Build @atlas/shared before starting watchers so @atlas/api and @atlas/web never race.
const build = spawnSync(pnpmCmd, ['--filter', '@atlas/shared', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const children = [
  spawn(pnpmCmd, ['--filter', '@atlas/api', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
  spawn(pnpmCmd, ['--filter', '@atlas/web', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];

let exiting = false;

function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!exiting && code && code !== 0) {
      shutdown(code);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
