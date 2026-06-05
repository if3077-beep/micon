#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

import { createRunCommand } from './cli/commands/run.js';
import { createSearchCommand } from './cli/commands/search.js';
import { createAddCommand } from './cli/commands/add.js';
import { createListCommand } from './cli/commands/list.js';
import { createInitCommand } from './cli/commands/init.js';
import { createDevCommand } from './cli/commands/dev.js';
import { createLogCommand } from './cli/commands/log.js';
import { createConfigCommand } from './cli/commands/config.js';

import type { AgentDefinition, RunConfig } from './core/types.js';
import { AgentEngine } from './core/engine.js';
import { AgentStore } from './agent/store.js';
import { McpRegistry } from './mcp/registry.js';

// ---------------------------------------------------------------------------
// 默认 action：自然语言一键模式
// ---------------------------------------------------------------------------

/** 步骤类型 → emoji 前缀 */
const STEP_EMOJI: Record<string, string> = {
  tool_call: '🔍',
  llm_thinking: '🤖',
  constraint_check: '⚠️',
  dry_run: '🔍',
  tool_error: '❌',
  user_rejected: '🚫',
  final_answer: '✨',
};

function displaySteps(steps: Array<Record<string, unknown>>): void {
  for (const step of steps) {
    const emoji = STEP_EMOJI[step.type as string] ?? '•';
    const type = step.type as string;

    if (type === 'tool_call' || type === 'dry_run') {
      const toolName = (step.toolCall as Record<string, unknown>)?.name ?? 'unknown';
      const result = step.result ? String(step.result).slice(0, 120) : '';
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) +
          chalk.cyan(`[${toolName}]`) +
          (result ? chalk.dim(` → ${result}`) : ''),
      );
    } else if (type === 'llm_thinking') {
      const thinking = step.result ? String(step.result).slice(0, 100) : '';
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) +
          chalk.yellow('thinking') +
          (thinking ? chalk.dim(` — ${thinking}`) : ''),
      );
    } else if (type === 'constraint_check') {
      const reason = step.error ?? step.result ?? '';
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) +
          chalk.red(`constraint — ${reason}`),
      );
    } else if (type === 'final_answer') {
      // final answer 单独展示
    } else {
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) + `${type}`,
      );
    }
  }
}

/** 将执行结果追加到日志文件 */
async function appendLog(
  agentName: string,
  result: unknown,
): Promise<void> {
  const logsDir = join(homedir(), '.micon', 'logs');
  await mkdir(logsDir, { recursive: true });
  const logPath = join(logsDir, `${agentName}.jsonl`);
  const line = JSON.stringify(result) + '\n';
  await appendFile(logPath, line, 'utf-8');
}

/** 交互式询问用户是否保存为可复用 Agent */
async function askSaveAgent(instruction: string): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(chalk.cyan('\nSave as reusable agent? [Y/n] '), resolve);
  });
  rl.close();

  if (answer.toLowerCase() === 'n') return;

  const name = instruction.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
  const registry = new McpRegistry();
  const installed = await registry.list();

  const agent: AgentDefinition = {
    name,
    description: instruction,
    goal: instruction,
    tools: installed.map((s) => s.manifest.name),
    constraints: [],
    inputs: {},
    output: { format: 'text', to: 'stdout' },
  };

  const store = new AgentStore();
  await store.save(agent);
  console.log(chalk.green(`✅ Agent "${name}" saved to store.`));
}

/**
 * 一键自然语言模式
 *
 * 当用户直接输入 `micon "review PR #42"` 时触发。
 * 1. 获取所有已安装的 MCP Server
 * 2. 创建临时 AgentDefinition（goal = 指令，tools = 所有已安装 server）
 * 3. 通过 AgentEngine 运行
 * 4. 展示结果
 * 5. 询问是否保存为可复用 Agent
 */
async function runAdHoc(instruction: string): Promise<void> {
  // 1. 获取所有已安装的 MCP Server
  const registry = new McpRegistry();
  const installed = await registry.list();
  const toolNames = installed.map((s) => s.manifest.name);

  if (toolNames.length === 0) {
    console.log(
      chalk.yellow('⚠️  No MCP servers installed. Agent will run without tools.'),
      chalk.dim('\n   Install servers with: micon add <server>'),
    );
  }

  // 2. 创建临时 AgentDefinition
  const agent: AgentDefinition = {
    name: 'ad-hoc',
    description: instruction,
    goal: instruction,
    tools: toolNames,
    constraints: [],
    inputs: {},
    output: { format: 'text', to: 'stdout' },
  };

  // 3. 构建 RunConfig 并运行
  const runConfig: RunConfig = {
    agent,
    inputs: {},
    dryRun: false,
    interactive: false,
    maxSteps: 10,
    model: agent.model ?? 'gpt-4o',
  };

  const spinner = ora('Running agent...').start();

  try {
    const engine = new AgentEngine(runConfig);
    const result = await engine.run();

    spinner.stop();

    // 4. 展示结果
    const status = result.status as string;
    if (status === 'success') {
      console.log(chalk.green('\n✅ Agent completed successfully\n'));
    } else if (status === 'partial') {
      console.log(
        chalk.yellow('\n⚠️  Agent completed partially (max steps reached)\n'),
      );
    } else {
      console.log(chalk.red('\n❌ Agent failed'));
      if (result.error) {
        console.log(chalk.red(`   Error: ${result.error}`));
      }
      console.log();
    }

    // 展示步骤
    if (result.steps && Array.isArray(result.steps) && result.steps.length > 0) {
      console.log(chalk.bold('Steps:'));
      displaySteps(result.steps as unknown as Array<Record<string, unknown>>);
      console.log();
    }

    // 最终输出
    const output = result.output ?? '';
    if (output) {
      console.log(chalk.bold('Output:'));
      console.log(chalk.white(output));
      console.log();
    }

    // Token 用量
    if (result.tokenUsage) {
      const tu = result.tokenUsage;
      console.log(
        chalk.dim(
          `Token usage: ${tu.input} input, ${tu.output} output`,
        ),
      );
    }

    // 保存日志
    await appendLog(agent.name, result);

    // 5. 询问是否保存为可复用 Agent
    if (status === 'success') {
      await askSaveAgent(instruction);
    }
  } catch (err) {
    spinner.fail('Agent execution failed');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// CLI 程序定义
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('micon')
  .description('MCP Server Hub + Lightweight Agent Runtime')
  .version('0.1.0');

// 注册所有子命令
program.addCommand(createRunCommand());
program.addCommand(createSearchCommand());
program.addCommand(createAddCommand());
program.addCommand(createListCommand());
program.addCommand(createInitCommand());
program.addCommand(createDevCommand());
program.addCommand(createLogCommand());
program.addCommand(createConfigCommand());

// 默认 action：如果用户输入 `micon "some instruction"`，当作自然语言运行
program.action(async () => {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length > 0 && !rawArgs[0].startsWith('-')) {
    const instruction = rawArgs.join(' ');
    await runAdHoc(instruction);
  }
  // 如果没有参数也没有子命令，Commander 会自动显示帮助
});

program.parse();
