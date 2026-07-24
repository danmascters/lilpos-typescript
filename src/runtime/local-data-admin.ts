(function(global: any) {
  'use strict';

  var SECRET_FIELD_PATTERN = /password|secret|token|apiKey|authorization|auth|credential/i;
  var LEGACY_ORDERS_STORAGE_KEY = 'lilpos_persisted_orders';
  var ORDER_DATA_STORE_NAMES = ['order_history', 'payment_history', 'order_events'];

  var SECTION_GROUPS = [
    {
      id: 'menu',
      label: 'Menu Data',
      sections: [
        { id: 'menu.categories', label: 'Categories', virtual: 'runtime', path: ['categories'] },
        { id: 'menu.items', label: 'Items', virtual: 'runtime', path: ['itemTiles'] },
        { id: 'menu.modifierGroups', label: 'Modifier Groups', virtual: 'runtime', path: ['modifierFlows', 'groups'] },
        { id: 'menu.modifierOptions', label: 'Modifier Options', virtual: 'runtime', path: ['modifierFlows', 'options'] },
        { id: 'menu.sizeSchemas', label: 'Size Schemas', virtual: 'runtime', path: ['pricingRules', 'sizes'] },
        { id: 'menu.pricingRules', label: 'Pricing Rules', virtual: 'runtime', path: ['pricingRules'] }
      ]
    },
    {
      id: 'station',
      label: 'Station Data',
      sections: [
        { id: 'station.settings', label: 'Station Settings', virtual: 'runtimeObject', path: ['settings'] },
        { id: 'station.keyboardSettings', label: 'Keyboard Settings', storeName: 'kv', keyHint: 'lilpos_manager_settings_v1' },
        { id: 'station.printerSettings', label: 'Printer Settings', virtual: 'runtimeObject', path: ['settings', 'printerSettings'] },
        { id: 'station.taxSettings', label: 'Tax Settings', virtual: 'runtimeObject', path: ['pricingRules', 'taxRules'] },
        { id: 'station.businessDaySettings', label: 'Business Day Settings', virtual: 'runtimeObject', path: ['settings', 'register'] }
      ]
    },
    {
      id: 'customers',
      label: 'Customer Data',
      sections: [
        { id: 'customers.customers', label: 'Customers', virtual: 'runtime', path: ['customers'] },
        { id: 'customers.lookupHistory', label: 'Customer Lookup History', storeName: 'kv', keyHint: 'customer' },
        { id: 'customers.callerIdMatches', label: 'Caller ID Matches', storeName: 'kv', keyHint: 'caller' }
      ]
    },
    {
      id: 'orders',
      label: 'Order Data',
      sections: [
        { id: 'orders.open', label: 'Open Orders', storeName: 'order_history', filter: function(row: any) { return row && row.orderStatus === 'open'; } },
        { id: 'orders.completed', label: 'Same-Day Completed Orders', storeName: 'order_history', filter: function(row: any) { return row && row.orderStatus === 'completed'; } },
        { id: 'orders.payments', label: 'Payment Records', storeName: 'payment_history' },
        { id: 'orders.auditEvents', label: 'Order Audit Events', storeName: 'order_events' }
      ]
    },
    {
      id: 'syncHealth',
      label: 'Sync / Health',
      sections: [
        { id: 'sync.pending', label: 'Pending Sync Records', storeName: 'order_history', filter: function(row: any) { return row && row.syncStatus === 'pending'; } },
        { id: 'sync.failed', label: 'Failed Sync Records', storeName: 'order_history', filter: function(row: any) { return row && row.syncStatus === 'failed'; } },
        { id: 'sync.lastStatus', label: 'Last Sync Status', storeName: 'runtime_meta', keyHint: 'sync' },
        { id: 'sync.indexedDbStatus', label: 'IndexedDB Status', virtual: 'health' },
        { id: 'sync.storagePersistence', label: 'Storage Persistence Status', virtual: 'health' },
        { id: 'sync.serviceWorkerStatus', label: 'Service Worker Status', virtual: 'health' }
      ]
    }
  ];

  function createLocalDataAdmin(deps?: any) {
    var safeDeps = deps || {};
    var dataService = safeDeps.dataService || global.lilposDataService || null;
    var debug = dataService && typeof dataService.__debugHistoryStores === 'function'
      ? dataService.__debugHistoryStores()
      : {};
    var dbName = safeDeps.dbName || debug.dbName || 'BringdatSmartRegisterMockNoNpm';
    var dbVersion = Number(safeDeps.dbVersion || debug.dbVersion || 3);

    function openDb(): Promise<IDBDatabase> {
      return new Promise(function(resolve, reject) {
        if (!global.indexedDB) {
          reject(new Error('IndexedDB is not available'));
          return;
        }
        var req = global.indexedDB.open(dbName, dbVersion);
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

    async function listStore(storeName: string): Promise<any[]> {
      var db = await openDb();
      try {
        if (!db.objectStoreNames.contains(storeName)) return [];
        var tx = db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        var rows = [] as any[];
        if (storeName === 'kv') {
          var keys = await requestResult(store.getAllKeys());
          var values = await requestResult(store.getAll());
          rows = values.map(function(value: any, index: number) {
            return { key: String(keys[index]), value: value };
          });
        } else {
          rows = await requestResult(store.getAll());
        }
        await txDone(tx);
        return rows;
      } finally {
        db.close();
      }
    }

    async function storeNames(): Promise<string[]> {
      var db = await openDb();
      try {
        return Array.from(db.objectStoreNames as any);
      } finally {
        db.close();
      }
    }

    function runtimePackage(): any {
      return dataService && dataService.runtimePackage ? dataService.runtimePackage : null;
    }

    function valueAtPath(source: any, path: string[]): any {
      return path.reduce(function(current, key) {
        return current && current[key] != null ? current[key] : null;
      }, source);
    }

    function isPlainObject(value: any): boolean {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function redact(value: any): any {
      if (Array.isArray(value)) return value.map(redact);
      if (!isPlainObject(value)) return value;
      return Object.keys(value).reduce(function(acc: any, key: string) {
        acc[key] = SECRET_FIELD_PATTERN.test(key) ? '[REDACTED]' : redact(value[key]);
        return acc;
      }, {});
    }

    function recordId(value: any, fallback: string): string {
      return String(
        value && (value.id || value.key || value.historyId || value.orderId || value.eventId || value.paymentHistoryId || value.historyItemId || value.name)
        || fallback
      );
    }

    function recordLabel(value: any): string {
      return String(value && (value.name || value.label || value.title || value.displayName || value.storedDisplayName || value.itemName || value.orderType || value.eventType || value.paymentType) || '');
    }

    function recordType(value: any): string {
      return String(value && (value.type || value.kind || value.orderType || value.eventType || value.paymentType || value.syncStatus) || '');
    }

    function recordStatus(value: any): string {
      return String(value && (value.status || value.orderStatus || value.paymentStatus || value.syncStatus) || '');
    }

    function recordDate(value: any, kind: 'created' | 'updated'): string {
      var candidates = kind === 'created'
        ? ['createdAt', 'createdTimestamp', 'openedAt', 'sentAt', 'paidAt', 'eventTimestamp']
        : ['updatedAt', 'updatedTimestamp', 'completedAt', 'closedAt', 'lastSyncedAt'];
      for (var idx = 0; idx < candidates.length; idx += 1) {
        var raw = value && value[candidates[idx]];
        if (raw) return String(raw);
      }
      return '';
    }

    function summarize(value: any): string {
      var parts = [
        recordLabel(value),
        recordType(value),
        recordStatus(value),
        value && value.totalCents != null ? '$' + (Number(value.totalCents || 0) / 100).toFixed(2) : '',
        value && value.key ? 'Key: ' + value.key : ''
      ].filter(Boolean);
      if (parts.length) return parts.join(' | ');
      var json = JSON.stringify(value || {});
      return json.length > 120 ? json.slice(0, 117) + '...' : json;
    }

    function makeRecord(section: any, value: any, index: number): LocalDataAdminRecord {
      var raw = value && value.key && value.value !== undefined ? Object.assign({ key: value.key }, value.value) : value;
      return {
        id: recordId(raw, section.id + ':' + index),
        storeName: section.storeName || section.id,
        sectionId: section.id,
        label: recordLabel(raw),
        type: recordType(raw),
        status: recordStatus(raw),
        createdAt: recordDate(raw, 'created'),
        updatedAt: recordDate(raw, 'updated'),
        summary: summarize(raw),
        value: redact(raw)
      };
    }

    function allConfiguredSections(): any[] {
      var result = [] as any[];
      SECTION_GROUPS.forEach(function(group: any) {
        group.sections.forEach(function(section: any) {
          result.push(Object.assign({}, section, { groupId: group.id, groupLabel: group.label }));
        });
      });
      return result;
    }

    async function rawValuesForSection(section: any): Promise<any[]> {
      if (!section) return [];
      if (section.virtual === 'runtime') {
        var value = valueAtPath(runtimePackage(), section.path || []);
        return Array.isArray(value) ? value : [];
      }
      if (section.virtual === 'runtimeObject') {
        var objectValue = valueAtPath(runtimePackage(), section.path || []);
        if (Array.isArray(objectValue)) return objectValue;
        return objectValue ? [objectValue] : [];
      }
      if (section.virtual === 'health') {
        return [await getHealth()];
      }
      if (!section.storeName) return [];
      var rows = await listStore(section.storeName);
      if (section.keyHint) {
        var hint = String(section.keyHint).toLowerCase();
        rows = rows.filter(function(row) {
          return String(row && row.key || '').toLowerCase().includes(hint)
            || JSON.stringify(row || {}).toLowerCase().includes(hint);
        });
      }
      if (typeof section.filter === 'function') {
        rows = rows.filter(section.filter);
      }
      return rows;
    }

    async function listSections(): Promise<LocalDataAdminSection[]> {
      var existingStores = [] as string[];
      try {
        existingStores = await storeNames();
      } catch (_err) {
        existingStores = [];
      }
      var configured = allConfiguredSections();
      var sections = [] as LocalDataAdminSection[];
      for (var idx = 0; idx < configured.length; idx += 1) {
        var section = configured[idx];
        var storeAvailable = !section.storeName || existingStores.indexOf(section.storeName) >= 0;
        var count = 0;
        if (storeAvailable) {
          try {
            count = (await rawValuesForSection(section)).length;
          } catch (_err) {
            count = 0;
          }
        }
        sections.push({
          id: section.id,
          groupId: section.groupId,
          groupLabel: section.groupLabel,
          label: section.label,
          storeName: section.storeName,
          virtual: !!section.virtual,
          available: storeAvailable,
          count: count,
          emptyReason: storeAvailable ? '' : 'Store is not available on this station.',
          clearAllowed: false
        });
      }
      existingStores.forEach(function(storeName) {
        var known = configured.some(function(section) { return section.storeName === storeName; });
        if (!known) {
          sections.push({
            id: 'other.' + storeName,
            groupId: 'other',
            groupLabel: 'Other Local Data',
            label: storeName,
            storeName: storeName,
            available: true,
            count: 0,
            clearAllowed: false
          });
        }
      });
      return sections;
    }

    async function findSection(sectionId: string): Promise<any> {
      var configured = allConfiguredSections();
      var found = configured.find(function(section) { return section.id === sectionId; });
      if (found) return found;
      if (String(sectionId || '').startsWith('other.')) {
        return { id: sectionId, groupId: 'other', groupLabel: 'Other Local Data', label: sectionId.slice(6), storeName: sectionId.slice(6) };
      }
      return null;
    }

    async function listRecords(sectionId: string): Promise<LocalDataAdminRecord[]> {
      var section = await findSection(sectionId);
      var values = await rawValuesForSection(section);
      return values.map(function(value, index) { return makeRecord(section, value, index); });
    }

    async function searchRecords(sectionId: string, query: string): Promise<LocalDataAdminRecord[]> {
      var records = await listRecords(sectionId);
      var q = String(query || '').trim().toLowerCase();
      if (!q) return records;
      return records.filter(function(record) {
        return [
          record.id,
          record.label,
          record.type,
          record.status,
          record.summary,
          JSON.stringify(record.value || {})
        ].join(' ').toLowerCase().includes(q);
      });
    }

    async function getRecord(sectionId: string, id: string): Promise<LocalDataAdminRecord | null> {
      var records = await listRecords(sectionId);
      return records.find(function(record) { return record.id === id; }) || null;
    }

    function exportMetadata(extra?: any): any {
      return Object.assign({
        exportedAt: new Date().toISOString(),
        app: 'LilPOS',
        databaseName: dbName,
        databaseVersion: dbVersion,
        stationId: safeDeps.stationId || 'local-station'
      }, extra || {});
    }

    async function exportStore(sectionId: string): Promise<LocalDataAdminExport> {
      var section = await findSection(sectionId);
      var records = await listRecords(sectionId);
      return {
        metadata: exportMetadata({ sectionsIncluded: [sectionId], storesIncluded: section && section.storeName ? [section.storeName] : [] }),
        sections: [{
          id: sectionId,
          label: section && section.label || sectionId,
          records: records
        }]
      };
    }

    async function exportAll(): Promise<LocalDataAdminExport> {
      var sections = await listSections();
      var exportedSections = [] as any[];
      for (var idx = 0; idx < sections.length; idx += 1) {
        var section = sections[idx];
        if (!section.available) continue;
        exportedSections.push({
          id: section.id,
          label: section.label,
          records: await listRecords(section.id)
        });
      }
      return {
        metadata: exportMetadata({
          sectionsIncluded: exportedSections.map(function(section) { return section.id; }),
          storesIncluded: Array.from(new Set(sections.map(function(section) { return section.storeName; }).filter(Boolean)))
        }),
        sections: exportedSections
      };
    }

    async function getHealth(): Promise<LocalDataAdminHealth> {
      var names = [] as string[];
      var indexedDbAvailable = !!global.indexedDB;
      try {
        names = indexedDbAvailable ? await storeNames() : [];
      } catch (_err) {
        names = [];
      }
      var storageEstimate = null;
      var storagePersisted: boolean | null = null;
      var persistentStorageSupported = !!(global.navigator && global.navigator.storage);
      try {
        if (global.navigator && global.navigator.storage && global.navigator.storage.estimate) {
          storageEstimate = await global.navigator.storage.estimate();
        }
      } catch (_err) {
        storageEstimate = null;
      }
      try {
        if (global.navigator && global.navigator.storage && global.navigator.storage.persisted) {
          storagePersisted = await global.navigator.storage.persisted();
        }
      } catch (_err) {
        storagePersisted = null;
      }
      var pending = null as number | null;
      var failed = null as number | null;
      try {
        if (dataService && dataService.listPendingSyncEnvelopes) {
          var envelopes = await dataService.listPendingSyncEnvelopes(1000);
          pending = envelopes.filter(function(row: any) { return row && row.payload && row.payload.syncStatus === 'pending'; }).length;
          failed = envelopes.filter(function(row: any) { return row && row.payload && row.payload.syncStatus === 'failed'; }).length;
        }
      } catch (_err) {
        pending = null;
        failed = null;
      }
      return {
        indexedDbAvailable: indexedDbAvailable,
        databaseName: dbName,
        databaseVersion: dbVersion,
        storeNames: names,
        storageEstimate: storageEstimate,
        storagePersisted: storagePersisted,
        persistentStorageSupported: persistentStorageSupported,
        serviceWorker: {
          supported: !!(global.navigator && global.navigator.serviceWorker),
          controlled: !!(global.navigator && global.navigator.serviceWorker && global.navigator.serviceWorker.controller)
        },
        pendingSyncCount: pending,
        failedSyncCount: failed,
        lastMenuSyncAt: runtimePackage() && runtimePackage().generatedAt || ''
      };
    }

    async function requestPersistentStorage(): Promise<any> {
      if (!global.navigator || !global.navigator.storage || !global.navigator.storage.persist) {
        return { supported: false, granted: false };
      }
      var granted = await global.navigator.storage.persist();
      return { supported: true, granted: !!granted };
    }

    async function clearSafeStore(sectionId: string): Promise<any> {
      return {
        cleared: false,
        reason: 'No safe clearable local data stores are enabled in this version.'
      };
    }

    async function clearOrdersData(): Promise<any> {
      if (!global.indexedDB) {
        return {
          cleared: false,
          reason: 'IndexedDB is not available on this station.'
        };
      }

      var db = await openDb();
      try {
        var availableStores = ORDER_DATA_STORE_NAMES.filter(function(storeName) {
          return db.objectStoreNames.contains(storeName);
        });
        var missingStores = ORDER_DATA_STORE_NAMES.filter(function(storeName) {
          return availableStores.indexOf(storeName) < 0;
        });

        if (availableStores.length) {
          var tx = db.transaction(availableStores, 'readwrite');
          availableStores.forEach(function(storeName) {
            tx.objectStore(storeName).clear();
          });
          await txDone(tx);
        }

        try {
          if (global.localStorage) {
            global.localStorage.removeItem(LEGACY_ORDERS_STORAGE_KEY);
          }
        } catch (_err) {
          // Ignore localStorage access errors in restricted contexts.
        }

        return {
          cleared: true,
          clearedStores: availableStores,
          missingStores: missingStores
        };
      } finally {
        db.close();
      }
    }

    return {
      getHealth: getHealth,
      listStores: storeNames,
      listSections: listSections,
      listRecords: listRecords,
      searchRecords: searchRecords,
      getRecord: getRecord,
      exportStore: exportStore,
      exportAll: exportAll,
      requestPersistentStorage: requestPersistentStorage,
      clearSafeStore: clearSafeStore,
      clearOrdersData: clearOrdersData,
      redactForExport: redact
    };
  }

  global.LilposLocalDataAdmin = {
    createLocalDataAdmin: createLocalDataAdmin
  };
})(window);
