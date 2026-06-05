/**
 * micon agents — 列出已保存的 Agent
 *
 * 展示所有已保存的 Agent 定义：名称、描述和文件路径。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AgentStore } from '../../agent/store.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createAgentsCommand(): Command {
  const cmd = new Command('agents');
  cmd
    .description('List saved agent definitions')
    .action(async () => {
      const spinner = ora('Loading agents...').start();
      try {
        const store = new AgentStore();
        const agents = await store.list();
        spinner.stop();

        if (agents.length === 0) {
          console.log(chalk.yellow('No agents saved.'));
          console.log(chalk.dim('Create one with: micon init <name>'));
          return;
        }

        console.log(chalk.bold(`\nSaved Agents (${agents.length}):\n`));
        for (const agent of agents) {
          console.log(`  ${chalk.bold(agent.name)} ${chalk.dim(`→ ${agent.path}`)}`);
        }
        console.log();
      } catch (err) {
        spinner.fail('Failed to list agents');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });
  return cmd;
}
