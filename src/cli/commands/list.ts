/**
 * micon list — 列出已安装的 MCP Server
 *
 * 展示所有已安装 Server 的名称、版本、权限、能力和配置状态。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import { McpRegistry } from '../../mcp/registry.js';
import type { InstalledMcpServer } from '../../core/types.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List installed MCP servers and their capabilities')
    .action(async () => {
      const spinner = ora('Loading installed servers...').start();

      try {
        const registry = new McpRegistry();
        const servers = await registry.list();

        spinner.stop();

        if (servers.length === 0) {
          console.log(
            chalk.yellow('No MCP servers installed.'),
            chalk.dim('\nInstall one with: micon add <server>'),
          );
          return;
        }

        console.log(chalk.bold(`\nInstalled MCP Servers (${servers.length}):\n`));

        for (const entry of servers) {
          const m = entry.manifest;

          // 检查配置状态
          const requiredFields = m.config.filter((f) => f.required);
          const missingConfig = requiredFields.filter((f) => !entry.config[f.name]);
          const configStatus = missingConfig.length > 0
            ? chalk.yellow('⚠️  needs config')
            : chalk.green('✅ configured');

          console.log(chalk.bold(`  ${m.displayName}`) + chalk.dim(` (${m.name})`));
          console.log(`  Version: ${m.version}  ${configStatus}`);

          // 已授权权限
          if (entry.grantedPermissions.length > 0) {
            console.log(
              `  Permissions: ${entry.grantedPermissions.map((p) => chalk.cyan(p)).join(', ')}`,
            );
          }

          // 能力列表
          if (m.capabilities.length > 0) {
            const caps = m.capabilities.map((c) => chalk.green(c.name)).join(', ');
            console.log(`  Capabilities: ${caps}`);
          }

          // 缺失配置提示
          if (missingConfig.length > 0) {
            const missing = missingConfig.map((f) => chalk.yellow(f.name)).join(', ');
            console.log(`  Missing config: ${missing}`);
          }

          console.log();
        }
      } catch (err) {
        spinner.fail('Failed to list servers');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
