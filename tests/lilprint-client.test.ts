import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

function runScript(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
}

describe('LilPrint client v1 contract helpers', () => {
  beforeAll(() => {
    const repoRoot = path.resolve(__dirname, '..');
    runScript(path.join(repoRoot, 'dist', 'printing', 'lilprint-client.js'));
  });

  it('sends requestedBy object and clear statuses by default', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
        headers: { get: () => '' }
      } as any;
    });

    const client = (window as any).LilposLilPrintClient.createLilPrintClient({
      baseUrl: 'http://localhost:3030',
      fetchImpl
    });

    await client.pausePrinter('printer_1', 'Maintenance', 'Manager');
    await client.clearPrinterQueue('printer_1', 'Shift change', { appId: 'lilpos', userId: 'u1', userName: 'Manager' });

    const pauseBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const clearBody = JSON.parse(fetchImpl.mock.calls[1][1].body);

    expect(pauseBody).toEqual({
      reason: 'Maintenance',
      requestedBy: {
        appId: 'lilpos',
        userId: 'Manager',
        userName: 'Manager'
      }
    });

    expect(clearBody.statuses).toEqual(['QUEUED', 'RETRY_WAIT']);
    expect(clearBody.requestedBy).toEqual({
      appId: 'lilpos',
      userId: 'u1',
      userName: 'Manager'
    });
  });

  it('exposes list and queue endpoints with query params', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
        headers: { get: () => '' }
      } as any;
    });

    const client = (window as any).LilposLilPrintClient.createLilPrintClient({
      baseUrl: 'http://localhost:3030',
      fetchImpl
    });

    await client.listPrintJobs({ printerId: 'p1', limit: 5 });
    await client.getQueueSummary({ appId: 'lilpos', printerId: 'p1' });

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3030/v1/print-jobs?printerId=p1&limit=5');
    expect(fetchImpl.mock.calls[1][0]).toBe('http://localhost:3030/v1/queue?appId=lilpos&printerId=p1');
  });

  it('exposes the documented health endpoint', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, status: 'running', version: '1.0.0' }),
        headers: { get: () => '' }
      } as any;
    });

    const client = (window as any).LilposLilPrintClient.createLilPrintClient({
      baseUrl: 'http://localhost:3030',
      fetchImpl
    });

    const response = await client.getHealth();

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:3030/health');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true, status: 'running', version: '1.0.0' });
  });

  it('reads requestId and error details from error payload when headers are missing', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: any) => {
      return {
        ok: false,
        status: 409,
        text: async () => JSON.stringify({
          ok: false,
          requestId: 'req-123',
          error: {
            code: 'INVALID_JOB_STATE',
            message: 'Only QUEUED or RETRY_WAIT jobs can be canceled',
            retryable: false
          }
        }),
        headers: { get: () => '' }
      } as any;
    });

    const client = (window as any).LilposLilPrintClient.createLilPrintClient({
      baseUrl: 'http://localhost:3030',
      fetchImpl
    });

    const result = await client.cancelJob('job_1', { reason: 'Test' });

    expect(result.ok).toBe(false);
    expect(result.requestId).toBe('req-123');
    expect(result.errorCode).toBe('INVALID_JOB_STATE');
    expect(result.errorMessage).toContain('Only QUEUED or RETRY_WAIT jobs can be canceled');
  });
});
