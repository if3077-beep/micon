/**
 * 认证与权限管理
 *
 * 负责 MCP Server 安装时的交互式授权流程和运行时的工具权限检查。
 * 安装时通过 inquirer 引导用户授权权限和填写配置项；
 * 运行时根据工具名称推断所需权限类别并校验。
 */

import type {
  McpServerManifest,
  McpPermission,
  InstalledMcpServer,
} from '../core/types.js';
import { ConfigStore } from './store.js';
import { McpRegistry } from '../mcp/registry.js';

// ---------------------------------------------------------------------------
// 工具名称 → 权限类别映射
// ---------------------------------------------------------------------------

/** 读操作关键词 */
const READ_KEYWORDS = ['read', 'get', 'list', 'search', 'fetch', 'find', 'query'];
/** 写操作关键词 */
const WRITE_KEYWORDS = ['write', 'create', 'update', 'delete', 'post', 'comment', 'add', 'remove', 'set', 'put', 'patch'];
/** 管理操作关键词 */
const ADMIN_KEYWORDS = ['admin', 'merge', 'approve', 'reject', 'config', 'manage', 'grant', 'revoke'];

/**
 * 根据工具名称推断所需的权限类别
 *
 * 例如 `filesystem_read_file` → `filesystem:read`
 */
function inferPermissionCategory(toolName: string): string {
  const lower = toolName.toLowerCase();

  // 提取前缀（下划线或冒号前的部分）作为资源域
  const separatorIdx = Math.max(lower.lastIndexOf('_'), lower.lastIndexOf(':'));
  const domain = separatorIdx > 0 ? lower.slice(0, separatorIdx) : 'general';

  if (ADMIN_KEYWORDS.some((kw) => lower.includes(kw))) {
    return `${domain}:admin`;
  }
  if (WRITE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return `${domain}:write`;
  }
  return `${domain}:read`;
}

// ---------------------------------------------------------------------------
// AuthManager
// ---------------------------------------------------------------------------

/**
 * 认证与权限管理器
 *
 * 提供 MCP Server 安装授权流程和运行时权限检查。
 */
export class AuthManager {
  private configStore: ConfigStore;
  private registry: McpRegistry;

  constructor(configStore?: ConfigStore, registry?: McpRegistry) {
    this.configStore = configStore ?? new ConfigStore();
    this.registry = registry ?? new McpRegistry();
  }

  /**
   * 交互式安装授权流程
   *
   * 1. 展示 Server 名称和描述
   * 2. 列出所有权限，让用户选择授权哪些（默认使用 manifest 中的默认值）
   * 3. 逐项提示用户填写必填配置
   * 4. 返回已授权的权限列表和配置值
   *
   * @param manifest - MCP Server 清单
   * @returns granted: 已授权的权限名称列表, config: 用户填写的配置值
   */
  async authorizeInstall(
    manifest: McpServerManifest,
  ): Promise<{ granted: string[]; config: Record<string, string> }> {
    console.log(`\n📦 Installing MCP Server: ${manifest.displayName} (${manifest.name})`);
    console.log(`   ${manifest.description}\n`);

    // ---- 权限授权 ----
    const granted = await this.promptPermissions(manifest.permissions);

    // ---- 配置项填写 ----
    const config = await this.promptConfigFields(manifest.config);

    return { granted, config };
  }

  /**
   * 检查工具调用是否被允许
   *
   * 根据工具名称推断所需权限类别，再与已安装 Server 的授权列表比对。
   */
  async checkToolPermission(
    serverName: string,
    toolName: string,
  ): Promise<boolean> {
    const entry = await this.registry.get(serverName);
    if (!entry) return false;

    const required = inferPermissionCategory(toolName);

    // 精确匹配或前缀匹配（如 filesystem:read 匹配 filesystem:read 也能匹配 filesystem:*）
    return entry.grantedPermissions.some(
      (p) => p === required || p === `${required.split(':')[0]}:*`,
    );
  }

  /**
   * 运行时请求提升权限
   *
   * 当工具调用需要未授权的权限时，交互式询问用户是否临时授予。
   *
   * @returns 用户是否同意授权
   */
  async requestElevatedPermission(
    serverName: string,
    permission: string,
  ): Promise<boolean> {
    try {
      const { default: inquirer } = await import('inquirer');
      const { grant } = await inquirer.prompt<{ grant: boolean }>([
        {
          type: 'confirm',
          name: 'grant',
          message: `Server "${serverName}" requests elevated permission "${permission}". Grant?`,
          default: false,
        },
      ]);

      if (grant) {
        await this.registry.grantPermission(serverName, permission);
      }

      return grant;
    } catch {
      // 非交互环境默认拒绝
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // 私有方法
  // -------------------------------------------------------------------------

  /**
   * 交互式权限选择
   */
  private async promptPermissions(
    permissions: McpPermission[],
  ): Promise<string[]> {
    if (permissions.length === 0) return [];

    try {
      const { default: inquirer } = await import('inquirer');

      // 默认选中 default 为 'allow' 的权限
      const defaults = permissions
        .filter((p) => p.default === 'allow')
        .map((p) => p.name);

      const { selected } = await inquirer.prompt<{ selected: string[] }>([
        {
          type: 'checkbox',
          name: 'selected',
          message: 'Select permissions to grant:',
          choices: permissions.map((p) => ({
            name: `${p.name} — ${p.description}`,
            value: p.name,
            checked: p.default === 'allow',
          })),
        },
      ]);

      return selected;
    } catch {
      // 非交互环境：使用 manifest 默认值
      return permissions
        .filter((p) => p.default === 'allow')
        .map((p) => p.name);
    }
  }

  /**
   * 交互式配置项填写
   */
  private async promptConfigFields(
    fields: McpServerManifest['config'],
  ): Promise<Record<string, string>> {
    if (fields.length === 0) return {};

    try {
      const { default: inquirer } = await import('inquirer');

      const config: Record<string, string> = {};

      for (const field of fields) {
        const { value } = await inquirer.prompt<{ value: string }>([
          {
            type: field.type === 'boolean' ? 'confirm' : 'input',
            name: 'value',
            message: `${field.description}${field.required ? ' (required)' : ''}:`,
            default: field.default,
            validate: field.required
              ? (input: string) => (input.trim() ? true : `${field.name} is required`)
              : undefined,
          },
        ]);

        config[field.name] = String(value);
      }

      return config;
    } catch {
      // 非交互环境：使用默认值，必填项缺失则抛错
      const config: Record<string, string> = {};

      for (const field of fields) {
        if (field.required && !field.default) {
          throw new Error(
            `Required config field "${field.name}" has no default value and cannot be prompted in non-interactive mode.`,
          );
        }
        config[field.name] = field.default ?? '';
      }

      return config;
    }
  }
}
