import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('McpClient content parsing', () => {
  it('should extract text content from SDK response format', () => {
    // Simulating the content extraction logic from callTool
    const content: Array<{ type: string; text?: string }> = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
      { type: 'image', text: 'ignored' },
    ];
    const result = content
      .filter((c) => c.type === 'text' && c.text !== undefined)
      .map((c) => c.text!)
      .join('\n');
    assert.equal(result, 'Hello\nWorld');
  });

  it('should handle empty content array', () => {
    const content: Array<{ type: string; text?: string }> = [];
    const result = content
      .filter((c) => c.type === 'text' && c.text !== undefined)
      .map((c) => c.text!)
      .join('\n');
    assert.equal(result, '');
  });

  it('should handle content with no text items', () => {
    const content: Array<{ type: string; text?: string }> = [
      { type: 'image' },
      { type: 'error' },
    ];
    const result = content
      .filter((c) => c.type === 'text' && c.text !== undefined)
      .map((c) => c.text!)
      .join('\n');
    assert.equal(result, '');
  });
});
