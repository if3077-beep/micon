/**
 * MCP Server 注册表
 *
 * 管理已安装的 MCP Server：清单、权限、配置和启动命令。
 * 数据持久化到 ~/.micon/config.json。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  InstalledMcpServer,
  McpServerManifest,
  MiconConfig,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// 本地配置读写（config/store.ts 尚未创建前的独立实现）
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.micon');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: MiconConfig = {
  version: '0.1.0',
  llm: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
  },
  mcpServers: {},
  agents: {},
};

async function loadConfig(): Promise<MiconConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as MiconConfig;
  } catch {
    return { ...DEFAULT_CONFIG, mcpServers: {}, agents: {} };
  }
}

async function saveConfig(config: MiconConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// McpRegistry
// ---------------------------------------------------------------------------

/**
 * MCP Server 注册表
 *
 * 负责已安装 Server 的增删查、权限管理和启动命令生成。
 * 底层读写 ~/.micon/config.json 中的 mcpServers 字段。
 */
export class McpRegistry {
  /**
   * 安装（注册）一个 MCP Server
   *
   * @param manifest    - Server 清单元数据
   * @param permissions - 用户授权的权限名称列表
   * @param config      - 用户提供的配置值
   * @returns 安装后的完整记录
   */
  async install(
    manifest: McpServerManifest,
    permissions: string[],
    config: Record<string, string>,
  ): Promise<InstalledMcpServer> {
    const cfg = await loadConfig();

    if (cfg.mcpServers[manifest.name]) {
      throw new Error(
        `MCP server "${manifest.name}" is already installed. Uninstall it first.`,
      );
    }

    const entry: InstalledMcpServer = {
      manifest,
      grantedPermissions: permissions,
      config,
      installedAt: new Date().toISOString(),
    };

    cfg.mcpServers[manifest.name] = entry;
    await saveConfig(cfg);
    return entry;
  }

  /**
   * 卸载（移除）一个 MCP Server
   */
  async uninstall(serverName: string): Promise<void> {
    const cfg = await loadConfig();

    if (!cfg.mcpServers[serverName]) {
      throw new Error(`MCP server "${serverName}" is not installed.`);
    }

    delete cfg.mcpServers[serverName];
    await saveConfig(cfg);
  }

  /**
   * 获取指定已安装 Server 的信息
   */
  async get(serverName: string): Promise<InstalledMcpServer | undefined> {
    const cfg = await loadConfig();
    return cfg.mcpServers[serverName];
  }

  /**
   * 列出所有已安装的 MCP Server
   */
  async list(): Promise<InstalledMcpServer[]> {
    const cfg = await loadConfig();
    return Object.values(cfg.mcpServers);
  }

  /**
   * 获取启动指定 Server 的命令和参数
   *
   * 根据 Server 的安装类型（npm/npx/binary）生成对应的启动命令。
   */
  async getInstallCommand(
    serverName: string,
  ): Promise<{ command: string; args: string[] }> {
    const entry = await this.get(serverName);
    if (!entry) {
      throw new Error(`MCP server "${serverName}" is not installed.`);
    }

    const { install } = entry.manifest;

    switch (install.type) {
      case 'npx':
        return {
          command: 'npx',
          args: ['-y', install.package ?? serverName, ...(install.args ?? [])],
        };
      case 'npm':
        // npm 安装后通过 node 直接运行
        return {
          command: 'node',
          args: [
            `node_modules/${install.package ?? serverName}/index.js`,
            ...(install.args ?? []),
          ],
        };
      case 'binary':
        return {
          command: install.command ?? serverName,
          args: install.args ?? [],
        };
      default:
        throw new Error(
          `Unknown install type "${install.type}" for server "${serverName}"`,
        );
    }
  }

  /**
   * 检查指定 Server 是否拥有某项权限
   */
  async checkPermission(
    serverName: string,
    permission: string,
  ): Promise<boolean> {
    const entry = await this.get(serverName);
    if (!entry) return false;
    return entry.grantedPermissions.includes(permission);
  }

  /**
   * 为指定 Server 授予一项权限
   */
  async grantPermission(
    serverName: string,
    permission: string,
  ): Promise<void> {
    const cfg = await loadConfig();
    const entry = cfg.mcpServers[serverName];

    if (!entry) {
      throw new Error(`MCP server "${serverName}" is not installed.`);
    }

    if (!entry.grantedPermissions.includes(permission)) {
      entry.grantedPermissions.push(permission);
      await saveConfig(cfg);
    }
  }
}
