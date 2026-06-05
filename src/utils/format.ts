import chalk from 'chalk';
import type { HubGrade } from '../core/types.js';

/** 等级 → 颜色映射 */
const GRADE_COLORS: Record<string, (text: string) => string> = {
  A: chalk.green.bold,
  B: chalk.blue.bold,
  C: chalk.yellow.bold,
  D: chalk.hex('#FFA500').bold,
  F: chalk.red.bold,
};

/**
 * 格式化质量等级，带颜色
 *
 * A=绿色, B=蓝色, C=黄色, D=橙色, F=红色
 */
export function formatGrade(grade: HubGrade | string): string {
  const colorFn = GRADE_COLORS[grade.toUpperCase()];
  return colorFn ? colorFn(grade.toUpperCase()) : grade;
}

/**
 * 格式化毫秒时长为人类可读格式
 *
 * - < 1000ms → "45ms"
 * - < 60000ms → "1.2s"
 * - >= 60000ms → "2m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;

  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * 格式化 Token 数量
 *
 * - >= 1000 → "1.2k"
 * - < 1000  → "500"
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

/**
 * 截断字符串并添加省略号
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * 格式化权限列表，显示已授权和未授权状态
 *
 * ✅ 已授权, ❌ 未授权
 */
export function formatPermissions(
  permissions: string[],
  granted: string[],
): string {
  return permissions
    .map((p) => (granted.includes(p) ? `✅ ${p}` : `❌ ${p}`))
    .join('  ');
}
