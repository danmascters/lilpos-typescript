interface Navigator {
  standalone?: boolean;
}

interface Window {
  LilposRuntime: {
    buildLilposRuntimePackageFromLegacy: (legacy: any, seed?: any, deps?: any) => any;
    createLilposDataService: (deps?: any) => any;
  };
  LilposPrinterSettingsService?: any;
  LilposPrintJobService?: any;
  LilposPrintStatusService?: any;
  LilposPrinterSettings?: any;
  LilposLilPrintClient?: any;
  LilposEscposBuilder?: any;
  LilposPrinterProfiles?: any;
  LilposOrdersManagement?: any;
  LilposLocalDataAdmin?: any;
  LilposStationDataManager?: any;
  LilposStationDataManagerView?: any;
  LilposDirectPrinterTest?: {
    render: (rootId?: string) => void;
  };
  lilposDataService?: any;
  lilposLocalDataAdmin?: any;
}

declare const self: ServiceWorkerGlobalScope;


interface Element {
  dataset: DOMStringMap;
  value: any;
  focus(options?: FocusOptions): void;
  setSelectionRange(start: number, end: number, direction?: "forward" | "backward" | "none"): void;
}
