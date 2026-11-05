import { describe, expect, it } from 'vitest';
import { sniffLocalFile } from '../../packages/runtime/src/local-bridge/files';
describe('local file classification', () => {
  it('detects magic bytes rather than trusting filenames or MIME declarations', () => {
    expect(sniffLocalFile(new TextEncoder().encode('%PDF-1.7'))).toBe('pdf');
    expect(sniffLocalFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image');
    expect(sniffLocalFile(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image');
    expect(sniffLocalFile(new TextEncoder().encode('<script>hello()</script>'))).toBe('text');
  });
});
