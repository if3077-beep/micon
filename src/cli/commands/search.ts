/**
 * micon search — 搜索 MCP Server Hub
 *
 * 在 Hub 中搜索 MCP Server，展示格式化结果表格。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import type { HubSearchResult, HubGrade } from '../../core/types.js';
import { HubSearch } from '../../hub/search.js';

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 等级 → 颜色 */
function gradeColor(grade: HubGrade): string {
  switch (grade) {
    case 'A': return chalk.green.bold(grade);
    case 'B': return chalk.blue.bold(grade);
    case 'C': return chalk.yellow.bold(grade);
    case 'D': return chalk.hex('#FF8C00').bold(grade);
    case 'F': return chalk.red.bold(grade);
    default:  return grade;
  }
}

/** 截断字符串 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** 格式化日期为相对时间 */
function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));

  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

export function createSearchCommand(): Command {
  const cmd = new Command('search');
  cmd
    .description('Search for MCP servers in the Hub')
    .argument('<query>', 'Search keyword')
    .option('-l, --limit <n>', 'Max results', '10')
    .option('-c, --category <cat>', 'Filter by category')
    .action(async (query, options) => {
      const limit = parseInt(options.limit, 10) || 10;
      const category = options.category as string | undefined;

      const spinner = ora('Searching Hub...').start();

      try {
        const hub = new HubSearch();

        let results: HubSearchResult[];

        if (category) {
          // 按分类筛选，再在结果中搜索关键词
          const categoryResults = await hub.listByCategory(category);
          const words = query.toLowerCase().split(/\s+/).filter(Boolean);
          results = categoryResults.filter((r) => {
            const haystack = [
              r.manifest.name,
              r.manifest.displayName,
              r.manifest.description,
              ...r.manifest.capabilities.map((c) => c.name),
            ].join(' ').toLowerCase();
            return words.every((w: string) => haystack.includes(w));
          });
        } else {
          results = await hub.search(query, { limit });
        }

        spinner.stop();

        if (results.length === 0) {
          console.log(
            chalk.yellow(`\nNo results found for "${query}".`),
            chalk.dim('\nTry different keywords or use: micon search <query> --category <cat>'),
          );
          return;
        }

        // 展示结果表格
        console.log(
          chalk.bold(`\nSearch results for "${query}" (${results.length} found):\n`),
        );

        for (const result of results) {
          const m = result.manifest;
          const q = m.quality;

          console.log(
            chalk.bold(`  ${m.displayName}`) + chalk.dim(` (${m.name})`),
          );
          console.log(
            `  Grade: ${gradeColor(result.grade)}` +
            chalk.dim(`  Score: ${result.score}`) +
            chalk.dim(`  ⭐ ${q.stars}`) +
            chalk.dim(`  Updated: ${relativeTime(q.lastUpdate)}`) +
            chalk.dim(`  Tests: ${q.testCoverage}%`),
          );
          console.log(
            chalk.dim(`  ${truncate(m.description, 80)}`),
          );

          if (m.capabilities.length > 0) {
            const caps = m.capabilities.map((c) => chalk.cyan(c.name)).join(', ');
            console.log(`  Capabilities: ${caps}`);
          }

          console.log();
        }
      } catch (err) {
        spinner.fail('Search failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
