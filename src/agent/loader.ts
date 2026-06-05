/**
 * Agent YAML 加载与解析
 *
 * 从文件系统读取 Agent 定义 YAML 文件并解析为 AgentDefinition 对象。
 * 支持从指定路径或按名称搜索加载。
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import type { AgentDefinition } from '../core/types.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 全局 Agent 存储目录 */
const AGENTS_DIR = join(homedir(), '.micon', 'agents');

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

/**
 * 解析 YAML 字符串为 AgentDefinition
 *
 * @param content - YAML 格式的 Agent 定义内容
 * @returns 解析后的 AgentDefinition
 * @throws 缺少必需字段时抛出错误
 */
export function parseAgentYaml(content: string): AgentDefinition {
  const parsed = yaml.load(content) as Record<string, unknown>;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid agent YAML: content is not a valid object');
  }

  // 校验必需字段
  const required: (keyof AgentDefinition)[] = ['name', 'goal', 'tools'];
  for (const field of required) {
    if (parsed[field] === undefined || parsed[field] === null) {
      throw new Error(`Invalid agent YAML: missing required field "${field}"`);
    }
  }

  return parsed as unknown as AgentDefinition;
}

// ---------------------------------------------------------------------------
// 加载
// ---------------------------------------------------------------------------

/**
 * 从文件路径加载 Agent 定义
 *
 * @param filePath - YAML 文件的绝对或相对路径
 * @returns 解析后的 AgentDefinition
 * @throws 文件不存在或解析失败时抛出错误
 */
export async function loadAgent(filePath: string): Promise<AgentDefinition> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    throw new Error(`Agent file not found: ${absPath}`);
  }

  const content = await readFile(absPath, 'utf-8');
  return parseAgentYaml(content);
}

/**
 * 按 Agent 名称搜索并加载
 *
 * 搜索顺序：
 * 1. ~/.micon/agents/{name}.yaml
 * 2. 当前工作目录下的 {name}.yaml
 *
 * @param name - Agent 名称
 * @returns 解析后的 AgentDefinition
 * @throws 所有搜索路径均未找到时抛出错误
 */
export async function loadAgentFromName(name: string): Promise<AgentDefinition> {
  const candidates = [
    join(AGENTS_DIR, `${name}.yaml`),
    join(process.cwd(), `${name}.yaml`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return loadAgent(candidate);
    }
  }

  throw new Error(
    `Agent "${name}" not found. Searched:\n  - ${candidates.join('\n  - ')}`,
  );
}
