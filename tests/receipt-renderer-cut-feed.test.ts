import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

function runScript(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
}

describe('Receipt Renderer Cut Feed', () => {
  beforeAll(() => {
    const repoRoot = path.resolve(__dirname, '..');
    runScript(path.join(repoRoot, 'dist', 'printing', 'printer-profile-registry.js'));
    runScript(path.join(repoRoot, 'dist', 'printing', 'printer-settings-service.js'));
    runScript(path.join(repoRoot, 'dist', 'printing', 'escpos-builder.js'));
    runScript(path.join(repoRoot, 'dist', 'printing', 'receipt-renderer.js'));
  });

  function renderBytes(feedLinesBeforeCut: number, cutPaperAfterReceipt: boolean): number[] {
    const rendered = (window as any).LilposReceiptRenderer.renderPrinterTestEscposBase64({
      settings: {
        merchantId: 'm1',
        locationId: 'l1',
        stationId: '1',
        feedLinesBeforeCut,
        cutPaperAfterReceipt
      },
      printer: {
        id: 'printer_1',
        name: 'Printer 1',
        ip: '192.168.1.10',
        port: 9100,
        profile: 'generic_escpos'
      }
    });
    return rendered.bytes || [];
  }

  function includesSequence(bytes: number[], sequence: number[]): boolean {
    for (let i = 0; i <= bytes.length - sequence.length; i += 1) {
      let matches = true;
      for (let j = 0; j < sequence.length; j += 1) {
        if (bytes[i + j] !== sequence[j]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
    return false;
  }

  it('emits feed-and-cut with dynamic n from feedLinesBeforeCut', () => {
    const bytes2 = renderBytes(2, true);
    const bytes5 = renderBytes(5, true);

    expect(includesSequence(bytes2, [0x1d, 0x56, 0x00])).toBe(true);
    expect(includesSequence(bytes5, [0x1d, 0x56, 0x00])).toBe(true);

    const bytesDelta = bytes5.length - bytes2.length;
    expect(bytesDelta).toBe(3);

    expect(includesSequence(bytes2, [0x1d, 0x56, 0x42, 0x02])).toBe(false);
    expect(includesSequence(bytes5, [0x1d, 0x56, 0x42, 0x05])).toBe(false);
  });

  it('falls back to plain cut when feedLinesBeforeCut is zero', () => {
    const bytes = renderBytes(0, true);
    expect(includesSequence(bytes, [0x1d, 0x56, 0x00])).toBe(true);
    expect(includesSequence(bytes, [0x1d, 0x56, 0x42, 0x00])).toBe(false);
  });

  it('respects TM-U220 impact profile capability defaults', () => {
    const rendered = (window as any).LilposReceiptRenderer.renderPrinterTestEscposBase64({
      settings: {
        merchantId: 'm1',
        locationId: 'l1',
        stationId: '1',
        feedLinesBeforeCut: 3,
        cutPaperAfterReceipt: true
      },
      printer: {
        id: 'u220',
        name: 'Kitchen U220',
        ip: '192.168.1.11',
        port: 9100,
        profile: 'epson_tm_u220'
      }
    });
    const bytes = rendered.bytes || [];
    expect(rendered.profileId).toBe('epson_tm_u220');
    expect(rendered.profileTechnology).toBe('impact');
    expect(includesSequence(bytes, [0x1b, 0x4d, 0x01])).toBe(false);
    expect(includesSequence(bytes, [0x1d, 0x56, 0x00])).toBe(false);
  });
});
