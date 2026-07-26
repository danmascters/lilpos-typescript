/// <reference path="./delivery-manager.types.ts" />

(function(global: any) {
  'use strict';
  function create(): DeliveryManagerState {
    return {
      loading: false,
      error: '',
      message: '',
      activeTab: 'settings',
      settings: global.LilposDeliveryManagerSettings.defaults(),
      drivers: [], shifts: [], orders: [], settlements: [],
      settlementPreviewByDriverId: {},
      editingDriverId: null
    };
  }
  global.LilposDeliveryManagerState = { create };
})(window);
