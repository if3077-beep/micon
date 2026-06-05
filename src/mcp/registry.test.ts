/**
 * McpRegistry 测试
 *
 * 测试 MCP Server 注册表的安装、卸载、权限管理和启动命令生成。
 * 使用真实 ConfigStore（~/.micon/config.json），测试前后备份/恢复配置以避免污染。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { McpRegistry } from './registry.js';
import type { McpServerManifest } from '../core/types.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';

const MICON_DIR = join(homedir(), '.micon');
const CONFIG_PATH = join(MICON_DIR, 'config.json');
const BACKUP_PATH = join(MICON_DIR, 'config.json.registry-test-backup');

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
  // 没有 backup 时不动 config（可能是测试前就存在的真实配置）
}

function makeTestManifest(overrides: Partial<McpServerManifest> = {}): McpServerManifest {
  return {
    name: 'test-server',
    displayName: 'Test Server',
    description: 'A test MCP server',
    version: '1.0.0',
    repository: 'https://github.com/test/server',
    category: 'development',
    permissions: [{ name: 'read', description: 'Read access', default: 'allow' }],
    capabilities: [{ name: 'test', description: 'Test capability' }],
    install: { type: 'npx', package: 'test-server' },
    config: [],
    quality: {
      stars: 100,
      lastUpdate: new Date().toISOString(),
      testCoverage: 80,
      securityAudit: true,
      compatibility: 'Node 18+',
    },
    ...overrides,
  };
}

describe('McpRegistry', () => {
  beforeEach(() => {
    backupConfig();
  });

  afterEach(() => {
    restoreConfig();
  });

  describe('getInstallCommand', () => {
    it('should return npx command for npx install type', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({
        install: { type: 'npx', package: '@test/mcp-server' },
      });

      await registry.install(manifest, ['read'], {});

      const cmd = await registry.getInstallCommand('test-server');
      assert.equal(cmd.command, 'npx');
      assert.deepEqual(cmd.args, ['-y', '@test/mcp-server']);
    });

    it('should return node command for npm install type', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({
        name: 'test-npm-server',
        install: { type: 'npm', package: 'test-npm-server' },
      });

      await registry.install(manifest, ['read'], {});

      const cmd = await registry.getInstallCommand('test-npm-server');
      assert.equal(cmd.command, 'node');
      assert.ok(cmd.args[0].includes('test-npm-server'));
    });

    it('should return binary command for binary install type', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({
        name: 'test-binary-server',
        install: { type: 'binary', command: 'my-mcp-server', args: ['--port', '3000'] },
      });

      await registry.install(manifest, ['read'], {});

      const cmd = await registry.getInstallCommand('test-binary-server');
      assert.equal(cmd.command, 'my-mcp-server');
      assert.deepEqual(cmd.args, ['--port', '3000']);
    });

    it('should throw for unknown install type', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({
        name: 'test-bad-server',
        install: { type: 'unknown' } as any,
      });

      await registry.install(manifest, ['read'], {});

      await assert.rejects(
        () => registry.getInstallCommand('test-bad-server'),
        { message: /Unknown install type/ },
      );
    });

    it('should throw for non-existent server', async () => {
      const registry = new McpRegistry();
      await assert.rejects(
        () => registry.getInstallCommand('non-existent'),
        { message: /not installed/ },
      );
    });
  });

  describe('install and uninstall', () => {
    it('should install and list a server', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({ name: 'test-list-server' });
      await registry.install(manifest, ['read'], {});

      const list = await registry.list();
      const found = list.find(s => s.manifest.name === 'test-list-server');
      assert.ok(found);
      assert.deepEqual(found.grantedPermissions, ['read']);
    });

    it('should throw when installing same server twice', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({ name: 'test-dup-server' });
      await registry.install(manifest, ['read'], {});

      await assert.rejects(
        () => registry.install(manifest, ['read'], {}),
        { message: /already installed/ },
      );
    });

    it('should uninstall a server', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({ name: 'test-uninstall-server' });
      await registry.install(manifest, ['read'], {});

      await registry.uninstall('test-uninstall-server');

      const list = await registry.list();
      assert.ok(!list.find(s => s.manifest.name === 'test-uninstall-server'));
    });

    it('should throw when uninstalling non-existent server', async () => {
      const registry = new McpRegistry();
      await assert.rejects(
        () => registry.uninstall('non-existent'),
        { message: /not installed/ },
      );
    });
  });

  describe('checkPermission and grantPermission', () => {
    it('should check granted permission', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({ name: 'test-perm-server' });
      await registry.install(manifest, ['read'], {});

      const hasRead = await registry.checkPermission('test-perm-server', 'read');
      assert.equal(hasRead, true);

      const hasWrite = await registry.checkPermission('test-perm-server', 'write');
      assert.equal(hasWrite, false);
    });

    it('should grant new permission', async () => {
      const registry = new McpRegistry();
      const manifest = makeTestManifest({ name: 'test-grant-server' });
      await registry.install(manifest, ['read'], {});

      await registry.grantPermission('test-grant-server', 'write');

      const hasWrite = await registry.checkPermission('test-grant-server', 'write');
      assert.equal(hasWrite, true);
    });
  });
});
