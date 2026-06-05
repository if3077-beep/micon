/**
 * MCP Server Hub 索引器
 *
 * 扫描 GitHub 发现新的 MCP Server 并更新本地缓存。
 * 使用 GitHub REST API 搜索带有 mcp-server topic 的仓库。
 */

import type { McpServerManifest, McpQuality } from '../core/types.js';

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 内置 registry.json 的路径 */
const BUNDLED_REGISTRY_PATH = join(__dirname, '..', '..', 'hub-data', 'registry.json');

/** 本地缓存路径 */
const CACHE_PATH = join(homedir(), '.micon', 'hub-cache.json');

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

/** 从 GitHub 仓库数据推断安装类型 */
export function inferInstallType(repo: GitHubRepo): McpServerManifest['install'] {
  const name = repo.name.toLowerCase();
  const desc = (repo.description ?? '').toLowerCase();

  // 如果 package.json 中有 bin 字段或描述提到 npx
  if (desc.includes('npx') || name.startsWith('mcp-server-')) {
    return {
      type: 'npx',
      package: repo.full_name,
      command: 'npx',
      args: ['-y', repo.full_name],
    };
  }

  // 默认 npx
  return {
    type: 'npx',
    package: repo.full_name,
    command: 'npx',
    args: ['-y', repo.full_name],
  };
}

/** 从 GitHub 仓库数据推断能力列表 */
export function inferCapabilities(repo: GitHubRepo): McpServerManifest['capabilities'] {
  const desc = repo.description ?? '';
  const caps: Array<{ name: string; description: string }> = [];

  // 简单关键词推断
  const keywords: Array<{ pattern: RegExp; cap: string; desc: string }> = [
    { pattern: /github|pr|issue|repo/i, cap: 'github-ops', desc: 'GitHub operations' },
    { pattern: /file|filesystem|fs|read|write/i, cap: 'file-ops', desc: 'File system operations' },
    { pattern: /database|db|sql|postgres|mysql/i, cap: 'db-ops', desc: 'Database operations' },
    { pattern: /search|web|scrape/i, cap: 'search', desc: 'Web search and scraping' },
    { pattern: /slack|discord|chat|message/i, cap: 'messaging', desc: 'Messaging integration' },
    { pattern: /docker|container|k8s/i, cap: 'container-ops', desc: 'Container management' },
    { pattern: /cloud|aws|gcp|azure/i, cap: 'cloud-ops', desc: 'Cloud operations' },
  ];

  for (const kw of keywords) {
    if (kw.pattern.test(desc)) {
      caps.push({ name: kw.cap, description: kw.desc });
    }
  }

  if (caps.length === 0) {
    caps.push({ name: 'general', description: 'General MCP server capabilities' });
  }

  return caps;
}

/** 从 GitHub 仓库数据推断权限 */
export function inferPermissions(repo: GitHubRepo): McpServerManifest['permissions'] {
  const desc = (repo.description ?? '').toLowerCase();
  const perms: McpServerManifest['permissions'] = [
    { name: 'read', description: 'Read access', default: 'allow' },
  ];

  if (/write|create|update|delete|post/i.test(desc)) {
    perms.push({ name: 'write', description: 'Write access', default: 'ask' });
  }

  return perms;
}

/** GitHub 仓库搜索结果类型 */
export interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  updated_at: string;
  language: string | null;
  topics: string[];
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepo[];
}

export class HubIndexer {
  /**
   * 更新索引：扫描 GitHub 上的 MCP Server，更新本地缓存
   *
   * 使用 GitHub REST API 搜索带有 mcp-server / mcp topic 的仓库，
   * 将结果转换为 McpServerManifest 格式并缓存到本地。
   *
   * @returns 索引的服务器数量
   */
  async updateIndex(): Promise<number> {
    const bundled = loadBundledRegistry();
    const bundledNames = new Set(bundled.map((s) => s.name));

    let discovered: McpServerManifest[] = [];

    try {
      discovered = await this.searchGitHub();
    } catch (err) {
      console.log(
        `GitHub search failed (${err instanceof Error ? err.message : String(err)}). Using bundled registry only.`,
      );
    }

    // 合并：内置优先，新发现的追加
    const newServers = discovered.filter((s) => !bundledNames.has(s.name));
    const allServers = [...bundled, ...newServers];

    // 写入本地缓存
    try {
      const cacheDir = join(homedir(), '.micon');
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(allServers, null, 2), 'utf-8');
    } catch {
      // 缓存写入失败不影响功能
    }

    return allServers.length;
  }

  /**
   * 通过 GitHub REST API 搜索 MCP Server 仓库
   */
  private async searchGitHub(): Promise<McpServerManifest[]> {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const queries = [
      'topic:mcp-server',
      'topic:mcp+language:typescript',
      'mcp+server+in:readme',
    ];

    const allRepos = new Map<string, GitHubRepo>();

    for (const q of queries) {
      try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`;
        const response = await fetch(url, { headers });

        if (!response.ok) {
          continue; // 跳过失败的查询
        }

        const data = (await response.json()) as GitHubSearchResponse;

        for (const repo of data.items) {
          if (!allRepos.has(repo.full_name)) {
            allRepos.set(repo.full_name, repo);
          }
        }
      } catch {
        continue;
      }
    }

    // 转换为 McpServerManifest
    return Array.from(allRepos.values()).map((repo) =>
      this.repoToManifest(repo),
    );
  }

  /**
   * 将 GitHub 仓库数据转换为 McpServerManifest
   */
  private repoToManifest(repo: GitHubRepo): McpServerManifest {
    const quality: McpQuality = {
      stars: repo.stargazers_count,
      lastUpdate: repo.updated_at,
      testCoverage: 0, // 无法从 API 获取，默认 0
      securityAudit: false,
      compatibility: 'mcp-spec 2025-03',
    };

    return {
      name: `@github/${repo.full_name.replace('/', '-')}`,
      displayName: repo.name,
      description: repo.description ?? 'MCP Server',
      version: '0.0.0',
      repository: repo.html_url,
      category: this.inferCategory(repo),
      permissions: inferPermissions(repo),
      capabilities: inferCapabilities(repo),
      install: inferInstallType(repo),
      config: [
        {
          name: 'API_KEY',
          type: 'string',
          description: 'API key if required',
          required: false,
        },
      ],
      quality,
    };
  }

  /**
   * 推断仓库的分类
   */
  private inferCategory(repo: GitHubRepo): string {
    const desc = (repo.description ?? '').toLowerCase();
    const topics = repo.topics ?? [];

    if (topics.includes('database') || /postgres|mysql|mongo|redis|sql/i.test(desc)) return 'database';
    if (topics.includes('cloud') || /aws|gcp|azure|terraform|k8s|docker/i.test(desc)) return 'cloud';
    if (topics.includes('communication') || /slack|discord|email|notion/i.test(desc)) return 'communication';
    if (topics.includes('productivity') || /google|drive|calendar|todo/i.test(desc)) return 'productivity';
    if (topics.includes('monitoring') || /sentry|logging|metrics|alert/i.test(desc)) return 'monitoring';

    return 'development';
  }
}
