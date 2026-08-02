/// <reference path="./table-service.types.ts" />
/// <reference path="./default-table-layout.ts" />
/// <reference path="./table-service-store.ts" />

(function(global: any) {
  'use strict';

  function createController(options: any = {}) {
    const dataService = options.dataService || global.lilposDataService || null;
    const onChange = typeof options.onChange === 'function' ? options.onChange : function() {};
    const onSelectTable = typeof options.onSelectTable === 'function' ? options.onSelectTable : function() {};
    const onClose = typeof options.onClose === 'function' ? options.onClose : function() {};
    const nowIso = options.nowIso || (() => new Date().toISOString());
    const store = global.LilposTableServiceStore.createTableServiceStore({ dataService, nowIso, getPlanPersistenceMode: () => 'persistent' });

    let dragCleanup: (() => void) | null = null;

    const state = {
      loaded: false,
      loading: false,
      error: '',
      mode: 'service' as TableServiceMode,
      room: null as TableServiceRoom | null,
      rooms: [] as TableServiceRoom[],
      tables: [] as TableServiceTable[],
      selectedTableId: null as string | null,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      editingSnapshot: null as TableServiceTable[] | null,
      dirtyLayout: false,
      dragState: null as any,
      pendingDrop: null as any,
      actionSheet: null as { tableId: string; choice: TableServiceActionSheetChoice } | null,
      inspectorTableId: null as string | null,
      saveError: '',
      roomsError: '',
      layoutMessage: ''
    };

    async function load(message = '') {
      state.loading = true;
      state.error = '';
      state.layoutMessage = message;
      onChange();
      try {
        const rooms = await store.getRooms();
        if (!rooms.length) {
          await store.ensureSeeded();
        }
        state.rooms = await store.getRooms();
        state.room = state.rooms.find((room) => room.isActive) || state.rooms[0] || null;
        if (!state.room) {
          const seed = await store.getSeedLayout(global.LilposTableServiceDefaults.DEFAULT_ROOM_ID);
          state.room = seed?.room || null;
          state.tables = seed?.tables || [];
        } else {
          state.tables = await store.getRoomLayout(state.room.id);
        }
        state.loaded = true;
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err || 'Unable to load table service.');
      } finally {
        state.loading = false;
        onChange();
      }
    }

    async function saveLayout() {
      if (!state.room) throw new Error('No room selected');
      await store.saveRoomLayout(state.room.id, state.tables);
      state.editingSnapshot = cloneTables(state.tables);
      state.dirtyLayout = false;
      state.layoutMessage = 'Layout saved.';
    }

    function cloneTables(tables: TableServiceTable[]): TableServiceTable[] {
      return JSON.parse(JSON.stringify(tables || []));
    }

    function beginLayoutMode() {
      state.mode = 'layout';
      state.editingSnapshot = cloneTables(state.tables);
      state.dirtyLayout = false;
      state.layoutMessage = 'Layout Mode enabled.';
      onChange();
    }

    function discardLayoutChanges() {
      if (state.editingSnapshot) {
        state.tables = cloneTables(state.editingSnapshot);
      }
      state.mode = 'service';
      state.dirtyLayout = false;
      state.dragState = null;
      state.pendingDrop = null;
      state.actionSheet = null;
      state.layoutMessage = 'Layout changes discarded.';
      onChange();
    }

    function setViewport(next: Partial<TableFloorViewport>) {
      state.viewport = Object.assign({}, state.viewport, next);
      onChange();
    }

    function setSelectedTable(tableId: string | null) {
      state.selectedTableId = tableId;
      state.inspectorTableId = tableId;
      onChange();
    }

    function selectedTable() {
      return state.tables.find((table) => table.id === state.selectedTableId) || null;
    }

    function tableById(tableId: string) {
      return state.tables.find((table) => table.id === tableId) || null;
    }

    function updateLocalTable(tableId: string, changes: Partial<TableServiceTable>) {
      const index = state.tables.findIndex((table) => table.id === tableId);
      if (index < 0) return null;
      const next = global.LilposTableServiceDefaults.normalizeTable(Object.assign({}, state.tables[index], changes, { updatedAt: nowIso() }), state.room?.id || global.LilposTableServiceDefaults.DEFAULT_ROOM_ID);
      state.tables[index] = next;
      state.dirtyLayout = true;
      return next;
    }

    function canSelectTable(table: TableServiceTable) {
      if (!table) return false;
      if (table.status === 'UNAVAILABLE') return false;
      return true;
    }

    function selectTableForService(tableId: string) {
      const table = tableById(tableId);
      if (!table) return;
      setSelectedTable(tableId);
      if (table.status === 'AVAILABLE') {
        onSelectTable(table.displayName || table.id, table);
      }
    }

    function openActionSheet(tableId: string, choice: TableServiceActionSheetChoice = 'move-only') {
      state.actionSheet = { tableId, choice };
      onChange();
    }

    function closeActionSheet() {
      state.actionSheet = null;
      onChange();
    }

    function normalizeAfterDrag(tableId: string, xPercent: number, yPercent: number) {
      const next = updateLocalTable(tableId, { xPercent, yPercent });
      if (!next) return null;
      const otherNearby = state.tables.find((table) => table.id !== tableId && table.isVisible !== false && Math.abs(table.xPercent - next.xPercent) < 12 && Math.abs(table.yPercent - next.yPercent) < 12);
      if (otherNearby) {
        openActionSheet(tableId, 'move-only');
        state.pendingDrop = { sourceTableId: tableId, targetTableId: otherNearby.id };
      }
      onChange();
      return next;
    }

    function fitRoom() {
      if (!state.tables.length) return;
      state.viewport = global.LilposTableServiceUtils.fitViewportToTables(state.tables, 100, 100);
      onChange();
    }

    async function handleAction(action: string, tableId?: string) {
      const table = tableId ? tableById(tableId) : selectedTable();
      if (action === 'close') {
        onClose();
        return;
      }
      if (action === 'mode-toggle') {
        if (state.mode === 'layout') {
          state.mode = 'service';
          onChange();
          return;
        }
        beginLayoutMode();
        return;
      }
      if (action === 'zoom-in') {
        setViewport({ zoom: Math.min(2, Number((state.viewport.zoom + 0.1).toFixed(2))) });
        return;
      }
      if (action === 'zoom-out') {
        setViewport({ zoom: Math.max(0.5, Number((state.viewport.zoom - 0.1).toFixed(2))) });
        return;
      }
      if (action === 'fit-room') {
        fitRoom();
        return;
      }
      if (action === 'save-layout') {
        try {
          await saveLayout();
        } catch (err) {
          state.saveError = err instanceof Error ? err.message : String(err || 'Unable to save layout.');
        }
        onChange();
        return;
      }
      if (action === 'cancel-layout') {
        if (state.dirtyLayout) {
          const keepEditing = typeof window.confirm === 'function' ? !window.confirm('Discard unsaved layout changes?') : false;
          if (keepEditing) return;
          discardLayoutChanges();
          return;
        }
        discardLayoutChanges();
        return;
      }
      if (action === 'open-check' || action === 'assign-server' || action === 'change-status' || action === 'view-order') {
        if (!table) return;
        state.layoutMessage = `${action} is coming soon for ${table.displayName}.`;
        onChange();
        return;
      }
      if (action === 'table-select' && table) {
        if (state.mode === 'layout') {
          state.selectedTableId = table.id;
          onChange();
          return;
        }
        if (table.status === 'AVAILABLE') {
          onSelectTable(table.displayName, table);
        } else {
          state.selectedTableId = table.id;
          onChange();
        }
        return;
      }
      if (action === 'move-only' && state.pendingDrop) {
        state.pendingDrop = null;
        state.actionSheet = null;
        onChange();
      }
    }

    function bind(root: ParentNode = document) {
      if (dragCleanup) {
        dragCleanup();
        dragCleanup = null;
      }

      root.querySelectorAll('[data-table-service-action]').forEach((element) => {
        element.addEventListener('click', () => {
          void handleAction((element as HTMLElement).dataset.tableServiceAction || '', (element as HTMLElement).dataset.tableId || undefined);
        });
      });

      root.querySelectorAll('[data-table-id]').forEach((element) => {
        const tableId = (element as HTMLElement).dataset.tableId || '';
        element.addEventListener('click', () => {
          if (state.dragState?.started) {
            state.dragState = null;
            return;
          }
          void handleAction('table-select', tableId);
        });
        element.addEventListener('pointerdown', (event: Event) => {
          if (state.mode !== 'layout') return;
          const pointerEvent = event as PointerEvent;
          const table = tableById(tableId);
          if (!table) return;
          pointerEvent.preventDefault();
          const holdTimer = window.setTimeout(() => {
            state.dragState = {
              tableId,
              started: true,
              pointerId: pointerEvent.pointerId,
              startClientX: pointerEvent.clientX,
              startClientY: pointerEvent.clientY,
              lastClientX: pointerEvent.clientX,
              lastClientY: pointerEvent.clientY
            };
            onChange();
          }, 600);
          state.dragState = {
            tableId,
            started: false,
            pointerId: pointerEvent.pointerId,
            holdTimer,
            startClientX: pointerEvent.clientX,
            startClientY: pointerEvent.clientY,
            lastClientX: pointerEvent.clientX,
            lastClientY: pointerEvent.clientY
          };
        });
      });

      const onPointerMove = (event: PointerEvent) => {
        if (!state.dragState || !state.dragState.started) return;
        const canvas = document.querySelector('[data-table-floor-canvas]') as HTMLElement | null;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const zoom = Number(state.viewport?.zoom || 1);
        const logicalWidth = Math.max(1, rect.width / Math.max(zoom, 0.001));
        const logicalHeight = Math.max(1, rect.height / Math.max(zoom, 0.001));
        const localX = Math.max(0, Math.min(logicalWidth, (event.clientX - rect.left) / Math.max(zoom, 0.001)));
        const localY = Math.max(0, Math.min(logicalHeight, (event.clientY - rect.top) / Math.max(zoom, 0.001)));
        const xPercent = Math.max(0, Math.min(100, (localX / logicalWidth) * 100));
        const yPercent = Math.max(0, Math.min(100, (localY / logicalHeight) * 100));
        updateLocalTable(state.dragState.tableId, { xPercent, yPercent });
        state.dragState.lastClientX = event.clientX;
        state.dragState.lastClientY = event.clientY;
        onChange();
      };

      const onPointerUp = () => {
        if (state.dragState?.holdTimer) {
          window.clearTimeout(state.dragState.holdTimer);
        }
        state.dragState = null;
        onChange();
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      dragCleanup = () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
      };
    }

    function render() {
      const room = state.room || { name: 'Main Dining Room' };
      return global.LilposTableServiceScreen.renderTableServiceScreen({
        room,
        tables: state.tables,
        mode: state.mode,
        selectedTable: selectedTable(),
        viewport: state.viewport,
        pendingDrop: state.pendingDrop,
        actionSheet: state.actionSheet,
        layoutMessage: state.layoutMessage,
        saveError: state.saveError
      });
    }

    return {
      state,
      load,
      bind,
      render,
      handleAction,
      fitRoom,
      beginLayoutMode,
      discardLayoutChanges,
      saveLayout,
      selectTableForService,
      openActionSheet,
      closeActionSheet,
      normalizeAfterDrag,
      tableById,
      canSelectTable
    };
  }

  global.LilposTableServiceRuntime = { createController };
})(window);
