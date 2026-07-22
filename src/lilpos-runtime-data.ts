(function(global: any) {
  'use strict';

  function buildLilposRuntimePackageFromLegacy(legacy: any, seed?: any, deps?: any): any {
    const safeSeed = seed || {};
    const safeDeps = deps || {};
    const nowIso = safeDeps.nowIso || (function() { return new Date().toISOString(); });
    const lineCount = typeof safeDeps.getLineCount === 'function' ? safeDeps.getLineCount() : 6;

    if (!legacy) return null;
    if (legacy.runtimeKind === 'lilpos-runtime-package-v1') return legacy;

    const favoriteItemIds = Array.isArray(safeSeed.favoriteItemIds)
      ? safeSeed.favoriteItemIds
      : Array.isArray(legacy && legacy.uiState && legacy.uiState.favoriteItemIds)
      ? legacy.uiState.favoriteItemIds
      : [];

    const favoriteCategoryIds = Array.isArray(safeSeed.favoriteCategoryIds)
      ? safeSeed.favoriteCategoryIds
      : Array.isArray(legacy && legacy.uiState && legacy.uiState.favoriteCategoryIds)
      ? legacy.uiState.favoriteCategoryIds
      : [];

    return {
      runtimeKind: 'lilpos-runtime-package-v1',
      packageVersion: legacy.registerPackageVersion || Date.now(),
      generatedAt: legacy.generatedAt || nowIso(),
      scale: legacy.scale || 'large',
      counts: {
        categories: legacy.categories ? legacy.categories.length : 0,
        items: legacy.items ? legacy.items.length : 0,
        modifierGroups: legacy.modifierGroups ? legacy.modifierGroups.length : 0,
        modifierOptions: legacy.modifierOptions ? legacy.modifierOptions.length : 0,
        itemModifierGroups: legacy.itemModifierGroups ? legacy.itemModifierGroups.length : 0
      },
      categories: (legacy.categories || []).map(function(c) {
        return Object.assign({}, c, { hidden: !!c.hidden });
      }),
      itemTiles: (legacy.items || []).map(function(i) {
        return Object.assign({}, i);
      }),
      modifierFlows: {
        groups: legacy.modifierGroups || [],
        options: legacy.modifierOptions || [],
        itemGroups: legacy.itemModifierGroups || []
      },
      pricingRules: {
        taxRules: legacy.taxRules || [],
        sizes: legacy.sizes || []
      },
      printerRoutes: legacy.printerRoutes || [],
      favorites: {
        itemIds: Array.from(new Set(favoriteItemIds)),
        categoryIds: Array.from(new Set(favoriteCategoryIds))
      },
      customers: Array.isArray(safeSeed.customers) ? safeSeed.customers : [],
      settings: {
        register: legacy.registerSettings || {
          mode: 'PRINT_ONLY',
          keepReprintMinutes: 60,
          currency: 'USD',
          orderTypes: ['Pickup', 'Delivery', 'Dine In'],
          defaultOrderType: 'Pickup'
        },
        printerSettings: {
          kitchen: 'Kitchen Printer',
          receipt: 'Front Receipt'
        },
        callerId: {
          enabled: true,
          lines: lineCount
        }
      },
      retentionPolicy: {
        durable: ['menu runtime package', 'customers', 'customer addresses', 'customer notes', 'settings', 'printer settings', 'caller id settings', 'favorites'],
        sameDay: ['current tickets', 'same-day activity', 'print/reprint buffer', 'caller events', 'incoming orders', 'driver activity', 'reports']
      }
    };
  }

  function createLilposDataService(deps?: any): any {
    var safeDeps = deps || {};
    var normalizePhone = safeDeps.normalizePhone || function(v) { return String(v || '').replace(/\D/g, ''); };
    var isItemOutOfStock = safeDeps.isItemOutOfStock || function() { return false; };
    var getFallbackCustomers = safeDeps.getFallbackCustomers || function() { return []; };
    var nowIso = safeDeps.nowIso || function() { return new Date().toISOString(); };
    var dbName = safeDeps.dbName || 'BringdatSmartRegisterMockNoNpm';
    var dbVersion = Number.isFinite(Number(safeDeps.dbVersion)) ? Number(safeDeps.dbVersion) : 3;
    var legacyOrdersKey = safeDeps.legacyOrdersKey || 'lilpos_persisted_orders';
    var getStationNumber = safeDeps.getStationNumber || function() { return 1; };
    var getMerchantId = safeDeps.getMerchantId || function() { return 'local-merchant'; };
    var getPlanPersistenceMode = safeDeps.getPlanPersistenceMode || function() { return 'same-day'; };

    var STORE_KV = 'kv';
    var STORE_META = 'runtime_meta';
    var STORE_ORDER_HISTORY = 'order_history';
    var STORE_ORDER_HISTORY_ITEMS = 'order_history_items';
    var STORE_ORDER_EVENTS = 'order_events';
    var STORE_PAYMENT_HISTORY = 'payment_history';
    var STORE_SPLIT_PAYMENT_PLAN = 'split_payment_plan';
    var STORE_SPLIT_PAYMENT_PORTION = 'split_payment_portion';

    var LEGACY_IMPORT_META_KEY = 'legacy_order_import_v1';

    var historyBootPromise: Promise<any> | null = null;

    function toIntCents(value: any): number {
      return Math.round(Number(value || 0) * 100);
    }

    function fromIntCents(value: any): number {
      return Number.isFinite(Number(value)) ? Number(value) / 100 : 0;
    }

    function normalizeOrderStatus(order: any) {
      var rawStatus = String(order && order.status || '').trim().toLowerCase();
      if (rawStatus === 'completed' || rawStatus === 'open' || rawStatus === 'canceled' || rawStatus === 'closed') {
        return rawStatus;
      }
      var paid = !!(order && order.paid) || String(order && order.paymentStatus || '').toLowerCase() === 'paid';
      return paid ? 'completed' : 'open';
    }

    function padOrderSequence(sequence: number): string {
      return String(Math.max(0, Number(sequence || 0))).padStart(5, '0');
    }

    function businessDateNow(): string {
      return new Date().toISOString().split('T')[0];
    }

    function normalizeDisplayOrderNumber(orderNumber: any): string {
      var raw = String(orderNumber || '').trim();
      if (!raw) return '';
      if (/^\d+$/.test(raw)) return String(Number(raw));
      var stationPattern = raw.match(/^(\d+)-0*(\d+)$/);
      if (stationPattern) return stationPattern[1] + '-' + String(Number(stationPattern[2]));
      return raw;
    }

    function safeParseLegacyOrders(): any[] {
      try {
        var raw = global.localStorage && global.localStorage.getItem(legacyOrdersKey);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error('Failed to parse legacy persisted orders for migration:', err);
        return [];
      }
    }

    function parseDailySequence(orderNumber: any, stationNumber: any): number | null {
      var expectedPrefix = String(stationNumber) + '-';
      var raw = String(orderNumber || '');
      if (!raw.startsWith(expectedPrefix)) return null;
      var suffix = raw.slice(expectedPrefix.length);
      var parsed = Number(suffix);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function deterministicKey(parts: any[]): string {
      return parts.map(function(part) { return String(part == null ? '' : part); }).join('|').toLowerCase();
    }

    function ensureSplitPaymentStores(db: IDBDatabase) {
      if (!db.objectStoreNames.contains(STORE_SPLIT_PAYMENT_PLAN)) {
        var planStore = db.createObjectStore(STORE_SPLIT_PAYMENT_PLAN, { keyPath: 'id' });
        planStore.createIndex('by_orderId', 'orderId', { unique: false });
        planStore.createIndex('by_status', 'status', { unique: false });
        planStore.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
      }

      if (!db.objectStoreNames.contains(STORE_SPLIT_PAYMENT_PORTION)) {
        var portionStore = db.createObjectStore(STORE_SPLIT_PAYMENT_PORTION, { keyPath: 'id' });
        portionStore.createIndex('by_planId', 'planId', { unique: false });
        portionStore.createIndex('by_orderId', 'orderId', { unique: false });
        portionStore.createIndex('by_status', 'status', { unique: false });
        portionStore.createIndex('by_paymentId', 'paymentId', { unique: false });
        portionStore.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
      }
    }

    function openRuntimeDb(): Promise<IDBDatabase> {
      return new Promise(function(resolve, reject) {
        var req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = function(event: any) {
          var db = req.result;
          var tx = req.transaction;
          var oldVersion = Number(event && event.oldVersion || 0);

          if (!db.objectStoreNames.contains(STORE_KV)) {
            db.createObjectStore(STORE_KV);
          }

          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'id' });
          }

          if (oldVersion < 2) {
            if (!db.objectStoreNames.contains(STORE_ORDER_HISTORY)) {
              var orderHistory = db.createObjectStore(STORE_ORDER_HISTORY, { keyPath: 'historyId' });
              orderHistory.createIndex('by_orderId', 'orderId', { unique: false });
              orderHistory.createIndex('by_businessDate', 'businessDate', { unique: false });
              orderHistory.createIndex('by_stationId', 'stationId', { unique: false });
              orderHistory.createIndex('by_orderStatus', 'orderStatus', { unique: false });
              orderHistory.createIndex('by_paymentStatus', 'paymentStatus', { unique: false });
              orderHistory.createIndex('by_completedAt', 'completedAt', { unique: false });
              orderHistory.createIndex('by_syncStatus', 'syncStatus', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_ORDER_HISTORY_ITEMS)) {
              var orderHistoryItems = db.createObjectStore(STORE_ORDER_HISTORY_ITEMS, { keyPath: 'historyItemId' });
              orderHistoryItems.createIndex('by_historyId', 'historyId', { unique: false });
              orderHistoryItems.createIndex('by_orderId', 'orderId', { unique: false });
              orderHistoryItems.createIndex('by_sortOrder', 'sortOrder', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_ORDER_EVENTS)) {
              var orderEvents = db.createObjectStore(STORE_ORDER_EVENTS, { keyPath: 'eventId' });
              orderEvents.createIndex('by_orderId', 'orderId', { unique: false });
              orderEvents.createIndex('by_historyId', 'historyId', { unique: false });
              orderEvents.createIndex('by_eventTimestamp', 'eventTimestamp', { unique: false });
              orderEvents.createIndex('by_eventType', 'eventType', { unique: false });
              orderEvents.createIndex('by_employeeId', 'employeeId', { unique: false });
              orderEvents.createIndex('by_businessDate', 'businessDate', { unique: false });
              orderEvents.createIndex('by_syncStatus', 'syncStatus', { unique: false });
              orderEvents.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
            }

            if (!db.objectStoreNames.contains(STORE_PAYMENT_HISTORY)) {
              var paymentHistory = db.createObjectStore(STORE_PAYMENT_HISTORY, { keyPath: 'paymentHistoryId' });
              paymentHistory.createIndex('by_orderId', 'orderId', { unique: false });
              paymentHistory.createIndex('by_historyId', 'historyId', { unique: false });
              paymentHistory.createIndex('by_paymentType', 'paymentType', { unique: false });
              paymentHistory.createIndex('by_paidAt', 'paidAt', { unique: false });
              paymentHistory.createIndex('by_syncStatus', 'syncStatus', { unique: false });
              paymentHistory.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
            }

            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try {
                tx.objectStore(STORE_META).put({
                  id: 'schema_version',
                  value: 2,
                  migratedAt: nowIso()
                });
              } catch (_err) {
                // Keep migration non-destructive even if metadata write fails.
              }
            }
          }

          if (oldVersion < 3) {
            ensureSplitPaymentStores(db);
            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try {
                tx.objectStore(STORE_META).put({
                  id: 'schema_version',
                  value: 3,
                  migratedAt: nowIso()
                });
              } catch (_err) {
                // Non-destructive migration metadata update
              }
            }
          }
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    }

    function txDone(tx: IDBTransaction): Promise<void> {
      return new Promise(function(resolve, reject) {
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    }

    function requestResult(req: IDBRequest): Promise<any> {
      return new Promise(function(resolve, reject) {
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    }

    async function kvPut(key: string, value: any): Promise<boolean> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).put(value, key);
      await txDone(tx);
      return true;
    }

    async function kvGet(key: string): Promise<any> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_KV, 'readonly');
      var value = await requestResult(tx.objectStore(STORE_KV).get(key));
      await txDone(tx);
      return value;
    }

    async function kvClear(): Promise<boolean> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).clear();
      await txDone(tx);
      return true;
    }

    async function metaGet(id: string): Promise<any> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_META, 'readonly');
      var value = await requestResult(tx.objectStore(STORE_META).get(id));
      await txDone(tx);
      return value || null;
    }

    async function metaPut(record: any): Promise<void> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put(record);
      await txDone(tx);
    }

    function sanitizeLegacyOrder(order: any): any {
      var safeOrder = order || {};
      var orderId = String(safeOrder.id || safeOrder.orderId || safeOrder.orderNumber || '').trim();
      if (!orderId) {
        throw new Error('Legacy order missing stable id/orderNumber');
      }
      var historyId = 'hist_legacy_' + orderId;
      var customer = safeOrder.customerSnapshot || safeOrder.customerInfo || safeOrder.customer || {};
      var displayName = String(
        customer && customer.name
        || safeOrder.customerName
        || safeOrder.customerLabel
        || safeOrder.orderLabel
        || safeOrder.orderIdentity
        || safeOrder.displayName
        || 'Guest'
      ).trim() || 'Guest';

      var paidAmountCents = Array.isArray(safeOrder.paymentLines)
        ? safeOrder.paymentLines.reduce(function(sum: number, line: any) {
            return sum + toIntCents((line && line.amount) || 0) + toIntCents((line && line.tipAmount) || 0);
          }, 0)
        : (safeOrder.paid ? toIntCents(safeOrder.total || 0) : 0);

      var totalCents = toIntCents(safeOrder.total || 0);
      var remainingBalanceCents = Math.max(0, totalCents - paidAmountCents);

      return {
        historyId: historyId,
        orderId: orderId,
        merchantId: String(safeOrder.merchantId || getMerchantId() || 'local-merchant'),
        stationId: String(safeOrder.stationNumber || getStationNumber() || 1),
        businessDate: String(safeOrder.businessDate || businessDateNow()),
        displayOrderNumber: normalizeDisplayOrderNumber(safeOrder.orderNumber || safeOrder.number || orderId),
        internalOrderSequence: parseDailySequence(safeOrder.orderNumber || safeOrder.number, safeOrder.stationNumber || getStationNumber()) || 0,
        orderType: String(safeOrder.orderType || 'pickup'),
        orderStatus: normalizeOrderStatus(safeOrder),
        paymentStatus: String(safeOrder.paymentStatus || (safeOrder.paid ? 'paid' : 'unpaid')),
        storedDisplayName: displayName,
        storedPhone: normalizePhone(customer && customer.phone),
        storedAddressSummary: String(customer && customer.address1 || ''),
        subtotalCents: toIntCents(safeOrder.subtotal || 0),
        taxCents: toIntCents(safeOrder.tax || 0),
        discountCents: toIntCents(safeOrder.discount || 0),
        feeCents: toIntCents(safeOrder.fee || 0),
        tipCents: toIntCents(safeOrder.tipTotal || 0),
        totalCents: totalCents,
        amountPaidCents: paidAmountCents,
        remainingBalanceCents: remainingBalanceCents,
        openedAt: safeOrder.createdTimestamp || null,
        sentAt: safeOrder.sentAt || safeOrder.updatedTimestamp || safeOrder.createdTimestamp || null,
        completedAt: safeOrder.paid ? (safeOrder.updatedTimestamp || safeOrder.createdTimestamp || null) : null,
        closedAt: (normalizeOrderStatus(safeOrder) === 'completed' || normalizeOrderStatus(safeOrder) === 'closed') ? (safeOrder.updatedTimestamp || safeOrder.createdTimestamp || null) : null,
        createdAt: safeOrder.createdTimestamp || nowIso(),
        updatedAt: safeOrder.updatedTimestamp || nowIso(),
        version: Number(safeOrder.version || 1),
        syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
        syncAttempts: Number(safeOrder.syncAttempts || 0),
        lastSyncError: safeOrder.lastSyncError || null,
        lastSyncedAt: safeOrder.lastSyncedAt || null,
        sourceSnapshot: {
          orderSpecialInstructions: safeOrder.orderSpecialInstructions || '',
          timingType: safeOrder.timingType || 'asap',
          asapTime: safeOrder.asapTime || null,
          futureDateTime: safeOrder.futureDateTime || null,
          orderSource: safeOrder.orderSource || '',
          customer: customer,
          paymentMethodSummary: safeOrder.paymentMethodSummary || ''
        },
        migration: {
          source: 'legacy_localstorage_orderpersistence',
          migrationKey: 'legacy:' + orderId,
          migratedAt: nowIso()
        }
      };
    }

    function legacyOrderItems(historyId: string, order: any): any[] {
      var lines = Array.isArray(order && order.lines) ? order.lines : [];
      return lines.map(function(line: any, idx: number) {
        var qty = Number(line && line.qty || 1);
        var unitPrice = Number(line && line.price || 0);
        var lineSubtotal = unitPrice * qty;
        var modifierSummary = Array.isArray(line && line.mods)
          ? line.mods.map(function(mod: any) {
              return String(mod && (mod.optionName || mod.name || mod.optionId || mod.id || '')); 
            }).filter(Boolean).join(', ')
          : '';
        return {
          historyItemId: 'hist_item_legacy_' + String(order && order.id || order && order.orderNumber || 'unknown') + '_' + String(idx),
          historyId: historyId,
          orderId: String(order && order.id || order && order.orderNumber || ''),
          sourceItemId: String(line && line.itemId || line && line.lineId || ''),
          itemName: String(line && (line.name || line.itemName || line.title) || 'Item'),
          categoryName: String(line && line.categoryName || ''),
          sizeName: String(line && line.size || ''),
          quantity: qty,
          unitPriceCents: toIntCents(unitPrice),
          lineSubtotalCents: toIntCents(lineSubtotal),
          lineTotalCents: toIntCents(lineSubtotal),
          instructions: String(line && line.specialInstruction || ''),
          modifierSummary: modifierSummary,
          sortOrder: idx,
          createdAt: String(order && order.createdTimestamp || nowIso())
        };
      });
    }

    function legacyOrderEvents(historyId: string, order: any): any[] {
      var orderId = String(order && order.id || order && order.orderNumber || '');
      var sourceEvents = Array.isArray(order && order.auditEvents) ? order.auditEvents : [];
      var normalized = sourceEvents.map(function(event: any, idx: number) {
        var label = String(event && (event.event || event.type || event.label || event.status || 'ORDER_UPDATED')).trim();
        var upper = label.toUpperCase();
        var eventType = upper.startsWith('ORDER_') || upper.startsWith('PAYMENT_') ? upper : 'ORDER_' + upper.replace(/\s+/g, '_');
        var timestamp = String(event && (event.timestamp || event.at || event.createdAt) || order && order.updatedTimestamp || order && order.createdTimestamp || nowIso());
        var employeeShortName = String(event && (event.employeeShortName || event.employeeInitials || event.by || event.employeeId) || 'System');
        var idempotencyKey = deterministicKey(['legacy', orderId, eventType, timestamp, idx]);
        return {
          eventId: 'evt_' + idempotencyKey.replace(/[^a-z0-9_\-]/g, '_'),
          orderId: orderId,
          historyId: historyId,
          merchantId: String(order && order.merchantId || getMerchantId() || 'local-merchant'),
          stationId: String(order && order.stationNumber || getStationNumber() || 1),
          businessDate: String(order && order.businessDate || businessDateNow()),
          eventType: eventType,
          eventTimestamp: timestamp,
          employeeId: String(event && event.employeeId || ''),
          employeeShortName: employeeShortName || 'System',
          actorType: String(event && event.actorType || 'employee'),
          idempotencyKey: idempotencyKey,
          metadata: event && event.metadata || null,
          createdAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
          syncAttempts: 0,
          lastSyncError: null,
          lastSyncedAt: null,
          migration: {
            source: 'legacy_localstorage_orderpersistence',
            migrationKey: 'legacy:' + orderId + ':event:' + idx
          }
        };
      });

      if (normalized.length) return normalized;

      var fallbackTimestamp = String(order && order.createdTimestamp || nowIso());
      var idempotencyKey = deterministicKey(['legacy', orderId, 'ORDER_ENTERED', fallbackTimestamp, 0]);
      return [{
        eventId: 'evt_' + idempotencyKey.replace(/[^a-z0-9_\-]/g, '_'),
        orderId: orderId,
        historyId: historyId,
        merchantId: String(order && order.merchantId || getMerchantId() || 'local-merchant'),
        stationId: String(order && order.stationNumber || getStationNumber() || 1),
        businessDate: String(order && order.businessDate || businessDateNow()),
        eventType: 'ORDER_ENTERED',
        eventTimestamp: fallbackTimestamp,
        employeeId: '',
        employeeShortName: 'System',
        actorType: 'system',
        idempotencyKey: idempotencyKey,
        metadata: { importedWithoutLedger: true },
        createdAt: nowIso(),
        syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
        syncAttempts: 0,
        lastSyncError: null,
        lastSyncedAt: null,
        migration: {
          source: 'legacy_localstorage_orderpersistence',
          migrationKey: 'legacy:' + orderId + ':event:fallback'
        }
      }];
    }

    function legacyPayments(historyId: string, order: any): any[] {
      var orderId = String(order && order.id || order && order.orderNumber || '');
      var paymentLines = Array.isArray(order && order.paymentLines) ? order.paymentLines : [];
      if (!paymentLines.length) return [];

      return paymentLines.map(function(line: any, idx: number) {
        var paymentType = String(line && line.paymentType || line && line.type || 'Other');
        var amountCents = toIntCents(line && line.amount || 0) + toIntCents(line && line.tipAmount || 0);
        var cardBrand = String(line && (line.cardBrand || line.brand || line.cardType) || '').trim();
        var lastFour = String(line && (line.lastFour || line.last4 || line.cardLastFour) || '').replace(/\D/g, '').slice(-4);
        var paymentId = String(line && line.paymentId || 'legacy_' + orderId + '_' + idx);
        var idempotencyKey = deterministicKey(['legacy', orderId, 'payment', paymentId, amountCents]);
        return {
          paymentHistoryId: 'pay_' + idempotencyKey.replace(/[^a-z0-9_\-]/g, '_'),
          orderId: orderId,
          historyId: historyId,
          paymentId: paymentId,
          paymentType: paymentType,
          tenderLabel: String(line && line.tenderLabel || paymentType),
          amountCents: amountCents,
          cardBrand: cardBrand,
          cardLastFour: lastFour,
          processorReferenceId: String(line && line.processorReferenceId || line && line.processorRef || ''),
          status: String(line && line.status || 'approved'),
          employeeId: String(line && line.employeeId || ''),
          employeeShortName: String(line && line.employeeShortName || line && line.employeeInitials || 'System'),
          paidAt: String(line && line.paidAt || order && order.updatedTimestamp || order && order.createdTimestamp || nowIso()),
          createdAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
          syncAttempts: 0,
          lastSyncError: null,
          lastSyncedAt: null,
          idempotencyKey: idempotencyKey,
          migration: {
            source: 'legacy_localstorage_orderpersistence',
            migrationKey: 'legacy:' + orderId + ':payment:' + idx
          }
        };
      });
    }

    async function importLegacyOrdersIntoHistory(): Promise<any> {
      var legacyOrders = safeParseLegacyOrders();
      var result = {
        totalLegacyOrders: legacyOrders.length,
        importedOrders: 0,
        importedItems: 0,
        importedEvents: 0,
        importedPayments: 0,
        failedOrders: [] as any[]
      };

      if (!legacyOrders.length) {
        await metaPut({ id: LEGACY_IMPORT_META_KEY, migratedAt: nowIso(), status: 'done', result: result });
        return result;
      }

      var db = await openRuntimeDb();
      var tx = db.transaction([STORE_ORDER_HISTORY, STORE_ORDER_HISTORY_ITEMS, STORE_ORDER_EVENTS, STORE_PAYMENT_HISTORY, STORE_META], 'readwrite');
      var historyStore = tx.objectStore(STORE_ORDER_HISTORY);
      var itemsStore = tx.objectStore(STORE_ORDER_HISTORY_ITEMS);
      var eventsStore = tx.objectStore(STORE_ORDER_EVENTS);
      var paymentsStore = tx.objectStore(STORE_PAYMENT_HISTORY);
      var metaStore = tx.objectStore(STORE_META);

      for (var i = 0; i < legacyOrders.length; i += 1) {
        var legacyOrder = legacyOrders[i];
        try {
          var snapshot = sanitizeLegacyOrder(legacyOrder);
          historyStore.put(snapshot);
          result.importedOrders += 1;

          var items = legacyOrderItems(snapshot.historyId, legacyOrder);
          for (var itemIdx = 0; itemIdx < items.length; itemIdx += 1) {
            itemsStore.put(items[itemIdx]);
            result.importedItems += 1;
          }

          var events = legacyOrderEvents(snapshot.historyId, legacyOrder);
          for (var eventIdx = 0; eventIdx < events.length; eventIdx += 1) {
            eventsStore.put(events[eventIdx]);
            result.importedEvents += 1;
          }

          var payments = legacyPayments(snapshot.historyId, legacyOrder);
          for (var paymentIdx = 0; paymentIdx < payments.length; paymentIdx += 1) {
            paymentsStore.put(payments[paymentIdx]);
            result.importedPayments += 1;
          }
        } catch (err: any) {
          result.failedOrders.push({
            index: i,
            orderId: String(legacyOrder && (legacyOrder.id || legacyOrder.orderNumber) || ''),
            message: err && err.message || String(err)
          });
          console.error('Legacy order migration skipped malformed record', legacyOrder, err);
        }
      }

      metaStore.put({
        id: LEGACY_IMPORT_META_KEY,
        migratedAt: nowIso(),
        status: result.failedOrders.length ? 'partial' : 'done',
        result: result
      });

      await txDone(tx);
      return result;
    }

    async function ensureHistoryPersistenceReady(forceLegacyImport?: boolean): Promise<any> {
      if (!historyBootPromise || forceLegacyImport) {
        historyBootPromise = (async function() {
          await openRuntimeDb();
          var marker = await metaGet(LEGACY_IMPORT_META_KEY);
          if (!marker || forceLegacyImport) {
            return importLegacyOrdersIntoHistory();
          }
          return marker.result || marker;
        })();
      }
      return historyBootPromise;
    }

    async function listStoreAll(storeName: string, indexName?: string, query?: any): Promise<any[]> {
      await ensureHistoryPersistenceReady();
      var db = await openRuntimeDb();
      var tx = db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      var req = indexName
        ? store.index(indexName).getAll(query)
        : store.getAll();
      var rows = await requestResult(req);
      await txDone(tx);
      return Array.isArray(rows) ? rows : [];
    }

    function eventLabelToType(label: any): string {
      var raw = String(label || '').trim();
      if (!raw) return 'ORDER_UPDATED';
      var upper = raw.toUpperCase().replace(/\s+/g, '_');
      if (upper.startsWith('ORDER_') || upper.startsWith('PAYMENT_') || upper === 'HISTORY_IMPORTED') return upper;
      if (upper === 'PAID') return 'ORDER_PAID';
      if (upper === 'PARTIALLY_PAID') return 'ORDER_PARTIALLY_PAID';
      return 'ORDER_' + upper;
    }

    function toReadableEventLabel(eventType: any): string {
      var t = String(eventType || '').toUpperCase();
      var map: any = {
        ORDER_ENTERED: 'Entered',
        ORDER_UPDATED: 'Updated',
        ORDER_SENT: 'Sent',
        PAYMENT_APPLIED: 'Payment Applied',
        ORDER_PARTIALLY_PAID: 'Partially Paid',
        ORDER_PAID: 'Paid',
        ORDER_COMPLETED: 'Completed',
        ORDER_CLOSED: 'Closed',
        ORDER_REOPENED: 'Reopened',
        ORDER_CANCELED: 'Canceled',
        ORDER_VOIDED: 'Voided',
        ORDER_REFUNDED: 'Refunded',
        ORDER_REPRINTED: 'Reprinted',
        HISTORY_IMPORTED: 'History Imported'
      };
      return map[t] || t.replace(/^ORDER_/, '').replace(/^PAYMENT_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
    }

    return {
      runtimePackage: null,
      indexes: {
        itemsById: new Map(),
        categoriesById: new Map(),
        itemsByCategoryId: new Map(),
        visibleCategoryIds: [],
        favoriteTiles: { categories: [], items: [], mixed: [] },
        searchIndex: [],
        outOfStockByItemId: new Set(),
        priceOverrideByItemId: new Map(),
        itemMods: new Map(),
        groupsById: {},
        optsByGroup: new Map(),
        indexMs: 0
      },

      loadRuntimePackage: function(input: any, seed?: any) {
        var runtime = buildLilposRuntimePackageFromLegacy(input, seed || {}, safeDeps);
        runtime.customers = Array.isArray(runtime.customers) && runtime.customers.length ? runtime.customers : ((seed && seed.customers) || []);
        this.runtimePackage = runtime;
        this.rebuildIndexes();
        return runtime;
      },

      rebuildIndexes: function() {
        var t0 = performance.now();
        var pkg = this.runtimePackage;
        if (!pkg) return;

        var categoriesById: any = new Map((pkg.categories || []).map(function(c: any) { return [c.id, c]; }));
        var itemsById: any = new Map((pkg.itemTiles || []).map(function(i: any) { return [i.id, i]; }));
        var itemsByCategoryId: any = new Map();
        var visibleCategoryIds = [];
        var outOfStockByItemId = new Set();
        var priceOverrideByItemId = new Map();

        (pkg.categories || []).forEach(function(c) {
          if (!c.hidden) visibleCategoryIds.push(c.id);
        });

        (pkg.itemTiles || []).forEach(function(item) {
          if (!itemsByCategoryId.has(item.categoryId)) itemsByCategoryId.set(item.categoryId, []);
          itemsByCategoryId.get(item.categoryId).push(item);
          if (isItemOutOfStock(item)) outOfStockByItemId.add(item.id);
          if (Number.isFinite(item.priceOverride) && item.priceOverride !== item.basePrice) {
            priceOverrideByItemId.set(item.id, item.priceOverride);
          }
        });

        var itemMods: any = new Map();
        (pkg.modifierFlows && pkg.modifierFlows.itemGroups ? pkg.modifierFlows.itemGroups : []).forEach(function(r) {
          if (!itemMods.has(r.itemId)) itemMods.set(r.itemId, []);
          itemMods.get(r.itemId).push(r.groupId);
        });
        var groupsById: any = Object.fromEntries((pkg.modifierFlows && pkg.modifierFlows.groups ? pkg.modifierFlows.groups : []).map(function(x: any) { return [x.id, x]; }));
        var optsByGroup: any = new Map();
        (pkg.modifierFlows && pkg.modifierFlows.options ? pkg.modifierFlows.options : []).forEach(function(o) {
          if (!optsByGroup.has(o.groupId)) optsByGroup.set(o.groupId, []);
          optsByGroup.get(o.groupId).push(o);
        });

        var normalize = function(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
        var searchIndex = (pkg.itemTiles || []).map(function(item) {
          var catName = (categoriesById.get(item.categoryId) || {}).name || '';
          var modText = (itemMods.get(item.id) || []).map(function(gid) { return (groupsById[gid] || {}).name || ''; }).join(' ');
          var text = normalize(item.name + ' ' + (item.description || '') + ' ' + catName + ' ' + modText);
          return { itemId: item.id, text: text };
        });

        var favoriteCategoryIds = (pkg.favorites && pkg.favorites.categoryIds) || [];
        var favoriteItemIds = (pkg.favorites && pkg.favorites.itemIds) || [];
        var favoriteCategories = favoriteCategoryIds.map(function(id) { return categoriesById.get(id); }).filter(function(c) { return c && !c.hidden; });
        var favoriteItems = favoriteItemIds.map(function(id) { return itemsById.get(id); }).filter(function(i) { return i && !((categoriesById.get(i.categoryId) || {}).hidden); });

        this.indexes = {
          itemsById: itemsById,
          categoriesById: categoriesById,
          itemsByCategoryId: itemsByCategoryId,
          visibleCategoryIds: visibleCategoryIds,
          favoriteTiles: {
            categories: favoriteCategories,
            items: favoriteItems,
            mixed: [].concat(
              favoriteCategories.map(function(c) { return { type: 'category', value: c }; }),
              favoriteItems.map(function(i) { return { type: 'item', value: i }; })
            )
          },
          searchIndex: searchIndex,
          outOfStockByItemId: outOfStockByItemId,
          priceOverrideByItemId: priceOverrideByItemId,
          itemMods: itemMods,
          groupsById: groupsById,
          optsByGroup: optsByGroup,
          indexMs: +(performance.now() - t0).toFixed(2)
        };

        this.runtimePackage.counts = {
          categories: pkg.categories ? pkg.categories.length : 0,
          items: pkg.itemTiles ? pkg.itemTiles.length : 0,
          modifierGroups: pkg.modifierFlows && pkg.modifierFlows.groups ? pkg.modifierFlows.groups.length : 0,
          modifierOptions: pkg.modifierFlows && pkg.modifierFlows.options ? pkg.modifierFlows.options.length : 0,
          itemModifierGroups: pkg.modifierFlows && pkg.modifierFlows.itemGroups ? pkg.modifierFlows.itemGroups.length : 0
        };
      },

      getVisibleCategories: function() {
        var self = this;
        return this.indexes.visibleCategoryIds.map(function(id) { return self.indexes.categoriesById.get(id); }).filter(Boolean);
      },

      getCategoryTiles: function() {
        return this.getVisibleCategories().map(function(c) { return { id: c.id, name: c.name }; });
      },

      getItemsForCategory: function(categoryId) {
        var self = this;
        return (this.indexes.itemsByCategoryId.get(categoryId) || []).filter(function(i) { return !((self.indexes.categoriesById.get(i.categoryId) || {}).hidden); });
      },

      getAllItems: function() {
        var self = this;
        return Array.from<any>(this.indexes.itemsById.values()).filter(function(i: any) { return !((self.indexes.categoriesById.get(i.categoryId) || {}).hidden); });
      },

      searchItems: function(query) {
        var self = this;
        var q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!q) return [];
        var itemIds = this.indexes.searchIndex.filter(function(doc) { return doc.text.includes(q); }).map(function(doc) { return doc.itemId; });
        return itemIds.map(function(id) { return self.indexes.itemsById.get(id); }).filter(function(i) { return i && !((self.indexes.categoriesById.get(i.categoryId) || {}).hidden); });
      },

      getFavoriteTiles: function() {
        return this.indexes.favoriteTiles;
      },

      getItemById: function(itemId) {
        return this.indexes.itemsById.get(itemId) || null;
      },

      updateItem: function(itemId: any, changes: any) {
        var item = this.getItemById(itemId);
        if (!item) return null;
        Object.assign(item, changes);
        this.rebuildIndexes();
        return item;
      },

      updateCategory: function(categoryId: any, changes: any) {
        var category = this.indexes.categoriesById.get(categoryId);
        if (!category) return null;
        Object.assign(category, changes);
        this.rebuildIndexes();
        return category;
      },

      addNewItem: function(item: any) {
        if (!this.runtimePackage) return null;
        this.runtimePackage.itemTiles.push(item);
        this.rebuildIndexes();
        return item;
      },

      lookupCustomerByPhone: function(phone: any) {
        var target = normalizePhone(phone);
        if (!target) return null;
        var source = (this.runtimePackage && this.runtimePackage.customers && this.runtimePackage.customers.length)
          ? this.runtimePackage.customers
          : getFallbackCustomers();
        return (source || []).find(function(c) { return normalizePhone(c.phone) === target; }) || null;
      },

      getCustomers: function() {
        var source = (this.runtimePackage && Array.isArray(this.runtimePackage.customers))
          ? this.runtimePackage.customers
          : getFallbackCustomers();
        return (source || []).map(function(c) { return Object.assign({}, c); });
      },

      upsertCustomer: function(customer) {
        if (!customer) return null;
        if (!this.runtimePackage) return null;
        if (!Array.isArray(this.runtimePackage.customers)) this.runtimePackage.customers = [];

        var next = Object.assign({}, customer);
        var targetPhone = normalizePhone(next.phone);
        var idx = this.runtimePackage.customers.findIndex(function(c) {
          if (next.id && c.id === next.id) return true;
          if (targetPhone && normalizePhone(c.phone) === targetPhone) return true;
          return false;
        });

        if (idx >= 0) {
          this.runtimePackage.customers[idx] = Object.assign({}, this.runtimePackage.customers[idx], next);
          return this.runtimePackage.customers[idx];
        }

        this.runtimePackage.customers.unshift(next);
        return next;
      },

      ensureHistoryPersistenceReady: ensureHistoryPersistenceReady,

      saveRuntimeCache: function(key: string, value: any) {
        return kvPut(key, value);
      },

      getRuntimeCache: function(key: string) {
        return kvGet(key);
      },

      clearRuntimeCache: function() {
        return kvClear();
      },

      getBusinessDate: function() {
        return businessDateNow();
      },

      getStationNumber: function() {
        return Number(getStationNumber() || 1);
      },

      buildOrderNumber: async function() {
        await ensureHistoryPersistenceReady();
        var station = Number(getStationNumber() || 1);
        var businessDate = businessDateNow();
        var rows = await listStoreAll(STORE_ORDER_HISTORY, 'by_businessDate', businessDate);
        var maxSequence = rows.reduce(function(best: number, row: any) {
          if (Number(row && row.stationId) !== station) return best;
          var seq = Number(row && row.internalOrderSequence);
          return Number.isFinite(seq) ? Math.max(best, seq) : best;
        }, -1);

        if (maxSequence < 0) {
          var legacyOrders = safeParseLegacyOrders();
          maxSequence = legacyOrders.reduce(function(best: number, order: any) {
            var parsed = parseDailySequence(order && order.orderNumber, station);
            return parsed == null ? best : Math.max(best, parsed);
          }, -1);
        }

        var nextSequence = maxSequence + 1;
        return String(station) + '-' + padOrderSequence(nextSequence);
      },

      saveOrderHistorySnapshot: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var orderId = String(input && (input.orderId || input.id) || '').trim();
        if (!orderId) throw new Error('saveOrderHistorySnapshot requires orderId');
        var historyId = String(input && input.historyId || ('hist_' + orderId)).trim();
        var record = {
          historyId: historyId,
          orderId: orderId,
          merchantId: String(input && input.merchantId || getMerchantId() || 'local-merchant'),
          stationId: String(input && input.stationId || getStationNumber() || 1),
          businessDate: String(input && input.businessDate || businessDateNow()),
          displayOrderNumber: normalizeDisplayOrderNumber(input && input.displayOrderNumber || input && input.orderNumber || orderId),
          internalOrderSequence: Number(input && input.internalOrderSequence || parseDailySequence(input && (input.orderNumber || input.displayOrderNumber), input && input.stationId || getStationNumber()) || 0),
          orderType: String(input && input.orderType || 'pickup'),
          orderStatus: String(input && input.orderStatus || normalizeOrderStatus(input)),
          paymentStatus: String(input && input.paymentStatus || (input && input.paid ? 'paid' : 'unpaid')),
          storedDisplayName: String(input && input.storedDisplayName || input && input.customerName || 'Guest'),
          storedPhone: normalizePhone(input && input.storedPhone || input && input.customerPhone),
          storedAddressSummary: String(input && input.storedAddressSummary || ''),
          subtotalCents: Number.isFinite(Number(input && input.subtotalCents)) ? Number(input.subtotalCents) : toIntCents(input && input.subtotal || 0),
          taxCents: Number.isFinite(Number(input && input.taxCents)) ? Number(input.taxCents) : toIntCents(input && input.tax || 0),
          discountCents: Number.isFinite(Number(input && input.discountCents)) ? Number(input.discountCents) : toIntCents(input && input.discount || 0),
          feeCents: Number.isFinite(Number(input && input.feeCents)) ? Number(input.feeCents) : toIntCents(input && input.fee || 0),
          tipCents: Number.isFinite(Number(input && input.tipCents)) ? Number(input.tipCents) : toIntCents(input && input.tip || 0),
          totalCents: Number.isFinite(Number(input && input.totalCents)) ? Number(input.totalCents) : toIntCents(input && input.total || 0),
          amountPaidCents: Number.isFinite(Number(input && input.amountPaidCents)) ? Number(input.amountPaidCents) : toIntCents(input && input.amountPaid || 0),
          remainingBalanceCents: Number.isFinite(Number(input && input.remainingBalanceCents)) ? Number(input.remainingBalanceCents) : Math.max(0, toIntCents(input && input.total || 0) - toIntCents(input && input.amountPaid || 0)),
          openedAt: input && input.openedAt || null,
          sentAt: input && input.sentAt || null,
          completedAt: input && input.completedAt || null,
          closedAt: input && input.closedAt || null,
          createdAt: input && input.createdAt || nowIso(),
          updatedAt: input && input.updatedAt || nowIso(),
          version: Number(input && input.version || 1),
          syncStatus: String(input && input.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          syncAttempts: Number(input && input.syncAttempts || 0),
          lastSyncError: input && input.lastSyncError || null,
          lastSyncedAt: input && input.lastSyncedAt || null,
          sourceSnapshot: input && input.sourceSnapshot || null,
          migration: input && input.migration || null
        };

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_HISTORY, 'readwrite');
        tx.objectStore(STORE_ORDER_HISTORY).put(record);
        await txDone(tx);
        return record;
      },

      updateOrderHistorySnapshot: async function(historyId: string, changes: any) {
        await ensureHistoryPersistenceReady();
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_HISTORY, 'readwrite');
        var store = tx.objectStore(STORE_ORDER_HISTORY);
        var current = await requestResult(store.get(historyId));
        if (!current) {
          await txDone(tx);
          return null;
        }
        var next = Object.assign({}, current, changes || {}, { updatedAt: nowIso() });
        store.put(next);
        await txDone(tx);
        return next;
      },

      getOrderHistoryByOrderId: async function(orderId: string) {
        var rows = await listStoreAll(STORE_ORDER_HISTORY, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.updatedAt || 0).getTime() - new Date(a && a.updatedAt || 0).getTime();
        });
        return rows[0] || null;
      },

      listOrderHistory: async function(options?: any) {
        var rows = await listStoreAll(STORE_ORDER_HISTORY);
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.updatedAt || b && b.createdAt || 0).getTime() - new Date(a && a.updatedAt || a && a.createdAt || 0).getTime();
        });
        if (options && options.businessDate) {
          rows = rows.filter(function(row: any) { return row.businessDate === options.businessDate; });
        }
        return rows;
      },

      saveOrderHistoryItems: async function(historyId: string, orderId: string, items: any[]) {
        await ensureHistoryPersistenceReady();
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_HISTORY_ITEMS, 'readwrite');
        var store = tx.objectStore(STORE_ORDER_HISTORY_ITEMS);
        var byHistoryReq = store.index('by_historyId').getAll(historyId);
        var existing = await requestResult(byHistoryReq);
        (existing || []).forEach(function(row: any) {
          store.delete(row.historyItemId);
        });

        (items || []).forEach(function(item: any, idx: number) {
          var row = {
            historyItemId: String(item && item.historyItemId || ('hist_item_' + historyId + '_' + idx)),
            historyId: historyId,
            orderId: orderId,
            sourceItemId: String(item && item.sourceItemId || item && item.itemId || item && item.lineId || ''),
            itemName: String(item && item.itemName || item && item.name || 'Item'),
            categoryName: String(item && item.categoryName || ''),
            sizeName: String(item && item.sizeName || item && item.size || ''),
            quantity: Number(item && item.quantity || item && item.qty || 1),
            unitPriceCents: Number.isFinite(Number(item && item.unitPriceCents)) ? Number(item.unitPriceCents) : toIntCents(item && item.unitPrice || item && item.price || 0),
            lineSubtotalCents: Number.isFinite(Number(item && item.lineSubtotalCents)) ? Number(item.lineSubtotalCents) : toIntCents((item && (item.unitPrice || item.price) || 0) * Number(item && (item.quantity || item.qty) || 1)),
            lineTotalCents: Number.isFinite(Number(item && item.lineTotalCents)) ? Number(item.lineTotalCents) : toIntCents((item && (item.unitPrice || item.price) || 0) * Number(item && (item.quantity || item.qty) || 1)),
            instructions: String(item && item.instructions || item && item.specialInstruction || ''),
            modifierSummary: String(item && item.modifierSummary || ''),
            sortOrder: Number(item && item.sortOrder || idx),
            createdAt: String(item && item.createdAt || nowIso())
          };
          store.put(row);
        });

        await txDone(tx);
        return true;
      },

      appendOrderEvent: async function(event: any) {
        await ensureHistoryPersistenceReady();
        var orderId = String(event && event.orderId || '').trim();
        if (!orderId) throw new Error('appendOrderEvent requires orderId');
        var eventType = eventLabelToType(event && (event.eventType || event.type || event.label));
        var timestamp = String(event && (event.eventTimestamp || event.timestamp || event.at) || nowIso());
        var idempotencyKey = String(event && event.idempotencyKey || deterministicKey([orderId, eventType, timestamp, event && event.employeeId || '', event && event.employeeShortName || '']));

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_EVENTS, 'readwrite');
        var store = tx.objectStore(STORE_ORDER_EVENTS);
        var index = store.index('by_idempotencyKey');
        var existing = await requestResult(index.get(idempotencyKey));
        if (existing) {
          await txDone(tx);
          return existing;
        }

        var row = {
          eventId: String(event && event.eventId || ('evt_' + idempotencyKey.replace(/[^a-z0-9_\-]/gi, '_'))),
          orderId: orderId,
          historyId: String(event && event.historyId || ''),
          merchantId: String(event && event.merchantId || getMerchantId() || 'local-merchant'),
          stationId: String(event && event.stationId || getStationNumber() || 1),
          businessDate: String(event && event.businessDate || businessDateNow()),
          eventType: eventType,
          eventTimestamp: timestamp,
          employeeId: String(event && event.employeeId || ''),
          employeeShortName: String(event && event.employeeShortName || event && event.employeeCode || event && event.employeeInitials || event && event.employee || event && event.by || 'System'),
          actorType: String(event && event.actorType || 'employee'),
          idempotencyKey: idempotencyKey,
          metadata: event && event.metadata || null,
          createdAt: String(event && event.createdAt || nowIso()),
          syncStatus: String(event && event.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          syncAttempts: Number(event && event.syncAttempts || 0),
          lastSyncError: event && event.lastSyncError || null,
          lastSyncedAt: event && event.lastSyncedAt || null
        };
        store.put(row);
        await txDone(tx);
        return row;
      },

      listOrderEvents: async function(orderId: string) {
        var rows = await listStoreAll(STORE_ORDER_EVENTS, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(a && a.eventTimestamp || 0).getTime() - new Date(b && b.eventTimestamp || 0).getTime();
        });
        return rows;
      },

      savePaymentHistory: async function(payment: any) {
        await ensureHistoryPersistenceReady();
        var orderId = String(payment && payment.orderId || '').trim();
        if (!orderId) throw new Error('savePaymentHistory requires orderId');
        var paidAt = String(payment && payment.paidAt || nowIso());
        var idempotencyKey = String(payment && payment.idempotencyKey || deterministicKey([
          orderId,
          payment && payment.paymentId || '',
          payment && payment.paymentType || '',
          payment && payment.amountCents || toIntCents(payment && payment.amount || 0),
          paidAt
        ]));

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PAYMENT_HISTORY, 'readwrite');
        var store = tx.objectStore(STORE_PAYMENT_HISTORY);
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));
        if (existing) {
          await txDone(tx);
          return existing;
        }

        var row = {
          paymentHistoryId: String(payment && payment.paymentHistoryId || ('pay_' + idempotencyKey.replace(/[^a-z0-9_\-]/gi, '_'))),
          orderId: orderId,
          historyId: String(payment && payment.historyId || ''),
          paymentId: String(payment && payment.paymentId || ''),
          paymentType: String(payment && payment.paymentType || 'Other'),
          tenderLabel: String(payment && payment.tenderLabel || payment && payment.paymentType || 'Other'),
          amountCents: Number.isFinite(Number(payment && payment.amountCents)) ? Number(payment.amountCents) : toIntCents(payment && payment.amount || 0),
          baseAmountCents: Number.isFinite(Number(payment && payment.baseAmountCents)) ? Number(payment.baseAmountCents) : (Number.isFinite(Number(payment && payment.amountCents)) ? Number(payment.amountCents) : toIntCents(payment && payment.amount || 0)),
          tipAmountCents: Number.isFinite(Number(payment && payment.tipAmountCents)) ? Number(payment.tipAmountCents) : toIntCents(payment && payment.tipAmount || 0),
          cardBrand: String(payment && payment.cardBrand || ''),
          cardLastFour: String(payment && payment.cardLastFour || payment && payment.lastFour || '').replace(/\D/g, '').slice(-4),
          processorReferenceId: String(payment && payment.processorReferenceId || ''),
          provider: String(payment && payment.provider || ''),
          providerTransactionReference: String(payment && payment.providerTransactionReference || ''),
          status: String(payment && payment.status || 'approved'),
          employeeId: String(payment && payment.employeeId || ''),
          employeeShortName: String(payment && payment.employeeShortName || payment && payment.employeeInitials || payment && payment.employee || 'System'),
          paidAt: paidAt,
          createdAt: String(payment && payment.createdAt || nowIso()),
          syncStatus: String(payment && payment.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          syncAttempts: Number(payment && payment.syncAttempts || 0),
          lastSyncError: payment && payment.lastSyncError || null,
          lastSyncedAt: payment && payment.lastSyncedAt || null,
          idempotencyKey: idempotencyKey
        };

        store.put(row);
        await txDone(tx);
        return row;
      },

      listPaymentHistory: async function(orderId: string) {
        var rows = await listStoreAll(STORE_PAYMENT_HISTORY, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(a && a.paidAt || a && a.createdAt || 0).getTime() - new Date(b && b.paidAt || b && b.createdAt || 0).getTime();
        });
        return rows;
      },

      markHistoryRecordPendingSync: async function(storeType: string, recordId: string) {
        await ensureHistoryPersistenceReady();
        var map: any = {
          ORDER_HISTORY: STORE_ORDER_HISTORY,
          ORDER_EVENT: STORE_ORDER_EVENTS,
          PAYMENT_HISTORY: STORE_PAYMENT_HISTORY
        };
        var storeName = map[storeType];
        if (!storeName) throw new Error('Unknown storeType: ' + storeType);
        var db = await openRuntimeDb();
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var row = await requestResult(store.get(recordId));
        if (row) {
          row.syncStatus = 'pending';
          row.updatedAt = nowIso();
          store.put(row);
        }
        await txDone(tx);
        return !!row;
      },

      markHistoryRecordSynced: async function(storeType: string, recordId: string) {
        await ensureHistoryPersistenceReady();
        var map: any = {
          ORDER_HISTORY: STORE_ORDER_HISTORY,
          ORDER_EVENT: STORE_ORDER_EVENTS,
          PAYMENT_HISTORY: STORE_PAYMENT_HISTORY
        };
        var storeName = map[storeType];
        if (!storeName) throw new Error('Unknown storeType: ' + storeType);
        var db = await openRuntimeDb();
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var row = await requestResult(store.get(recordId));
        if (row) {
          row.syncStatus = 'synced';
          row.lastSyncedAt = nowIso();
          row.lastSyncError = null;
          row.updatedAt = nowIso();
          store.put(row);
        }
        await txDone(tx);
        return !!row;
      },

      markHistoryRecordSyncFailed: async function(storeType: string, recordId: string, errorText: string) {
        await ensureHistoryPersistenceReady();
        var map: any = {
          ORDER_HISTORY: STORE_ORDER_HISTORY,
          ORDER_EVENT: STORE_ORDER_EVENTS,
          PAYMENT_HISTORY: STORE_PAYMENT_HISTORY
        };
        var storeName = map[storeType];
        if (!storeName) throw new Error('Unknown storeType: ' + storeType);
        var db = await openRuntimeDb();
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var row = await requestResult(store.get(recordId));
        if (row) {
          row.syncStatus = 'failed';
          row.syncAttempts = Number(row.syncAttempts || 0) + 1;
          row.lastSyncError = String(errorText || 'Sync failed');
          row.updatedAt = nowIso();
          store.put(row);
        }
        await txDone(tx);
        return !!row;
      },

      listPendingSyncEnvelopes: async function(limit?: number) {
        await ensureHistoryPersistenceReady();
        var max = Number(limit || 200);
        var historyRows = (await listStoreAll(STORE_ORDER_HISTORY)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var eventRows = (await listStoreAll(STORE_ORDER_EVENTS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var paymentRows = (await listStoreAll(STORE_PAYMENT_HISTORY)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });

        var envelopes = [] as any[];
        historyRows.forEach(function(row: any) {
          envelopes.push({
            recordId: row.historyId,
            recordType: 'ORDER_HISTORY',
            merchantId: row.merchantId,
            stationId: row.stationId,
            schemaVersion: 2,
            payload: row,
            idempotencyKey: row.historyId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        });
        eventRows.forEach(function(row: any) {
          envelopes.push({
            recordId: row.eventId,
            recordType: 'ORDER_EVENT',
            merchantId: row.merchantId,
            stationId: row.stationId,
            schemaVersion: 2,
            payload: row,
            idempotencyKey: row.idempotencyKey,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt || row.createdAt
          });
        });
        paymentRows.forEach(function(row: any) {
          envelopes.push({
            recordId: row.paymentHistoryId,
            recordType: 'PAYMENT_HISTORY',
            merchantId: row.merchantId || getMerchantId(),
            stationId: row.stationId || getStationNumber(),
            schemaVersion: 2,
            payload: row,
            idempotencyKey: row.idempotencyKey,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt || row.createdAt
          });
        });
        envelopes.sort(function(a: any, b: any) {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
        return envelopes.slice(0, Math.max(1, max));
      },

      saveSplitPaymentPlan: async function(plan: any) {
        await ensureHistoryPersistenceReady();
        var id = String(plan && plan.id || '').trim();
        var orderId = String(plan && plan.orderId || '').trim();
        if (!id) throw new Error('saveSplitPaymentPlan requires id');
        if (!orderId) throw new Error('saveSplitPaymentPlan requires orderId');

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_SPLIT_PAYMENT_PLAN, 'readwrite');
        var store = tx.objectStore(STORE_SPLIT_PAYMENT_PLAN);
        var idempotencyKey = String(plan && plan.idempotencyKey || deterministicKey(['split-plan', id, orderId]));
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));

        var record = existing || {
          id: id,
          createdAt: String(plan && plan.createdAt || nowIso())
        };

        record.orderId = orderId;
        record.historyId = String(plan && plan.historyId || '');
        record.mode = String(plan && plan.mode || 'CUSTOM');
        record.originalBalanceCents = Number(plan && plan.originalBalanceCents || 0);
        record.paidCents = Number(plan && plan.paidCents || 0);
        record.remainingCents = Number(plan && plan.remainingCents || 0);
        record.requestedPaymentCount = Number(plan && plan.requestedPaymentCount || 0);
        record.status = String(plan && plan.status || 'ACTIVE');
        record.employeeId = String(plan && plan.employeeId || '');
        record.stationId = String(plan && plan.stationId || getStationNumber() || 1);
        record.syncStatus = String(plan && plan.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'));
        record.idempotencyKey = idempotencyKey;
        record.updatedAt = String(plan && plan.updatedAt || nowIso());

        store.put(record);
        await txDone(tx);
        return record;
      },

      getSplitPaymentPlanByOrderId: async function(orderId: string) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_SPLIT_PAYMENT_PLAN, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.updatedAt || b && b.createdAt || 0).getTime() - new Date(a && a.updatedAt || a && a.createdAt || 0).getTime();
        });
        return rows[0] || null;
      },

      saveSplitPaymentPortion: async function(portion: any) {
        await ensureHistoryPersistenceReady();
        var id = String(portion && portion.id || '').trim();
        if (!id) throw new Error('saveSplitPaymentPortion requires id');
        var planId = String(portion && portion.planId || '').trim();
        var orderId = String(portion && portion.orderId || '').trim();
        if (!planId) throw new Error('saveSplitPaymentPortion requires planId');
        if (!orderId) throw new Error('saveSplitPaymentPortion requires orderId');

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_SPLIT_PAYMENT_PORTION, 'readwrite');
        var store = tx.objectStore(STORE_SPLIT_PAYMENT_PORTION);
        var idempotencyKey = String(portion && portion.idempotencyKey || deterministicKey(['split-portion', id, planId, orderId]));
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));
        var record = existing || {
          id: id,
          createdAt: String(portion && portion.createdAt || nowIso())
        };

        record.planId = planId;
        record.orderId = orderId;
        record.sequence = Number(portion && portion.sequence || 0);
        record.paymentMethod = String(portion && portion.paymentMethod || 'other');
        record.plannedAmountCents = Number(portion && portion.plannedAmountCents || 0);
        record.approvedAmountCents = Number(portion && portion.approvedAmountCents || 0);
        record.tipAmountCents = Number(portion && portion.tipAmountCents || 0);
        record.status = String(portion && portion.status || 'PENDING');
        record.paymentId = String(portion && portion.paymentId || '');
        record.provider = String(portion && portion.provider || '');
        record.providerTransactionReference = String(portion && portion.providerTransactionReference || '');
        record.cardBrand = String(portion && portion.cardBrand || '');
        record.cardLast4 = String(portion && portion.cardLast4 || '').replace(/\D/g, '').slice(-4);
        record.failureCode = String(portion && portion.failureCode || '');
        record.failureMessage = String(portion && portion.failureMessage || '');
        record.syncStatus = String(portion && portion.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'));
        record.idempotencyKey = idempotencyKey;
        record.updatedAt = String(portion && portion.updatedAt || nowIso());

        store.put(record);
        await txDone(tx);
        return record;
      },

      listSplitPaymentPortionsByPlanId: async function(planId: string) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_SPLIT_PAYMENT_PORTION, 'by_planId', planId);
        rows.sort(function(a: any, b: any) {
          return Number(a && a.sequence || 0) - Number(b && b.sequence || 0);
        });
        return rows;
      },

      loadSplitPaymentWorkspaceByOrderId: async function(orderId: string) {
        var plan = await this.getSplitPaymentPlanByOrderId(orderId);
        if (!plan) return null;
        var portions = await this.listSplitPaymentPortionsByPlanId(plan.id);
        return {
          plan: plan,
          portions: portions
        };
      },

      persistSplitPaymentWorkspace: async function(workspace: any) {
        if (!workspace) return null;
        var planRecord = await this.saveSplitPaymentPlan({
          id: workspace.planId,
          orderId: workspace.orderId,
          historyId: workspace.historyId,
          mode: workspace.mode,
          originalBalanceCents: workspace.originalBalanceCents,
          paidCents: workspace.paidCents,
          remainingCents: workspace.remainingCents,
          requestedPaymentCount: workspace.requestedPaymentCount,
          status: workspace.status,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          idempotencyKey: workspace.idempotencyKey,
          syncStatus: workspace.syncStatus
        });

        var portions = Array.isArray(workspace.portions) ? workspace.portions : [];
        for (var idx = 0; idx < portions.length; idx += 1) {
          var portion = portions[idx] || {};
          await this.saveSplitPaymentPortion({
            id: portion.id,
            planId: workspace.planId,
            orderId: workspace.orderId,
            sequence: portion.sequence,
            paymentMethod: portion.paymentMethod,
            plannedAmountCents: portion.plannedAmountCents,
            approvedAmountCents: portion.approvedAmountCents,
            tipAmountCents: portion.tipAmountCents,
            status: portion.status,
            paymentId: portion.paymentId,
            provider: portion.provider,
            providerTransactionReference: portion.providerTransactionReference,
            cardBrand: portion.cardBrand,
            cardLast4: portion.cardLast4,
            failureCode: portion.failureCode,
            failureMessage: portion.failureMessage,
            createdAt: portion.createdAt,
            updatedAt: portion.updatedAt,
            idempotencyKey: portion.idempotencyKey,
            syncStatus: portion.syncStatus
          });
        }

        return {
          plan: planRecord,
          portions: portions
        };
      },

      listHistoricalOrdersCompat: async function() {
        var rows = await this.listOrderHistory();
        return rows.map(function(row: any) {
          return {
            id: row.orderId,
            orderNumber: row.displayOrderNumber,
            number: row.displayOrderNumber,
            orderType: row.orderType,
            status: row.orderStatus,
            paymentStatus: row.paymentStatus,
            paid: row.paymentStatus === 'paid' || row.amountPaidCents >= row.totalCents,
            orderSource: row.sourceSnapshot && row.sourceSnapshot.orderSource || '',
            timingType: row.sourceSnapshot && row.sourceSnapshot.timingType || 'asap',
            asapTime: row.sourceSnapshot && row.sourceSnapshot.asapTime || null,
            futureDateTime: row.sourceSnapshot && row.sourceSnapshot.futureDateTime || null,
            orderSpecialInstructions: row.sourceSnapshot && row.sourceSnapshot.orderSpecialInstructions || '',
            customerSnapshot: row.sourceSnapshot && row.sourceSnapshot.customer || {
              name: row.storedDisplayName,
              phone: row.storedPhone,
              address1: row.storedAddressSummary
            },
            customerInfo: row.sourceSnapshot && row.sourceSnapshot.customer || {
              name: row.storedDisplayName,
              phone: row.storedPhone,
              address1: row.storedAddressSummary
            },
            customer: row.sourceSnapshot && row.sourceSnapshot.customer || {
              name: row.storedDisplayName,
              phone: row.storedPhone,
              address1: row.storedAddressSummary
            },
            customerName: row.storedDisplayName,
            subtotal: fromIntCents(row.subtotalCents),
            tax: fromIntCents(row.taxCents),
            total: fromIntCents(row.totalCents),
            createdTimestamp: row.createdAt,
            updatedTimestamp: row.updatedAt,
            paymentMethodSummary: row.sourceSnapshot && row.sourceSnapshot.paymentMethodSummary || '',
            businessDate: row.businessDate,
            stationNumber: row.stationId,
            syncStatus: row.syncStatus,
            syncAttempts: row.syncAttempts,
            lastSyncError: row.lastSyncError,
            lastSyncedAt: row.lastSyncedAt,
            historyId: row.historyId,
            internalOrderSequence: row.internalOrderSequence
          };
        });
      },

      getHistoricalOrderByIdCompat: async function(orderId: string) {
        var row = await this.getOrderHistoryByOrderId(orderId);
        if (!row) return null;
        var items = await listStoreAll(STORE_ORDER_HISTORY_ITEMS, 'by_historyId', row.historyId);
        var events = await this.listOrderEvents(orderId);
        var payments = await this.listPaymentHistory(orderId);

        return {
          id: row.orderId,
          orderNumber: row.displayOrderNumber,
          number: row.displayOrderNumber,
          orderType: row.orderType,
          status: row.orderStatus,
          paymentStatus: row.paymentStatus,
          paid: row.paymentStatus === 'paid' || row.amountPaidCents >= row.totalCents,
          orderSource: row.sourceSnapshot && row.sourceSnapshot.orderSource || '',
          timingType: row.sourceSnapshot && row.sourceSnapshot.timingType || 'asap',
          asapTime: row.sourceSnapshot && row.sourceSnapshot.asapTime || null,
          futureDateTime: row.sourceSnapshot && row.sourceSnapshot.futureDateTime || null,
          orderSpecialInstructions: row.sourceSnapshot && row.sourceSnapshot.orderSpecialInstructions || '',
          customerSnapshot: row.sourceSnapshot && row.sourceSnapshot.customer || {
            name: row.storedDisplayName,
            phone: row.storedPhone,
            address1: row.storedAddressSummary
          },
          customerInfo: row.sourceSnapshot && row.sourceSnapshot.customer || {
            name: row.storedDisplayName,
            phone: row.storedPhone,
            address1: row.storedAddressSummary
          },
          customer: row.sourceSnapshot && row.sourceSnapshot.customer || {
            name: row.storedDisplayName,
            phone: row.storedPhone,
            address1: row.storedAddressSummary
          },
          customerName: row.storedDisplayName,
          subtotal: fromIntCents(row.subtotalCents),
          tax: fromIntCents(row.taxCents),
          total: fromIntCents(row.totalCents),
          createdTimestamp: row.createdAt,
          updatedTimestamp: row.updatedAt,
          paymentMethodSummary: row.sourceSnapshot && row.sourceSnapshot.paymentMethodSummary || '',
          paymentLines: payments.map(function(payment: any) {
            return {
              paymentType: payment.paymentType,
              amount: fromIntCents(payment.amountCents),
              baseAmount: fromIntCents(payment.baseAmountCents),
              tipAmount: fromIntCents(payment.tipAmountCents),
              cardBrand: payment.cardBrand,
              lastFour: payment.cardLastFour,
              provider: payment.provider,
              providerTransactionReference: payment.providerTransactionReference,
              paymentId: payment.paymentId,
              paidAt: payment.paidAt
            };
          }),
          lines: items.map(function(item: any) {
            return {
              lineId: item.historyItemId,
              itemId: item.sourceItemId,
              name: item.itemName,
              qty: item.quantity,
              price: fromIntCents(item.unitPriceCents),
              size: item.sizeName,
              specialInstruction: item.instructions,
              mods: item.modifierSummary
                ? item.modifierSummary.split(',').map(function(modName: string) {
                    return { optionName: String(modName || '').trim() };
                  }).filter(function(mod: any) { return mod.optionName; })
                : []
            };
          }),
          auditEvents: events.map(function(event: any) {
            return {
              event: toReadableEventLabel(event.eventType),
              eventType: event.eventType,
              timestamp: event.eventTimestamp,
              employeeShortName: event.employeeShortName || event.employeeId || 'System'
            };
          }),
          businessDate: row.businessDate,
          stationNumber: row.stationId,
          syncStatus: row.syncStatus,
          syncAttempts: row.syncAttempts,
          lastSyncError: row.lastSyncError,
          lastSyncedAt: row.lastSyncedAt,
          historyId: row.historyId,
          internalOrderSequence: row.internalOrderSequence
        };
      },

      __debugHistoryStores: function() {
        return {
          dbName: dbName,
          dbVersion: dbVersion,
          stores: [STORE_KV, STORE_META, STORE_ORDER_HISTORY, STORE_ORDER_HISTORY_ITEMS, STORE_ORDER_EVENTS, STORE_PAYMENT_HISTORY, STORE_SPLIT_PAYMENT_PLAN, STORE_SPLIT_PAYMENT_PORTION],
          legacyOrdersKey: legacyOrdersKey,
          migrationMetaKey: LEGACY_IMPORT_META_KEY
        };
      },

      __debugReimportLegacy: function() {
        historyBootPromise = null;
        return ensureHistoryPersistenceReady(true);
      },

      getLegacyIndex: function() {
        return {
          catsById: Object.fromEntries(Array.from<any>(this.indexes.categoriesById.entries())),
          itemMods: this.indexes.itemMods,
          groupsById: this.indexes.groupsById,
          optsByGroup: this.indexes.optsByGroup,
          indexMs: this.indexes.indexMs
        };
      }
    };
  }

  global.LilposRuntime = {
    buildLilposRuntimePackageFromLegacy: buildLilposRuntimePackageFromLegacy,
    createLilposDataService: createLilposDataService
  };
})(window);
