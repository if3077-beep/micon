/**
 * micon run — 运行 Agent
 *
 * 支持按名称、YAML 文件路径或自然语言指令运行 Agent。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import type { AgentDefinition, RunConfig } from '../../core/types.js';
import { AgentEngine } from '../../core/engine.js';
import { AgentStore } from '../../agent/store.js';
import { loadAgent } from '../../agent/loader.js';
import { McpRegistry } from '../../mcp/registry.js';
import { collectInputs, displayResult } from '../../utils/format.js';
import { appendLog } from '../../utils/log-writer.js';
import { askSaveAgent } from '../../utils/agent-helper.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createRunCommand(): Command {
  const cmd = new Command('run');
  cmd
    .description('Run an agent by name, file path, or natural language instruction')
    .argument('[target]', 'Agent name, YAML file path, or natural language instruction')
    .option('-i, --input <key=value>', 'Input parameter (repeatable)', collectInputs, {})
    .option('-d, --dry-run', 'Preview actions without executing', false)
    .option('--model <model>', 'Override LLM model')
    .option('--max-steps <n>', 'Maximum ReAct loop steps')
    .action(async (target, options) => {
      // 1. 未提供 target 时显示帮助
      if (!target) {
        cmd.help();
        return;
      }

      const spinner = ora('Loading agent...').start();
      let agent: AgentDefinition;
      let isAdHoc = false;

      try {
        // 2. YAML 文件路径
        if (target.endsWith('.yaml') || target.endsWith('.yml')) {
          agent = await loadAgent(target);
          spinner.succeed(`Loaded agent from file: ${target}`);
        }
        // 3. 已保存的 Agent 名称
        else {
          const store = new AgentStore();
          if (await store.exists(target)) {
            agent = await store.load(target);
            spinner.succeed(`Loaded agent: ${chalk.bold(agent.name)}`);
          }
          // 4. 自然语言指令
          else {
            isAdHoc = true;
            agent = {
              name: 'ad-hoc',
              description: target,
              goal: target,
              tools: [],
              constraints: [],
              inputs: {},
              output: { format: 'text', to: 'stdout' },
            };
            spinner.succeed(`Running natural language instruction`);
          }
        }
      } catch (err) {
        spinner.fail('Failed to load agent');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      // 5. 自然语言模式下自动发现所有已安装的 MCP Server
      if (isAdHoc && agent.tools.length === 0) {
        const registry = new McpRegistry();
        const installed = await registry.list();
        agent.tools = installed.map((s) => s.manifest.name);

        if (agent.tools.length === 0) {
          console.log(
            chalk.yellow('\n⚠️  No MCP servers installed. Agent will run without tools.'),
            chalk.dim('\n   Install servers with: micon add <server>'),
          );
        }
      }

      // 6. 合并 CLI 输入
      const inputs = { ...(options.input as Record<string, unknown>) };

      // 7. 构建 RunConfig 并执行
      const runConfig: RunConfig = {
        agent,
        inputs,
        dryRun: options.dryRun ?? false,
        interactive: false,
        maxSteps: options.maxSteps ? parseInt(options.maxSteps, 10) : (agent.maxSteps ?? 10),
        model: options.model ?? agent.model ?? 'gpt-4o',
      };

      const runSpinner = ora('Running agent...').start();

      try {
        const engine = new AgentEngine(runConfig);
        const result = await engine.run();

        runSpinner.stop();

        // 8. 展示结果
        displayResult(result);

        // 9. 保存日志
        await appendLog(agent.name, result);

        // 非 success 状态设置非零退出码
        if (result.status === 'error') {
          process.exit(1);
        }

        // 10. 自然语言模式下询问是否保存
        if (isAdHoc && result.status === 'success') {
          await askSaveAgent(target);
        }
      } catch (err) {
        runSpinner.fail('Agent execution failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
