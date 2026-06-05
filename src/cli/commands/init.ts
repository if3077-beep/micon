/**
 * micon init — 创建新 Agent 定义文件
 *
 * 支持模板和交互式创建两种模式，生成 YAML 文件并保存到 AgentStore。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import yaml from 'js-yaml';

import type { AgentDefinition } from '../../core/types.js';
import { AgentStore } from '../../agent/store.js';
import { McpRegistry } from '../../mcp/registry.js';

// ---------------------------------------------------------------------------
// 预置模板
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, Partial<AgentDefinition>> = {
  reviewer: {
    description: 'Code review agent that analyzes pull requests',
    goal: 'Review code changes and provide constructive feedback on quality, security, and best practices',
    constraints: ['read-only', 'comment-only'],
    output: { format: 'markdown', to: 'stdout' },
  },
  writer: {
    description: 'Content writing agent that creates and edits documents',
    goal: 'Write high-quality content based on given requirements and context',
    constraints: [],
    output: { format: 'markdown', to: 'stdout' },
  },
  assistant: {
    description: 'General-purpose assistant agent',
    goal: 'Help the user accomplish tasks using available tools',
    constraints: [],
    output: { format: 'text', to: 'stdout' },
  },
};

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createInitCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Create a new agent definition file')
    .argument('<name>', 'Agent name')
    .option('-t, --template <template>', 'Use a template (reviewer|writer|assistant)')
    .action(async (name, options) => {
      try {
        let agent: AgentDefinition;

        if (options.template) {
          // 1. 使用模板
          const template = TEMPLATES[options.template as string];
          if (!template) {
            console.error(
              chalk.red(`Unknown template: "${options.template}"`),
              chalk.dim('\nAvailable templates: reviewer, writer, assistant'),
            );
            process.exit(1);
          }

          // 自动填入已安装的 MCP Server
          const registry = new McpRegistry();
          const installed = await registry.list();
          const tools = installed.map((s) => s.manifest.name);

          agent = {
            name,
            description: template.description ?? '',
            goal: template.goal ?? '',
            tools,
            constraints: template.constraints ?? [],
            inputs: {},
            output: template.output ?? { format: 'text', to: 'stdout' },
          };

          console.log(chalk.cyan(`Using template: ${options.template}`));
        } else {
          // 2. 交互式创建
          const { default: inquirer } = await import('inquirer');

          // 目标
          const { goal } = await inquirer.prompt<{ goal: string }>([
            {
              type: 'input',
              name: 'goal',
              message: 'What does your agent do?',
              validate: (input: string) => input.trim() ? true : 'Goal is required',
            },
          ]);

          // 选择 MCP Server
          const registry = new McpRegistry();
          const installed = await registry.list();
          const serverChoices = installed.map((s) => ({
            name: `${s.manifest.displayName} (${s.manifest.name})`,
            value: s.manifest.name,
          }));

          let tools: string[] = [];
          if (serverChoices.length > 0) {
            const { selectedTools } = await inquirer.prompt<{ selectedTools: string[] }>([
              {
                type: 'checkbox',
                name: 'selectedTools',
                message: 'Which MCP servers to use?',
                choices: serverChoices,
              },
            ]);
            tools = selectedTools;
          } else {
            console.log(chalk.dim('  No MCP servers installed yet. You can add tools later.'));
          }

          // 约束
          const { constraints } = await inquirer.prompt<{ constraints: string[] }>([
            {
              type: 'checkbox',
              name: 'constraints',
              message: 'Any constraints?',
              choices: [
                { name: 'Read-only', value: 'read-only' },
                { name: 'Comment-only', value: 'comment-only' },
                { name: 'No delete', value: 'no-delete' },
                { name: 'Custom (edit YAML after creation)', value: 'custom' },
              ],
            },
          ]);

          // 输出格式
          const { outputFormat } = await inquirer.prompt<{ outputFormat: string }>([
            {
              type: 'list',
              name: 'outputFormat',
              message: 'Output format?',
              choices: [
                { name: 'Markdown', value: 'markdown' },
                { name: 'JSON', value: 'json' },
                { name: 'Text', value: 'text' },
              ],
              default: 'text',
            },
          ]);

          agent = {
            name,
            description: goal,
            goal,
            tools,
            constraints: constraints.filter((c) => c !== 'custom'),
            inputs: {},
            output: { format: outputFormat as 'markdown' | 'json' | 'text', to: 'stdout' },
          };
        }

        // 3. 生成 YAML 并写入文件
        const yamlContent = yaml.dump(agent as unknown as Record<string, unknown>, {
          lineWidth: 120,
          noRefs: true,
        });

        const { writeFile } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        const filePath = resolve(`${name}.yaml`);
        await writeFile(filePath, yamlContent, 'utf-8');

        console.log(chalk.green(`\n✅ Agent definition created: ${chalk.bold(filePath)}`));

        // 4. 保存到 AgentStore
        const store = new AgentStore();
        await store.save(agent);

        console.log(chalk.dim(`   Also saved to AgentStore as "${name}".`));
        console.log(chalk.dim(`   Edit the YAML file to customize, then run: micon run ${name}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
