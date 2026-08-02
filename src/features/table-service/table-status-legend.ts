/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  const LEGEND_ITEMS = [
    ['AVAILABLE', 'Ready'],
    ['SEATED', 'Active'],
    ['ORDERING', 'Ordering'],
    ['ORDER_SENT', 'Kitchen Sent'],
    ['CHECK_PRESENTED', 'Check Presented'],
    ['PAID', 'Paid'],
    ['NEEDS_CLEANING', 'Needs Cleaning'],
    ['UNAVAILABLE', 'Unavailable']
  ];

  function renderTableStatusLegend(): string {
    return `
      <div class="table-status-legend" role="list" aria-label="Table status legend">
        ${LEGEND_ITEMS.map(([status, label]) => `
          <span class="table-status-legend-item table-status-${String(status).toLowerCase()}" role="listitem">
            <span class="table-status-legend-swatch" aria-hidden="true"></span>
            <span class="table-status-legend-label">${label}</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  global.LilposTableStatusLegend = { renderTableStatusLegend };
})(window);
