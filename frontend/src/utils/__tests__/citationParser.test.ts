import { describe, it, expect } from 'vitest';
import { parseContentWithCitations } from '../citationParser';
import type { IAnnotation } from '../../types/chat';

describe('parseContentWithCitations', () => {
  describe('empty/null inputs', () => {
    it('returns empty citations when content is empty', () => {
      const result = parseContentWithCitations('', []);
      expect(result.citations).toHaveLength(0);
      expect(result.processedText).toBe('');
    });

    it('returns empty citations when annotations array is empty', () => {
      const result = parseContentWithCitations('Hello world', []);
      expect(result.citations).toHaveLength(0);
      expect(result.processedText).toBe('Hello world');
    });

    it('returns original content when no annotations provided', () => {
      const content = 'This is a test message without any citations.';
      const result = parseContentWithCitations(content, []);
      expect(result.processedText).toBe(content);
    });
  });

  describe('textToReplace substitution', () => {
    it('replaces textToReplace with numbered marker [1]', () => {
      const content = 'See source 【4:0†source】 for details';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'Source', textToReplace: '【4:0†source】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.processedText).toBe('See source [1] for details');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].index).toBe(1);
    });

    it('replaces multiple different placeholders with sequential numbers', () => {
      const content = 'First 【1:0†source1】 and second 【2:0†source2】';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'Source 1', textToReplace: '【1:0†source1】' },
        { type: 'uri_citation', label: 'Source 2', textToReplace: '【2:0†source2】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.processedText).toBe('First [1] and second [2]');
      expect(result.citations).toHaveLength(2);
    });
  });

  describe('deduplication', () => {
    it('deduplicates identical annotations with same key', () => {
      const content = '【4:0†source】 and again 【4:0†source】';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'Source', url: 'https://example.com', textToReplace: '【4:0†source】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.citations).toHaveLength(1);
      expect(result.processedText).toBe('[1] and again [1]');
    });

    it('tracks reference count for deduplicated citations', () => {
      // When multiple different annotations point to the same citation (same key),
      // the count increments each time getOrCreateCitationIndex is called.
      // With replaceAll, each annotation's textToReplace is processed once.
      const content = '【4:0†source】 first 【5:0†other】 second';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'Source', url: 'https://example.com', textToReplace: '【4:0†source】' },
        { type: 'uri_citation', label: 'Source', url: 'https://example.com', textToReplace: '【5:0†other】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      // Both annotations have the same key (type:label:url), so they dedupe to one citation
      expect(result.citations).toHaveLength(1);
      // Count is 2 because getOrCreateCitationIndex was called twice
      expect(result.citations[0].count).toBe(2);
    });
  });

  describe('annotation types', () => {
    it('handles uri_citation annotations', () => {
      const content = 'Check 【1:0†link】 here';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'Link', url: 'https://example.com', textToReplace: '【1:0†link】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.citations[0].annotation.type).toBe('uri_citation');
      expect(result.citations[0].annotation.url).toBe('https://example.com');
    });

    it('handles file_citation annotations', () => {
      const content = 'See file 【1:0†document.pdf】';
      const annotations: IAnnotation[] = [
        { type: 'file_citation', label: 'document.pdf', fileId: 'file-123', textToReplace: '【1:0†document.pdf】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.citations[0].annotation.type).toBe('file_citation');
      expect(result.citations[0].annotation.fileId).toBe('file-123');
    });
  });

  describe('Assistants API pattern matching', () => {
    it('handles 【N:M†label】 format', () => {
      const content = 'Reference 【4:0†source】 in text';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'source', textToReplace: '【4:0†source】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.processedText).toContain('[1]');
      expect(result.processedText).not.toContain('【');
    });

    it('handles 【N†label】 format (single number)', () => {
      const content = 'Reference 【13†myfile.pdf】 here';
      const annotations: IAnnotation[] = [
        { type: 'file_citation', label: 'myfile.pdf', textToReplace: '【13†myfile.pdf】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.processedText).toContain('[1]');
    });
  });

  describe('edge cases', () => {
    it('preserves text before and after citations', () => {
      const content = 'Before 【1:0†ref】 after';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'ref', textToReplace: '【1:0†ref】' }
      ];

      const result = parseContentWithCitations(content, annotations);
      expect(result.processedText).toBe('Before [1] after');
    });

    it('handles annotations without textToReplace gracefully', () => {
      const content = 'Some text without matching placeholders';
      const annotations: IAnnotation[] = [
        { type: 'uri_citation', label: 'Orphan', url: 'https://example.com' }
      ];

      const result = parseContentWithCitations(content, annotations);
      // Should not crash, content should be preserved
      expect(result.processedText).toBe(content);
    });
  });
});
