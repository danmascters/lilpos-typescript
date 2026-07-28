/// <reference path="./printer-types.ts" />
/// <reference path="./escpos-builder.ts" />

(function(global: any) {
  'use strict';

  function money(value: any): string {
    var n = Number(value || 0);
    return '$' + n.toFixed(2);
  }

  function toAmount(value: any): number {
    if (Number.isFinite(Number(value))) return Number(value);
    return 0;
  }

  function displayOrderNumber(value: any): string {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d+$/.test(raw)) return String(Number(raw));
    var stationPattern = raw.match(/^(\d+)-0*(\d+)$/);
    if (stationPattern) return stationPattern[1] + '-' + String(Number(stationPattern[2]));
    return raw;
  }

  function wrapText(value: any, width: number): string[] {
    var text = String(value || '').trim();
    if (!text) return [];
    var max = Math.max(10, Number(width || 32));
    var words = text.split(/\s+/g);
    var lines: string[] = [];
    var current = '';
    for (var i = 0; i < words.length; i += 1) {
      var word = words[i];
      if (!word) continue;
      if (!current) {
        if (word.length <= max) {
          current = word;
        } else {
          lines.push(word.slice(0, max));
          var tail = word.slice(max);
          if (tail) words.splice(i + 1, 0, tail);
        }
        continue;
      }
      if ((current + ' ' + word).length <= max) {
        current += ' ' + word;
      } else {
        lines.push(current);
        current = '';
        i -= 1;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function renderSafePaymentLine(payment: any): string {
    var type = String(payment && (payment.paymentType || payment.tenderLabel) || 'Payment').trim();
    var brand = String(payment && payment.cardBrand || '').trim();
    var last4 = String(payment && (payment.cardLastFour || payment.lastFour || payment.cardLast4) || '').replace(/\D/g, '').slice(-4);
    if (brand && last4) return type + ' ' + brand + ' •••• ' + last4;
    return type;
  }

  function lineItemsFromOrder(order: any): any[] {
    var rows = Array.isArray(order && order.lines) ? order.lines : [];
    return rows.map(function(line: any) {
      var mods = Array.isArray(line && line.mods) ? line.mods : [];
      return {
        qty: Number(line && line.qty || 1),
        name: String(line && line.name || 'Item'),
        unitPrice: Number(line && line.price || 0),
        total: Number(line && line.price || 0) * Number(line && line.qty || 1),
        notes: String(line && (line.specialInstruction || line.instructions) || ''),
        modifiers: mods.map(function(mod: any) {
          var name = String(mod && (mod.optionName || mod.name) || '').trim();
          var price = Number(mod && (mod.price || mod.amount || 0) || 0);
          return { name: name, price: price };
        }).filter(function(mod: any) { return !!mod.name; })
      };
    });
  }

  function renderCustomerReceiptEscposBase64(input: any): any {
    var settings = (global.LilposPrinterSettingsService && global.LilposPrinterSettingsService.normalize)
      ? global.LilposPrinterSettingsService.normalize(input && input.settings || {})
      : (input && input.settings || {});
    var order = input && input.order || {};
    var isReprint = input && input.isReprint === true;
    var width = Math.max(20, Number(settings.charactersPerLine || (settings.paperWidth === '58mm' ? 32 : 48)));
    var builder = global.LilposEscposBuilder.createEscposBuilder();

    builder.init().font(settings.fontFamilyMode || 'font_a').alignCenter();

    if (isReprint && settings.printDuplicateLabelOnReprint) {
      builder.boldOn().size('double_width').line('REPRINT').size('normal').boldOff().feed(1);
    }

    var merchantName = String(order && (order.merchantName || order.stationName || 'LilPOS')).trim();
    if (settings.printMerchantName) {
      builder.boldOn().size(settings.headerTextScale || 'double_width').line(merchantName).size('normal').boldOff();
    }
    if (settings.printMerchantAddress && order && order.merchantAddress) builder.line(String(order.merchantAddress));
    if (settings.printMerchantPhone && order && order.merchantPhone) builder.line(String(order.merchantPhone));

    builder.feed(1).alignLeft();

    var orderNumber = displayOrderNumber(order && (order.orderNumber || order.number || order.displayOrderNumber));
    var orderType = String(order && order.orderType || '').toUpperCase();
    if (settings.printOrderNumber || settings.printOrderType) {
      var left = settings.printOrderNumber ? ('Order ' + orderNumber) : '';
      var right = settings.printOrderType ? orderType : '';
      if (settings.emphasizeOrderNumber) builder.boldOn();
      builder.twoCol(left, right, width);
      if (settings.emphasizeOrderNumber) builder.boldOff();
    }

    if (settings.printDateTime) {
      var whenText = String(order && (order.updatedTimestamp || order.createdTimestamp || new Date().toISOString()));
      builder.twoCol(whenText.replace('T', ' ').slice(0, 19), settings.printStationName ? ('Station ' + String(order && (order.stationNumber || order.stationId || '1'))) : '', width);
    } else if (settings.printStationName) {
      builder.line('Station ' + String(order && (order.stationNumber || order.stationId || '1')));
    }

    if (settings.printCustomerName || settings.printCustomerPhone || settings.printCustomerAddressForDelivery) {
      var customer = order && (order.customer || order.customerInfo || order.customerSnapshot) || {};
      if (settings.printCustomerName && customer.name) builder.line('Customer: ' + String(customer.name));
      if (settings.printCustomerPhone && customer.phone) builder.line('Phone: ' + String(customer.phone));
      if (settings.printCustomerAddressForDelivery && String(order && order.orderType || '').toLowerCase() === 'delivery') {
        var addr = [customer.address1, customer.city, customer.state, customer.zip].filter(Boolean).join(' ');
        if (addr) wrapText('Address: ' + addr, width).forEach(function(row) { builder.line(row); });
      }
    }

    builder.hr(width);

    var items = lineItemsFromOrder(order);
    items.forEach(function(item) {
      var amount = settings.printItemPrices ? money(item.total) : '';
      var qtyPrefix = settings.printItemQuantities ? String(item.qty) + '  ' : '';
      var nameWidth = Math.max(8, width - (amount ? amount.length + 1 : 0));
      var nameLines = wrapText(qtyPrefix + item.name, nameWidth);
      if (!nameLines.length) nameLines = [qtyPrefix + item.name];
      builder.twoCol(nameLines[0], amount, width);
      for (var i = 1; i < nameLines.length; i += 1) builder.line(nameLines[i]);

      if (settings.printModifiers) {
        item.modifiers.forEach(function(mod: any) {
          var modAmount = settings.printModifierPrices ? money(mod.price || 0) : '';
          var modLines = wrapText('+ ' + mod.name, Math.max(6, width - (modAmount ? modAmount.length + 1 : 0) - 2));
          if (!modLines.length) modLines = ['+ ' + mod.name];
          builder.twoCol('  ' + modLines[0], modAmount, width);
          for (var m = 1; m < modLines.length; m += 1) builder.line('  ' + modLines[m]);
        });
      }

      if (settings.printItemNotes && item.notes) {
        wrapText('Note: ' + item.notes, Math.max(8, width - 2)).forEach(function(noteLine) {
          builder.line('  ' + noteLine);
        });
      }
    });

    if (settings.printOrderNotes && order && order.orderSpecialInstructions) {
      builder.hr(width);
      wrapText('Order Note: ' + String(order.orderSpecialInstructions), width).forEach(function(line) {
        builder.line(line);
      });
    }

    builder.hr(width);

    var subtotal = toAmount(order && order.subtotal);
    var tax = toAmount(order && order.tax);
    var tip = toAmount(order && (order.tip || ((Number(order.tipCents || 0) / 100) || 0)));
    var total = toAmount(order && order.total);

    if (settings.printSubtotal) builder.twoCol('Subtotal', money(subtotal), width);
    if (settings.printTax) builder.twoCol('Tax', money(tax), width);
    if (settings.printTips && tip > 0) builder.twoCol('Tip', money(tip), width);

    if (settings.emphasizeTotals) builder.boldOn().size('double_height');
    if (settings.printTotal !== false) builder.twoCol('TOTAL', money(total), width);
    if (settings.emphasizeTotals) builder.size('normal').boldOff();

    if (settings.printPayments) {
      var paymentLines = Array.isArray(order && order.paymentLines) ? order.paymentLines : [];
      if (paymentLines.length) {
        builder.feed(1).line('Payment:');
        paymentLines.forEach(function(line: any) {
          builder.line(renderSafePaymentLine(line));
        });
      }
    }

    if (settings.printChangeDue) {
      var change = Number(input && input.changeDue || 0);
      if (change > 0) builder.twoCol('Change Due', money(change), width);
    }

    builder.feed(1).alignCenter();
    if (settings.footerMessage) {
      wrapText(settings.footerMessage, width).forEach(function(line) {
        builder.line(line);
      });
    }

    builder.feed(Math.max(0, Number(settings.feedLinesBeforeCut || 0)));

    if (settings.cutPaperAfterReceipt) builder.cut();
    if (settings.openCashDrawerWithCashSale && input && input.allowDrawerPulse === true) builder.openDrawerPulse();

    return {
      base64: builder.base64(),
      bytes: builder.bytes(),
      width: width
    };
  }

  function renderPrinterTestEscposBase64(input: any): any {
    var settings = (global.LilposPrinterSettingsService && global.LilposPrinterSettingsService.normalize)
      ? global.LilposPrinterSettingsService.normalize(input && input.settings || {})
      : (input && input.settings || {});
    var printer = input && input.printer || {};
    var width = Math.max(20, Number(settings.charactersPerLine || (settings.paperWidth === '58mm' ? 32 : 48)));
    var builder = global.LilposEscposBuilder.createEscposBuilder();

    builder.init().alignCenter().boldOn().line('LilPOS Printer Test').boldOff().feed(1).alignLeft();
    builder.line('Printer: ' + String(printer.name || 'Unknown'));
    builder.line('ID: ' + String(printer.id || ''));
    builder.line('Endpoint: ' + String(printer.ip || '') + ':' + String(printer.port || 9100));
    builder.line('Paper: ' + String(settings.paperWidth || '80mm') + ' (' + width + ' cpl)');
    builder.hr(width);
    builder.font('font_a').line('Font A sample');
    builder.font('font_b').line('Font B sample');
    builder.font(settings.fontFamilyMode || 'font_a');
    builder.boldOn().line('Bold sample').boldOff();
    builder.size('double_height').line('Double Height').size('normal');
    builder.size('double_width').line('Double Width').size('normal');
    builder.alignCenter().line('Centered text');
    builder.alignLeft().twoCol('Left/Right test', '$12.34', width);
    builder.line('Date: ' + new Date().toISOString());
    builder.feed(Math.max(0, Number(settings.feedLinesBeforeCut || 0)));
    if (settings.cutPaperAfterReceipt) builder.cut();

    return {
      base64: builder.base64(),
      bytes: builder.bytes(),
      width: width
    };
  }

  global.LilposReceiptRenderer = {
    displayOrderNumber: displayOrderNumber,
    wrapText: wrapText,
    renderCustomerReceiptEscposBase64: renderCustomerReceiptEscposBase64,
    renderPrinterTestEscposBase64: renderPrinterTestEscposBase64
  };
})(window);
