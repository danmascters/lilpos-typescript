type LilPrintJobPayloadType = 'epos_xml' | 'escpos_raw_base64' | 'plain_text';

type LilPrintTransport = 'tcp_9100';

type LilPrintPriority = 'low' | 'normal' | 'high';

type LilPrintJobStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'TRANSMITTED'
  | 'RETRY_WAIT'
  | 'FAILED_FINAL'
  | 'CANCELED'
  | 'MANUALLY_RESOLVED';

type LilPrintConnectionState = 'connected' | 'disconnected' | 'degraded';

type LilPosPaperWidth = '58mm' | '80mm';

type LilPosFontFamilyMode = 'font_a' | 'font_b';

type LilPosTextScale = 'normal' | 'double_height' | 'double_width' | 'double_size';

type LilPosSyncStatus = 'LOCAL_ONLY' | 'PENDING' | 'SYNCED' | 'FAILED' | 'local-only' | 'pending' | 'synced' | 'failed';

type PosPrinterPrimaryRole =
  | 'receipt'
  | 'kitchen'
  | 'pizza'
  | 'expo'
  | 'bar'
  | 'delivery'
  | 'label'
  | 'cash_drawer'
  | 'custom';

type PrinterRoutingTicketType =
  | 'customer_receipt'
  | 'kitchen_ticket'
  | 'pizza_ticket'
  | 'expo_ticket'
  | 'bar_ticket'
  | 'delivery_ticket'
  | 'label'
  | 'custom';

type PrinterRoutingTrigger =
  | 'order_sent'
  | 'sale_completed'
  | 'manual_print'
  | 'order_accepted'
  | 'order_working'
  | 'status_changed';

type PrinterRoutingItemMatchMode = 'all' | 'printer_routes' | 'categories' | 'items' | 'unmatched';

type PrinterRoutingTicketContentMode = 'full' | 'filtered' | 'filtered_plus_shared' | 'unmatched_only' | 'summary';

type LocalPrintBatchStatus = 'BUILDING' | 'SUBMITTING' | 'IN_PROGRESS' | 'COMPLETED' | 'PRINT_ISSUE' | 'RESOLVED';

type PosPrinterConfig = {
  id: string;
  merchantId: string;
  locationId: string;
  name: string;
  description?: string;
  enabled: boolean;
  primaryRole: PosPrinterPrimaryRole;
  customRoleName?: string;
  secondaryRoles: string[];
  ip: string;
  port: number;
  transport: LilPrintTransport;
  profile: string;
  paperWidth: LilPosPaperWidth;
  charactersPerLine: number;
  defaultCopies: number;
  retryEnabled: boolean;
  maxAttempts: number;
  cutPaper: boolean;
  cashDrawerConnected: boolean;
  routeLabels?: string[];
  disabledAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: LilPosSyncStatus;
};

type PrinterRoutingRule = {
  id: string;
  merchantId: string;
  locationId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  destinationPrinterId: string;
  ticketType: PrinterRoutingTicketType;
  trigger: PrinterRoutingTrigger;
  orderTypes: string[];
  orderSources: string[];
  itemMatchMode: PrinterRoutingItemMatchMode;
  printerRouteIds: string[];
  categoryIds: string[];
  itemIds: string[];
  excludedCategoryIds: string[];
  excludedItemIds: string[];
  ticketContentMode: PrinterRoutingTicketContentMode;
  includeCustomerName: boolean;
  includeCustomerPhone: boolean;
  includeDeliveryAddress: boolean;
  includeCustomerNotes: boolean;
  copies?: number;
  priority: LilPrintPriority;
  isFallbackRule: boolean;
  stopAfterMatch: boolean;
  formattingOverrideId?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: LilPosSyncStatus;
};

type LocalPrintBatch = {
  id: string;
  orderId: string;
  trigger: PrinterRoutingTrigger | string;
  requestedAt: string;
  requiredJobCount: number;
  optionalJobCount: number;
  overallStatus: LocalPrintBatchStatus;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: LilPosSyncStatus;
};

type EvaluatedPrintDestination = {
  ruleId: string;
  printerId: string;
  ticketType: PrinterRoutingTicketType | string;
  matchedLineIds: string[];
  ticketContentMode: PrinterRoutingTicketContentMode | string;
  copies: number;
  priority: LilPrintPriority;
  required: boolean;
  isFallbackRule?: boolean;
  includeCustomerName?: boolean;
  includeCustomerPhone?: boolean;
  includeDeliveryAddress?: boolean;
  includeCustomerNotes?: boolean;
};

type PrinterSettingsRecord = {
  id: string;
  merchantId: string;
  locationId: string;
  stationId?: string;
  agentHttpsUrl: string;
  agentHttpUrl: string;
  preferHttps: boolean;
  receiptPrintingEnabled: boolean;
  promptForReceiptAfterSale: boolean;
  autoPrintReceiptAfterSale: boolean;
  defaultReceiptPrinterId?: string;
  defaultKitchenPrinterId?: string;
  receiptPrinterId?: string;
  receiptPrinterName?: string;
  receiptPrinterIp?: string;
  receiptPrinterPort: number;
  receiptPrinterProfile?: string;
  receiptPrinterTransport: LilPrintTransport;
  paperWidth: LilPosPaperWidth;
  charactersPerLine: number;
  leftMarginChars?: number;
  rightMarginChars?: number;
  fontFamilyMode: LilPosFontFamilyMode;
  defaultTextScale: LilPosTextScale;
  headerTextScale: LilPosTextScale;
  emphasizeTotals?: boolean;
  emphasizeOrderNumber?: boolean;
  condenseItemDescriptions?: boolean;
  printLogo: boolean;
  printMerchantName: boolean;
  printMerchantAddress: boolean;
  printMerchantPhone: boolean;
  printOrderNumber: boolean;
  printOrderType: boolean;
  printCustomerName: boolean;
  printCustomerPhone: boolean;
  printCustomerAddressForDelivery: boolean;
  printItemDescriptions: boolean;
  printItemQuantities?: boolean;
  printItemPrices?: boolean;
  printModifiers: boolean;
  printModifierPrices?: boolean;
  printItemNotes: boolean;
  printOrderNotes: boolean;
  printSubtotal: boolean;
  printTax: boolean;
  printDiscounts: boolean;
  printTips: boolean;
  printTotal?: boolean;
  printPayments: boolean;
  printAmountTendered?: boolean;
  printChangeDue: boolean;
  printEmployeeName: boolean;
  printStationName: boolean;
  printDateTime: boolean;
  footerMessage?: string;
  printDuplicateLabelOnReprint: boolean;
  feedLinesBeforeCut: number;
  cutPaperAfterReceipt: boolean;
  openCashDrawerWithCashSale: boolean;
  kitchenPaperWidth?: LilPosPaperWidth;
  kitchenCharactersPerLine?: number;
  kitchenOrderNumberScale?: LilPosTextScale | string;
  kitchenItemTextScale?: LilPosTextScale | string;
  kitchenModifierTextScale?: LilPosTextScale | string;
  kitchenShowPromisedTime?: boolean;
  kitchenShowEmployeeName?: boolean;
  kitchenShowStationName?: boolean;
  kitchenShowOrderNotes?: boolean;
  kitchenShowItemNotes?: boolean;
  copies: number;
  priority: LilPrintPriority;
  retryEnabled: boolean;
  maxAttempts: number;
  migratedToMultiPrinterV2At?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: LilPosSyncStatus;
};

type LocalPrintJobReference = {
  id: string;
  orderId: string;
  batchId?: string;
  printJobId: string;
  idempotencyKey: string;
  jobType: 'customer_receipt' | 'printer_test';
  printerRole: 'receipt';
  printerId: string;
  requestedAt: string;
  lastKnownStatus: LilPrintJobStatus;
  lastStatusAt: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  originalPrintJobId?: string;
  isReprint: boolean;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: LilPosSyncStatus;
};

type LilPrintPrinter = {
  id: string;
  name: string;
  ip?: string;
  port?: number;
  profile?: string;
  transport?: LilPrintTransport | string;
  status?: string;
  paused?: boolean;
  queuedJobs?: number;
  retryWaitJobs?: number;
  failedJobs?: number;
  lastSuccessfulConnectionAt?: string;
  lastTransmittedAt?: string;
};

type LilPrintAgentInfo = {
  id?: string;
  version?: string;
  hostname?: string;
  platform?: string;
  queueDatabaseStatus?: string;
  capabilities?: any;
};

type LilPrintRequestPrinter = {
  id: string;
  name: string;
  ip: string;
  port: number;
  profile?: string;
  transport: LilPrintTransport;
};

type LilPrintJobCreateRequest = {
  appId: 'lilpos';
  merchantId: string;
  locationId: string;
  jobId: string;
  idempotencyKey: string;
  printer: LilPrintRequestPrinter;
  payload: {
    type: LilPrintJobPayloadType;
    data: string;
  };
  metadata: {
    orderId: string;
    batchId?: string;
    stationId: string;
    businessDayId: string;
    jobType: 'customer_receipt' | 'printer_test';
    printerRole: 'receipt';
    source: 'lilpos';
    isReprint: boolean;
    originalPrintJobId?: string;
  };
  options: {
    copies: number;
    priority: LilPrintPriority;
    retryEnabled: boolean;
    maxAttempts: number;
  };
};

type LilPrintApiResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string;
  requestId: string;
};
