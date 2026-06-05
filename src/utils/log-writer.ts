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
  const logsDir = join(homedir(), '.micon', 'logs');
  await mkdir(logsDir, { recursive: true });
  const logPath = join(logsDir, `${agentName}.jsonl`);
  const line = JSON.stringify(result) + '\n';
  await appendFile(logPath, line, 'utf-8');
}
