# Micon

**MCP Server Hub + Lightweight Agent Runtime**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

## What is Micon?

Micon is a CLI tool that lets you discover, install, and run AI agents powered by MCP (Model Context Protocol) servers.

- **MCP Server Hub** — discover and install MCP servers from a curated registry, the same way you install npm packages.
- **Agent Runtime** — define and run AI agents with a single command, powered by a built-in ReAct loop.

Think of it as **"npm for MCP + Express for Agents"**.

## Quick Start

```bash
npm install -g micon

# Step 1: Discover MCP servers
micon search github

# Step 2: Install a server
micon add @anthropic/github-mcp --yes

# Step 3: Run an agent — one line, zero config
micon run "review PR #42 for security issues"
```

## Core Concepts

Micon supports three levels of usage, from zero-config to full control.

### Level 1 — One-liner, instant

```bash
micon run "summarize the latest commit in my repo"
```

Pass a natural language prompt directly. Micon picks the right MCP servers and model automatically. After execution, it asks if you want to save it as a reusable agent.

### Level 2 — Reusable, parameterized

Define an agent in YAML, then run it by name:

```yaml
# pr-reviewer.yaml
name: pr-reviewer
description: "Review pull requests for security and performance issues"

goal: |
  Review the specified pull request, identify security vulnerabilities,
  performance issues, and logic errors. Post the review as a PR comment.

tools:
  - '@anthropic/github-mcp'

constraints:
  - Read-only access — never modify any files
  - Comment only — do not approve or merge PRs

inputs:
  repo:
    type: string
  pr_number:
    type: number

output:
  format: markdown
  to: github-pr-comment

model: gpt-4o
maxSteps: 8
```

```bash
micon run pr-reviewer --input repo=myorg/myrepo --input pr_number=42
```

### Level 3 — Interactive, step-by-step

```bash
micon dev pr-reviewer --input pr_number=42
```

Run an agent in development mode. Confirm or reject each tool call before execution. Inspect the ReAct loop in real time.

## Agent Definition

Agents are defined in YAML with **goal + tools + constraints** — not step-by-step scripts. The LLM decides how to achieve the goal.

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent identifier (alphanumeric + hyphens) |
| `description` | No | Human-readable description |
| `goal` | Yes | Natural language goal for the agent |
| `tools` | Yes | List of MCP server names to use |
| `constraints` | No | Rules the agent must follow (e.g. "read-only") |
| `inputs` | No | Parameter definitions with type |
| `output` | No | Output format (`markdown`/`json`/`text`) and target |
| `model` | No | LLM model override |
| `maxSteps` | No | Max ReAct loop iterations (default: 10) |

## CLI Commands

| Command | Description |
|---------|-------------|
| `micon run <target>` | Run agent by name, YAML file, or natural language |
| `micon search <query>` | Search the MCP server hub |
| `micon add <server>` | Install an MCP server from the hub |
| `micon list` | List installed MCP servers |
| `micon init <name>` | Create a new agent definition file |
| `micon dev <agent>` | Run agent in interactive dev mode |
| `micon log [agent]` | View agent execution history |
| `micon config show` | Show current configuration |
| `micon config set-api-key` | Set LLM API key |
| `micon config set-model <model>` | Set default LLM model |

### Common options for `micon run`

| Option | Description |
|--------|-------------|
| `--input key=value` | Pass input parameter (repeatable) |
| `--dry-run` | Preview execution plan without running |
| `--model <model>` | Override LLM model |
| `--max-steps <n>` | Override max ReAct loop steps |

## Hub Quality Scoring

Every MCP server in the hub receives a quality grade from A to F:

| Grade | Score | Criteria |
|-------|-------|----------|
| **A** | 90-100 | Well-documented, actively maintained, full test coverage, security audited |
| **B** | 75-89 | Documented, maintained, partial test coverage |
| **C** | 60-74 | Basic documentation, sporadic updates, minimal tests |
| **D** | 40-59 | Undocumented or unmaintained, no tests |
| **F** | 0-39 | Broken, deprecated, or known security issues |

Scoring weights: Activity (25%), Test Coverage (20%), Documentation (20%), Security (20%), Community (15%).

## Configuration

### Config file

`~/.micon/config.json`

```json
{
  "version": "0.1.0",
  "llm": {
    "provider": "openai",
    "apiKey": "",
    "model": "gpt-4o",
    "baseUrl": "https://api.openai.com/v1"
  },
  "mcpServers": {},
  "agents": {}
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key for OpenAI models (auto-detected) |
| `ANTHROPIC_API_KEY` | API key for Anthropic models (auto-detected) |
| `MICON_DEBUG` | Enable debug logging (any value) |

## Architecture

Micon agents execute a **ReAct loop** (Reason → Act → Observe):

```
┌──────────────────────────────┐
│     User Goal + Tools        │
│     + Constraints            │
└─────────────┬────────────────┘
              │
       ┌──────▼──────┐
       │  LLM Planner │ ← decides which tool to call
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │ Tool Executor │ ← invokes MCP server tool
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │   Observe    │ ← feed result back to LLM
       └──────┬──────┘
              │
         Goal met? ──Yes──→ Return result
              │
             No → loop back to Planner
```

The loop terminates when the LLM produces a final answer or reaches the configured step limit. Constraint checks run before every tool execution.

## Development

```bash
# Clone the repository
git clone https://github.com/if3077-beep/micon.git
cd micon

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js --help
node dist/index.js search github
node dist/index.js run "hello world" --dry-run
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m "Add my feature"`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE) - Copyright (c) 2026 Micon Contributors
