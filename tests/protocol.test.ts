import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFloorStore, isFloorEvent } from '../src/protocol.ts';

const agent = { id: 'one', name: 'Atlas', role: 'Builder', color: '#ef8855', status: 'working', task: 'Building', zone: 'desks' };

test('upsert, move, remove and subscriptions share one event path', () => {
  const store = createFloorStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  assert.equal(store.dispatch({ type: 'agent.upsert', agent }), true);
  store.dispatch({ type: 'agent.upsert', agent: { ...agent, id: 'two' } });
  store.dispatch({ type: 'agent.upsert', agent: { ...agent, task: 'Testing' } });
  assert.deepEqual(store.getSnapshot().agents.map(agent => agent.id), ['one', 'two']);
  store.dispatch({ type: 'agent.move', id: 'one', zone: 'lab' });
  assert.equal(store.getSnapshot().agents[0].zone, 'lab');
  store.dispatch({ type: 'agent.remove', id: 'one' });
  assert.equal(store.getSnapshot().agents.length, 1);
  assert.equal(notifications, 5);
  unsubscribe();
  store.dispatch({ type: 'activity', id: 'one', message: 'Done' });
  assert.equal(notifications, 5);
});

test('rejects invalid external payloads without changing state', () => {
  const store = createFloorStore();
  for (const payload of [null, {}, { type: 'agent.move', id: 'one', zone: 'roof' }, { type: 'agent.upsert', agent: { ...agent, color: 'red' } }]) {
    assert.equal(isFloorEvent(payload), false);
    assert.equal(store.dispatch(payload), false);
  }
  assert.equal(store.getSnapshot().revision, 0);
});

test('keeps a bounded activity history', () => {
  const store = createFloorStore();
  for (let index = 0; index < 70; index++) store.dispatch({ type: 'activity', id: 'one', message: `Event ${index}` });
  assert.equal(store.getSnapshot().activities.length, 60);
  assert.equal(store.getSnapshot().activities[0].message, 'Event 69');
});

test('switching data sources clears agents and simulated activity together', () => {
  const store = createFloorStore();
  store.dispatch({ type: 'agent.upsert', agent });
  store.dispatch({ type: 'activity', id: 'one', message: 'Demo event' });
  store.reset();
  assert.deepEqual(store.getSnapshot(), { agents: [], activities: [], revision: 0 });
});

test('optional floor, progress and avatar fields are validated and moves can change floors', () => {
  const rich = { ...agent, floor: 'loft', progress: 42, avatar: { hairStyle: 'hood', accessory: 'glasses', skin: '#f2c6a0', hair: '#3fb8b0' } };
  const store = createFloorStore();
  assert.equal(store.dispatch({ type: 'agent.upsert', agent: rich }), true);
  assert.equal(store.dispatch({ type: 'agent.move', id: 'one', zone: 'lab', floor: 'main' }), true);
  assert.deepEqual([store.getSnapshot().agents[0].zone, store.getSnapshot().agents[0].floor], ['lab', 'main']);
  store.dispatch({ type: 'agent.move', id: 'one', zone: 'desks' });
  assert.equal(store.getSnapshot().agents[0].floor, 'main');
  for (const invalid of [{ progress: 101 }, { progress: '50' }, { floor: '../roof' }, { avatar: { hairStyle: 'mohawk' } }, { avatar: { skin: 'pink' } }, { avatar: [] }]) {
    assert.equal(isFloorEvent({ type: 'agent.upsert', agent: { ...agent, ...invalid } }), false, JSON.stringify(invalid));
  }
  assert.equal(isFloorEvent({ type: 'agent.move', id: 'one', zone: 'lab', floor: 'has spaces' }), false);
});