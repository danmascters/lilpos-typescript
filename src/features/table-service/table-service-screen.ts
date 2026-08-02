/// <reference path="./table-service.types.ts" />
/// <reference path="./table-service-utils.ts" />
/// <reference path="./table-service-header.ts" />
/// <reference path="./table-status-legend.ts" />
/// <reference path="./table-layout-toolbar.ts" />
/// <reference path="./table-service-zoom-controls.ts" />
/// <reference path="./table-service-floor.ts" />
/// <reference path="./table-inspector.ts" />

(function(global: any) {
  'use strict';

  function renderTableServiceScreen(input: any): string {
    const room = input.room;
    const tables = Array.isArray(input.tables) ? input.tables : [];
    const summary = global.LilposTableServiceUtils.computeSummary(tables);
    const inspectorTable = input.selectedTable || null;
    const mode = input.mode || 'service';
    return `
      <div class="table-service-screen ${mode === 'layout' ? 'is-layout-mode' : 'is-service-mode'}">
        ${global.LilposTableServiceHeader.renderTableServiceHeader({ room, mode })}
        <section class="table-service-summary-row" aria-label="Table summary metrics">
          <div class="table-summary-metric"><span>Open Tables</span><b>${summary.openTables}</b></div>
          <div class="table-summary-metric"><span>Available Tables</span><b>${summary.availableTables}</b></div>
          <div class="table-summary-metric"><span>Guests Seated</span><b>${summary.guestsSeated}</b></div>
          <div class="table-summary-metric"><span>Seats Available</span><b>${summary.seatsAvailable}</b></div>
          <div class="table-summary-metric"><span>Needs Attention</span><b>${summary.needsAttention}</b></div>
        </section>
        ${global.LilposTableStatusLegend.renderTableStatusLegend()}
        ${global.LilposTableLayoutToolbar.renderTableLayoutToolbar({ mode })}
        <div class="table-service-body">
          ${global.LilposTableServiceFloor.renderFloorGrid(room, tables, input)}
          ${global.LilposTableInspector.renderTableInspector({ table: inspectorTable })}
        </div>
        ${global.LilposTableServiceZoomControls.renderTableServiceZoomControls({ viewport: input.viewport || { zoom: 1 } })}
      </div>
    `;
  }

  global.LilposTableServiceScreen = { renderTableServiceScreen };
})(window);
