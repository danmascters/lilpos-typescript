(function(global: any) {
  'use strict';

  function defaultState(): StationDataManagerState {
    return {
      loading: false,
      error: '',
      sections: [],
      activeSectionId: '',
      records: [],
      query: '',
      selectedRecord: null,
      health: null,
      lastRefreshedAt: '',
      actionMessage: ''
    };
  }

  function jsonFileName(prefix: string): string {
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return prefix + '-' + stamp + '.json';
  }

  function downloadJson(payload: any, fileName: string) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  global.LilposStationDataManager = {
    defaultState: defaultState,
    jsonFileName: jsonFileName,
    downloadJson: downloadJson,
    copyText: copyText
  };
})(window);
