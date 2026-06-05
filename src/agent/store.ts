/**
 * Agent 存储管理
 *
 * 负责 Agent 定义的持久化：保存、加载、列表、删除、查询。
 * 默认存储位置为 ~/.micon/agents/，同时支持当前工作目录查找。
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import type { AgentDefinition } from '../core/types.js';
import { parseAgentYaml } from './loader.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 全局 Agent 存储目录 */
const AGENTS_DIR = join(homedir(), '.micon', 'agents');

// ---------------------------------------------------------------------------
// AgentStore
// ---------------------------------------------------------------------------

/**
 * Agent 存储管理器
 *
 * 提供 Agent 的 CRUD 操作，默认持久化到 ~/.micon/agents/{name}.yaml。
 */
export class AgentStore {
  /**
   * 保存 Agent 定义为 YAML 文件
   *
   * @param agent    - Agent 定义
   * @param filePath - 可选的自定义保存路径，默认 ~/.micon/agents/{name}.yaml
   * @returns 保存的文件绝对路径
   */
  async save(agent: AgentDefinition, filePath?: string): Promise<string> {
    const targetPath = filePath
      ? resolve(filePath)
      : join(AGENTS_DIR, `${agent.name}.yaml`);

    const dir = resolve(targetPath, '..');
    await mkdir(dir, { recursive: true });

    const content = yaml.dump(agent as unknown as Record<string, unknown>, {
      lineWidth: 120,
      noRefs: true,
    });

    await writeFile(targetPath, content, 'utf-8');
    return targetPath;
  }

  /**
   * 按名称从存储中加载 Agent
   *
   * @param name - Agent 名称
   * @returns 解析后的 AgentDefinition
   * @throws 未找到时抛出错误
   */
  async load(name: string): Promise<AgentDefinition> {
    const agentPath = this.resolveAgentPath(name);
    if (!agentPath) {
      throw new Error(`Agent "${name}" not found in store`);
    }

    const content = await readFile(agentPath, 'utf-8');
    return parseAgentYaml(content);
  }

  /**
   * 列出所有已保存的 Agent
   *
   * @returns Agent 名称和路径列表
   */
  async list(): Promise<Array<{ name: string; path: string }>> {
    const results: Array<{ name: string; path: string }> = [];

    // 扫描 ~/.micon/agents/
    if (existsSync(AGENTS_DIR)) {
      const files = await readdir(AGENTS_DIR);
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = file.replace(/\.(yaml|yml)$/, '');
          results.push({ name, path: join(AGENTS_DIR, file) });
        }
      }
    }

    return results;
  }

  /**
   * 删除指定 Agent
   *
   * @param name - Agent 名称
   * @throws 未找到时抛出错误
   */
  async delete(name: string): Promise<void> {
    const agentPath = this.resolveAgentPath(name);
    if (!agentPath) {
      throw new Error(`Agent "${name}" not found in store`);
    }

    await unlink(agentPath);
  }

  /**
   * 检查 Agent 是否存在
   *
   * @param name - Agent 名称
   * @returns 是否存在
   */
  async exists(name: string): Promise<boolean> {
    return this.resolveAgentPath(name) !== null;
  }

  /**
   * 按 Agent 名称查找文件路径
   *
   * 搜索顺序：
   * 1. ~/.micon/agents/{name}.yaml / {name}.yml
   * 2. 当前工作目录下的 {name}.yaml / {name}.yml
   *
   * @param name - Agent 名称
   * @returns 文件绝对路径，未找到返回 null
   */
  resolveAgentPath(name: string): string | null {
    const candidates = [
      join(AGENTS_DIR, `${name}.yaml`),
      join(AGENTS_DIR, `${name}.yml`),
      join(process.cwd(), `${name}.yaml`),
      join(process.cwd(), `${name}.yml`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
