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
import { collectInputs, displayResult } from '../../utils/format.js';
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
    .option('--model <model>', 'Override LLM model')
    .option('--max-steps <n>', 'Maximum ReAct loop steps')
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
        maxSteps: options.maxSteps ? parseInt(options.maxSteps, 10) : (agent.maxSteps ?? 10),
        model: options.model ?? agent.model ?? 'gpt-4o',
      };

      const runSpinner = ora('Running agent in dev mode...').start();

      try {
        const engine = new AgentEngine(runConfig);
        const result = await engine.run();

        runSpinner.stop();

        displayResult(result);

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
