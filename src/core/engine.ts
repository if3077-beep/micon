/**
 * ReAct 执行引擎
 *
 * 接收 Agent 目标 + 可用 MCP 工具 + 约束，运行 Reason→Act→Observe 循环，
 * 直到目标达成或达到最大步数。
 */

import OpenAI from 'openai';

import type {
  AgentDefinition,
  RunConfig,
  ExecutionResult,
  ExecutionStep,
  ExecutionStepType,
  TokenUsage,
  ToolResult,
} from './types.js';

import { McpClient, type Tool as McpTool } from '../mcp/client.js';
import { McpRegistry } from '../mcp/registry.js';
import { ConfigStore } from '../config/store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WRITE_KEYWORDS = /write|create|update|delete|remove|insert|patch|put|post/i;
const BLOCKED_BY_COMMENT_ONLY = /approve|merge|ship|deploy/i;

function buildSystemPrompt(
  goal: string,
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  constraints: string[],
): string {
  const toolDescriptions = tools
    .map((t) => `- ${t.name}: ${t.description}\n  Input: ${JSON.stringify(t.inputSchema)}`)
    .join('\n\n');

  const constraintBlock =
    constraints.length > 0
      ? `## Constraints\n${constraints.map((c) => `- ${c}`).join('\n')}`
      : '';

  return [
    'You are an AI agent. Use the available tools to achieve the goal.',
    'After each tool result, decide your next action.',
    'When done, provide a final answer.\n',
    `## Goal\n${goal}\n`,
    `## Available Tools\n${toolDescriptions}\n`,
    constraintBlock,
  ].join('\n');
}

function mcpToolsToOpenAI(
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

function checkConstraint(
  toolName: string,
  constraints: string[],
): { blocked: boolean; reason?: string } {
  for (const c of constraints) {
    const lower = c.toLowerCase();
    if (lower.includes('只读') || lower.includes('read-only')) {
      if (WRITE_KEYWORDS.test(toolName)) {
        return { blocked: true, reason: `工具 "${toolName}" 被只读约束阻止` };
      }
    }
    if (lower.includes('只评论') || lower.includes('comment-only')) {
      if (BLOCKED_BY_COMMENT_ONLY.test(toolName)) {
        return { blocked: true, reason: `工具 "${toolName}" 被评论约束阻止` };
      }
    }
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// AgentEngine
// ---------------------------------------------------------------------------

export class AgentEngine {
  private config: RunConfig;
  private steps: ExecutionStep[] = [];
  private tokenUsage: TokenUsage = { input: 0, output: 0 };
  private openai!: OpenAI;
  private model: string;
  private mcpClient = new McpClient();
  /** toolName → serverName 映射 */
  private toolServerMap = new Map<string, string>();

  constructor(config: RunConfig) {
    this.config = config;
    this.model = config.model ?? config.agent.model ?? 'gpt-4o';
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async run(): Promise<ExecutionResult> {
    const startIso = new Date().toISOString();
    const startMs = Date.now();

    try {
      const agent = this.config.agent;

      // dry-run 模式：不连接 MCP、不调 LLM，只展示执行计划
      if (this.config.dryRun) {
        const allTools = await this.getDryRunTools();
        const plan = [
          `Agent: ${agent.name}`,
          `Goal: ${agent.goal}`,
          `Tools: ${allTools.map((t) => t.name).join(', ') || '(none)'}`,
          `Constraints: ${agent.constraints.join(', ') || '(none)'}`,
          `Max steps: ${this.config.maxSteps}`,
        ].join('\n');

        return {
          agentName: agent.name,
          status: 'success',
          steps: [{
            stepNumber: 1,
            type: 'dry_run' as const,
            toolOutput: plan,
            duration: 0,
          }],
          output: plan,
          startTime: startIso,
          endTime: new Date().toISOString(),
        };
      }

      // 1. Load config & init OpenAI client
      const configStore = new ConfigStore();
      const llmConfig = await configStore.getLlmConfig();
      this.openai = new OpenAI({
        apiKey: llmConfig.apiKey,
        baseURL: llmConfig.baseUrl,
      });
      this.model = this.config.model ?? agent.model ?? llmConfig.model;

      // 2. Connect MCP servers & collect tools
      const allTools = await this.connectMcpServers();

      // 3. Build system prompt & conversation
      const constraints = agent.constraints;
      const systemPrompt = buildSystemPrompt(agent.goal, allTools, constraints);
      const openaiTools = mcpToolsToOpenAI(allTools);

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      // 4. ReAct loop
      const maxSteps = this.config.maxSteps;

      for (let step = 0; step < maxSteps; step++) {
        // -- Reason: call LLM --
        const response = await this.callLLM(messages, openaiTools);
        const choice = response.choices[0];
        this.trackTokens(response.usage);

        // -- Check for tool calls --
        const toolCalls = choice.message.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
          // Push assistant message with tool calls to history
          messages.push(choice.message);

          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            const toolArgsStr = tc.function.arguments;

            // -- Constraint check --
            const constraintResult = checkConstraint(toolName, constraints);
            if (constraintResult.blocked) {
              this.addStep('constraint_check', {
                toolName,
                passed: false,
                toolOutput: constraintResult.reason,
              });
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `约束阻止: ${constraintResult.reason}`,
              });
              continue;
            }

            // -- Interactive confirmation --
            if (this.config.interactive) {
              const confirmed = await this.promptConfirmation(toolName, toolArgsStr);
              if (!confirmed) {
                this.addStep('user_rejected', {
                  toolName,
                  toolOutput: '用户拒绝执行此工具',
                });
                messages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: '用户拒绝执行此工具调用。',
                });
                continue;
              }
            }

            // -- Dry run --
            if (this.config.dryRun) {
              this.addStep('dry_run', {
                toolName,
                toolOutput: `[dry-run] 将调用工具: ${toolName}`,
              });
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `[dry-run] 将调用工具: ${toolName}，参数: ${toolArgsStr}`,
              });
              continue;
            }

            // -- Act: execute tool --
            try {
              const result = await this.executeTool(toolName, toolArgsStr);
              this.addStep('tool_call', {
                toolName,
                toolOutput: result.content.slice(0, 500),
              });
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: result.content,
              });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              this.addStep('tool_error', {
                toolName,
                toolOutput: errorMsg,
              });
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `工具执行错误: ${errorMsg}`,
              });
            }
          }

          // -- Observe: loop back, LLM will see tool results --
          continue;
        }

        // -- Final answer (no tool calls) --
        const finalAnswer = choice.message.content ?? '';
        this.addStep('final_answer', { toolOutput: finalAnswer });

        await this.cleanup();

        return {
          agentName: this.config.agent.name,
          status: 'success',
          steps: this.steps,
          output: finalAnswer,
          startTime: startIso,
          endTime: new Date().toISOString(),
          tokenUsage: this.tokenUsage,
        };
      }

      // Max steps reached
      await this.cleanup();
      return {
        agentName: this.config.agent.name,
        status: 'partial',
        steps: this.steps,
        output: '达到最大步数限制，任务未完全完成。',
        error: 'max_steps_reached',
        startTime: startIso,
        endTime: new Date().toISOString(),
        tokenUsage: this.tokenUsage,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        agentName: this.config.agent.name,
        status: 'error',
        steps: this.steps,
        output: '',
        error: errorMsg,
        startTime: startIso,
        endTime: new Date().toISOString(),
        tokenUsage: this.tokenUsage,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private: MCP connection
  // -----------------------------------------------------------------------

  private async connectMcpServers(): Promise<
    Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
  > {
    const agent = this.config.agent;
    const serverNames = agent.tools; // tools 字段就是 MCP Server 名称列表
    const registry = new McpRegistry();
    const allTools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> = [];

    for (const serverName of serverNames) {
      // 获取安装命令
      const installCmd = await registry.getInstallCommand(serverName);
      // 获取用户配置（如 API Token）
      const installed = await registry.get(serverName);
      const env = installed?.config ?? {};

      // 连接 MCP Server
      await this.mcpClient.connect(serverName, installCmd.command, installCmd.args, env);

      // 获取工具列表
      const tools = await this.mcpClient.listTools(serverName);
      for (const tool of tools) {
        allTools.push({
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {},
          },
        });
        // 记录 toolName → serverName 映射
        this.toolServerMap.set(tool.name, serverName);
      }
    }

    return allTools;
  }

  // -----------------------------------------------------------------------
  // Private: LLM calls
  // -----------------------------------------------------------------------

  private async callLLM(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[],
  ): Promise<OpenAI.ChatCompletion> {
    const params: OpenAI.ChatCompletionCreateParams = {
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    };

    try {
      return await this.openai.chat.completions.create(params);
    } catch (err) {
      // Retry once with exponential backoff
      if (err instanceof OpenAI.APIError) {
        const delay = Math.min(1000 * Math.pow(2, 1), 10000);
        await this.sleep(delay);
        return await this.openai.chat.completions.create(params);
      }
      throw err;
    }
  }

  private trackTokens(usage: OpenAI.CompletionUsage | undefined): void {
    if (usage) {
      this.tokenUsage.input += usage.prompt_tokens;
      this.tokenUsage.output += usage.completion_tokens;
    }
  }

  // -----------------------------------------------------------------------
  // Private: Tool execution
  // -----------------------------------------------------------------------

  private async executeTool(
    toolName: string,
    argsStr: string,
  ): Promise<ToolResult> {
    const serverName = this.toolServerMap.get(toolName);
    if (!serverName) {
      throw new Error(`未找到工具 "${toolName}" 对应的 MCP Server`);
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }

    return await this.mcpClient.callTool(serverName, toolName, args);
  }

  // -----------------------------------------------------------------------
  // Private: Step recording
  // -----------------------------------------------------------------------

  private addStep(
    type: ExecutionStepType,
    data: {
      toolName?: string;
      toolInput?: Record<string, unknown>;
      toolOutput?: string;
      thinking?: string;
      decision?: string;
      passed?: boolean;
    },
  ): void {
    const stepStart = this.steps.length > 0
      ? Date.now()
      : Date.now();
    this.steps.push({
      stepNumber: this.steps.length + 1,
      type,
      toolName: data.toolName,
      toolInput: data.toolInput,
      toolOutput: data.toolOutput,
      thinking: data.thinking,
      decision: data.decision,
      passed: data.passed,
      duration: 0, // 简化：单步耗时由外部计算
    });
  }

  // -----------------------------------------------------------------------
  // Private: Interactive confirmation
  // -----------------------------------------------------------------------

  private async promptConfirmation(
    toolName: string,
    argsStr: string,
  ): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(
        `\n🔧 即将调用工具: ${toolName}\n   参数: ${argsStr}\n   确认执行? (y/N) `,
        (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y');
        },
      );
    });
  }

  // -----------------------------------------------------------------------
  // Private: Cleanup
  // -----------------------------------------------------------------------

  private async cleanup(): Promise<void> {
    try {
      await this.mcpClient.disconnectAll();
    } catch {
      // Best-effort cleanup
    }
  }

  // -----------------------------------------------------------------------
  // Private: Utility
  // -----------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * dry-run 模式下的模拟工具列表
   * 不启动 MCP 子进程，从 registry 读取 manifest 中的 capabilities 作为工具列表
   */
  private async getDryRunTools(): Promise<
    Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
  > {
    const agent = this.config.agent;
    const registry = new McpRegistry();
    const allTools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> = [];

    for (const serverName of agent.tools) {
      const installed = await registry.get(serverName);
      if (!installed) continue;

      // 从 manifest 的 capabilities 生成模拟工具
      for (const cap of installed.manifest.capabilities) {
        allTools.push({
          name: cap.name,
          description: cap.description,
          inputSchema: { type: 'object' as const, properties: {} },
        });
      }
    }

    return allTools;
  }
}
