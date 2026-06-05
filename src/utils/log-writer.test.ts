import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { appendLog } from './log-writer.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOGS_DIR = join(homedir(), '.micon', 'logs');

describe('appendLog', () => {
  afterEach(() => {
    // Clean up test log files
    const testLog = join(LOGS_DIR, 'test-agent.jsonl');
    const safeLog = join(LOGS_DIR, '___etc_passwd.jsonl');
    if (existsSync(testLog)) rmSync(testLog);
    if (existsSync(safeLog)) rmSync(safeLog);
  });

  it('should write log entry as JSONL', async () => {
    const result = { status: 'success', output: 'test output' };
    await appendLog('test-agent', result);

    const logPath = join(LOGS_DIR, 'test-agent.jsonl');
    assert.ok(existsSync(logPath));

    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 1);

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.output, 'test output');
  });

  it('should append multiple entries', async () => {
    await appendLog('test-agent', { status: 'success', output: 'run 1' });
    await appendLog('test-agent', { status: 'error', output: 'run 2' });

    const logPath = join(LOGS_DIR, 'test-agent.jsonl');
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2);
  });

  it('should sanitize agent name to prevent path traversal', async () => {
    await appendLog('../etc/passwd', { status: 'success' });

    // Should create a safe filename, not traverse paths
    const safePath = join(LOGS_DIR, '___etc_passwd.jsonl');
    assert.ok(existsSync(safePath), `Expected safe log file at ${safePath}`);

    // Original dangerous path should NOT exist
    const dangerPath = join(LOGS_DIR, '..', 'etc', 'passwd.jsonl');
    assert.ok(!existsSync(dangerPath));
  });
});
