import { describe, it, expect } from 'vitest';
import {
  validateImageFile,
  validateDocumentFile,
  validateFile,
  validateFileCount,
  getEffectiveMimeType,
  convertFilesToDataUris,
} from '../fileAttachments';

// Helper to create a mock File with specific properties
function createMockFile(
  name: string,
  type: string,
  size: number
): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size, writable: false });
  return file;
}

describe('getEffectiveMimeType', () => {
  it('returns file.type when available', () => {
    const file = createMockFile('test.png', 'image/png', 1000);
    expect(getEffectiveMimeType(file)).toBe('image/png');
  });

  it('falls back to extension for .md files', () => {
    const file = createMockFile('readme.md', '', 1000);
    expect(getEffectiveMimeType(file)).toBe('text/markdown');
  });

  it('falls back to extension for .txt files', () => {
    const file = createMockFile('notes.txt', '', 1000);
    expect(getEffectiveMimeType(file)).toBe('text/plain');
  });

  it('falls back to extension for .json files', () => {
    const file = createMockFile('config.json', 'application/octet-stream', 1000);
    expect(getEffectiveMimeType(file)).toBe('application/json');
  });

  it('handles .csv files', () => {
    const file = createMockFile('data.csv', '', 1000);
    expect(getEffectiveMimeType(file)).toBe('text/csv');
  });

  it('handles .pdf files', () => {
    const file = createMockFile('document.pdf', '', 1000);
    expect(getEffectiveMimeType(file)).toBe('application/pdf');
  });
});

describe('validateImageFile', () => {
  describe('valid images', () => {
    it('accepts PNG under size limit', () => {
      const file = createMockFile('test.png', 'image/png', 1024);
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts JPEG under size limit', () => {
      const file = createMockFile('photo.jpg', 'image/jpeg', 2 * 1024 * 1024);
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts GIF under size limit', () => {
      const file = createMockFile('animation.gif', 'image/gif', 1000);
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts WebP under size limit', () => {
      const file = createMockFile('image.webp', 'image/webp', 1000);
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('size validation', () => {
    it('rejects images over 5MB', () => {
      const file = createMockFile('large.png', 'image/png', 6 * 1024 * 1024);
      const result = validateImageFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('5MB');
    });

    it('accepts images exactly at 5MB limit', () => {
      const file = createMockFile('exact.png', 'image/png', 5 * 1024 * 1024);
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('type validation', () => {
    it('rejects non-image files', () => {
      const file = createMockFile('document.pdf', 'application/pdf', 1000);
      const result = validateImageFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not an image');
    });

    it('rejects unsupported image formats', () => {
      const file = createMockFile('image.bmp', 'image/bmp', 1000);
      const result = validateImageFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });
});

describe('validateDocumentFile', () => {
  describe('valid documents', () => {
    it('accepts PDF files', () => {
      const file = createMockFile('doc.pdf', 'application/pdf', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts plain text files', () => {
      const file = createMockFile('notes.txt', 'text/plain', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts markdown files', () => {
      const file = createMockFile('readme.md', 'text/markdown', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts JSON files', () => {
      const file = createMockFile('config.json', 'application/json', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts CSV files', () => {
      const file = createMockFile('data.csv', 'text/csv', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts HTML files', () => {
      const file = createMockFile('page.html', 'text/html', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts XML files', () => {
      const file = createMockFile('data.xml', 'application/xml', 1000);
      const result = validateDocumentFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('size validation', () => {
    it('rejects documents over 20MB', () => {
      const file = createMockFile('huge.pdf', 'application/pdf', 21 * 1024 * 1024);
      const result = validateDocumentFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('20MB');
    });
  });

  describe('type validation', () => {
    it('rejects unsupported document types', () => {
      const file = createMockFile('spreadsheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000);
      const result = validateDocumentFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });
});

describe('validateFile', () => {
  it('routes image files to image validation', () => {
    const file = createMockFile('test.png', 'image/png', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it('routes document files to document validation', () => {
    const file = createMockFile('doc.pdf', 'application/pdf', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it('rejects completely unsupported file types', () => {
    const file = createMockFile('archive.zip', 'application/zip', 1000);
    const result = validateFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not a supported file type');
  });
});

describe('validateFileCount', () => {
  it('accepts files within limit', () => {
    const files = [
      createMockFile('1.png', 'image/png', 100),
      createMockFile('2.png', 'image/png', 100),
    ];
    const result = validateFileCount(files, 0);
    expect(result.valid).toBe(true);
  });

  it('considers existing file count', () => {
    const files = [createMockFile('new.png', 'image/png', 100)];
    const result = validateFileCount(files, 9);
    expect(result.valid).toBe(true);
  });

  it('rejects when total exceeds 10 files', () => {
    const files = [
      createMockFile('1.png', 'image/png', 100),
      createMockFile('2.png', 'image/png', 100),
    ];
    const result = validateFileCount(files, 9);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 10 files');
  });

  it('provides helpful error message with counts', () => {
    const files = [
      createMockFile('1.png', 'image/png', 100),
      createMockFile('2.png', 'image/png', 100),
      createMockFile('3.png', 'image/png', 100),
    ];
    const result = validateFileCount(files, 8);

    expect(result.error).toContain('8 attached');
    expect(result.error).toContain('3 more');
  });
});

describe('convertFilesToDataUris', () => {
  it('converts a valid image file to data URI', async () => {
    const file = createMockFile('test.png', 'image/png', 100);
    
    const results = await convertFilesToDataUris([file]);
    
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('test.png');
    expect(results[0].mimeType).toBe('image/png');
    expect(results[0].sizeBytes).toBe(100);
    expect(results[0].dataUri).toMatch(/^data:image\/png;base64,/);
  });

  it('converts multiple files', async () => {
    const files = [
      createMockFile('a.png', 'image/png', 100),
      createMockFile('b.pdf', 'application/pdf', 200),
    ];
    
    const results = await convertFilesToDataUris(files);
    
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('a.png');
    expect(results[1].name).toBe('b.pdf');
  });

  it('throws error for invalid file type', async () => {
    const file = createMockFile('test.exe', 'application/x-msdownload', 100);
    
    await expect(convertFilesToDataUris([file])).rejects.toThrow('not a supported file type');
  });

  it('throws error for oversized image', async () => {
    const file = createMockFile('huge.png', 'image/png', 6 * 1024 * 1024);
    
    await expect(convertFilesToDataUris([file])).rejects.toThrow('Maximum file size is 5MB');
  });

  it('corrects MIME type in data URI based on extension', async () => {
    // File with octet-stream type but .md extension should get text/markdown
    const file = createMockFile('readme.md', 'application/octet-stream', 100);
    
    const results = await convertFilesToDataUris([file]);
    
    expect(results[0].mimeType).toBe('text/markdown');
    expect(results[0].dataUri).toMatch(/^data:text\/markdown;base64,/);
  });
});
