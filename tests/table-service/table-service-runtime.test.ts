import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import source files directly so the IIFE globals are registered on window
import '../../src/features/table-service/table-service.types';
import '../../src/features/table-service/default-table-layout';
import '../../src/features/table-service/table-service-store';
import '../../src/features/table-service/table-service-utils';
import '../../src/features/table-service/table-node';
import '../../src/features/table-service/table-status-legend';
import '../../src/features/table-service/table-service-header';
import '../../src/features/table-service/table-inspector';
import '../../src/features/table-service/table-layout-toolbar';
import '../../src/features/table-service/table-service-zoom-controls';
import '../../src/features/table-service/table-service-floor';
import '../../src/features/table-service/table-service-screen';
import '../../src/features/table-service/table-service-runtime';

describe('table service runtime', () => {
  const cache: Record<string, any> = {};

  beforeEach(() => {
    Object.keys(cache).forEach((key) => delete cache[key]);
    (window as any).lilposDataService = {
      getRuntimeCache: async (key: string) => cache[key] || null,
      saveRuntimeCache: async (key: string, value: any) => {
        cache[key] = value;
      }
    };
  });

  it('loads the default room and seed tables', async () => {
    const controller = (window as any).LilposTableServiceRuntime.createController({
      dataService: (window as any).lilposDataService,
      onChange: () => undefined
    });

    await controller.load();

    expect(controller.state.room?.name).toBe('Main Dining Room');
    expect(controller.state.tables.length).toBeGreaterThan(0);
    expect(controller.state.tables.find((table: any) => table.displayName === 'T2')?.status).toBe('AVAILABLE');
  });

  it('selects an available table through the callback', async () => {
    const onSelectTable = vi.fn();
    const controller = (window as any).LilposTableServiceRuntime.createController({
      dataService: (window as any).lilposDataService,
      onChange: () => undefined,
      onSelectTable
    });

    await controller.load();
    const available = controller.state.tables.find((table: any) => table.status === 'AVAILABLE');
    expect(available).toBeTruthy();

    controller.selectTableForService(available.id);

    expect(onSelectTable).toHaveBeenCalledTimes(1);
    expect(onSelectTable.mock.calls[0][0]).toBe(available.displayName);
  });
});
