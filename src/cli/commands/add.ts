/**
 * micon add — 安装 MCP Server
 *
 * 从 Hub 安装 MCP Server，支持交互式权限授权。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import { HubSearch } from '../../hub/search.js';
import { McpRegistry } from '../../mcp/registry.js';
import { AuthManager } from '../../config/auth.js';

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createAddCommand(): Command {
  const cmd = new Command('add');
  cmd
    .description('Install an MCP server from the Hub')
    .argument('<server>', 'MCP server name (e.g., @anthropic/github-mcp)')
    .option('-y, --yes', 'Accept default permissions without prompting')
    .action(async (serverName, options) => {
      const spinner = ora(`Searching for "${serverName}"...`).start();

      try {
        const hub = new HubSearch();

        // 1. 精确匹配搜索
        const exactMatch = await hub.getByExactName(serverName);

        if (!exactMatch) {
          // 2. 未找到，建议相似 Server
          const similar = await hub.search(serverName, { limit: 5 });
          spinner.fail(`Server "${serverName}" not found in Hub.`);

          if (similar.length > 0) {
            console.log(chalk.yellow('\nDid you mean one of these?'));
            for (const s of similar) {
              console.log(`  • ${chalk.bold(s.manifest.name)} — ${s.manifest.description.slice(0, 60)}`);
            }
          }
          return;
        }

        const manifest = exactMatch.manifest;
        spinner.succeed(`Found: ${chalk.bold(manifest.displayName)} (${manifest.name})`);

        // 3. 展示 Server 信息
        console.log();
        console.log(chalk.bold('  Description: ') + manifest.description);
        console.log(chalk.bold('  Version:     ') + manifest.version);
        console.log(chalk.bold('  Category:    ') + manifest.category);

        if (manifest.permissions.length > 0) {
          console.log(chalk.bold('  Permissions:'));
          for (const p of manifest.permissions) {
            const defaultLabel = p.default === 'allow'
              ? chalk.green(' [allow]')
              : p.default === 'deny'
                ? chalk.red(' [deny]')
                : chalk.yellow(' [ask]');
            console.log(`    • ${p.name}${defaultLabel} — ${p.description}`);
          }
        }

        if (manifest.capabilities.length > 0) {
          console.log(chalk.bold('  Capabilities:'));
          for (const c of manifest.capabilities) {
            console.log(`    • ${chalk.cyan(c.name)} — ${c.description}`);
          }
        }

        console.log();

        // 4. 权限授权
        let granted: string[];
        let config: Record<string, string>;

        if (options.yes) {
          // 5. --yes 模式：使用默认权限
          granted = manifest.permissions
            .filter((p) => p.default === 'allow')
            .map((p) => p.name);
          config = {};
          for (const field of manifest.config) {
            if (field.default !== undefined) {
              config[field.name] = field.default;
            }
          }
          console.log(chalk.dim('Using default permissions (--yes mode).'));
        } else {
          // 交互式授权
          const auth = new AuthManager();
          const authResult = await auth.authorizeInstall(manifest);
          granted = authResult.granted;
          config = authResult.config;
        }

        // 6. 安装
        const installSpinner = ora('Installing...').start();
        const registry = new McpRegistry();

        try {
          await registry.install(manifest, granted, config);
          installSpinner.succeed(chalk.green(`✅ ${manifest.displayName} installed successfully!`));
        } catch (err) {
          if (err instanceof Error && err.message.includes('already installed')) {
            installSpinner.warn(chalk.yellow(`${manifest.displayName} is already installed.`));
          } else {
            throw err;
          }
        }

        // 7. 展示可用能力
        if (manifest.capabilities.length > 0) {
          console.log(chalk.bold('\nAvailable capabilities:'));
          for (const c of manifest.capabilities) {
            console.log(`  ${chalk.green('✔')} ${c.name} — ${c.description}`);
          }
        }

        // 8. 提醒配置 Token
        const requiredFields = manifest.config.filter((f) => f.required);
        if (requiredFields.length > 0) {
          const missing = requiredFields.filter((f) => !config[f.name]);
          if (missing.length > 0) {
            console.log(
              chalk.yellow('\n⚠️  Remember to configure required tokens:'),
            );
            for (const f of missing) {
              console.log(`  • ${f.name}: ${f.description}`);
            }
          }
        }
      } catch (err) {
        spinner.fail('Installation failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
