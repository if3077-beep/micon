import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigStore, CONFIG_PATH, MICON_DIR } from './store.js';
import { existsSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKUP_PATH = join(MICON_DIR, 'config.json.store-test-backup');

function backupConfig(): void {
  if (existsSync(CONFIG_PATH)) {
    copyFileSync(CONFIG_PATH, BACKUP_PATH);
    // Don't delete - another test might be reading it
  }
}

function restoreConfig(): void {
  if (existsSync(BACKUP_PATH)) {
    copyFileSync(BACKUP_PATH, CONFIG_PATH);
    try { rmSync(BACKUP_PATH); } catch { /* ignore */ }
  }
}

describe('ConfigStore', () => {
  beforeEach(() => backupConfig());
  afterEach(() => restoreConfig());

  describe('load and save', () => {
    it('should create default config when none exists', async () => {
      const store = new ConfigStore();
      const config = await store.load();

      assert.equal(config.version, '0.1.0');
      assert.equal(config.llm.provider, 'openai');
      assert.equal(config.llm.model, 'gpt-4o');
      assert.deepEqual(config.mcpServers, {});
      assert.deepEqual(config.agents, {});
    });

    it('should persist and reload config', async () => {
      const store = new ConfigStore();
      const config = await store.load();
      config.llm.model = 'gpt-4o-mini';
      await store.save(config);

      const store2 = new ConfigStore();
      const reloaded = await store2.load();
      assert.equal(reloaded.llm.model, 'gpt-4o-mini');
    });

    it('should merge with defaults for partial config', async () => {
      const store = new ConfigStore();
      // Write a partial config
      await store.ensureDir();
      const { writeFileSync } = await import('node:fs');
      writeFileSync(CONFIG_PATH, JSON.stringify({ version: '0.2.0' }), 'utf-8');

      const config = await store.load();
      // Should have version from file but defaults for everything else
      assert.equal(config.version, '0.2.0');
      assert.equal(config.llm.provider, 'openai');
    });
  });

  describe('setLlmConfig', () => {
    it('should update LLM config', async () => {
      const store = new ConfigStore();
      await store.load();

      await store.setLlmConfig({
        provider: 'anthropic',
        apiKey: 'sk-test-key',
        model: 'claude-3-opus',
        baseUrl: 'https://api.anthropic.com',
      });

      const config = await store.load();
      assert.equal(config.llm.provider, 'anthropic');
      assert.equal(config.llm.model, 'claude-3-opus');
    });
  });
});
