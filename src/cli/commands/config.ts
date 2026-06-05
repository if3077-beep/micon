/**
 * micon config — 管理配置
 *
 * 子命令：set-api-key, set-model, show
 */

import { Command } from 'commander';
import chalk from 'chalk';

import { ConfigStore } from '../../config/store.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createConfigCommand(): Command {
  const cmd = new Command('config');
  cmd.description('Manage Micon configuration');

  // --- set-api-key ---
  const setApiKeyCmd = new Command('set-api-key');
  setApiKeyCmd
    .description('Set LLM API key')
    .action(async () => {
      try {
        const { default: inquirer } = await import('inquirer');
        const store = new ConfigStore();
        const config = await store.load();

        const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
          {
            type: 'password',
            name: 'apiKey',
            message: `Enter your ${config.llm.provider} API key:`,
            mask: '*',
            validate: (input: string) => input.trim() ? true : 'API key is required',
          },
        ]);

        config.llm.apiKey = apiKey;
        await store.save(config);

        console.log(chalk.green('✅ API key saved successfully.'));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  // --- set-model ---
  const setModelCmd = new Command('set-model');
  setModelCmd
    .description('Set default LLM model')
    .argument('<model>', 'Model name (e.g., gpt-4o, gpt-4o-mini)')
    .action(async (model: string) => {
      try {
        const store = new ConfigStore();
        const config = await store.load();

        config.llm.model = model;
        await store.save(config);

        console.log(chalk.green(`✅ Default model set to: ${chalk.bold(model)}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  // --- show ---
  const showCmd = new Command('show');
  showCmd
    .description('Show current configuration')
    .action(async () => {
      try {
        const store = new ConfigStore();
        const config = await store.load();

        console.log(chalk.bold('\nMicon Configuration:\n'));
        console.log(`  Version:    ${config.version}`);
        console.log(`  Provider:   ${config.llm.provider}`);
        console.log(`  Model:      ${config.llm.model}`);
        console.log(`  API Key:    ${config.llm.apiKey ? chalk.green('configured') : chalk.red('not set')}`);
        console.log(`  Base URL:   ${config.llm.baseUrl ?? 'default'}`);

        const serverCount = Object.keys(config.mcpServers).length;
        const agentCount = Object.keys(config.agents).length;
        console.log(`  MCP Servers: ${serverCount} installed`);
        console.log(`  Agents:      ${agentCount} registered`);

        if (serverCount > 0) {
          console.log(chalk.dim('\n  Installed servers:'));
          for (const [name, entry] of Object.entries(config.mcpServers)) {
            console.log(chalk.dim(`    • ${name} (v${entry.manifest.version})`));
          }
        }

        if (agentCount > 0) {
          console.log(chalk.dim('\n  Registered agents:'));
          for (const [name, path] of Object.entries(config.agents)) {
            console.log(chalk.dim(`    • ${name} → ${path}`));
          }
        }

        console.log();
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  cmd
    .addCommand(setApiKeyCmd)
    .addCommand(setModelCmd)
    .addCommand(showCmd);

  return cmd;
}
