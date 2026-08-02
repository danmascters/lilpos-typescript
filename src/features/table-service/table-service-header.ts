/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  function renderTableServiceHeader(input: any): string {
    const room = input.room;
    const mode = input.mode || 'service';
    const editing = mode === 'layout';
    return `
      <header class="table-service-header ${editing ? 'is-layout-mode' : 'is-service-mode'}">
        <div class="table-service-header-copy">
          <button type="button" class="table-service-back-btn" data-table-service-action="close">Back</button>
          <div>
            <h2>${String(room?.name || 'Main Dining Room')}</h2>
            <p>${editing ? 'Layout Mode' : 'Service Mode'}</p>
          </div>
        </div>
        <div class="table-service-header-actions">
          <button type="button" class="btn-secondary" data-table-service-action="mode-toggle">${editing ? 'Service Mode' : 'Edit Layout'}</button>
          <button type="button" class="btn-secondary" data-table-service-action="zoom-out">Zoom Out</button>
          <button type="button" class="btn-secondary" data-table-service-action="fit-room">Fit Room</button>
          <button type="button" class="btn-secondary" data-table-service-action="zoom-in">Zoom In</button>
        </div>
      </header>
    `;
  }

  global.LilposTableServiceHeader = { renderTableServiceHeader };
})(window);
