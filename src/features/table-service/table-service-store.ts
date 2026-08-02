/// <reference path="./table-service.types.ts" />
/// <reference path="./default-table-layout.ts" />

(function(global: any) {
  'use strict';

  const STORE_KEY = 'lilpos_table_service_rooms_v1';
  const TABLE_KEY_PREFIX = 'lilpos_table_service_tables_v1:';

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  function createTableServiceStore(options: any = {}) {
    const dataService = options.dataService || global.lilposDataService || null;
    const nowIso = options.nowIso || (() => new Date().toISOString());
    const getPlanPersistenceMode = options.getPlanPersistenceMode || (() => 'same-day');
    const persistSameDay = () => getPlanPersistenceMode() === 'persistent';
    const defaultLayout = global.LilposTableServiceDefaults.defaultLayout;

    async function readRooms(): Promise<TableServiceRoom[]> {
      if (dataService?.getRuntimeCache) {
        const cached = await dataService.getRuntimeCache(STORE_KEY);
        if (cached && Array.isArray(cached.rooms)) {
          return cached.rooms.map((room: any) => global.LilposTableServiceDefaults.normalizeRoom(room));
        }
      }
      return [clone(defaultLayout().room)];
    }

    async function readRoomTables(roomId: string): Promise<TableServiceTable[]> {
      const key = `${TABLE_KEY_PREFIX}${roomId}`;
      if (dataService?.getRuntimeCache) {
        const cached = await dataService.getRuntimeCache(key);
        if (cached && Array.isArray(cached.tables)) {
          return cached.tables.map((table: any) => global.LilposTableServiceDefaults.normalizeTable(table, roomId));
        }
      }
      return clone(defaultLayout(roomId).tables);
    }

    async function saveRooms(rooms: TableServiceRoom[]): Promise<void> {
      if (dataService?.saveRuntimeCache) {
        await dataService.saveRuntimeCache(STORE_KEY, { rooms: clone(rooms), updatedAt: nowIso() });
      }
    }

    async function saveRoomTables(roomId: string, tables: TableServiceTable[]): Promise<void> {
      if (dataService?.saveRuntimeCache) {
        await dataService.saveRuntimeCache(`${TABLE_KEY_PREFIX}${roomId}`, {
          roomId,
          tables: clone(tables),
          updatedAt: nowIso(),
          persisted: persistSameDay()
        });
      }
    }

    return {
      async getRooms(): Promise<TableServiceRoom[]> {
        return readRooms();
      },
      async getRoomLayout(roomId: string): Promise<TableServiceTable[]> {
        return readRoomTables(roomId);
      },
      async saveRoomLayout(roomId: string, tables: TableServiceTable[]): Promise<void> {
        if (!roomId) throw new Error('saveRoomLayout requires a roomId');
        await saveRoomTables(roomId, tables);
      },
      async getTable(tableId: string): Promise<TableServiceTable | null> {
        const rooms = await readRooms();
        for (const room of rooms) {
          const tables = await readRoomTables(room.id);
          const found = tables.find((table) => table.id === tableId);
          if (found) return found;
        }
        return null;
      },
      async updateTable(tableId: string, changes: Partial<TableServiceTable>): Promise<TableServiceTable> {
        const rooms = await readRooms();
        for (const room of rooms) {
          const tables = await readRoomTables(room.id);
          const index = tables.findIndex((table) => table.id === tableId);
          if (index < 0) continue;
          const next = global.LilposTableServiceDefaults.normalizeTable(Object.assign({}, tables[index], changes, { updatedAt: nowIso() }), room.id);
          tables[index] = next;
          await saveRoomTables(room.id, tables);
          return next;
        }
        throw new Error('Table not found');
      },
      async listActiveTables(roomId: string): Promise<TableServiceTable[]> {
        const tables = await readRoomTables(roomId);
        return tables.filter((table) => table.isVisible !== false);
      },
      async getSeedLayout(roomId: string): Promise<{ room: TableServiceRoom; tables: TableServiceTable[] } | null> {
        const layout = defaultLayout(roomId);
        return { room: layout.room, tables: layout.tables };
      },
      async ensureSeeded(roomId?: string) {
        const rooms = await readRooms();
        if (rooms.length) return { rooms };
        const layout = defaultLayout(roomId || global.LilposTableServiceDefaults.DEFAULT_ROOM_ID);
        await saveRooms([layout.room]);
        await saveRoomTables(layout.room.id, layout.tables);
        return { rooms: [layout.room], tables: layout.tables };
      }
    };
  }

  global.LilposTableServiceStore = { createTableServiceStore };
})(window);
