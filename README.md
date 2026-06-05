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

# Discover MCP servers
micon search github

# Install a server
micon add @anthropic/github-mcp --yes

# Run an agent with natural language
micon run "review PR #42 for security issues"
```

## Core Concepts

Micon supports three levels of usage, from zero-config to full control.

### Level 1 — Zero-config, instant

```bash
micon "summarize the latest commit"
```

Pass a natural language prompt directly. Micon picks the right MCP servers and model automatically.

### Level 2 — Reusable, parameterized

```yaml
# agent.yaml
name: pr-reviewer
description: Review pull requests for issues
model: claude-sonnet-4-20250514
servers:
  - @anthropic/github-mcp
prompt: |
  Review pull request {{pr_number}} in {{repo}} for:
  - Security vulnerabilities
  - Code quality issues
  - Missing tests
```

```bash
micon run agent.yaml --pr-number 42 --repo owner/repo
```

### Level 3 — Interactive, step-by-step

```bash
micon dev agent.yaml
```

Run an agent in development mode. Inspect each step of the ReAct loop, modify prompts on the fly, and debug tool calls interactively.

## Agent Definition

Agents are defined in YAML. Here is a complete example:

```yaml
name: pr-reviewer
version: 1.0.0
description: Automated pull request reviewer
model: claude-sonnet-4-20250514

servers:
  - name: @anthropic/github-mcp
    config:
      github_token: ${GITHUB_TOKEN}

tools:
  - github:get-pr
  - github:list-comments
  - github:create-review

prompt: |
  You are a senior code reviewer. Review pull request {{pr_number}}
  in repository {{repo}} and provide actionable feedback.

  Focus on:
  1. Security vulnerabilities
  2. Logic errors and edge cases
  3. Code style and maintainability
  4. Missing test coverage

  Output a structured review with severity levels (critical, warning, info).

parameters:
  - name: pr_number
    type: number
    required: true
  - name: repo
    type: string
    required: true
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `micon run <prompt or agent.yaml>` | Run an agent with a prompt or definition file |
| `micon search <query>` | Search the MCP server hub |
| `micon add <server>` | Install an MCP server |
| `micon list` | List installed MCP servers |
| `micon init [name]` | Scaffold a new agent definition |
| `micon dev <agent.yaml>` | Run an agent in interactive dev mode |
| `micon log [agent-id]` | View agent execution logs |
| `micon config` | Show or edit configuration |

## Hub Quality Scoring

Every MCP server in the hub receives a quality grade from A to F based on:

| Grade | Criteria |
|-------|----------|
| **A** | Well-documented, actively maintained, full test coverage, security audited |
| **B** | Documented, maintained, partial test coverage |
| **C** | Basic documentation, sporadic updates, minimal tests |
| **D** | Undocumented or unmaintained, no tests |
| **F** | Broken, deprecated, or known security issues |

Grades are computed from repository metadata: commit frequency, issue resolution time, documentation completeness, and test coverage reports.

## Configuration

### Config file

`~/.micon/config.json`

```json
{
  "defaultModel": "claude-sonnet-4-20250514",
  "servers": {
    "@anthropic/github-mcp": {
      "version": "1.2.0",
      "config": {
        "github_token": "${GITHUB_TOKEN}"
      }
    }
  },
  "hub": {
    "registry": "https://hub.micon.dev"
  }
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key for OpenAI models |
| `ANTHROPIC_API_KEY` | API key for Anthropic models |
| `MICON_CONFIG_DIR` | Override default config directory |

## Architecture

Micon agents execute a **ReAct loop**:

```
Reason -> Act -> Observe -> Reason -> Act -> Observe -> ...
```

1. **Reason** — the LLM analyzes the current state and decides which tool to call.
2. **Act** — Micon invokes the selected MCP tool and captures the result.
3. **Observe** — the result is fed back to the LLM for the next reasoning step.

The loop terminates when the LLM produces a final answer or reaches the configured step limit.

## Development

```bash
# Clone the repository
git clone https://github.com/micon-dev/micon.git
cd micon

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run locally
npm run dev -- run "hello world"
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m "Add my feature"`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

Please ensure all tests pass and follow the existing code style.

## License

[MIT](LICENSE) - Copyright (c) 2026 Micon Contributors
