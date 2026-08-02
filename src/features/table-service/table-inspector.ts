/// <reference path="./table-service.types.ts" />
/// <reference path="./table-service-utils.ts" />

(function(global: any) {
  'use strict';

  function renderTableInspector(input: any): string {
    const table: TableServiceTable | null = input.table || null;
    if (!table) {
      return `<aside class="table-inspector empty"><h3>Table Details</h3><p>Select a table to view status, server, seats, and check info.</p></aside>`;
    }

    const openSeats = global.LilposTableServiceUtils.availableSeats(table);
    return `
      <aside class="table-inspector ${global.LilposTableServiceUtils.statusTone(table.status)}">
        <h3>Table ${String(table.displayName)}</h3>
        <dl>
          <div><dt>Status</dt><dd>${global.LilposTableServiceUtils.tableStatusLabel(table.status)}</dd></div>
          <div><dt>Server</dt><dd>${String(table.assignedServerName || 'No server')}</dd></div>
          <div><dt>Seats</dt><dd>${Math.max(0, Number(table.occupiedSeats || 0))} / ${Math.max(0, Number(table.seatCapacity || 0))} seats</dd></div>
          <div><dt>Available</dt><dd>${openSeats}</dd></div>
          <div><dt>Seated</dt><dd>${table.seatedAt ? `${global.LilposTableServiceUtils.minutesElapsed(table.seatedAt)} min` : '—'}</dd></div>
          <div><dt>Check Total</dt><dd>${table.checkTotal != null ? global.LilposTableServiceUtils.money(table.checkTotal) : '—'}</dd></div>
          <div><dt>Order</dt><dd>${table.activeOrderId || '—'}</dd></div>
          <div><dt>Check</dt><dd>${table.activeCheckId || '—'}</dd></div>
        </dl>
        <div class="table-inspector-actions">
          <button type="button" class="btn-secondary" data-table-service-action="open-check" ${table.status === 'AVAILABLE' || table.status === 'UNAVAILABLE' ? 'disabled' : ''}>Open Check</button>
          <button type="button" class="btn-secondary" data-table-service-action="assign-server" ${table.status === 'UNAVAILABLE' ? 'disabled' : ''}>Assign Server</button>
          <button type="button" class="btn-secondary" data-table-service-action="change-status">Change Status</button>
          <button type="button" class="btn-secondary" data-table-service-action="view-order" ${table.activeOrderId ? '' : 'disabled'}>View Order</button>
        </div>
      </aside>
    `;
  }

  global.LilposTableInspector = { renderTableInspector };
})(window);
