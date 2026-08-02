/// <reference path="../../types.d.ts" />

type TableShape = 'round' | 'square' | 'rectangle';
type TableStatus = 'AVAILABLE' | 'SEATED' | 'ORDERING' | 'ORDER_SENT' | 'CHECK_PRESENTED' | 'PAID' | 'NEEDS_CLEANING' | 'UNAVAILABLE';
type TableServiceMode = 'service' | 'layout';
type TableServiceActionSheetChoice = 'move-only' | 'join-tables' | 'create-table-group' | 'cancel';

interface TableServiceRoom {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface TableServiceTable {
  id: string;
  roomId: string;
  displayName: string;
  shape: TableShape;
  xPercent: number;
  yPercent: number;
  width?: number;
  height?: number;
  rotation?: number;
  seatCapacity: number;
  occupiedSeats: number;
  status: TableStatus;
  assignedServerId?: string | null;
  assignedServerName?: string | null;
  activeOrderId?: string | null;
  activeCheckId?: string | null;
  seatedAt?: string | null;
  checkTotal?: number | null;
  joinedGroupId?: string | null;
  isVisible: boolean;
  isLocked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface TableFloorViewport {
  zoom: number;
  panX: number;
  panY: number;
}

interface TableServiceSummary {
  openTables: number;
  availableTables: number;
  guestsSeated: number;
  seatsAvailable: number;
  needsAttention: number;
}

interface TableServiceRuntime {
  getRooms(): Promise<TableServiceRoom[]>;
  getRoomLayout(roomId: string): Promise<TableServiceTable[]>;
  saveRoomLayout(roomId: string, tables: TableServiceTable[]): Promise<void>;
  getTable(tableId: string): Promise<TableServiceTable | null>;
  updateTable(tableId: string, changes: Partial<TableServiceTable>): Promise<TableServiceTable>;
  listActiveTables?(roomId: string): Promise<TableServiceTable[]>;
  getSeedLayout?(roomId: string): Promise<{ room: TableServiceRoom; tables: TableServiceTable[] } | null>;
}

(function(global: any) {
  'use strict';

  global.LilposTableServiceTypes = {
    TableShape: null as any,
    TableStatus: null as any,
    TableServiceMode: null as any,
    TableServiceActionSheetChoice: null as any,
    TableServiceRoom: null as any,
    TableServiceTable: null as any,
    TableFloorViewport: null as any,
    TableServiceSummary: null as any,
    TableServiceRuntime: null as any
  };
})(window);
