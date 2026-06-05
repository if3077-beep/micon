/**
 * MCP Server Hub 搜索引擎
 *
 * 提供关键词搜索、精确名称匹配、分类浏览等功能。
 * 优先从内置 registry.json 加载数据，回退到本地缓存。
 */

import type { McpServerManifest, HubSearchResult } from '../core/types.js';
import { calculateQualityScore, scoreToGrade } from './scorer.js';

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 内置 registry.json 的路径（相对于编译后的 dist/hub/ 目录） */
const BUNDLED_REGISTRY_PATH = join(__dirname, '..', '..', 'hub-data', 'registry.json');

/** 将 McpServerManifest 转换为 HubSearchResult */
function toSearchResult(manifest: McpServerManifest): HubSearchResult {
  const score = calculateQualityScore(manifest.quality);
  const grade = scoreToGrade(score);
  return { manifest, score, grade };
}

export class HubSearch {
  private servers: McpServerManifest[] = [];

  constructor() {
    this.servers = this.loadRegistry();
  }

  /** 加载注册表数据：合并内置 + 本地缓存（去重） */
  private loadRegistry(): McpServerManifest[] {
    const servers = new Map<string, McpServerManifest>();

    // 1. 加载本地缓存（indexer 更新的数据）
    const cachePath = join(homedir(), '.micon', 'hub-cache.json');
    if (existsSync(cachePath)) {
      try {
        const raw = readFileSync(cachePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const s of data as McpServerManifest[]) {
            servers.set(s.name, s);
          }
        }
      } catch {
        // 缓存文件损坏，继续
      }
    }

    // 2. 加载内置 registry（覆盖缓存中的同名条目，保证内置数据优先）
    if (existsSync(BUNDLED_REGISTRY_PATH)) {
      try {
        const raw = readFileSync(BUNDLED_REGISTRY_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const s of data as McpServerManifest[]) {
            servers.set(s.name, s);
          }
        }
      } catch {
        // 内置数据损坏，继续
      }
    }

    return Array.from(servers.values());
  }

  /**
   * 关键词搜索 MCP Server
   *
   * 将查询拆分为多个关键词，匹配 name、displayName、description、capabilities。
   * 按质量评分降序排列。
   */
  async search(
    query: string,
    options?: { limit?: number }
  ): Promise<HubSearchResult[]> {
    const limit = options?.limit ?? 10;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return this.servers
        .map(toSearchResult)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    const results = this.servers
      .filter((server) => {
        const haystack = [
          server.name,
          server.displayName,
          server.description,
          ...server.capabilities.map((c) => c.name),
          ...server.capabilities.map((c) => c.description),
        ]
          .join(' ')
          .toLowerCase();

        return words.every((word) => haystack.includes(word));
      })
      .map(toSearchResult)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /** 精确名称匹配 */
  async getByExactName(name: string): Promise<HubSearchResult | undefined> {
    const server = this.servers.find((s) => s.name === name);
    if (!server) return undefined;
    return toSearchResult(server);
  }

  /** 列出所有可用分类 */
  async listCategories(): Promise<string[]> {
    const categories = new Set(this.servers.map((s) => s.category));
    return [...categories].sort();
  }

  /** 按分类筛选 */
  async listByCategory(category: string): Promise<HubSearchResult[]> {
    return this.servers
      .filter((s) => s.category === category)
      .map(toSearchResult)
      .sort((a, b) => b.score - a.score);
  }
}
