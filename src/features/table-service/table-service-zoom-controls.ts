/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  function renderTableServiceZoomControls(input: any): string {
    const viewport = input.viewport || { zoom: 1 };
    return `
      <div class="table-zoom-controls" aria-label="Table floor zoom controls">
        <button type="button" class="btn-secondary" data-table-service-action="zoom-out">-</button>
        <span class="table-zoom-readout">${Math.round(Number(viewport.zoom || 1) * 100)}%</span>
        <button type="button" class="btn-secondary" data-table-service-action="zoom-in">+</button>
        <button type="button" class="btn-secondary" data-table-service-action="fit-room">Fit Room</button>
      </div>
    `;
  }

  global.LilposTableServiceZoomControls = { renderTableServiceZoomControls };
})(window);
