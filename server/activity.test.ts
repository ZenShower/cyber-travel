import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityRegistry } from './activity.js';
import { consumeAgentEvents, eventMessage } from './agentStream.js';
import type { ThreadEvent } from '@openai/codex-sdk';

test('concurrent photo and planning tasks stay independent, and completion ignores late signals', () => {
  let now = 1000;
  const changes: string[] = [];
  const registry = new ActivityRegistry(id => changes.push(id), [], () => now);
  const plan = registry.start('trip', 'plan', '规划');
  const photo = registry.start('trip', 'photo', '照片', { photoId: 'p1' });
  now += 1000; plan.report('查资料'); photo.report('生图');
  assert.deepEqual(registry.snapshot('trip').tasks.map(item => item.message), ['查资料', '生图']);
  plan.finish('completed', '路线已保存');
  plan.report('late signal'); plan.finish('failed', 'late error');
  assert.deepEqual(registry.snapshot('trip').tasks.map(item => item.status), ['completed', 'running']);
  assert.equal(registry.snapshot('other').tasks.length, 0);
  assert.ok(changes.length > 4);
});

test('restart marks a persisted running task interrupted instead of pretending it is live', () => {
  const first = new ActivityRegistry();
  first.start('trip', 'book', '相册');
  const restored = new ActivityRegistry(undefined, first.all(), () => 5000);
  assert.equal(restored.snapshot('trip').tasks[0].status, 'interrupted');
  assert.equal(restored.snapshot('trip').tasks[0].finishedAt, 5000);
});

async function* events(...items: ThreadEvent[]) { for (const item of items) yield item; }
const done: ThreadEvent = { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, reasoning_output_tokens: 0 } };
test('stream exposes operational signals before final JSON without leaking reasoning or tool arguments', async () => {
  const visible: string[] = [];
  const output = await consumeAgentEvents(events(
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'PRIVATE REASONING' } },
    { type: 'item.started', item: { id: 'm', type: 'mcp_tool_call', server: 'image_gen', tool: 'imagegen', arguments: { secret: 'PRIVATE INPUT' }, status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: '{"ok":true}' } }, done,
  ), message => visible.push(message));
  assert.equal(output, '{"ok":true}');
  assert.ok(visible.some(message => message.includes('生图')));
  assert.ok(!visible.join().includes('PRIVATE'));
  assert.ok(!visible.join().includes('{"ok"'));
  assert.equal(eventMessage({ type: 'item.started', item: { id: 'c', type: 'command_execution', command: 'secret command', aggregated_output: 'private output', status: 'in_progress' } }), '正在检查资料与本地素材');
});

test('a failed or truncated stream cannot be reported as completed', async () => {
  await assert.rejects(consumeAgentEvents(events({ type: 'turn.failed', error: { message: 'timeout' } })), /timeout/);
  await assert.rejects(consumeAgentEvents(events({ type: 'turn.started' })), /没有收到完成确认/);
});

test('recoverable error event waits for a terminal outcome', async () => {
  const messages: string[] = [];
  await consumeAgentEvents(events({ type: 'error', message: 'reconnecting' }, done), text => messages.push(text));
  assert.ok(messages[0].includes('等待恢复'));
});
