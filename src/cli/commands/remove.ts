/**
 * micon remove — 卸载 MCP Server
 *
 * 从已安装列表中移除指定的 MCP Server。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { McpRegistry } from '../../mcp/registry.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createRemoveCommand(): Command {
  const cmd = new Command('remove');
  cmd
    .description('Uninstall an MCP server')
    .argument('<server>', 'MCP server name to uninstall')
    .action(async (serverName) => {
      const spinner = ora(`Removing "${serverName}"...`).start();
      try {
        const registry = new McpRegistry();
        await registry.uninstall(serverName);
        spinner.succeed(chalk.green(`✅ ${serverName} uninstalled successfully.`));
      } catch (err) {
        spinner.fail('Uninstall failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });
  return cmd;
}
