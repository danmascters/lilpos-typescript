/// <reference path="./table-service.types.ts" />
/// <reference path="./table-service-utils.ts" />
/// <reference path="./table-node.ts" />

(function(global: any) {
  'use strict';

  function renderFloorGrid(room: TableServiceRoom, tables: TableServiceTable[], state: any): string {
    const zoom = Number(state.viewport?.zoom || 1);
    const scaledWidth = `${Math.max(100, Math.round(100 / Math.max(zoom, 0.001)))}%`;
    const scaledHeight = `${Math.max(100, Math.round(100 / Math.max(zoom, 0.001)))}%`;
    return `
      <section class="table-floor ${state.mode === 'layout' ? 'is-layout-mode' : 'is-service-mode'}" data-table-floor>
        <div class="table-floor-canvas" data-table-floor-canvas style="transform:scale(${zoom});transform-origin:top left;width:${scaledWidth};height:${scaledHeight};">
          ${tables.filter((table) => table.isVisible !== false).map((table) => {
            const left = `${Math.max(0, Math.min(100, table.xPercent))}%`;
            const top = `${Math.max(0, Math.min(100, table.yPercent))}%`;
            return `
              <div class="table-floor-node-wrap" style="left:${left};top:${top};">
                ${global.LilposTableNode.tableNodeHtml(table, state)}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  global.LilposTableServiceFloor = { renderFloorGrid };
})(window);
