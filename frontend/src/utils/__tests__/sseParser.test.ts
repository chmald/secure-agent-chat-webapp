import { describe, it, expect, vi } from 'vitest';
import { parseSseLine, splitSseBuffer } from '../sseParser';

describe('parseSseLine', () => {
  describe('valid SSE lines', () => {
    it('parses a valid chunk event', () => {
      const line = 'data: {"type":"chunk","content":"Hello"}';
      const result = parseSseLine(line);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('chunk');
      expect(result?.data.content).toBe('Hello');
    });

    it('parses a conversationId event', () => {
      const line = 'data: {"type":"conversationId","conversationId":"conv-123"}';
      const result = parseSseLine(line);

      expect(result?.type).toBe('conversationId');
      expect(result?.data.conversationId).toBe('conv-123');
    });

    it('parses a done event', () => {
      const line = 'data: {"type":"done"}';
      const result = parseSseLine(line);

      expect(result?.type).toBe('done');
    });

    it('parses a usage event with token counts', () => {
      const line = 'data: {"type":"usage","promptTokens":100,"completionTokens":50,"totalTokens":150,"duration":1234}';
      const result = parseSseLine(line);

      expect(result?.type).toBe('usage');
      expect(result?.data.promptTokens).toBe(100);
      expect(result?.data.completionTokens).toBe(50);
      expect(result?.data.totalTokens).toBe(150);
      expect(result?.data.duration).toBe(1234);
    });

    it('parses an error event', () => {
      const line = 'data: {"type":"error","message":"Something went wrong"}';
      const result = parseSseLine(line);

      expect(result?.type).toBe('error');
      expect(result?.data.message).toBe('Something went wrong');
    });

    it('parses an annotations event', () => {
      const line = 'data: {"type":"annotations","annotations":[{"type":"uri_citation","label":"Test"}]}';
      const result = parseSseLine(line);

      expect(result?.type).toBe('annotations');
      expect(result?.data.annotations).toHaveLength(1);
    });

    it('parses a mcpApprovalRequest event', () => {
      const line = 'data: {"type":"mcpApprovalRequest","id":"approval-123","toolName":"read_file","serverLabel":"FileSystem","arguments":"{\\"path\\":\\"/test\\"}","previousResponseId":"resp-456"}';
      const result = parseSseLine(line);

      expect(result?.type).toBe('mcpApprovalRequest');
      expect(result?.data.id).toBe('approval-123');
      expect(result?.data.toolName).toBe('read_file');
      expect(result?.data.serverLabel).toBe('FileSystem');
      expect(result?.data.arguments).toBe('{"path":"/test"}');
      expect(result?.data.previousResponseId).toBe('resp-456');
    });
  });

  describe('invalid SSE lines', () => {
    it('returns null for empty string', () => {
      const result = parseSseLine('');
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      const result = parseSseLine('   ');
      expect(result).toBeNull();
    });

    it('returns null for line without data: prefix', () => {
      const result = parseSseLine('{"type":"chunk","content":"Hello"}');
      expect(result).toBeNull();
    });

    it('returns null for data: with empty JSON', () => {
      const result = parseSseLine('data: ');
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseSseLine('data: {not valid json}');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns null for JSON without type field', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseSseLine('data: {"content":"Hello"}');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null for non-object JSON', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseSseLine('data: "just a string"');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('handles extra whitespace around data:', () => {
      const line = '  data: {"type":"chunk","content":"test"}  ';
      const result = parseSseLine(line);

      expect(result?.type).toBe('chunk');
    });

    it('handles content with special characters', () => {
      const line = 'data: {"type":"chunk","content":"Hello\\nWorld\\t!"}';
      const result = parseSseLine(line);

      expect(result?.data.content).toBe('Hello\nWorld\t!');
    });

    it('handles unicode content', () => {
      const line = 'data: {"type":"chunk","content":"Hello 世界 🌍"}';
      const result = parseSseLine(line);

      expect(result?.data.content).toBe('Hello 世界 🌍');
    });
  });
});

describe('splitSseBuffer', () => {
  it('splits buffer on newlines', () => {
    const buffer = 'line1\nline2\nline3';
    const [lines, remaining] = splitSseBuffer(buffer);

    expect(lines).toEqual(['line1', 'line2']);
    expect(remaining).toBe('line3');
  });

  it('handles Windows-style line endings', () => {
    const buffer = 'line1\r\nline2\r\nline3';
    const [lines, remaining] = splitSseBuffer(buffer);

    expect(lines).toEqual(['line1', 'line2']);
    expect(remaining).toBe('line3');
  });

  it('returns empty lines array for no newlines', () => {
    const buffer = 'incomplete line';
    const [lines, remaining] = splitSseBuffer(buffer);

    expect(lines).toEqual([]);
    expect(remaining).toBe('incomplete line');
  });

  it('handles empty buffer', () => {
    const [lines, remaining] = splitSseBuffer('');

    expect(lines).toEqual([]);
    expect(remaining).toBe('');
  });

  it('handles buffer ending with newline', () => {
    const buffer = 'line1\nline2\n';
    const [lines, remaining] = splitSseBuffer(buffer);

    expect(lines).toEqual(['line1', 'line2']);
    expect(remaining).toBe('');
  });

  it('handles multiple consecutive newlines', () => {
    const buffer = 'line1\n\nline2\n';
    const [lines, remaining] = splitSseBuffer(buffer);

    expect(lines).toEqual(['line1', '', 'line2']);
    expect(remaining).toBe('');
  });
});
