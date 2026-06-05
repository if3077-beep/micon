/**
 * 日志写入工具
 *
 * 将执行结果追加到日志文件
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 将执行结果追加到日志文件 */
export async function appendLog(
  agentName: string,
  result: unknown,
): Promise<void> {
  // Sanitize agentName to prevent path traversal
  const safeName = agentName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const logsDir = join(homedir(), '.micon', 'logs');
  await mkdir(logsDir, { recursive: true });
  const logPath = join(logsDir, `${safeName}.jsonl`);
  const line = JSON.stringify(result) + '\n';
  await appendFile(logPath, line, 'utf-8');
}
