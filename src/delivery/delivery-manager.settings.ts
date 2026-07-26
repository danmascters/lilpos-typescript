/// <reference path="./delivery-manager.types.ts" />

(function(global: any) {
  'use strict';

  function defaults(now = new Date().toISOString()): DeliveryManagerSettings {
    return {
      id: 'delivery_manager_settings',
      inHouseDeliveryEnabled: false,
      deliveryQueueMode: 'main_orders',
      driverBanksEnabled: false,
      driverBankReconciliationMode: 'end_of_shift',
      createdAt: now,
      updatedAt: now,
      version: 1,
      syncStatus: 'pending',
      lastSyncAttemptAt: null,
      syncError: null
    };
  }

  function normalize(input: any): DeliveryManagerSettings {
    const base = defaults(String(input?.createdAt || new Date().toISOString()));
    return {
      ...base,
      ...(input || {}),
      id: 'delivery_manager_settings',
      inHouseDeliveryEnabled: input?.inHouseDeliveryEnabled === true,
      deliveryQueueMode: input?.deliveryQueueMode === 'dedicated_delivery_queue' ? 'dedicated_delivery_queue' : 'main_orders',
      driverBanksEnabled: input?.driverBanksEnabled === true,
      driverBankReconciliationMode: input?.driverBankReconciliationMode === 'per_order' ? 'per_order' : 'end_of_shift'
    };
  }

  global.LilposDeliveryManagerSettings = { defaults, normalize };
})(window);
