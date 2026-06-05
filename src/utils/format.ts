import chalk from 'chalk';
import type { HubGrade, ExecutionStep, ExecutionResult } from '../core/types.js';

// ---------------------------------------------------------------------------
// 步骤展示
// ---------------------------------------------------------------------------

/** 步骤类型 → emoji 前缀 */
export const STEP_EMOJI: Record<string, string> = {
  tool_call: '🔍',
  llm_thinking: '🤖',
  constraint_check: '⚠️',
  dry_run: '🔍',
  tool_error: '❌',
  user_rejected: '🚫',
  final_answer: '✨',
};

/**
 * 展示执行步骤列表
 *
 * 使用 ExecutionStep 类型的正确字段名（toolName, toolOutput）。
 */
export function displaySteps(steps: ExecutionStep[]): void {
  for (const step of steps) {
    const emoji = STEP_EMOJI[step.type] ?? '•';
    const type = step.type;

    if (type === 'tool_call' || type === 'dry_run') {
      const toolName = step.toolName ?? 'unknown';
      const result = step.toolOutput
        ? String(step.toolOutput).slice(0, 120)
        : '';
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) +
        chalk.cyan(`[${toolName}]`) +
        (result ? chalk.dim(` → ${result}`) : ''),
      );
    } else if (type === 'llm_thinking') {
      const thinking = step.toolOutput
        ? String(step.toolOutput).slice(0, 100)
        : '';
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) +
        chalk.yellow('thinking') +
        (thinking ? chalk.dim(` — ${thinking}`) : ''),
      );
    } else if (type === 'constraint_check') {
      const reason = step.toolOutput ?? '';
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) +
        chalk.red(`constraint — ${reason}`),
      );
    } else if (type === 'final_answer') {
      // final answer 单独展示
    } else {
      console.log(
        chalk.dim(`  ${emoji} Step ${step.stepNumber ?? '?'}: `) + `${type}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CLI 输入收集
// ---------------------------------------------------------------------------

/** 收集 --input key=value 参数 */
export function collectInputs(
  value: string,
  previous: Record<string, unknown>,
): Record<string, unknown> {
  const eqIndex = value.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid input format: "${value}". Expected key=value`);
  }
  const key = value.slice(0, eqIndex);
  const raw = value.slice(eqIndex + 1);

  // 尝试解析为数字或布尔值，否则保留字符串
  let parsed: unknown = raw;
  if (raw === 'true') parsed = true;
  else if (raw === 'false') parsed = false;
  else if (/^\d+$/.test(raw)) parsed = Number(raw);

  return { ...previous, [key]: parsed };
}

// ---------------------------------------------------------------------------
// 格式化工具函数
// ---------------------------------------------------------------------------

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

/**
 * 展示 Agent 执行结果
 */
export function displayResult(result: ExecutionResult): void {
  const status = result.status;
  if (status === 'success') {
    console.log(chalk.green('\n✅ Agent completed successfully\n'));
  } else if (status === 'partial') {
    console.log(chalk.yellow('\n⚠️  Agent completed partially (max steps reached)\n'));
  } else {
    console.log(chalk.red('\n❌ Agent failed'));
    if (result.error) {
      console.log(chalk.red(`   Error: ${result.error}`));
    }
    console.log();
  }

  // 展示步骤
  if (result.steps && result.steps.length > 0) {
    console.log(chalk.bold('Steps:'));
    displaySteps(result.steps);
    console.log();
  }

  // 最终输出
  const output = result.output ?? '';
  if (output) {
    console.log(chalk.bold('Output:'));
    console.log(chalk.white(output));
    console.log();
  }

  // Token 用量
  if (result.tokenUsage) {
    const tu = result.tokenUsage;
    console.log(
      chalk.dim(
        `Token usage: ${tu.input} input, ${tu.output} output`,
      ),
    );
  }
}
