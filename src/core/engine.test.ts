import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkConstraint } from './engine.js';

describe('checkConstraint', () => {
  it('should block write tools when read-only constraint is set', () => {
    const result = checkConstraint('write_file', ['read-only']);
    assert.equal(result.blocked, true);
    assert.ok(result.reason);
  });

  it('should block write tools when 只读 constraint is set', () => {
    const result = checkConstraint('create_issue', ['只读']);
    assert.equal(result.blocked, true);
  });

  it('should allow read tools when read-only constraint is set', () => {
    const result = checkConstraint('read_file', ['read-only']);
    assert.equal(result.blocked, false);
  });

  it('should block approve/merge when comment-only constraint is set', () => {
    const result = checkConstraint('approve_pr', ['comment-only']);
    assert.equal(result.blocked, true);
  });

  it('should block deploy when comment-only constraint is set', () => {
    const result = checkConstraint('deploy_app', ['只评论']);
    assert.equal(result.blocked, true);
  });

  it('should allow comment when comment-only constraint is set', () => {
    const result = checkConstraint('comment_pr', ['comment-only']);
    assert.equal(result.blocked, false);
  });

  it('should not block anything with no constraints', () => {
    const result = checkConstraint('delete_everything', []);
    assert.equal(result.blocked, false);
  });

  it('should handle multiple constraints', () => {
    const result = checkConstraint('write_file', ['read-only', 'comment-only']);
    assert.equal(result.blocked, true);
  });
});
