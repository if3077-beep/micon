# Micon 开发指南

> MCP Server Hub + Lightweight Agent Runtime
> 仓库：https://github.com/if3077-beep/micon

## 当前状态

**v0.9.0** — 编译零错误，38 个测试全绿，CI 就绪。

### 文件清单

```
src/
├── index.ts                    # CLI 入口 + 自然语言一键模式
├── core/
│   ├── types.ts                # 核心类型定义
│   └── engine.ts               # ReAct 执行引擎
├── mcp/
│   ├── client.ts               # MCP 客户端（子进程连接）
│   └── registry.ts             # MCP Server 注册表（委托 ConfigStore）
├── agent/
│   ├── loader.ts               # YAML 加载器
│   ├── validator.ts            # Agent 校验器
│   └── store.ts                # Agent 存储
├── hub/
│   ├── scorer.ts               # 质量评分（A-F 等级）
│   ├── search.ts               # Hub 搜索引擎
│   └── indexer.ts              # GitHub REST API 索引器
├── config/
│   ├── store.ts                # 配置存储（~/.micon/config.json 唯一入口）
│   └── auth.ts                 # 交互式权限授权
├── cli/commands/
│   ├── run.ts                  # micon run
│   ├── dev.ts                  # micon dev（交互式调试）
│   ├── search.ts               # micon search
│   ├── add.ts                  # micon add
│   ├── remove.ts               # micon remove
│   ├── list.ts                 # micon list
│   ├── agents.ts               # micon agents
│   ├── init.ts                 # micon init（含模板）
│   ├── log.ts                  # micon log
│   └── config.ts               # micon config
└── utils/
    ├── logger.ts               # 日志工具
    ├── format.ts               # 格式化 + displayResult
    ├── log-writer.ts           # JSONL 日志写入
    └── agent-helper.ts         # askSaveAgent 提取
agents/                          # 示例 Agent
├── pr-reviewer.yaml
├── doc-generator.yaml
└── web-researcher.yaml
hub-data/
└── registry.json               # 15 个预置 MCP Server
```

### 测试覆盖

| 模块 | 测试文件 | 用例数 |
|------|----------|--------|
| core/engine | engine.test.ts | 8（checkConstraint） |
| hub/indexer | indexer.test.ts | 9（推断函数） |
| mcp/client | client.test.ts | 3（内容解析） |
| mcp/registry | registry.test.ts | 11（CRUD + 权限） |
| config/store | store.test.ts | 4（load/save/defaults） |
| utils/log-writer | log-writer.test.ts | 3（JSONL + 路径遍历防护） |

运行：`npm test`（tsc + node --test --test-concurrency=1）

### CI

`.github/workflows/test.yml` — Node 18/20/22 矩阵，步骤：install → type check → build → test。

---

## 架构决策记录

### 1. LLM 调用方式
- OpenAI SDK 作为统一接口，支持 OpenAI + Anthropic（baseUrl 切换）
- BYOK 模式，用户自带 API Key
- 环境变量 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 自动检测，优先于配置文件
- 未来支持 Ollama 本地模型

### 2. MCP Server 沙箱
- MVP：权限声明 + 用户授权，不做进程隔离
- V2：Docker 容器隔离
- V3：WebAssembly 沙箱

### 3. Agent 定义范式
- 人定义 goal + tools + constraints，LLM 自主决定执行路径（ReAct 循环）
- 不使用步骤编排（YAML steps），避免变成低配版 GitHub Actions

### 4. 三级体验
- Level 1：`micon "自然语言"` — 零门槛
- Level 2：`micon run agent.yaml` — 可复用
- Level 3：`micon dev agent.yaml` — 可调试

### 5. 配置持久化
- ConfigStore 是唯一读写 `~/.micon/config.json` 的入口
- McpRegistry 委托 ConfigStore，不直接操作文件
- API Key 只显示 `configured` / `not set`，不泄露任何字符

### 6. 安全设计
- agentName 正则过滤 `[^a-zA-Z0-9_-]` 防路径遍历
- MCP 连接失败跳过继续，不阻塞其他 server
- LLM 重试覆盖 APIError + TypeError（网络错误），指数退避最大 10s
- 非 TTY 环境明确报错

---

## 开发命令

```bash
# 安装依赖
npm install

# 类型检查
npx tsc --noEmit

# 构建
npm run build

# 测试
npm test

# 覆盖率
npm run test:coverage

# 本地运行
node dist/index.js --help
node dist/index.js search github
node dist/index.js run "hello" --dry-run

# 全局链接（开发时用）
npm link
micon --help
```

---

## 关键依赖

| 包 | 版本 | 用途 |
|---|---|---|
| @modelcontextprotocol/sdk | ^1.12.1 | MCP 协议通信 |
| commander | ^12.1.0 | CLI 框架 |
| openai | ^4.78.0 | LLM API 调用 |
| chalk | ^5.3.0 | 终端彩色输出 |
| ora | ^8.1.0 | 加载动画 |
| inquirer | ^12.3.0 | 交互式提示 |
| js-yaml | ^4.1.0 | YAML 解析 |

测试框架：node:test + node:assert（零依赖）

---

## 下次开工方向

1. **Hub 远程索引** — indexer.ts 已实现 GitHub REST API 扫描，可接入 `micon search` 实时查询
2. **micon add 实际安装** — 当前只写配置，npx 类型运行时自动下载，npm/binary 类型需实现
3. **Agent 组合编排** — 多 Agent 协作（V2）
4. **Ollama 本地模型** — 零配置本地推理
5. **Web UI** — 可视化 Agent 管理
