/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  function toSet(values: any): Set<string> {
    if (!Array.isArray(values)) return new Set();
    return new Set(values.map(function(value) { return String(value || '').trim(); }).filter(Boolean));
  }

  function lowerSet(values: any): Set<string> {
    if (!Array.isArray(values)) return new Set();
    return new Set(values.map(function(value) { return String(value || '').trim().toLowerCase(); }).filter(Boolean));
  }

  function normalizeOrderType(order: any): string {
    return String(order && order.orderType || '').trim().toLowerCase();
  }

  function normalizeOrderSource(order: any): string {
    return String(order && (order.orderSource || order.source || '')).trim().toLowerCase();
  }

  function linesFromOrder(order: any): any[] {
    var lines = Array.isArray(order && order.lines) ? order.lines : [];
    return lines.map(function(line: any, idx: number) {
      return {
        lineId: String(line && (line.lineId || line.id) || ('line_' + idx)),
        itemId: String(line && (line.itemId || line.sourceItemId || '') || ''),
        categoryId: String(line && (line.categoryId || '') || ''),
        printerRouteId: String(line && (line.printerRouteId || line.routeId || '') || '').toLowerCase(),
        quantity: Number(line && line.qty || 1),
        raw: line
      };
    });
  }

  function isPreparationTicketType(ticketType: string): boolean {
    var value = String(ticketType || '').toLowerCase();
    return value === 'kitchen_ticket'
      || value === 'pizza_ticket'
      || value === 'bar_ticket'
      || value === 'expo_ticket'
      || value === 'delivery_ticket'
      || value === 'label'
      || value === 'custom';
  }

  function matchOrderFilter(rule: PrinterRoutingRule, orderType: string, orderSource: string): boolean {
    var allowedTypes = lowerSet(rule && rule.orderTypes);
    var allowedSources = lowerSet(rule && rule.orderSources);
    var typeMatch = !allowedTypes.size || allowedTypes.has('all') || allowedTypes.has(orderType);
    var sourceMatch = !allowedSources.size || allowedSources.has('all') || allowedSources.has(orderSource);
    return typeMatch && sourceMatch;
  }

  function filterLinesByRule(rule: PrinterRoutingRule, lines: any[], unmatchedLineIds: Set<string>): any[] {
    var mode = String(rule && rule.itemMatchMode || 'all');
    var includeRouteIds = lowerSet(rule && rule.printerRouteIds);
    var includeCategoryIds = toSet(rule && rule.categoryIds);
    var includeItemIds = toSet(rule && rule.itemIds);
    var excludeCategoryIds = toSet(rule && rule.excludedCategoryIds);
    var excludeItemIds = toSet(rule && rule.excludedItemIds);

    var candidates = lines.filter(function(line: any) {
      if (excludeCategoryIds.has(String(line.categoryId || ''))) return false;
      if (excludeItemIds.has(String(line.itemId || ''))) return false;
      if (mode === 'all') return true;
      if (mode === 'printer_routes') return includeRouteIds.has(String(line.printerRouteId || '').toLowerCase());
      if (mode === 'categories') return includeCategoryIds.has(String(line.categoryId || ''));
      if (mode === 'items') return includeItemIds.has(String(line.itemId || ''));
      if (mode === 'unmatched') return unmatchedLineIds.has(String(line.lineId || ''));
      return false;
    });

    return candidates;
  }

  function destinationKey(destination: EvaluatedPrintDestination): string {
    return [
      destination.printerId,
      destination.ticketType,
      destination.ticketContentMode,
      destination.copies,
      destination.priority,
      destination.required ? 'required' : 'optional',
      destination.isFallbackRule ? 'fallback' : 'normal',
      destination.includeCustomerName ? 'name' : 'noname',
      destination.includeCustomerPhone ? 'phone' : 'nophone',
      destination.includeDeliveryAddress ? 'addr' : 'noaddr',
      destination.includeCustomerNotes ? 'notes' : 'nonotes',
      (destination.matchedLineIds || []).slice().sort().join(',')
    ].join('|');
  }

  function mergeDestinations(rows: EvaluatedPrintDestination[]): EvaluatedPrintDestination[] {
    var byKey: any = {};
    var ordered: EvaluatedPrintDestination[] = [];
    rows.forEach(function(row) {
      var key = destinationKey(row);
      if (!byKey[key]) {
        byKey[key] = row;
        ordered.push(row);
        return;
      }
      // Preserve deterministic ordering and track all contributing rules for diagnostics.
      byKey[key].ruleId = String(byKey[key].ruleId || row.ruleId);
    });
    return ordered;
  }

  function evaluatePrintRoutes(input: any): EvaluatedPrintDestination[] {
    var payload = input || {};
    var trigger = String(payload.trigger || '').toLowerCase();
    var order = payload.order || {};
    var enabledPrinters: PosPrinterConfig[] = (Array.isArray(payload.printers) ? payload.printers : [])
      .filter(function(printer: any) { return printer && printer.enabled !== false; });
    var printersById: any = {};
    enabledPrinters.forEach(function(printer: any) { printersById[String(printer.id)] = printer; });

    var rules: PrinterRoutingRule[] = (Array.isArray(payload.rules) ? payload.rules : [])
      .filter(function(rule: any) { return rule && rule.enabled !== false; })
      .sort(function(a: any, b: any) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); });

    var orderType = normalizeOrderType(order);
    var orderSource = normalizeOrderSource(order);
    var lines = linesFromOrder(order);
    var unmatchedLineIds = new Set(lines.map(function(line: any) { return String(line.lineId || ''); }));
    var destinations: EvaluatedPrintDestination[] = [];
    var fallbackRules: PrinterRoutingRule[] = [];

    rules.forEach(function(rule) {
      var ruleTrigger = String(rule.trigger || '').toLowerCase();
      if (ruleTrigger && trigger && ruleTrigger !== trigger) return;
      if (!printersById[String(rule.destinationPrinterId || '')]) return;
      if (!matchOrderFilter(rule, orderType, orderSource)) return;
      if (rule.isFallbackRule || String(rule.itemMatchMode || '') === 'unmatched') {
        fallbackRules.push(rule);
        return;
      }

      var matchedLines = filterLinesByRule(rule, lines, unmatchedLineIds);
      var contentMode = String(rule.ticketContentMode || 'full');
      var isFullTicket = contentMode === 'full';
      if (!isFullTicket && !matchedLines.length) return;

      var matchedLineIds = isFullTicket
        ? lines.map(function(line: any) { return String(line.lineId || ''); })
        : matchedLines.map(function(line: any) { return String(line.lineId || ''); });

      destinations.push({
        ruleId: String(rule.id || ''),
        printerId: String(rule.destinationPrinterId || ''),
        ticketType: String(rule.ticketType || 'customer_receipt') as any,
        matchedLineIds: matchedLineIds,
        ticketContentMode: contentMode as any,
        copies: Math.max(1, Number(rule.copies || 1)),
        priority: (String(rule.priority || 'normal') as LilPrintPriority),
        required: !rule.isFallbackRule,
        isFallbackRule: !!rule.isFallbackRule,
        includeCustomerName: rule.includeCustomerName !== false,
        includeCustomerPhone: rule.includeCustomerPhone === true,
        includeDeliveryAddress: rule.includeDeliveryAddress === true,
        includeCustomerNotes: rule.includeCustomerNotes === true
      });

      if (isPreparationTicketType(String(rule.ticketType || '')) && contentMode !== 'full') {
        matchedLines.forEach(function(line: any) {
          unmatchedLineIds.delete(String(line.lineId || ''));
        });
      }
    });

    fallbackRules.forEach(function(rule) {
      if (!printersById[String(rule.destinationPrinterId || '')]) return;
      var matchedLines = filterLinesByRule(rule, lines, unmatchedLineIds);
      var contentMode = String(rule.ticketContentMode || 'unmatched_only');
      if (!matchedLines.length && contentMode !== 'full') return;
      destinations.push({
        ruleId: String(rule.id || ''),
        printerId: String(rule.destinationPrinterId || ''),
        ticketType: String(rule.ticketType || 'kitchen_ticket') as any,
        matchedLineIds: matchedLines.map(function(line: any) { return String(line.lineId || ''); }),
        ticketContentMode: contentMode as any,
        copies: Math.max(1, Number(rule.copies || 1)),
        priority: (String(rule.priority || 'normal') as LilPrintPriority),
        required: false,
        isFallbackRule: true,
        includeCustomerName: rule.includeCustomerName !== false,
        includeCustomerPhone: rule.includeCustomerPhone === true,
        includeDeliveryAddress: rule.includeDeliveryAddress === true,
        includeCustomerNotes: rule.includeCustomerNotes === true
      });
    });

    return mergeDestinations(destinations);
  }

  global.LilposPrinterRoutingEngine = {
    evaluatePrintRoutes: evaluatePrintRoutes
  };
})(window);
