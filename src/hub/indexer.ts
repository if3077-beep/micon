/**
 * MCP Server Hub 索引器
 *
 * 未来将扫描 GitHub 发现新的 MCP Server 并更新本地缓存。
 * 当前为 MVP 存根实现，仅使用内置注册表。
 */

import type { McpServerManifest } from '../core/types.js';

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 内置 registry.json 的路径 */
const BUNDLED_REGISTRY_PATH = join(__dirname, '..', '..', 'hub-data', 'registry.json');

/** 加载内置注册表 */
function loadBundledRegistry(): McpServerManifest[] {
  if (existsSync(BUNDLED_REGISTRY_PATH)) {
    try {
      const raw = readFileSync(BUNDLED_REGISTRY_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data as McpServerManifest[];
    } catch {
      // 加载失败返回空
    }
  }
  return [];
}

export class HubIndexer {
  /**
   * 更新索引：扫描 GitHub 上的 MCP Server，更新本地缓存
   *
   * MVP 阶段仅返回内置注册表中的服务器数量。
   * @returns 索引的服务器数量
   */
  async updateIndex(): Promise<number> {
    console.log('Index update not yet implemented. Using bundled registry.');
    const servers = loadBundledRegistry();
    return servers.length;
  }
}
