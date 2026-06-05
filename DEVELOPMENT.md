# Micon 开发指南

> MCP Server Hub + Lightweight Agent Runtime
> 项目路径：`C:\Users\zz\Desktop\TRAE\micon\`

## 当前状态

代码框架已搭建完成，共 20+ 源文件，但存在 **14 个 TypeScript 编译错误**，全部集中在 `engine.ts`。其他模块编译通过。

### 文件清单

```
src/
├── index.ts                    # CLI 入口 + 自然语言一键模式
├── core/
│   ├── types.ts                # 11 个核心类型定义 ✅
│   └── engine.ts               # ReAct 执行引擎 ❌ 14 errors
├── mcp/
│   ├── client.ts               # MCP 客户端（子进程连接）✅
│   └── registry.ts             # MCP Server 注册表 ✅
├── agent/
│   ├── loader.ts               # YAML 加载器 ✅
│   ├── validator.ts            # Agent 校验器 ✅
│   └── store.ts                # Agent 存储 ✅
├── hub/
│   ├── scorer.ts               # 质量评分 ✅
│   ├── search.ts               # Hub 搜索引擎 ✅
│   └── indexer.ts              # GitHub 索引器（存根）✅
├── config/
│   ├── store.ts                # 配置存储 ✅
│   └── auth.ts                 # 权限管理 ✅
├── cli/commands/
│   ├── run.ts                  # micon run ✅
│   ├── search.ts               # micon search ✅
│   ├── add.ts                  # micon add ✅
│   ├── list.ts                 # micon list ✅
│   ├── init.ts                 # micon init ✅
│   ├── dev.ts                  # micon dev ✅
│   ├── log.ts                  # micon log ✅
│   └── config.ts               # micon config ✅
└── utils/
    ├── logger.ts               # 日志工具 ✅
    └── format.ts               # 格式化工具 ✅
agents/                          # 示例 Agent
├── pr-reviewer.yaml
├── doc-generator.yaml
└── web-researcher.yaml
hub-data/
└── registry.json               # 15 个预置 MCP Server
```

---

## 待办事项（按优先级排序）

### P0：修复编译错误，让项目能跑起来

**engine.ts 的 14 个错误**，根本原因是 engine.ts 和 types.ts 的接口不匹配。engine.ts 是由 subagent 独立编写的，它定义了自己的内部类型（如 `MiconConfig`、`ToolCall`），与 `core/types.ts` 的正式类型冲突。

需要修改 engine.ts 使其与 types.ts 对齐：

1. **import 方式错误**（2 处）
   - `import McpClient from '../mcp/client.js'` → `import { McpClient } from '../mcp/client.js'`
   - `import McpRegistry from '../mcp/registry.js'` → `import { McpRegistry } from '../mcp/registry.js'`
   - McpClient 和 McpRegistry 都是命名导出，没有 default export

2. **RunConfig 上不存在 constraints 属性**（1 处）
   - 第 146 行 `this.config.constraints` 不存在
   - 应改为 `this.config.agent.constraints`

3. **ToolCall 类型不匹配**（1 处）
   - engine.ts 的 ToolCall 有 `id` 和 `arguments: string` 字段
   - types.ts 的 ToolCall 只有 `name` 和 `arguments: Record<string,unknown>`
   - 需要统一：要么在 types.ts 中加 `id` 字段，要么 engine.ts 内部定义 ExtendedToolCall

4. **ExecutionStepType 缺少枚举值**（4 处）
   - types.ts 只定义了 `'tool_call' | 'llm_thinking' | 'constraint_check'`
   - engine.ts 使用了 `'user_rejected'`、`'dry_run'`、`'tool_error'`、`'final_answer'`
   - 需要在 types.ts 中扩展 ExecutionStepType

5. **TokenUsage 字段名不匹配**（3 处）
   - types.ts: `{ input: number, output: number }`
   - engine.ts: `{ inputTokens: number, outputTokens: number }`
   - 统一为 types.ts 的定义

6. **AgentDefinition 上不存在 mcpServers 属性**（1 处）
   - 第 292 行 `agent.mcpServers` 不存在
   - 应改为 `agent.tools`（tools 就是 MCP Server 名称列表）

7. **ExecutionStep 结构不匹配**（2 处）
   - engine.ts 的 recordStep 写入 `toolCall`、`result`、`error`、`timestamp` 字段
   - types.ts 的 ExecutionStep 定义了 `stepNumber`、`toolName`、`toolInput`、`toolOutput`、`thinking`、`decision`、`passed`、`duration`
   - 需要重写 recordStep 方法，映射到正确的 ExecutionStep 字段

8. **engine.ts 的 connectMcpServers 方法与 McpClient API 不匹配**
   - engine.ts 调用 `new McpClient(serverName)` 和 `client.connect()` 无参
   - McpClient 的实际 API 是 `connect(serverName, command, args, env)`
   - 需要通过 McpRegistry 获取安装命令，再调用 McpClient.connect

9. **engine.ts 的 executeTool 方法引用了不存在的 registry.getClientForTool()**
   - McpRegistry 没有此方法
   - 需要维护一个 toolName → serverName 的映射，或直接用 McpClient 实例

10. **engine.ts 返回的 ExecutionResult 结构与 types.ts 不匹配**
    - engine.ts 返回 `{ status, result, steps, tokenUsage, duration }`
    - types.ts 定义 `{ agentName, status, output, steps, error?, startTime, endTime, tokenUsage? }`
    - 需要对齐字段名

### P1：McpClient 与 McpRegistry 的协作方式

当前 engine.ts 中的 MCP 连接逻辑需要重写：

```typescript
// 正确流程：
const registry = new McpRegistry();
const mcpClient = new McpClient();

for (const serverName of agent.tools) {
  const installCmd = await registry.getInstallCommand(serverName);
  const serverConfig = (await registry.get(serverName))?.config ?? {};
  await mcpClient.connect(serverName, installCmd.command, installCmd.args, serverConfig);
  const tools = await mcpClient.listTools(serverName);
  // 收集工具...
}
```

### P2：CLI 命令中 engine 返回值的字段映射

run.ts 和 index.ts 中读取 engine 结果时使用了 `(result as any).result`，需要统一为 `result.output`（与 types.ts 对齐）。

### P3：功能增强（按优先级）

1. **micon add 的实际安装逻辑** — 当前 add.ts 只写配置，不执行 npm install。需要：
   - 对于 npx 类型：不需要预安装，运行时自动下载
   - 对于 npm 类型：需要执行 `npm install -g` 或本地安装
   - 对于 binary 类型：需要下载二进制文件

2. **micon config set-api-key 的交互优化** — 当前使用 inquirer，需要测试非 TTY 环境

3. **micon log 的 JSONL 读取** — 当前 log.ts 读取逻辑需要与 appendLog 的写入格式对齐

4. **micon init 的模板系统** — 当前只有交互式创建，需要补充预置模板

5. **Hub 远程索引更新** — indexer.ts 目前是存根，需要实现 GitHub API 扫描

6. **Agent 组合编排** — V2 功能，当前不需要

### P4：测试与文档

1. 为 core/engine.ts 编写单元测试
2. 为 mcp/client.ts 编写集成测试（需要 mock MCP server）
3. 编写 README.md
4. 添加 CI（GitHub Actions）

---

## 架构决策记录

### 1. LLM 调用方式
- 使用 OpenAI SDK 作为统一接口
- 支持 OpenAI 和 Anthropic（通过 baseUrl 切换）
- BYOK 模式，用户自己提供 API Key
- 未来支持 Ollama 本地模型

### 2. MCP Server 沙箱
- MVP 阶段：权限声明 + 用户授权，不做进程隔离
- V2：Docker 容器隔离
- V3：WebAssembly 沙箱

### 3. Agent 定义范式
- 人定义目标+边界，LLM 自主规划执行（ReAct 循环）
- 不使用步骤编排（YAML steps），避免变成低配版 GitHub Actions
- YAML 只定义：goal、tools、constraints、inputs、output

### 4. 三级体验
- Level 1：`micon "自然语言"` — 零门槛
- Level 2：`micon run agent.yaml` — 可复用
- Level 3：`micon dev agent.yaml` — 可调试

---

## 开发命令

```bash
cd C:\Users\zz\Desktop\TRAE\micon

# 安装依赖
npm install

# 编译检查
npx tsc --noEmit

# 构建
npm run build

# 本地测试
node dist/index.js --help
node dist/index.js search github
node dist/index.js list

# 链接到全局（开发时用）
npm link
micon --help
```

---

## 关键依赖版本

| 包 | 版本 | 用途 |
|---|---|---|
| @modelcontextprotocol/sdk | ^1.12.1 | MCP 协议通信 |
| commander | ^12.1.0 | CLI 框架 |
| openai | ^4.78.0 | LLM API 调用 |
| chalk | ^5.3.0 | 终端彩色输出 |
| ora | ^8.1.0 | 加载动画 |
| inquirer | ^12.3.0 | 交互式提示 |
| js-yaml | ^4.1.0 | YAML 解析 |

---

## 下次开工的推荐顺序

1. 修复 engine.ts 的 14 个编译错误（P0）
2. 重写 engine.ts 的 MCP 连接逻辑（P1）
3. 统一 CLI 与 engine 的返回值字段（P2）
4. `npm run build` 验证编译通过
5. 手动测试 `micon search` 和 `micon list`
6. 编写 README.md
7. 初始化 Git 仓库并首次提交
