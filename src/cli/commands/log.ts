/**
 * micon log — 查看 Agent 执行历史
 *
 * 从 ~/.micon/logs/ 读取 JSONL 日志文件，展示执行历史。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 解析时间周期字符串为毫秒 */
function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)([hdwm])$/);
  if (!match) {
    throw new Error(`Invalid period format: "${period}". Use e.g., 7d, 24h, 1w, 1m`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 0);
}

/** 状态 → emoji */
function statusEmoji(status: string): string {
  switch (status) {
    case 'success': return '✅';
    case 'error':   return '❌';
    case 'partial': return '⚠️';
    default:        return '•';
  }
}

/** 格式化时长 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createLogCommand(): Command {
  const cmd = new Command('log');
  cmd
    .description('View agent execution history')
    .argument('[agent]', 'Agent name (omit for all)')
    .option('-l, --limit <n>', 'Number of recent runs', '10')
    .option('--last <period>', 'Time period (e.g., 7d, 24h)')
    .action(async (agent, options) => {
      const limit = parseInt(options.limit, 10) || 10;
      const logsDir = join(homedir(), '.micon', 'logs');

      if (!existsSync(logsDir)) {
        console.log(chalk.yellow('No execution logs found.'));
        console.log(chalk.dim('Run an agent first: micon run <agent>'));
        return;
      }

      const spinner = ora('Loading logs...').start();

      try {
        let timeCutoff = 0;
        if (options.last) {
          const periodMs = parsePeriod(options.last as string);
          timeCutoff = Date.now() - periodMs;
        }

        if (agent) {
          // 查看指定 Agent 的日志
          const logPath = join(logsDir, `${agent}.jsonl`);
          if (!existsSync(logPath)) {
            spinner.warn(chalk.yellow(`No logs found for agent "${agent}".`));
            return;
          }

          const content = await readFile(logPath, 'utf-8');
          const lines = content.trim().split('\n').filter(Boolean);
          let entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);

          // 时间过滤
          if (timeCutoff > 0) {
            entries = entries.filter((e) => {
              const t = new Date(e.startTime as string).getTime();
              return t >= timeCutoff;
            });
          }

          // 最近的排在后面（按时间升序），取最后 N 条
          entries = entries.slice(-limit);

          spinner.stop();

          if (entries.length === 0) {
            console.log(chalk.yellow(`No log entries found for agent "${agent}".`));
            return;
          }

          console.log(chalk.bold(`\nExecution history for "${agent}" (${entries.length} runs):\n`));

          for (const entry of entries) {
            const status = entry.status as string;
            const emoji = statusEmoji(status);
            // ExecutionResult 没有 duration 字段，从 startTime/endTime 计算
            const startMs = entry.startTime ? new Date(entry.startTime as string).getTime() : 0;
            const endMs = entry.endTime ? new Date(entry.endTime as string).getTime() : 0;
            const duration = (startMs && endMs)
              ? formatDuration(endMs - startMs)
              : '?';
            const startTime = entry.startTime
              ? new Date(entry.startTime as string).toLocaleString()
              : 'unknown';

            const steps = entry.steps as Array<Record<string, unknown>> | undefined;
            const stepCount = steps?.length ?? 0;

            const tu = entry.tokenUsage as { input?: number; output?: number } | undefined;
            const tokenInfo = tu
              ? `${(tu.input ?? 0) + (tu.output ?? 0)} tokens`
              : '';

            console.log(
              `  ${emoji} ${chalk.dim(startTime)}  ` +
              chalk.bold(`${status}`) +
              chalk.dim(`  ${duration}`) +
              (tokenInfo ? chalk.dim(`  ${tokenInfo}`) : '') +
              chalk.dim(`  ${stepCount} steps`),
            );

            // 步骤摘要
            if (steps && steps.length > 0) {
              const toolCalls = steps.filter((s) => s.type === 'tool_call');
              if (toolCalls.length > 0) {
                const toolNames = toolCalls.map((s) => {
                  return (s.toolName as string) ?? '?';
                });
                console.log(chalk.dim(`     Tools: ${toolNames.join(' → ')}`));
              }
            }

            // 错误信息
            if (entry.error) {
              console.log(chalk.red(`     Error: ${entry.error}`));
            }

            console.log();
          }
        } else {
          // 查看所有 Agent 的日志摘要
          const files = await readdir(logsDir);
          const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

          if (jsonlFiles.length === 0) {
            spinner.warn(chalk.yellow('No log files found.'));
            return;
          }

          const summaries: Array<{
            agentName: string;
            totalRuns: number;
            successCount: number;
            errorCount: number;
            lastRun: string;
          }> = [];

          for (const file of jsonlFiles) {
            const content = await readFile(join(logsDir, file), 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            let entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);

            if (timeCutoff > 0) {
              entries = entries.filter((e) => {
                const t = new Date(e.startTime as string).getTime();
                return t >= timeCutoff;
              });
            }

            if (entries.length === 0) continue;

            const agentName = file.replace('.jsonl', '');
            const successCount = entries.filter((e) => e.status === 'success').length;
            const errorCount = entries.filter((e) => e.status === 'error').length;
            const lastEntry = entries[entries.length - 1];
            const lastRun = lastEntry.startTime
              ? new Date(lastEntry.startTime as string).toLocaleString()
              : 'unknown';

            summaries.push({
              agentName,
              totalRuns: entries.length,
              successCount,
              errorCount,
              lastRun,
            });
          }

          spinner.stop();

          if (summaries.length === 0) {
            console.log(chalk.yellow('No log entries found for the specified period.'));
            return;
          }

          console.log(chalk.bold(`\nExecution summary across all agents:\n`));

          for (const s of summaries) {
            console.log(
              `  ${chalk.bold(s.agentName)}  ` +
              chalk.dim(`${s.totalRuns} runs`) +
              chalk.green(`  ✅ ${s.successCount}`) +
              (s.errorCount > 0 ? chalk.red(`  ❌ ${s.errorCount}`) : '') +
              chalk.dim(`  Last: ${s.lastRun}`),
            );
          }

          console.log();
        }
      } catch (err) {
        spinner.fail('Failed to load logs');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
