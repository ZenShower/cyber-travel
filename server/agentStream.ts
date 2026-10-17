import type { ThreadEvent } from '@openai/codex-sdk';
import type { ProgressReporter } from '../src/activityTypes.js';

// Only operational signals leave the bridge. Never publish reasoning text, tool
// arguments/results, shell commands, or the structured JSON being assembled.
export function eventMessage(event: ThreadEvent): string | null {
  if (event.type === 'thread.started') return '已连接 Codex，正在接收任务';
  if (event.type === 'turn.started') return 'Codex 已开始处理';
  if (event.type === 'turn.completed') return '已收到结果，正在检查与保存';
  if (!('item' in event)) return null;
  const item = event.item;
  const done = event.type === 'item.completed';
  switch (item.type) {
    case 'reasoning': return '正在规划与推敲';
    case 'web_search': return done ? '已查阅一组地点资料' : '正在查找地点、活动与交通资料';
    case 'command_execution': return item.status === 'failed' ? '一次工具执行未成功，等待后续处理' : done ? '已完成一次资料或文件检查' : '正在检查资料与本地素材';
    case 'mcp_tool_call': {
      const image = /image|imagegen|generate_image/i.test(`${item.server} ${item.tool}`);
      return item.status === 'failed' ? '一次工具调用未成功，等待后续处理' : image ? done ? '生图工具已返回，正在整理照片' : '正在调用生图工具，照片需要一些时间' : done ? '已完成一次工具调用' : '正在调用工具核实与处理资料';
    }
    case 'agent_message': return '正在整理本次结果';
    case 'todo_list': return '正在更新执行步骤';
    case 'file_change': return '正在整理产出文件';
    default: return null;
  }
}

export async function consumeAgentEvents(events: AsyncIterable<ThreadEvent>, report?: ProgressReporter): Promise<string> {
  let finalResponse = '';
  let completed = false;
  for await (const event of events) {
    if (event.type === 'turn.failed') throw new Error(event.error.message);
    // SDK error events can describe a recoverable reconnect; the final lifecycle
    // event decides success. Preserve its activity without promising recovery.
    if (event.type === 'error') report?.('Codex 报告连接或执行异常，正在等待恢复');
    const message = eventMessage(event);
    if (message) report?.(message);
    if (event.type === 'item.completed' && event.item.type === 'agent_message') finalResponse = event.item.text;
    if (event.type === 'turn.completed') completed = true;
  }
  if (!completed) throw new Error('Codex 事件流已关闭，但没有收到完成确认');
  return finalResponse;
}
