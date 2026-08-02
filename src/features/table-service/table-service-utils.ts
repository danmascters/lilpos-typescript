/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  function money(value: any): string {
    return `$${Number(value || 0).toFixed(2)}`;
  }

  function minutesElapsed(iso: string | null | undefined): number {
    if (!iso) return 0;
    const start = new Date(iso).getTime();
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 60000));
  }

  function dayOrdinalSuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    const mod = day % 10;
    if (mod === 1) return 'st';
    if (mod === 2) return 'nd';
    if (mod === 3) return 'rd';
    return 'th';
  }

  function computeSummary(tables: TableServiceTable[]): TableServiceSummary {
    const visible = (Array.isArray(tables) ? tables : []).filter((table) => table.isVisible !== false);
    const openTables = visible.filter((table) => !['AVAILABLE', 'UNAVAILABLE'].includes(table.status)).length;
    const availableTables = visible.filter((table) => table.status === 'AVAILABLE').length;
    const guestsSeated = visible.reduce((sum, table) => sum + Math.max(Number(table.occupiedSeats || 0), 0), 0);
    const seatsAvailable = visible.reduce((sum, table) => sum + Math.max(Number(table.seatCapacity || 0) - Number(table.occupiedSeats || 0), 0), 0);
    const needsAttention = visible.filter((table) => table.status === 'NEEDS_CLEANING' || table.status === 'UNAVAILABLE').length;
    return { openTables, availableTables, guestsSeated, seatsAvailable, needsAttention };
  }

  function statusTone(status: TableStatus): string {
    return {
      AVAILABLE: 'available',
      SEATED: 'seated',
      ORDERING: 'ordering',
      ORDER_SENT: 'sent',
      CHECK_PRESENTED: 'check-presented',
      PAID: 'paid',
      NEEDS_CLEANING: 'needs-cleaning',
      UNAVAILABLE: 'unavailable'
    }[status] || 'available';
  }

  function statusIcon(status: TableStatus): string {
    return {
      AVAILABLE: 'ready',
      SEATED: 'guest',
      ORDERING: 'pen',
      ORDER_SENT: 'kitchen',
      CHECK_PRESENTED: 'check',
      PAID: 'paid',
      NEEDS_CLEANING: 'alert',
      UNAVAILABLE: 'blocked'
    }[status] || 'ready';
  }

  function availableSeats(table: TableServiceTable): number {
    return Math.max(Number(table.seatCapacity || 0) - Number(table.occupiedSeats || 0), 0);
  }

  function tableStatusLabel(status: TableStatus): string {
    return String(status || 'AVAILABLE').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function isNeedsAttention(table: TableServiceTable): boolean {
    return table.status === 'NEEDS_CLEANING' || table.status === 'UNAVAILABLE';
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function fitViewportToTables(tables: TableServiceTable[], floorWidth: number, floorHeight: number): TableFloorViewport {
    const visible = (Array.isArray(tables) ? tables : []).filter((table) => table.isVisible !== false);
    if (!visible.length) return { zoom: 1, panX: 0, panY: 0 };
    const minX = Math.min(...visible.map((table) => table.xPercent));
    const maxX = Math.max(...visible.map((table) => table.xPercent));
    const minY = Math.min(...visible.map((table) => table.yPercent));
    const maxY = Math.max(...visible.map((table) => table.yPercent));
    const spanX = Math.max(20, maxX - minX + 14);
    const spanY = Math.max(20, maxY - minY + 14);
    const zoomX = floorWidth / spanX;
    const zoomY = floorHeight / spanY;
    const zoom = clamp(Math.min(zoomX, zoomY) / 100, 0.5, 1.75);
    return {
      zoom,
      panX: clamp(((50 - (minX + maxX) / 2) * zoom) / 3, -60, 60),
      panY: clamp(((50 - (minY + maxY) / 2) * zoom) / 3, -60, 60)
    };
  }

  global.LilposTableServiceUtils = {
    money,
    minutesElapsed,
    dayOrdinalSuffix,
    computeSummary,
    statusTone,
    statusIcon,
    availableSeats,
    tableStatusLabel,
    isNeedsAttention,
    fitViewportToTables,
    clamp
  };
})(window);
