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
