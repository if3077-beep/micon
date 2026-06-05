/**
 * MCP 客户端封装
 *
 * 通过 StdioClientTransport 连接 MCP Server 子进程，提供工具列表和调用能力。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolResult } from '../core/types.js';

/** MCP 工具描述（从 SDK 返回的原始结构简化） */
export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
}

/** 已连接的服务器条目 */
interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport;
}

/**
 * MCP 客户端管理器
 *
 * 管理多个 MCP Server 的连接，每个 Server 以子进程方式运行。
 */
export class McpClient {
  private servers = new Map<string, ConnectedServer>();

  /**
   * 连接到 MCP Server
   *
   * 以子进程方式启动 MCP Server 并完成初始化握手。
   *
   * @param serverName - 服务器标识名，用于后续引用
   * @param command    - 启动子进程的命令（如 npx、node）
   * @param args       - 命令行参数
   * @param env        - 传递给子进程的环境变量（可选）
   */
  async connect(
    serverName: string,
    command: string,
    args: string[],
    env?: Record<string, string>,
  ): Promise<void> {
    if (this.servers.has(serverName)) {
      throw new Error(`MCP server "${serverName}" is already connected`);
    }

    const transport = new StdioClientTransport({
      command,
      args,
      env,
      stderr: 'pipe',
    });

    const client = new Client(
      { name: 'micon', version: '0.1.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to connect to MCP server "${serverName}": ${message}`,
      );
    }

    this.servers.set(serverName, { client, transport });
  }

  /**
   * 列出指定服务器提供的所有工具
   *
   * @param serverName - 服务器标识名
   * @returns 工具列表
   */
  async listTools(serverName: string): Promise<Tool[]> {
    const entry = this.getConnectedServer(serverName);
    const result = await entry.client.listTools();
    return result.tools as Tool[];
  }

  /**
   * 调用指定服务器上的工具
   *
   * @param serverName - 服务器标识名
   * @param name       - 工具名称
   * @param args       - 工具调用参数
   * @returns 工具执行结果
   */
  async callTool(
    serverName: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const entry = this.getConnectedServer(serverName);

    const result = await entry.client.callTool({
      name,
      arguments: args,
    });

    // SDK 返回的 content 是数组，提取文本内容拼接
    const content = (result.content as Array<{ type: string; text?: string }>)
      ?.filter((c) => c.type === 'text' && c.text !== undefined)
      .map((c) => c.text!)
      .join('\n') ?? '';

    const raw = result as Record<string, unknown>;
    const isError = (raw.isError as boolean | undefined) ?? false;

    return {
      content,
      isError,
    };
  }

  /**
   * 断开指定服务器的连接
   *
   * 关闭传输通道并清理内部引用。
   *
   * @param serverName - 服务器标识名
   */
  async disconnect(serverName: string): Promise<void> {
    const entry = this.getConnectedServer(serverName);
    await entry.client.close();
    this.servers.delete(serverName);
  }

  /**
   * 断开所有已连接的服务器
   */
  async disconnectAll(): Promise<void> {
    const names = [...this.servers.keys()];
    await Promise.all(names.map((n) => this.disconnect(n)));
  }

  /**
   * 检查指定服务器是否已连接
   */
  isConnected(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  /** 获取已连接服务器条目，不存在则抛错 */
  private getConnectedServer(serverName: string): ConnectedServer {
    const entry = this.servers.get(serverName);
    if (!entry) {
      throw new Error(
        `MCP server "${serverName}" is not connected. Call connect() first.`,
      );
    }
    return entry;
  }
}
