import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRelay } from '../scripts/relay.mjs';
import { isFloorEvent } from '../src/protocol.ts';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('local relay validates, broadcasts, replays snapshots and restricts origins', async () => {
  const server = createRelay({ validate: isFloorEvent });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/events`;
  const post = (body: unknown, origin?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  const controller = new AbortController();
  try {
    assert.equal((await post({ bad: true })).status, 400);
    assert.equal((await post({}, 'https://untrusted.example')).status, 403);
    const agent = { id: 'real', name: 'Real Agent', role: 'Builder', task: 'Testing', color: '#123456', status: 'working', zone: 'desks' };
    assert.equal((await post({ type: 'agent.upsert', agent })).status, 202);
    assert.equal((await post({ type: 'agent.move', id: 'real', zone: 'lab' })).status, 202);
    const stream = await fetch(url, { signal: controller.signal });
    const reader = stream.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /agent.upsert/);
    assert.match(first, /"zone":"lab"/);
    await post({ type: 'activity', id: 'real', message: 'Live event' });
    const next = new TextDecoder().decode((await reader.read()).value);
    assert.match(next, /Live event/);
    await reader.cancel();
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('template and both skill installers copy usable files and refuse overwrites', async () => {
  const destination = await mkdtemp(join(tmpdir(), 'agent-floor-install-'));
  const cli = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));
  const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: 'pipe' });
  try {
    run('skill', '--target', 'vscode', '--path', destination);
    run('skill', '--target', 'claude', '--path', destination);
    for (const host of ['.github', '.claude']) {
      const skill = await readFile(join(destination, host, 'skills/agent-floor-ui/SKILL.md'), 'utf8');
      assert.match(skill, /^---\nname: agent-floor-ui\ndescription:/);
      assert.match(await readFile(join(destination, host, 'skills/agent-floor-ui/events.md'), 'utf8'), /agent.upsert/);
    }
    assert.throws(() => run('skill', '--target', 'claude', '--path', destination), /Not overwriting/);
    run('init', join(destination, 'template'));
    assert.match(await readFile(join(destination, 'template/src/AgentFloor.tsx'), 'utf8'), /export function AgentFloor/);
    assert.throws(() => run('init', join(destination, 'template')), /empty destination/);
  } finally { await rm(destination, { recursive: true, force: true }); }
});