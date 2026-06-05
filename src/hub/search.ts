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

  /** 加载注册表数据：优先内置，回退本地缓存 */
  private loadRegistry(): McpServerManifest[] {
    // 优先使用内置 registry
    if (existsSync(BUNDLED_REGISTRY_PATH)) {
      try {
        const raw = readFileSync(BUNDLED_REGISTRY_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) {
          return data as McpServerManifest[];
        }
      } catch {
        // 内置数据损坏，尝试本地缓存
      }
    }

    // 回退到 ~/.micon/hub-cache.json
    const cachePath = join(homedir(), '.micon', 'hub-cache.json');
    if (existsSync(cachePath)) {
      try {
        const raw = readFileSync(cachePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data as McpServerManifest[];
      } catch {
        // 缓存文件损坏，返回空
      }
    }

    return [];
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
