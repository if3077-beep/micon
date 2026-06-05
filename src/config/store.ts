/**
 * 全局配置管理
 *
 * 负责读写 ~/.micon/config.json，提供配置加载、保存和 LLM 配置访问。
 * 首次加载时自动创建默认配置文件，并与默认值合并以兼容旧版本。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { MiconConfig, LlmConfig } from '../core/types.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** Micon 配置目录 */
export const MICON_DIR = join(homedir(), '.micon');

/** 配置文件路径 */
export const CONFIG_PATH = join(MICON_DIR, 'config.json');

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

/**
 * 获取默认配置
 *
 * @returns 包含所有字段默认值的 MiconConfig 对象
 */
export function getDefaultConfig(): MiconConfig {
  return {
    version: '0.1.0',
    llm: {
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
    },
    mcpServers: {},
    agents: {},
  };
}

// ---------------------------------------------------------------------------
// 深度合并工具
// ---------------------------------------------------------------------------

/**
 * 将用户配置与默认配置深度合并，确保旧版本配置中缺失的字段有默认值。
 */
function mergeWithDefault(user: Partial<MiconConfig>, defaults: MiconConfig): MiconConfig {
  return {
    version: user.version ?? defaults.version,
    llm: {
      ...defaults.llm,
      ...user.llm,
    },
    mcpServers: user.mcpServers ?? defaults.mcpServers,
    agents: user.agents ?? defaults.agents,
  };
}

// ---------------------------------------------------------------------------
// ConfigStore
// ---------------------------------------------------------------------------

/**
 * 全局配置存储
 *
 * 提供 ~/.micon/config.json 的加载、保存和便捷访问方法。
 */
export class ConfigStore {
  /**
   * 确保 ~/.micon/ 目录存在
   */
  async ensureDir(): Promise<void> {
    await mkdir(MICON_DIR, { recursive: true });
  }

  /**
   * 从文件加载配置
   *
   * 如果配置文件不存在则创建默认配置；加载后与默认值合并以兼容旧版本。
   */
  async load(): Promise<MiconConfig> {
    const defaults = getDefaultConfig();

    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<MiconConfig>;
      return mergeWithDefault(parsed, defaults);
    } catch {
      // 文件不存在或解析失败，创建默认配置
      await this.ensureDir();
      await this.save(defaults);
      return defaults;
    }
  }

  /**
   * 保存配置到文件
   */
  async save(config: MiconConfig): Promise<void> {
    await this.ensureDir();
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * 获取 LLM 配置
   *
   * 如果 apiKey 为空，提示用户输入。
   */
  async getLlmConfig(): Promise<LlmConfig> {
    const config = await this.load();

    if (!config.llm.apiKey) {
      const { default: inquirer } = await import('inquirer');
      const { apiKey } = await inquirer.prompt<{
        apiKey: string;
      }>([
        {
          type: 'password',
          name: 'apiKey',
          message: `Enter your ${config.llm.provider} API key:`,
          mask: '*',
        },
      ]);

      config.llm.apiKey = apiKey;
      await this.save(config);
    }

    return config.llm;
  }

  /**
   * 更新 LLM 配置
   */
  async setLlmConfig(llm: LlmConfig): Promise<void> {
    const config = await this.load();
    config.llm = llm;
    await this.save(config);
  }

  /**
   * 获取 API Key
   *
   * @throws 如果 API Key 未设置则抛出明确错误
   */
  async getApiKey(): Promise<string> {
    const llm = await this.getLlmConfig();

    if (!llm.apiKey) {
      throw new Error(
        'API key is not set. Run `micon config` or set it via environment variable.',
      );
    }

    return llm.apiKey;
  }
}
