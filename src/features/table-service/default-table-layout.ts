/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  const DEFAULT_ROOM_ID = 'main-dining-room';
  const DEFAULT_LAYOUT_KEY = 'lilpos_table_service_layout_v1';

  function nowIso() {
    return new Date().toISOString();
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function seedRoom(): TableServiceRoom {
    const stamp = nowIso();
    return {
      id: DEFAULT_ROOM_ID,
      name: 'Main Dining Room',
      sortOrder: 1,
      isActive: true,
      canvasWidth: 100,
      canvasHeight: 100,
      createdAt: stamp,
      updatedAt: stamp
    };
  }

  function seedTables(): TableServiceTable[] {
    const stamp = nowIso();
    return [
      { id: 'table_t1', roomId: DEFAULT_ROOM_ID, displayName: 'T1', shape: 'round', xPercent: 18, yPercent: 24, seatCapacity: 4, occupiedSeats: 4, status: 'SEATED', assignedServerName: 'Maria', activeOrderId: 'ord_t1', seatedAt: '2026-07-29T16:25:00.000Z', isVisible: true, isLocked: false, createdAt: stamp, updatedAt: stamp },
      { id: 'table_t2', roomId: DEFAULT_ROOM_ID, displayName: 'T2', shape: 'square', xPercent: 40, yPercent: 22, seatCapacity: 2, occupiedSeats: 0, status: 'AVAILABLE', assignedServerName: null, activeOrderId: null, seatedAt: null, isVisible: true, isLocked: false, createdAt: stamp, updatedAt: stamp },
      { id: 'table_t3', roomId: DEFAULT_ROOM_ID, displayName: 'T3', shape: 'rectangle', xPercent: 63, yPercent: 22, seatCapacity: 6, occupiedSeats: 6, status: 'ORDER_SENT', assignedServerName: 'Devon', activeOrderId: 'ord_t3', seatedAt: '2026-07-29T16:05:00.000Z', isVisible: true, isLocked: false, createdAt: stamp, updatedAt: stamp },
      { id: 'table_t4', roomId: DEFAULT_ROOM_ID, displayName: 'T4', shape: 'round', xPercent: 22, yPercent: 58, seatCapacity: 4, occupiedSeats: 2, status: 'CHECK_PRESENTED', assignedServerName: 'Maria', activeOrderId: 'ord_t4', activeCheckId: 'check_t4', seatedAt: '2026-07-29T15:47:00.000Z', checkTotal: 54.25, isVisible: true, isLocked: false, createdAt: stamp, updatedAt: stamp },
      { id: 'table_t5', roomId: DEFAULT_ROOM_ID, displayName: 'T5', shape: 'square', xPercent: 48, yPercent: 58, seatCapacity: 4, occupiedSeats: 0, status: 'NEEDS_CLEANING', assignedServerName: null, activeOrderId: null, seatedAt: null, isVisible: true, isLocked: false, createdAt: stamp, updatedAt: stamp },
      { id: 'table_t6', roomId: DEFAULT_ROOM_ID, displayName: 'T6', shape: 'rectangle', xPercent: 76, yPercent: 58, seatCapacity: 4, occupiedSeats: 3, status: 'SEATED', assignedServerName: 'Alyssa', activeOrderId: 'ord_t6', seatedAt: '2026-07-29T16:12:00.000Z', isVisible: true, isLocked: false, createdAt: stamp, updatedAt: stamp }
    ];
  }

  function normalizeRoom(room: any): TableServiceRoom {
    const stamp = nowIso();
    return {
      id: String(room?.id || DEFAULT_ROOM_ID),
      name: String(room?.name || 'Main Dining Room'),
      sortOrder: Number.isFinite(Number(room?.sortOrder)) ? Number(room.sortOrder) : 1,
      isActive: room?.isActive !== false,
      canvasWidth: Number.isFinite(Number(room?.canvasWidth)) ? Number(room.canvasWidth) : 100,
      canvasHeight: Number.isFinite(Number(room?.canvasHeight)) ? Number(room.canvasHeight) : 100,
      createdAt: String(room?.createdAt || stamp),
      updatedAt: String(room?.updatedAt || stamp)
    };
  }

  function normalizeTable(table: any, roomId: string): TableServiceTable {
    const stamp = nowIso();
    const safeRoomId = String(table?.roomId || roomId || DEFAULT_ROOM_ID);
    const seatCapacity = Math.max(0, Number.isFinite(Number(table?.seatCapacity)) ? Number(table.seatCapacity) : 0);
    const occupiedSeats = clamp(Math.max(0, Number.isFinite(Number(table?.occupiedSeats)) ? Number(table.occupiedSeats) : 0), 0, Math.max(seatCapacity, 1));
    const rawStatus = String(table?.status || 'AVAILABLE').toUpperCase();
    const status = ['AVAILABLE', 'SEATED', 'ORDERING', 'ORDER_SENT', 'CHECK_PRESENTED', 'PAID', 'NEEDS_CLEANING', 'UNAVAILABLE'].includes(rawStatus) ? rawStatus as TableStatus : 'AVAILABLE';
    return {
      id: String(table?.id || `table_${Math.random().toString(36).slice(2, 8)}`),
      roomId: safeRoomId,
      displayName: String(table?.displayName || table?.name || table?.label || 'Table'),
      shape: String(table?.shape || 'round') === 'square' ? 'square' : String(table?.shape || 'round') === 'rectangle' ? 'rectangle' : 'round',
      xPercent: clamp(Number.isFinite(Number(table?.xPercent)) ? Number(table.xPercent) : 50, 0, 100),
      yPercent: clamp(Number.isFinite(Number(table?.yPercent)) ? Number(table.yPercent) : 50, 0, 100),
      width: Number.isFinite(Number(table?.width)) ? Number(table.width) : undefined,
      height: Number.isFinite(Number(table?.height)) ? Number(table.height) : undefined,
      rotation: Number.isFinite(Number(table?.rotation)) ? Number(table.rotation) : undefined,
      seatCapacity,
      occupiedSeats,
      status,
      assignedServerId: table?.assignedServerId ?? null,
      assignedServerName: table?.assignedServerName ?? null,
      activeOrderId: table?.activeOrderId ?? null,
      activeCheckId: table?.activeCheckId ?? null,
      seatedAt: table?.seatedAt ?? null,
      checkTotal: Number.isFinite(Number(table?.checkTotal)) ? Number(table.checkTotal) : null,
      joinedGroupId: table?.joinedGroupId ?? null,
      isVisible: table?.isVisible !== false,
      isLocked: table?.isLocked === true,
      createdAt: String(table?.createdAt || stamp),
      updatedAt: String(table?.updatedAt || stamp)
    };
  }

  function normalizeLayoutPayload(roomId: string, tables: any[]): TableServiceTable[] {
    return (Array.isArray(tables) ? tables : []).map((table) => normalizeTable(table, roomId));
  }

  function clampTableToBounds(table: TableServiceTable) {
    return Object.assign({}, table, {
      xPercent: clamp(Number(table.xPercent || 0), 0, 100),
      yPercent: clamp(Number(table.yPercent || 0), 0, 100)
    });
  }

  function computeAvailableSeats(table: TableServiceTable) {
    return Math.max(Number(table.seatCapacity || 0) - Number(table.occupiedSeats || 0), 0);
  }

  function defaultLayout(roomId = DEFAULT_ROOM_ID) {
    const room = seedRoom();
    room.id = roomId || DEFAULT_ROOM_ID;
    const tables = seedTables().map((table) => clampTableToBounds(Object.assign({}, table, { roomId: room.id })));
    return { room, tables };
  }

  global.LilposTableServiceDefaults = {
    DEFAULT_ROOM_ID,
    DEFAULT_LAYOUT_KEY,
    seedRoom,
    seedTables,
    normalizeRoom,
    normalizeTable,
    normalizeLayoutPayload,
    clampTableToBounds,
    computeAvailableSeats,
    defaultLayout
  };
})(window);
