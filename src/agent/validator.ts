/**
 * Agent 定义校验
 *
 * 对 AgentDefinition 进行结构和语义校验，确保定义完整且合法。
 * 包括字段格式、工具可用性、输入输出约束等规则。
 */

import type {
  AgentDefinition,
  AgentInputType,
  AgentOutputFormat,
  AgentOutputTarget,
} from '../core/types.js';
import { McpRegistry } from '../mcp/registry.js';

// ---------------------------------------------------------------------------
// 合法值集合
// ---------------------------------------------------------------------------

const VALID_INPUT_TYPES: ReadonlySet<string> = new Set<string>([
  'string',
  'number',
  'boolean',
]);

const VALID_OUTPUT_FORMATS: ReadonlySet<string> = new Set<string>([
  'markdown',
  'json',
  'text',
]);

const VALID_OUTPUT_TARGETS: ReadonlySet<string> = new Set<string>([
  'stdout',
  'github-pr-comment',
  'file',
]);

// ---------------------------------------------------------------------------
// AgentValidator
// ---------------------------------------------------------------------------

/**
 * Agent 定义校验器
 *
 * 提供 validate() 校验 Agent 定义本身，以及 validateInputs() 校验用户输入。
 */
export class AgentValidator {
  private registry: McpRegistry;

  constructor() {
    this.registry = new McpRegistry();
  }

  /**
   * 校验 Agent 定义
   *
   * @param agent - 待校验的 AgentDefinition
   * @returns 校验结果，包含是否合法和错误列表
   */
  async validate(agent: AgentDefinition): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // --- name ---
    if (!agent.name) {
      errors.push('name is required');
    } else if (!/^[a-zA-Z0-9-]{2,50}$/.test(agent.name)) {
      errors.push(
        'name must be 2-50 characters, alphanumeric and hyphens only',
      );
    }

    // --- goal ---
    if (!agent.goal || typeof agent.goal !== 'string' || agent.goal.trim() === '') {
      errors.push('goal is required and must be a non-empty string');
    }

    // --- tools ---
    if (!Array.isArray(agent.tools) || agent.tools.length === 0) {
      errors.push('tools is required and must be a non-empty array');
    } else {
      // 检查每个 tool 是否为已安装的 MCP Server
      const installed = await this.registry.list();
      const installedNames = new Set(installed.map((s) => s.manifest.name));

      for (const tool of agent.tools) {
        if (typeof tool !== 'string' || tool.trim() === '') {
          errors.push(`each tool must be a non-empty string, got: ${JSON.stringify(tool)}`);
        } else if (!installedNames.has(tool)) {
          errors.push(`tool "${tool}" is not an installed MCP server`);
        }
      }
    }

    // --- constraints (optional) ---
    if (agent.constraints !== undefined) {
      if (!Array.isArray(agent.constraints)) {
        errors.push('constraints must be an array of strings');
      } else {
        for (const c of agent.constraints) {
          if (typeof c !== 'string') {
            errors.push(`each constraint must be a string, got: ${typeof c}`);
            break;
          }
        }
      }
    }

    // --- inputs (optional) ---
    if (agent.inputs !== undefined) {
      if (typeof agent.inputs !== 'object' || agent.inputs === null || Array.isArray(agent.inputs)) {
        errors.push('inputs must be an object mapping names to types');
      } else {
        for (const [key, value] of Object.entries(agent.inputs)) {
          if (!VALID_INPUT_TYPES.has(value as string)) {
            errors.push(
              `inputs.${key}: type must be one of 'string'|'number'|'boolean', got '${value}'`,
            );
          }
        }
      }
    }

    // --- output.format ---
    if (agent.output?.format !== undefined) {
      if (!VALID_OUTPUT_FORMATS.has(agent.output.format)) {
        errors.push(
          `output.format must be 'markdown'|'json'|'text', got '${agent.output.format}'`,
        );
      }
    }

    // --- output.to ---
    if (agent.output?.to !== undefined) {
      if (!VALID_OUTPUT_TARGETS.has(agent.output.to)) {
        errors.push(
          `output.to must be 'stdout'|'github-pr-comment'|'file', got '${agent.output.to}'`,
        );
      }
    }

    // --- maxSteps ---
    if (agent.maxSteps !== undefined) {
      if (typeof agent.maxSteps !== 'number' || agent.maxSteps < 1 || agent.maxSteps > 50) {
        errors.push('maxSteps must be a number between 1 and 50');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 校验用户输入是否匹配 Agent 的 inputs 定义
   *
   * @param agent  - Agent 定义
   * @param inputs - 用户提供的输入值
   * @returns 校验结果
   */
  validateInputs(
    agent: AgentDefinition,
    inputs: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const schema = agent.inputs ?? {};

    for (const [key, expectedType] of Object.entries(schema)) {
      const value = inputs[key];

      if (value === undefined || value === null) {
        errors.push(`missing required input: ${key}`);
        continue;
      }

      const actualType = typeof value;

      if (expectedType === 'number' && actualType !== 'number') {
        errors.push(`input "${key}" must be number, got ${actualType}`);
      } else if (expectedType === 'string' && actualType !== 'string') {
        errors.push(`input "${key}" must be string, got ${actualType}`);
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        errors.push(`input "${key}" must be boolean, got ${actualType}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
