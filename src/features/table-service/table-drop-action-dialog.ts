/// <reference path="./table-service.types.ts" />

(function(global: any) {
  'use strict';

  function renderTableDropActionDialog(input: any): string {
    const open = !!input.open;
    if (!open) return '';
    const tableA = input.sourceTableName || 'Table';
    const tableB = input.targetTableName || 'Table';
    return `
      <div class="modal-backdrop table-drop-action-backdrop">
        <div class="call-modal table-drop-action-dialog">
          <h3>Tables are close together</h3>
          <p>${tableA} was dropped near ${tableB}. Choose what to do.</p>
          <div class="call-modal-actions">
            <button type="button" class="btn-success" data-table-service-action="move-only">Move Only</button>
            <button type="button" class="btn-secondary" data-table-service-action="join-tables" disabled>Join Tables</button>
            <button type="button" class="btn-secondary" data-table-service-action="create-table-group" disabled>Create Table Group</button>
            <button type="button" class="btn-secondary" data-table-service-action="cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  global.LilposTableDropActionDialog = { renderTableDropActionDialog };
})(window);
