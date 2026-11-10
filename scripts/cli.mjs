#!/usr/bin/env node
import { cp, mkdir, readdir, access, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createRelay } from './relay.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { positionals, values } = parseArgs({ allowPositionals: true, options: { target: { type: 'string' }, path: { type: 'string' }, port: { type: 'string', default: '4310' }, origin: { type: 'string', multiple: true } } });

try {
  const command = positionals[0];
  if (command === 'relay') {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
    const { isFloorEvent } = await import('../dist/protocol.js');
    const server = createRelay({ validate: isFloorEvent, ...(values.origin ? { origins: values.origin } : {}) });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Agent Floor relay: http://127.0.0.1:${port}/events\nOnly localhost is exposed. Press Ctrl+C to stop.`));
    const shutdown = () => { server.closeAllConnections(); server.close(); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else if (command === 'skill') {
    if (!['vscode', 'claude'].includes(values.target)) throw new Error('Choose --target vscode or --target claude.');
    const target = resolve(values.path ?? '.', values.target === 'claude' ? '.claude/skills/agent-floor-ui' : '.github/skills/agent-floor-ui');
    let exists = false;
    try { await access(target); exists = true; } catch {}
    if (exists) throw new Error(`Not overwriting existing skill: ${target}`);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(root, 'skills/agent-floor-ui'), target, { recursive: true, errorOnExist: true, force: false });
    console.log(`Installed workspace skill at ${target}`);
  } else if (command === 'init') {
    const target = resolve(positionals[1] ?? 'agent-floor-workspace');
    let entries = [];
    try { entries = await readdir(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (entries.length) throw new Error('Choose an empty destination directory. Existing files will not be overwritten.');
    await mkdir(target, { recursive: true });
    for (const entry of ['src', 'scripts', 'skills', 'tests', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.lib.config.ts', 'playwright.config.ts', 'README.md']) await cp(join(root, entry), join(target, entry), { recursive: true, errorOnExist: true, force: false });
    await writeFile(join(target, '.gitignore'), 'node_modules/\ndist/\ndist-demo/\n*.tgz\ntest-results/\n.DS_Store\n', { flag: 'wx' });
    console.log(`Template created at ${target}\nNext: cd "${target}" && npm install && npm run dev`);
  } else {
    console.log('Agent Floor UI\n\n  agent-floor-ui init [directory]\n  agent-floor-ui skill --target vscode|claude [--path project]\n  agent-floor-ui relay [--port 4310] [--origin http://127.0.0.1:5173]\n');
    if (command && command !== 'help') process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }