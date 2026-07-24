(function(global: any) {
  'use strict';

  function h(value: any): string {
    return String(value ?? '').replace(/[&<>"]/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch];
    });
  }

  function formatBytes(value: any): string {
    var bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function groupedSections(sections: LocalDataAdminSection[]): any[] {
    var groups: any = {};
    (sections || []).forEach(function(section) {
      var groupId = section.groupId || 'other';
      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          label: section.groupLabel || 'Other Local Data',
          sections: []
        };
      }
      groups[groupId].sections.push(section);
    });
    return Object.keys(groups).map(function(key) { return groups[key]; });
  }

  function renderSectionNav(state: StationDataManagerState): string {
    var groups = groupedSections(state.sections || []);
    if (!groups.length) return '<p class="muted">No local data sections discovered yet.</p>';
    return groups.map(function(group) {
      return '<div class="sdm-nav-group">'
        + '<div class="sdm-nav-group-title">' + h(group.label) + '</div>'
        + group.sections.map(function(section: LocalDataAdminSection) {
          var active = state.activeSectionId === section.id;
          var count = section.count == null ? '-' : String(section.count);
          return '<button type="button" class="sdm-nav-item ' + (active ? 'active' : '') + '" data-sdm-section="' + h(section.id) + '">'
            + '<span>' + h(section.label) + '</span>'
            + '<b>' + h(count) + '</b>'
            + '</button>';
        }).join('')
        + '</div>';
    }).join('');
  }

  function renderHealth(state: StationDataManagerState): string {
    var health = state.health;
    if (!health) return '<div class="sdm-health-panel"><p class="muted">Health information is not loaded yet.</p></div>';
    var storage = health.storageEstimate || {};
    var rows = [
      ['IndexedDB available', health.indexedDbAvailable ? 'Yes' : 'No'],
      ['Database', health.databaseName || '-'],
      ['Version', String(health.databaseVersion || '-')],
      ['Stores', (health.storeNames || []).join(', ') || '-'],
      ['Storage usage', formatBytes(storage.usage) + ' / ' + formatBytes(storage.quota)],
      ['Storage persistent', health.storagePersisted == null ? 'Unknown' : (health.storagePersisted ? 'Yes' : 'No')],
      ['Service worker', health.serviceWorker && health.serviceWorker.supported ? (health.serviceWorker.controlled ? 'Controlled' : 'Supported') : 'Not supported'],
      ['Last menu sync', health.lastMenuSyncAt || '-'],
      ['Pending sync', health.pendingSyncCount == null ? '-' : String(health.pendingSyncCount)],
      ['Failed sync', health.failedSyncCount == null ? '-' : String(health.failedSyncCount)]
    ];
    return '<div class="sdm-health-panel">'
      + '<div class="sdm-panel-head"><h3>Sync / Health</h3><button id="sdmPersistStorage" class="btn-secondary" ' + (health.persistentStorageSupported ? '' : 'disabled') + '>Request Persistent Storage</button></div>'
      + '<div class="sdm-health-grid">'
      + rows.map(function(row) {
        return '<div class="sdm-health-row"><span>' + h(row[0]) + '</span><b>' + h(row[1]) + '</b></div>';
      }).join('')
      + '</div>'
      + '</div>';
  }

  function renderRecords(state: StationDataManagerState): string {
    var active = (state.sections || []).find(function(section) { return section.id === state.activeSectionId; }) || null;
    var records = state.records || [];
    var title = active ? active.label : 'Local Data';
    return '<div class="sdm-records-panel">'
      + '<div class="sdm-panel-head">'
      + '<div><h3>' + h(title) + '</h3><p class="muted">' + h(String(records.length)) + ' records shown</p></div>'
      + '<button id="sdmExportStore" class="btn-secondary" ' + (active ? '' : 'disabled') + '>Export Store</button>'
      + '</div>'
      + '<div class="sdm-search-row"><input id="sdmSearch" data-keyboard-kind="text" placeholder="Search current section" value="' + h(state.query || '') + '" /></div>'
      + (records.length
        ? '<div class="sdm-record-table">'
          + '<div class="sdm-record-row sdm-record-head"><span>ID / Key</span><span>Name / Type / Status</span><span>Updated / Created</span><span>Summary</span><span>Actions</span></div>'
          + records.map(function(record) {
            var meta = [record.label, record.type, record.status].filter(Boolean).join(' | ') || '-';
            var dates = [record.updatedAt, record.createdAt].filter(Boolean).join(' | ') || '-';
            return '<div class="sdm-record-row">'
              + '<span title="' + h(record.id) + '">' + h(record.id) + '</span>'
              + '<span title="' + h(meta) + '">' + h(meta) + '</span>'
              + '<span title="' + h(dates) + '">' + h(dates) + '</span>'
              + '<span title="' + h(record.summary) + '">' + h(record.summary) + '</span>'
              + '<span class="sdm-record-actions"><button class="btn-secondary" data-sdm-view-record="' + h(record.id) + '">View JSON</button><button class="btn-secondary" data-sdm-copy-record="' + h(record.id) + '">Copy JSON</button></span>'
              + '</div>';
          }).join('')
          + '</div>'
        : '<div class="sdm-empty"><b>No records</b><p class="muted">This section is empty or not available on this station.</p></div>')
      + '</div>';
  }

  function renderJsonInspector(state: StationDataManagerState): string {
    if (!state.selectedRecord) return '';
    var json = JSON.stringify(state.selectedRecord.value, null, 2);
    return '<div class="sdm-json-modal" role="dialog" aria-modal="true">'
      + '<div class="sdm-json-panel">'
      + '<div class="sdm-panel-head"><h3>Record JSON</h3><div><button id="sdmCopySelectedJson" class="btn-secondary">Copy JSON</button><button id="sdmCloseJson" class="btn-secondary">Close</button></div></div>'
      + '<pre>' + h(json) + '</pre>'
      + '</div>'
      + '</div>';
  }

  function render(state: StationDataManagerState): string {
    var refreshed = state.lastRefreshedAt ? new Date(state.lastRefreshedAt).toLocaleString() : 'Not refreshed yet';
    return '<div class="station-data-manager">'
      + '<div class="sdm-header">'
      + '<div><h2>Station Data Manager</h2><p>Local browser data stored on this station.</p><small>Last refreshed: ' + h(refreshed) + '</small></div>'
      + '<div class="sdm-header-actions"><button id="sdmRefresh" class="btn-secondary">Refresh</button><button id="sdmExportAll" class="btn-primary">Export All</button></div>'
      + '</div>'
      + (state.error ? '<div class="sdm-error">' + h(state.error) + '</div>' : '')
      + (state.actionMessage ? '<div class="sdm-action-message">' + h(state.actionMessage) + '</div>' : '')
      + (state.loading ? '<div class="sdm-loading">Loading local station data...</div>' : '')
      + '<div class="sdm-layout">'
      + '<aside class="sdm-sidebar">' + renderSectionNav(state) + '</aside>'
      + '<main class="sdm-main">' + renderRecords(state) + renderHealth(state) + '</main>'
      + '</div>'
      + renderJsonInspector(state)
      + '</div>';
  }

  global.LilposStationDataManagerView = {
    render: render
  };
})(window);
