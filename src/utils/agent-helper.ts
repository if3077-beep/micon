/**
 * Agent 辅助工具
 *
 * 提供可复用的 Agent 相关操作函数。
 */

import { createInterface } from 'node:readline';
import chalk from 'chalk';

import type { AgentDefinition } from '../core/types.js';
import { McpRegistry } from '../mcp/registry.js';
import { AgentStore } from '../agent/store.js';

/**
 * 交互式询问用户是否保存为可复用 Agent
 */
export async function askSaveAgent(target: string): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(chalk.cyan('\nSave as reusable agent? [Y/n] '), resolve);
  });
  rl.close();

  if (answer.toLowerCase() === 'n') return;

  const name = target.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
  const registry = new McpRegistry();
  const installed = await registry.list();

  const agent: AgentDefinition = {
    name,
    description: target,
    goal: target,
    tools: installed.map((s) => s.manifest.name),
    constraints: [],
    inputs: {},
    output: { format: 'text', to: 'stdout' },
  };

  const store = new AgentStore();
  await store.save(agent);
  console.log(chalk.green(`✅ Agent "${name}" saved to store.`));
}
