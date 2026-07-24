type LocalDataAdminRecord = {
  id: string;
  storeName: string;
  sectionId: string;
  label: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  value: any;
};

type LocalDataAdminSection = {
  id: string;
  groupId: string;
  groupLabel: string;
  label: string;
  storeName?: string;
  virtual?: boolean;
  count?: number;
  available: boolean;
  emptyReason?: string;
  clearAllowed?: boolean;
};

type LocalDataAdminHealth = {
  indexedDbAvailable: boolean;
  databaseName: string;
  databaseVersion: number;
  storeNames: string[];
  storageEstimate: any;
  storagePersisted: boolean | null;
  persistentStorageSupported: boolean;
  serviceWorker: any;
  pendingSyncCount: number | null;
  failedSyncCount: number | null;
  lastMenuSyncAt: string;
};

type LocalDataAdminExport = {
  metadata: any;
  sections: any[];
};
