import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferInstallType, inferCapabilities, inferPermissions } from './indexer.js';
import type { GitHubRepo } from './indexer.js';

const makeRepo = (overrides: Partial<GitHubRepo> = {}): GitHubRepo => ({
  full_name: 'test/repo',
  name: 'repo',
  description: 'A test MCP server',
  html_url: 'https://github.com/test/repo',
  stargazers_count: 100,
  updated_at: '2025-01-01T00:00:00Z',
  language: 'TypeScript',
  topics: ['mcp-server'],
  ...overrides,
});

describe('inferInstallType', () => {
  it('should default to npx', () => {
    const repo = makeRepo();
    const result = inferInstallType(repo);
    assert.equal(result.type, 'npx');
    assert.equal(result.package, 'test/repo');
  });

  it('should detect npx from name pattern', () => {
    const repo = makeRepo({ name: 'mcp-server-github' });
    const result = inferInstallType(repo);
    assert.equal(result.type, 'npx');
  });

  it('should detect npx from description', () => {
    const repo = makeRepo({ description: 'Run with npx this server' });
    const result = inferInstallType(repo);
    assert.equal(result.type, 'npx');
  });
});

describe('inferCapabilities', () => {
  it('should infer github capabilities from description', () => {
    const repo = makeRepo({ description: 'GitHub PR and issue management' });
    const caps = inferCapabilities(repo);
    assert.ok(caps.some(c => c.name === 'github-ops'));
  });

  it('should infer file capabilities from description', () => {
    const repo = makeRepo({ description: 'File system read and write' });
    const caps = inferCapabilities(repo);
    assert.ok(caps.some(c => c.name === 'file-ops'));
  });

  it('should default to general when no keywords match', () => {
    const repo = makeRepo({ description: 'Something completely unrelated' });
    const caps = inferCapabilities(repo);
    assert.ok(caps.some(c => c.name === 'general'));
  });
});

describe('inferPermissions', () => {
  it('should always include read permission', () => {
    const repo = makeRepo();
    const perms = inferPermissions(repo);
    assert.ok(perms.some(p => p.name === 'read'));
  });

  it('should add write permission for write-related descriptions', () => {
    const repo = makeRepo({ description: 'Create and update files' });
    const perms = inferPermissions(repo);
    assert.ok(perms.some(p => p.name === 'write'));
  });

  it('should not add write permission for read-only descriptions', () => {
    const repo = makeRepo({ description: 'Read-only file viewer' });
    const perms = inferPermissions(repo);
    assert.ok(!perms.some(p => p.name === 'write'));
  });
});
