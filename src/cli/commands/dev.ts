/**
 * micon dev — 交互式开发模式运行 Agent
 *
 * 与 run 类似，但启用交互模式：每步工具调用前需用户确认，
 * 展示 LLM 思考过程，允许跳过、修改参数或中止。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import type { AgentDefinition, RunConfig } from '../../core/types.js';
import { AgentEngine } from '../../core/engine.js';
import { AgentStore } from '../../agent/store.js';
import { loadAgent } from '../../agent/loader.js';
import { collectInputs, displaySteps } from '../../utils/format.js';
import { appendLog } from '../../utils/log-writer.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createDevCommand(): Command {
  const cmd = new Command('dev');
  cmd
    .description('Run an agent in interactive development mode')
    .argument('<agent>', 'Agent name or file path')
    .option('-i, --input <key=value>', 'Input parameter', collectInputs, {})
    .action(async (agentTarget, options) => {
      const spinner = ora('Loading agent...').start();
      let agent: AgentDefinition;

      try {
        if (agentTarget.endsWith('.yaml') || agentTarget.endsWith('.yml')) {
          agent = await loadAgent(agentTarget);
        } else {
          const store = new AgentStore();
          agent = await store.load(agentTarget);
        }
        spinner.succeed(`Loaded agent: ${chalk.bold(agent.name)} (dev mode)`);
      } catch (err) {
        spinner.fail('Failed to load agent');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      console.log(chalk.cyan('\n🔧 Interactive development mode'));
      console.log(chalk.dim('   Before each tool call, you can: approve, skip, modify args, or abort\n'));

      const inputs = { ...(options.input as Record<string, unknown>) };

      const runConfig: RunConfig = {
        agent,
        inputs,
        dryRun: false,
        interactive: true,
        maxSteps: agent.maxSteps ?? 10,
        model: agent.model ?? 'gpt-4o',
      };

      const runSpinner = ora('Running agent in dev mode...').start();

      try {
        const engine = new AgentEngine(runConfig);
        const result = await engine.run();

        runSpinner.stop();

        const status = result.status as string;
        if (status === 'success') {
          console.log(chalk.green('\n✅ Agent completed successfully\n'));
        } else if (status === 'partial') {
          console.log(chalk.yellow('\n⚠️  Agent completed partially (max steps reached)\n'));
        } else {
          console.log(chalk.red('\n❌ Agent failed\n'));
        }

        // 展示步骤详情
        if (result.steps && result.steps.length > 0) {
          console.log(chalk.bold('Execution steps:'));
          displaySteps(result.steps);
          console.log();
        }

        // 最终输出（兼容 engine 实际返回的 result 字段和类型定义的 output 字段）
        const output = result.output ?? '';
        if (output) {
          console.log(chalk.bold('Output:'));
          console.log(chalk.white(String(output)));
          console.log();
        }

        // Token 用量
        if (result.tokenUsage) {
          const tu = result.tokenUsage as { input?: number; output?: number };
          console.log(
            chalk.dim(`Token usage: ${tu.input ?? 0} input, ${tu.output ?? 0} output`),
          );
        }

        // 保存日志
        await appendLog(agent.name, result);
      } catch (err) {
        runSpinner.fail('Dev mode execution failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
