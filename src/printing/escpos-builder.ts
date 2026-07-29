/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  function toBytes(text: string): number[] {
    var value = String(text == null ? '' : text);
    var bytes: number[] = [];
    for (var i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      bytes.push(code & 0xff);
    }
    return bytes;
  }

  function bytesToBase64(bytes: number[]): string {
    var uint = new Uint8Array(bytes || []);
    var chunk = '';
    for (var i = 0; i < uint.length; i += 1) chunk += String.fromCharCode(uint[i]);
    if (typeof global.btoa === 'function') return global.btoa(chunk);
    throw new Error('Base64 conversion is unavailable in this environment.');
  }

  function createEscposBuilder(options?: any) {
    var out: number[] = [];
    var caps = options && options.capabilities ? options.capabilities : null;

    function isSupported(flag: string): boolean {
      if (!caps || caps[flag] == null) return true;
      return caps[flag] !== false;
    }

    function push(values: number[]) {
      out.push.apply(out, values);
      return api;
    }

    function line(text?: string) {
      if (text) push(toBytes(text));
      push([0x0a]);
      return api;
    }

    function setSize(mode: LilPosTextScale) {
      var scale = mode || 'normal';
      if (scale === 'double_height' && !isSupported('supportsDoubleHeight')) return api;
      if (scale === 'double_width' && !isSupported('supportsDoubleWidth')) return api;
      if (scale === 'double_size' && (!isSupported('supportsDoubleWidth') || !isSupported('supportsDoubleHeight'))) return api;
      if (scale === 'double_height') return push([0x1d, 0x21, 0x01]);
      if (scale === 'double_width') return push([0x1d, 0x21, 0x10]);
      if (scale === 'double_size') return push([0x1d, 0x21, 0x11]);
      return push([0x1d, 0x21, 0x00]);
    }

    var api = {
      init: function() {
        return push([0x1b, 0x40]);
      },
      font: function(mode: LilPosFontFamilyMode) {
        if (mode === 'font_b' && !isSupported('supportsFontB')) return api;
        if (mode === 'font_a' && !isSupported('supportsFontA')) return api;
        return push([0x1b, 0x4d, mode === 'font_b' ? 1 : 0]);
      },
      alignLeft: function() { return push([0x1b, 0x61, 0x00]); },
      alignCenter: function() { return push([0x1b, 0x61, 0x01]); },
      alignRight: function() { return push([0x1b, 0x61, 0x02]); },
      boldOn: function() { return isSupported('supportsBold') ? push([0x1b, 0x45, 0x01]) : api; },
      boldOff: function() { return isSupported('supportsBold') ? push([0x1b, 0x45, 0x00]) : api; },
      underlineOn: function() { return isSupported('supportsUnderline') ? push([0x1b, 0x2d, 0x01]) : api; },
      underlineOff: function() { return isSupported('supportsUnderline') ? push([0x1b, 0x2d, 0x00]) : api; },
      size: function(mode: LilPosTextScale) { return setSize(mode); },
      text: function(value: string) { return push(toBytes(value)); },
      line: line,
      hr: function(width: number) {
        return line(Array(Math.max(8, Number(width || 32))).fill('-').join(''));
      },
      twoCol: function(left: string, right: string, width: number) {
        var total = Math.max(20, Number(width || 32));
        var l = String(left || '');
        var r = String(right || '');
        if (r.length >= total - 1) return line(l).line(r);
        var leftWidth = total - r.length - 1;
        if (l.length > leftWidth) {
          line(l.slice(0, leftWidth));
          return line(Array(total - r.length).fill(' ').join('') + r);
        }
        return line(l + Array(leftWidth - l.length + 1).fill(' ').join('') + r);
      },
      feed: function(lines: number) {
        var n = Math.max(0, Math.min(20, Number(lines || 0)));
        for (var i = 0; i < n; i += 1) push([0x0a]);
        return api;
      },
      cut: function(linesBeforeCut?: number) {
        if (!isSupported('supportsCut')) return api;
        var n = Math.max(0, Math.min(20, Number(linesBeforeCut || 0)));
        if (n > 0) {
          // GS V 66 n: feed n lines then cut (supported by common ESC/POS printers).
          return push([0x1d, 0x56, 0x42, n]);
        }
        return push([0x1d, 0x56, 0x00]);
      },
      openDrawerPulse: function() {
        if (!isSupported('supportsDrawerPulse')) return api;
        return push([0x1b, 0x70, 0x00, 0x19, 0xfa]);
      },
      bytes: function() {
        return out.slice();
      },
      base64: function() {
        return bytesToBase64(out);
      }
    };

    return api;
  }

  global.LilposEscposBuilder = {
    createEscposBuilder: createEscposBuilder,
    bytesToBase64: bytesToBase64
  };
})(window);
