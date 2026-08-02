/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  function renderTableLayoutToolbar(input: any): string {
    const mode = input.mode || 'service';
    const editing = mode === 'layout';
    return `
      <div class="table-layout-toolbar ${editing ? 'is-layout-mode' : 'is-service-mode'}">
        <button type="button" class="btn-secondary" data-table-service-action="save-layout" ${editing ? '' : 'disabled'}>Save Layout</button>
        <button type="button" class="btn-secondary" data-table-service-action="cancel-layout" ${editing ? '' : 'disabled'}>Cancel</button>
        <span class="table-layout-toolbar-note">${editing ? 'Press and hold a table, then drag it into position.' : 'Tap a table to select it.'}</span>
      </div>
    `;
  }

  global.LilposTableLayoutToolbar = { renderTableLayoutToolbar };
})(window);
