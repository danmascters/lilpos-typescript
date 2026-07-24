interface Navigator {
  standalone?: boolean;
}

interface Window {
  LilposRuntime: {
    buildLilposRuntimePackageFromLegacy: (legacy: any, seed?: any, deps?: any) => any;
    createLilposDataService: (deps?: any) => any;
  };
  LilposOrdersManagement?: any;
  LilposLocalDataAdmin?: any;
  LilposStationDataManager?: any;
  LilposStationDataManagerView?: any;
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
