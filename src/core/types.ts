/**
 * Micon 核心类型定义
 *
 * Micon = MCP Server Hub + Lightweight Agent Runtime
 * 用户可以通过单条命令运行由 MCP 工具驱动的 AI Agent
 */

// ============================================================================
// Agent 相关类型
// ============================================================================

/** Agent 输入参数的合法类型 */
export type AgentInputType = 'string' | 'number' | 'boolean';

/** Agent 输出格式 */
export type AgentOutputFormat = 'markdown' | 'json' | 'text';

/** Agent 输出目标 */
export type AgentOutputTarget = 'stdout' | 'github-pr-comment' | 'file';

/** Agent 输出配置 */
export interface AgentOutput {
  /** 输出格式 */
  format: AgentOutputFormat;
  /** 输出目标，默认 'stdout' */
  to?: AgentOutputTarget;
}

/**
 * YAML 定义的 Agent 配置
 *
 * 描述一个完整的 Agent，包括目标、可用工具、约束、输入输出等。
 * 通常从 `.micon/agents/*.yaml` 文件加载。
 */
export interface AgentDefinition {
  /** Agent 名称，需在项目内唯一 */
  name: string;
  /** Agent 功能描述 */
  description: string;
  /** Agent 的自然语言目标，驱动 ReAct 循环的核心指令 */
  goal: string;
  /** 可使用的 MCP Server 名称列表 */
  tools: string[];
  /** Agent 必须遵守的规则约束 */
  constraints: string[];
  /** 输入参数定义：名称 → 类型 */
  inputs: Record<string, AgentInputType>;
  /** 输出配置 */
  output: AgentOutput;
  /** LLM 模型覆盖，不指定则使用全局默认 */
  model?: string;
  /** ReAct 循环最大迭代次数，默认 10 */
  maxSteps?: number;
}

// ============================================================================
// MCP Server 相关类型
// ============================================================================

/** MCP 权限默认策略 */
export type McpPermissionDefault = 'allow' | 'deny' | 'ask';

/** MCP Server 权限声明 */
export interface McpPermission {
  /** 权限名称，如 'filesystem:read'、'network:fetch' */
  name: string;
  /** 权限用途描述 */
  description: string;
  /** 默认策略 */
  default: McpPermissionDefault;
}

/** MCP Server 能力声明 */
export interface McpCapability {
  /** 能力名称，如 'tools'、'resources'、'prompts' */
  name: string;
  /** 能力描述 */
  description: string;
}

/** MCP Server 安装方式 */
export type McpInstallType = 'npm' | 'npx' | 'binary';

/** MCP Server 安装配置 */
export interface McpInstall {
  /** 安装类型 */
  type: McpInstallType;
  /** npm 包名（type 为 npm/npx 时使用） */
  package?: string;
  /** 可执行命令（type 为 binary 时使用） */
  command?: string;
  /** 命令行参数 */
  args?: string[];
}

/** MCP 配置字段类型 */
export type McpConfigFieldType = 'string' | 'number' | 'boolean';

/** MCP Server 配置字段定义 */
export interface McpConfigField {
  /** 配置项名称 */
  name: string;
  /** 值类型 */
  type: McpConfigFieldType;
  /** 配置项描述 */
  description: string;
  /** 是否必填 */
  required: boolean;
  /** 默认值 */
  default?: string;
}

/**
 * MCP Server 质量评分
 *
 * 综合评估 MCP Server 的可靠性、安全性和兼容性。
 */
export interface McpQuality {
  /** GitHub Stars 数 */
  stars: number;
  /** 最近更新时间（ISO 8601） */
  lastUpdate: string;
  /** 测试覆盖率 0-100 */
  testCoverage: number;
  /** 是否通过安全审计 */
  securityAudit: boolean;
  /** 兼容性描述，如 'Node 18+, Python 3.10+' */
  compatibility: string;
}

/**
 * MCP Server 清单/元数据
 *
 * 描述一个 MCP Server 的完整信息，包括功能、权限、安装方式、配置项和质量评分。
 */
export interface McpServerManifest {
  /** Server 标识名，如 '@anthropic/mcp-filesystem' */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 功能描述 */
  description: string;
  /** 语义化版本号 */
  version: string;
  /** 仓库地址（GitHub URL） */
  repository: string;
  /** 分类，如 'development'、'database'、'cloud' */
  category: string;
  /** 声明的权限列表 */
  permissions: McpPermission[];
  /** 声明的能力列表 */
  capabilities: McpCapability[];
  /** 安装配置 */
  install: McpInstall;
  /** 配置字段定义 */
  config: McpConfigField[];
  /** 质量评分 */
  quality: McpQuality;
}

// ============================================================================
// 执行相关类型
// ============================================================================

/** 执行步骤类型 */
export type ExecutionStepType =
  | 'tool_call'
  | 'llm_thinking'
  | 'constraint_check'
  | 'user_rejected'
  | 'dry_run'
  | 'tool_error'
  | 'final_answer';

/** 执行状态 */
export type ExecutionStatus = 'success' | 'error' | 'partial';

/**
 * 单个 ReAct 循环步骤
 *
 * 记录 Agent 执行过程中每一步的详细信息。
 */
export interface ExecutionStep {
  /** 步骤序号，从 1 开始 */
  stepNumber: number;
  /** 步骤类型 */
  type: ExecutionStepType;
  /** 调用的工具名称（type 为 tool_call 时） */
  toolName?: string;
  /** 工具调用输入（type 为 tool_call 时） */
  toolInput?: Record<string, unknown>;
  /** 工具调用输出（type 为 tool_call 时） */
  toolOutput?: string;
  /** LLM 思考过程（type 为 llm_thinking 时） */
  thinking?: string;
  /** LLM 决策内容（type 为 llm_thinking 时） */
  decision?: string;
  /** 约束检查是否通过（type 为 constraint_check 时） */
  passed?: boolean;
  /** 本步骤耗时（毫秒） */
  duration: number;
}

/** Token 用量统计 */
export interface TokenUsage {
  /** 输入 Token 数 */
  input: number;
  /** 输出 Token 数 */
  output: number;
}

/**
 * Agent 执行结果
 *
 * 包含执行状态、步骤记录、输出内容和资源消耗等信息。
 */
export interface ExecutionResult {
  /** 执行的 Agent 名称 */
  agentName: string;
  /** 执行状态 */
  status: ExecutionStatus;
  /** 执行步骤记录 */
  steps: ExecutionStep[];
  /** 最终输出内容 */
  output: string;
  /** 错误信息（status 为 error 或 partial 时） */
  error?: string;
  /** 执行开始时间（ISO 8601） */
  startTime: string;
  /** 执行结束时间（ISO 8601） */
  endTime: string;
  /** Token 用量统计 */
  tokenUsage?: TokenUsage;
}

// ============================================================================
// 运行时配置类型
// ============================================================================

/**
 * Agent 运行时配置
 *
 * 每次执行 Agent 时生成的运行配置，合并了 Agent 定义和用户输入。
 */
export interface RunConfig {
  /** Agent 定义 */
  agent: AgentDefinition;
  /** 用户提供的输入值 */
  inputs: Record<string, unknown>;
  /** 是否为试运行（不实际调用工具） */
  dryRun: boolean;
  /** 是否为交互模式（每次工具调用前需用户确认） */
  interactive: boolean;
  /** ReAct 循环最大迭代次数 */
  maxSteps: number;
  /** 使用的 LLM 模型 */
  model: string;
}

// ============================================================================
// 全局配置类型
// ============================================================================

/** LLM 提供商 */
export type LlmProvider = 'openai' | 'anthropic';

/** LLM 配置 */
export interface LlmConfig {
  /** 提供商 */
  provider: LlmProvider;
  /** API 密钥 */
  apiKey: string;
  /** 默认模型 */
  model: string;
  /** 自定义 API 基础地址 */
  baseUrl?: string;
}

/**
 * 已安装的 MCP Server 跟踪信息
 *
 * 记录用户已安装的 MCP Server 的授权和配置状态。
 */
export interface InstalledMcpServer {
  /** Server 清单 */
  manifest: McpServerManifest;
  /** 用户已授权的权限名称列表 */
  grantedPermissions: string[];
  /** 用户提供的配置值 */
  config: Record<string, string>;
  /** 安装时间（ISO 8601） */
  installedAt: string;
}

/**
 * Micon 全局用户配置
 *
 * 存储在 ~/.micon/ 目录下，包含 LLM 设置、已安装的 MCP Server 和 Agent 注册信息。
 */
export interface MiconConfig {
  /** 配置版本号 */
  version: string;
  /** LLM 配置 */
  llm: LlmConfig;
  /** 已安装的 MCP Server：名称 → 安装信息 */
  mcpServers: Record<string, InstalledMcpServer>;
  /** 已注册的 Agent：名称 → 文件路径 */
  agents: Record<string, string>;
}

// ============================================================================
// Hub 搜索相关类型
// ============================================================================

/** Hub 质量等级 */
export type HubGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Hub 搜索结果
 *
 * 从 MCP Server Hub 搜索返回的结果，包含清单、质量评分和等级。
 */
export interface HubSearchResult {
  /** Server 清单 */
  manifest: McpServerManifest;
  /** 质量评分 0-100 */
  score: number;
  /** 质量等级 */
  grade: HubGrade;
}

// ============================================================================
// 工具调用相关类型
// ============================================================================

/**
 * 工具调用请求
 *
 * 表示 Agent 对 MCP 工具的一次调用。
 */
export interface ToolCall {
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  arguments: Record<string, unknown>;
}

/**
 * 工具调用结果
 *
 * MCP Server 执行工具后返回的结果。
 */
export interface ToolResult {
  /** 返回内容 */
  content: string;
  /** 是否为错误结果 */
  isError: boolean;
}
