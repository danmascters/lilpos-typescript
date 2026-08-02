/// <reference path="./table-service.types.ts" />
/// <reference path="./table-service-utils.ts" />

(function(global: any) {
  'use strict';

  function buildTableA11yLabel(table: TableServiceTable): string {
    const server = table.assignedServerName || 'No server';
    const occupied = `${Number(table.occupiedSeats || 0)} of ${Number(table.seatCapacity || 0)} seats occupied`;
    const total = table.checkTotal != null ? `, total ${global.LilposTableServiceUtils.money(table.checkTotal)}` : '';
    const elapsed = table.seatedAt ? `, seated ${global.LilposTableServiceUtils.minutesElapsed(table.seatedAt)} minutes ago` : '';
    return `Table ${table.displayName}, ${global.LilposTableServiceUtils.tableStatusLabel(table.status)}, server ${server}, ${occupied}${elapsed}${total}`;
  }

  function tableNodeHtml(table: TableServiceTable, context: any): string {
    const isSelected = context.selectedTableId === table.id;
    const isLayoutMode = context.mode === 'layout';
    const sizeClass = table.shape === 'rectangle' ? 'table-node-rectangle' : table.shape === 'square' ? 'table-node-square' : 'table-node-round';
    const statusTone = global.LilposTableServiceUtils.statusTone(table.status);
    const server = table.assignedServerName || 'No server';
    const seats = `${Math.max(0, Number(table.occupiedSeats || 0))} / ${Math.max(0, Number(table.seatCapacity || 0))} seats`;
    const availableSeats = global.LilposTableServiceUtils.availableSeats(table);
    const elapsed = table.seatedAt ? `${global.LilposTableServiceUtils.minutesElapsed(table.seatedAt)} min` : '';
    const checkTotal = table.checkTotal != null ? global.LilposTableServiceUtils.money(table.checkTotal) : '';
    const extraLine = elapsed || checkTotal ? `<div class="table-node-extra">${elapsed ? `<span>${elapsed}</span>` : ''}${elapsed && checkTotal ? '' : ''}${checkTotal ? `<span>${checkTotal}</span>` : ''}</div>` : '';
    const attention = global.LilposTableServiceUtils.isNeedsAttention(table) ? `<span class="table-node-attention" aria-hidden="true">!</span>` : '';
    return `
      <button
        type="button"
        class="table-node ${sizeClass} ${statusTone} ${isSelected ? 'is-selected' : ''} ${isLayoutMode ? 'is-layout-editable' : ''}"
        data-table-id="${String(table.id)}"
        data-table-status="${String(table.status)}"
        data-table-shape="${String(table.shape)}"
        data-table-server="${String(server)}"
        data-table-seat-capacity="${String(table.seatCapacity)}"
        data-table-occupied-seats="${String(table.occupiedSeats)}"
        aria-label="${buildTableA11yLabel(table)}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
      >
        <span class="table-node-icon" aria-hidden="true">${attention || global.LilposTableServiceUtils.statusIcon(table.status)}</span>
        <span class="table-node-id">${String(table.displayName)}</span>
        <span class="table-node-status">${global.LilposTableServiceUtils.tableStatusLabel(table.status)}</span>
        <span class="table-node-server">${server}</span>
        <span class="table-node-seats">${seats}${availableSeats ? ` · ${availableSeats} open` : ''}</span>
        ${extraLine}
      </button>
    `;
  }

  global.LilposTableNode = {
    buildTableA11yLabel,
    tableNodeHtml
  };
})(window);
