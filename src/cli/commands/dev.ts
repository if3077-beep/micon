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

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 收集 --input key=value 参数 */
function collectInputs(
  value: string,
  previous: Record<string, unknown>,
): Record<string, unknown> {
  const eqIndex = value.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid input format: "${value}". Expected key=value`);
  }
  const key = value.slice(0, eqIndex);
  const raw = value.slice(eqIndex + 1);

  let parsed: unknown = raw;
  if (raw === 'true') parsed = true;
  else if (raw === 'false') parsed = false;
  else if (/^\d+$/.test(raw)) parsed = Number(raw);

  return { ...previous, [key]: parsed };
}

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
        if (result.steps && Array.isArray(result.steps) && result.steps.length > 0) {
          console.log(chalk.bold('Execution steps:'));
          for (const step of result.steps as unknown as Array<Record<string, unknown>>) {
            const type = step.type as string;
            const emoji = type === 'tool_call' ? '🔍'
              : type === 'llm_thinking' ? '🤖'
              : type === 'constraint_check' ? '⚠️'
              : type === 'user_rejected' ? '🚫'
              : type === 'final_answer' ? '✨'
              : '•';

            if (type === 'tool_call') {
              const toolName = (step.toolCall as Record<string, unknown>)?.name ?? 'unknown';
              console.log(
                `  ${emoji} Step ${step.stepNumber ?? '?'}: ${chalk.cyan(`[${toolName}]`)}`,
              );
              if (step.result) {
                console.log(chalk.dim(`     Result: ${String(step.result).slice(0, 150)}`));
              }
            } else if (type === 'llm_thinking') {
              console.log(
                `  ${emoji} Step ${step.stepNumber ?? '?'}: ${chalk.yellow('thinking')}`,
              );
              if (step.result) {
                console.log(chalk.dim(`     ${String(step.result).slice(0, 150)}`));
              }
            } else if (type === 'constraint_check') {
              console.log(
                `  ${emoji} Step ${step.stepNumber ?? '?'}: ${chalk.red(`constraint — ${step.error ?? step.result ?? ''}`)}`,
              );
            } else if (type === 'user_rejected') {
              console.log(
                `  ${emoji} Step ${step.stepNumber ?? '?'}: ${chalk.red('user rejected tool call')}`,
              );
            }
          }
          console.log();
        }

        // 最终输出（兼容 engine 实际返回的 result 字段和类型定义的 output 字段）
        const output = (result as unknown as Record<string, unknown>).result ?? (result as unknown as Record<string, unknown>).output ?? '';
        if (output) {
          console.log(chalk.bold('Output:'));
          console.log(chalk.white(String(output)));
          console.log();
        }

        // Token 用量
        if (result.tokenUsage) {
          const tu = result.tokenUsage as { inputTokens?: number; outputTokens?: number };
          console.log(
            chalk.dim(`Token usage: ${tu.inputTokens ?? 0} input, ${tu.outputTokens ?? 0} output`),
          );
        }
      } catch (err) {
        runSpinner.fail('Dev mode execution failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
