/**
 * MCP Server 注册表
 *
 * 管理已安装的 MCP Server：清单、权限、配置和启动命令。
 * 数据持久化委托给 ConfigStore（~/.micon/config.json）。
 */

import type {
  InstalledMcpServer,
  McpServerManifest,
} from '../core/types.js';

import { ConfigStore } from '../config/store.js';

// ---------------------------------------------------------------------------
// McpRegistry
// ---------------------------------------------------------------------------

/**
 * MCP Server 注册表
 *
 * 负责已安装 Server 的增删查、权限管理和启动命令生成。
 * 底层通过 ConfigStore 读写 ~/.micon/config.json 中的 mcpServers 字段。
 */
export class McpRegistry {
  private store = new ConfigStore();

  /**
   * 安装（注册）一个 MCP Server
   */
  async install(
    manifest: McpServerManifest,
    permissions: string[],
    config: Record<string, string>,
  ): Promise<InstalledMcpServer> {
    const cfg = await this.store.load();

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
    await this.store.save(cfg);
    return entry;
  }

  /**
   * 卸载（移除）一个 MCP Server
   */
  async uninstall(serverName: string): Promise<void> {
    const cfg = await this.store.load();

    if (!cfg.mcpServers[serverName]) {
      throw new Error(`MCP server "${serverName}" is not installed.`);
    }

    delete cfg.mcpServers[serverName];
    await this.store.save(cfg);
  }

  /**
   * 获取指定已安装 Server 的信息
   */
  async get(serverName: string): Promise<InstalledMcpServer | undefined> {
    const cfg = await this.store.load();
    return cfg.mcpServers[serverName];
  }

  /**
   * 列出所有已安装的 MCP Server
   */
  async list(): Promise<InstalledMcpServer[]> {
    const cfg = await this.store.load();
    return Object.values(cfg.mcpServers);
  }

  /**
   * 获取启动指定 Server 的命令和参数
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
    const cfg = await this.store.load();
    const entry = cfg.mcpServers[serverName];

    if (!entry) {
      throw new Error(`MCP server "${serverName}" is not installed.`);
    }

    if (!entry.grantedPermissions.includes(permission)) {
      entry.grantedPermissions.push(permission);
      await this.store.save(cfg);
    }
  }
}
