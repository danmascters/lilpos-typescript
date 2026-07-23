(function(global: any) {
  'use strict';

  type OrdersQueueViewMode = 'STANDARD' | 'ROWS';
  type OrdersQueuePreferenceKey = 'open' | 'completed' | 'onlineOnly' | 'futureOrders';

  type OrdersManagementViewPreferences = {
    open: OrdersQueueViewMode;
    completed: OrdersQueueViewMode;
    onlineOnly: OrdersQueueViewMode;
    futureOrders: OrdersQueueViewMode;
    columnLayouts?: Record<string, OrdersQueueColumnLayout>;
  };

  type OrdersQueueColumnSort = {
    columnId: string;
    direction: 'asc' | 'desc';
  } | null;

  type OrdersQueueColumnLayout = {
    order: string[];
    sort: OrdersQueueColumnSort;
  };

  type RenderOrderRowsInput = {
    rows: any[];
    orderTypes: Record<string, string>;
    h: (value: any) => string;
    money: (value: any) => string;
    formatOrderNumberForDisplay: (value: any) => string;
    paymentBadgeForOrder: (order: any) => { paidClass: string; paidText: string };
    columnLayout?: OrdersQueueColumnLayout;
    hiddenColumnIds?: string[];
  };

  var VIEW_MODE_STANDARD: OrdersQueueViewMode = 'STANDARD';
  var VIEW_MODE_ROWS: OrdersQueueViewMode = 'ROWS';

  var QUEUE_PREF_KEYS: Record<string, OrdersQueuePreferenceKey> = {
    open: 'open',
    completed: 'completed',
    online: 'onlineOnly',
    future: 'futureOrders'
  };

  var DEFAULT_VIEW_PREFERENCES: OrdersManagementViewPreferences = {
    open: VIEW_MODE_STANDARD,
    completed: VIEW_MODE_STANDARD,
    onlineOnly: VIEW_MODE_STANDARD,
    futureOrders: VIEW_MODE_STANDARD,
    columnLayouts: {}
  };

  var COLUMN_DEFS = [
    { id: 'order', label: 'Order', className: 'orders-row-number' },
    { id: 'customer', label: 'Customer', className: 'orders-row-customer' },
    { id: 'phone', label: 'Phone', className: 'orders-row-phone' },
    { id: 'type', label: 'Type', className: 'orders-row-type' },
    { id: 'receivedTime', label: 'Received Time', className: 'orders-row-received-time' },
    { id: 'dueTime', label: 'Due Time', className: 'orders-row-due-time' },
    { id: 'source', label: 'Source', className: 'orders-row-source' },
    { id: 'payment', label: 'Payment', className: 'orders-row-payment' },
    { id: 'status', label: 'Status', className: 'orders-row-status' },
    { id: 'total', label: 'Total', className: 'orders-row-total' }
  ];
  var DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map(function(column) { return column.id; });
  var COLUMN_BY_ID = COLUMN_DEFS.reduce(function(acc: any, column) {
    acc[column.id] = column;
    return acc;
  }, {});

  function normalizeViewMode(value: any): OrdersQueueViewMode {
    return String(value || '').toUpperCase() === VIEW_MODE_ROWS ? VIEW_MODE_ROWS : VIEW_MODE_STANDARD;
  }

  function normalizePreferences(input: any): OrdersManagementViewPreferences {
    var source = input || {};
    var columnLayouts = normalizeColumnLayouts(source.columnLayouts);
    return {
      open: normalizeViewMode(source.open),
      completed: normalizeViewMode(source.completed),
      onlineOnly: normalizeViewMode(source.onlineOnly),
      futureOrders: normalizeViewMode(source.futureOrders),
      columnLayouts: columnLayouts
    };
  }

  function preferenceKeyForQueue(queueFilter: string): OrdersQueuePreferenceKey {
    return QUEUE_PREF_KEYS[String(queueFilter || '')] || 'open';
  }

  function viewModeForQueue(preferences: any, queueFilter: string): OrdersQueueViewMode {
    var normalized = normalizePreferences(preferences);
    return normalized[preferenceKeyForQueue(queueFilter)];
  }

  function setViewModeForQueue(preferences: any, queueFilter: string, viewMode: any): OrdersManagementViewPreferences {
    var next = normalizePreferences(preferences);
    next[preferenceKeyForQueue(queueFilter)] = normalizeViewMode(viewMode);
    return next;
  }

  function normalizeColumnOrder(input: any): string[] {
    var seen: any = {};
    var order = Array.isArray(input)
      ? input.filter(function(columnId) {
          var id = String(columnId || '');
          if (!COLUMN_BY_ID[id] || seen[id]) return false;
          seen[id] = true;
          return true;
        }).map(function(columnId) { return String(columnId); })
      : [];
    DEFAULT_COLUMN_ORDER.forEach(function(columnId) {
      if (!seen[columnId]) order.push(columnId);
    });
    return order;
  }

  function normalizeColumnSort(input: any): OrdersQueueColumnSort {
    var columnId = String(input && input.columnId || '');
    if (!COLUMN_BY_ID[columnId]) return null;
    var direction: 'asc' | 'desc' = String(input && input.direction || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
    return { columnId: columnId, direction: direction };
  }

  function normalizeColumnLayout(input: any): OrdersQueueColumnLayout {
    return {
      order: normalizeColumnOrder(input && input.order),
      sort: normalizeColumnSort(input && input.sort)
    };
  }

  function normalizeColumnLayouts(input: any): Record<string, OrdersQueueColumnLayout> {
    var source = input || {};
    return {
      open: normalizeColumnLayout(source.open),
      completed: normalizeColumnLayout(source.completed),
      onlineOnly: normalizeColumnLayout(source.onlineOnly),
      futureOrders: normalizeColumnLayout(source.futureOrders)
    };
  }

  function columnLayoutForQueue(preferences: any, queueFilter: string): OrdersQueueColumnLayout {
    var normalized = normalizePreferences(preferences);
    var key = preferenceKeyForQueue(queueFilter);
    return normalizeColumnLayout(normalized.columnLayouts && normalized.columnLayouts[key]);
  }

  function setColumnOrderForQueue(preferences: any, queueFilter: string, order: any): OrdersManagementViewPreferences {
    var next = normalizePreferences(preferences);
    var key = preferenceKeyForQueue(queueFilter);
    next.columnLayouts = next.columnLayouts || {};
    next.columnLayouts[key] = {
      order: normalizeColumnOrder(order),
      sort: columnLayoutForQueue(next, queueFilter).sort
    };
    return next;
  }

  function moveColumnForQueue(preferences: any, queueFilter: string, sourceColumnId: any, targetColumnId: any): OrdersManagementViewPreferences {
    var layout = columnLayoutForQueue(preferences, queueFilter);
    var source = String(sourceColumnId || '');
    var target = String(targetColumnId || '');
    if (!COLUMN_BY_ID[source] || !COLUMN_BY_ID[target] || source === target) return normalizePreferences(preferences);
    var order = layout.order.filter(function(columnId) { return columnId !== source; });
    var targetIndex = order.indexOf(target);
    if (targetIndex < 0) targetIndex = order.length;
    order.splice(targetIndex, 0, source);
    return setColumnOrderForQueue(preferences, queueFilter, order);
  }

  function setSortForQueue(preferences: any, queueFilter: string, columnId: any): OrdersManagementViewPreferences {
    var next = normalizePreferences(preferences);
    var key = preferenceKeyForQueue(queueFilter);
    var id = String(columnId || '');
    if (!COLUMN_BY_ID[id]) return next;
    var current = columnLayoutForQueue(next, queueFilter).sort;
    var direction: 'asc' | 'desc' = current && current.columnId === id && current.direction === 'asc' ? 'desc' : 'asc';
    next.columnLayouts = next.columnLayouts || {};
    next.columnLayouts[key] = {
      order: columnLayoutForQueue(next, queueFilter).order,
      sort: { columnId: id, direction: direction }
    };
    return next;
  }

  function renderViewModeSwitch(input: any): string {
    var activeMode = normalizeViewMode(input && input.activeMode);
    var h = input && input.h || function(value: any) { return String(value == null ? '' : value); };
    var options = [
      { mode: VIEW_MODE_STANDARD, label: 'Tiles' },
      { mode: VIEW_MODE_ROWS, label: 'Rows' }
    ];
    return '<div class="orders-view-switch" role="group" aria-label="Orders display mode">'
      + options.map(function(option) {
        var active = activeMode === option.mode;
        return '<button type="button" class="orders-view-switch-option ' + (active ? 'active' : '') + '" data-orders-view-mode="' + option.mode + '" aria-pressed="' + (active ? 'true' : 'false') + '">'
          + h(option.label)
          + '</button>';
      }).join('')
      + '</div>';
  }

  function statusClass(value: any): string {
    var normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    return normalized || 'unknown';
  }

  function displayStatus(value: any): string {
    return String(value || 'open').trim().toUpperCase();
  }

  function isDeliveryOrder(order: any, typeLabel: string): boolean {
    return String(order && order.orderType || '').trim().toLowerCase() === 'delivery'
      || String(typeLabel || '').trim().toLowerCase() === 'delivery';
  }

  function renderHeaderCell(column: any, sort: OrdersQueueColumnSort, h: (value: any) => string): string {
    var isSorted = !!sort && sort.columnId === column.id;
    var direction = isSorted ? sort.direction : '';
    var marker = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '';
    return '<button type="button" class="orders-row-head-cell ' + h(column.className) + '" draggable="true" data-orders-column-id="' + h(column.id) + '" data-orders-sort-column="' + h(column.id) + '" aria-sort="' + (direction || 'none') + '">'
      + '<span>' + h(column.label) + '</span>'
      + '<span class="orders-row-sort-marker">' + h(marker) + '</span>'
      + '</button>';
  }

  function rowCellHtml(columnId: string, order: any, display: any, h: (value: any) => string, money: (value: any) => string): string {
    if (columnId === 'order') return '<span class="orders-row-number" title="' + h(display.displayNumber) + '">#' + h(display.displayNumber) + '</span>';
    if (columnId === 'customer') return '<span class="orders-row-customer" title="' + h(display.customerTitle) + '"><span class="orders-row-customer-name">' + h(display.customerName) + '</span>' + display.customerMeta + '</span>';
    if (columnId === 'phone') return '<span class="orders-row-phone" title="' + h(display.phoneLabel) + '">' + h(display.phoneLabel) + '</span>';
    if (columnId === 'type') return '<span class="orders-row-type" title="' + h(display.typeLabel) + '">' + h(display.typeLabel) + '</span>';
    if (columnId === 'receivedTime') return '<span class="orders-row-received-time" title="' + h(display.receivedTimeLabel) + '">' + h(display.receivedTimeLabel) + '</span>';
    if (columnId === 'dueTime') return '<span class="orders-row-due-time" title="' + h(display.dueTimeLabel) + '">' + h(display.dueTimeLabel) + '</span>';
    if (columnId === 'source') return '<span class="orders-row-source" title="' + h(display.sourceLabel) + '">' + h(display.sourceLabel) + '</span>';
    if (columnId === 'payment') return '<span class="orders-row-payment"><span class="order-payment-badge ' + h(display.paymentBadge.paidClass) + '">' + h(display.paymentBadge.paidText) + '</span></span>';
    if (columnId === 'status') return '<span class="orders-row-status"><span class="order-status ' + h(statusClass(display.orderStatus)) + '">' + h(displayStatus(display.orderStatus)) + '</span></span>';
    if (columnId === 'total') return '<span class="orders-row-total">' + h(money(order.total)) + '</span>';
    return '';
  }

  function renderOrderRows(input: RenderOrderRowsInput): string {
    var rows = Array.isArray(input.rows) ? input.rows : [];
    var h = input.h;
    var money = input.money;
    var orderTypes = input.orderTypes || {};
    var formatOrderNumberForDisplay = input.formatOrderNumberForDisplay;
    var paymentBadgeForOrder = input.paymentBadgeForOrder;
    var columnLayout = normalizeColumnLayout(input.columnLayout);
    var hiddenColumns: any = {};
    (Array.isArray(input.hiddenColumnIds) ? input.hiddenColumnIds : []).forEach(function(columnId) {
      hiddenColumns[String(columnId || '')] = true;
    });
    var columns = columnLayout.order.map(function(columnId) { return COLUMN_BY_ID[columnId]; }).filter(function(column) {
      return !!column && !hiddenColumns[column.id];
    });
    var style = '--orders-row-columns:' + columns.map(function(column) { return 'var(--orders-col-' + column.id + ')'; }).join(' ') + ';';

    return '<div class="orders-mgmt-rows" role="list" style="' + h(style) + '">'
      + '<div class="orders-mgmt-row orders-mgmt-row-head">'
      + columns.map(function(column) { return renderHeaderCell(column, columnLayout.sort, h); }).join('')
      + '</div>'
      + rows.map(function(order) {
        var typeLabel = orderTypes[order.orderType] || order.orderType || 'Order';
        var displayNumber = formatOrderNumberForDisplay(order.number);
        var sourceLabel = order.onlineOnly ? 'Online Only' : String(order.source || 'Counter');
        var paymentBadge = paymentBadgeForOrder(order);
        var orderStatus = String(order.status || 'open');
        var customerName = order.customerName || 'Guest';
        var phoneLabel = String(order.customerPhone || '').trim();
        var addressLabel = isDeliveryOrder(order, typeLabel) ? String(order.customerAddress || '').trim() : '';
        var customerTitle = [customerName, addressLabel].filter(function(value) { return String(value || '').trim(); }).join(' | ');
        var customerMeta = addressLabel
          ? '<small class="orders-row-customer-meta" title="' + h(addressLabel) + '">' + h(addressLabel) + '</small>'
          : '';
        var receivedTimeLabel = String(order.receivedTimeLabel || order.timeLabel || '').trim();
        var dueTimeLabel = String(order.dueTimeLabel || '').trim();
        var display = {
          displayNumber: displayNumber,
          sourceLabel: sourceLabel,
          paymentBadge: paymentBadge,
          orderStatus: orderStatus,
          customerName: customerName,
          phoneLabel: phoneLabel,
          customerTitle: customerTitle,
          customerMeta: customerMeta,
          typeLabel: typeLabel,
          receivedTimeLabel: receivedTimeLabel,
          dueTimeLabel: dueTimeLabel
        };
        return '<button type="button" class="orders-mgmt-row" role="listitem" data-open-order="' + h(order.id) + '">'
          + columns.map(function(column) { return rowCellHtml(column.id, order, display, h, money); }).join('')
          + '</button>';
      }).join('')
      + '</div>';
  }

  global.LilposOrdersManagement = {
    VIEW_MODE_STANDARD: VIEW_MODE_STANDARD,
    VIEW_MODE_ROWS: VIEW_MODE_ROWS,
    DEFAULT_VIEW_PREFERENCES: DEFAULT_VIEW_PREFERENCES,
    normalizeViewMode: normalizeViewMode,
    normalizePreferences: normalizePreferences,
    preferenceKeyForQueue: preferenceKeyForQueue,
    viewModeForQueue: viewModeForQueue,
    setViewModeForQueue: setViewModeForQueue,
    DEFAULT_COLUMN_ORDER: DEFAULT_COLUMN_ORDER,
    COLUMN_DEFS: COLUMN_DEFS,
    normalizeColumnLayout: normalizeColumnLayout,
    columnLayoutForQueue: columnLayoutForQueue,
    setColumnOrderForQueue: setColumnOrderForQueue,
    moveColumnForQueue: moveColumnForQueue,
    setSortForQueue: setSortForQueue,
    renderViewModeSwitch: renderViewModeSwitch,
    renderOrderRows: renderOrderRows
  };
})(window);
