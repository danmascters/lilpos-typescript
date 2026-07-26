type DeliveryQueueMode = 'main_orders' | 'dedicated_delivery_queue';
type DriverBankReconciliationMode = 'end_of_shift' | 'per_order';
type DeliveryStatus = 'PENDING_DELIVERY' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED' | 'CANCELED';
type DriverShiftStatus = 'OPEN' | 'CLOSED';
type DriverSettlementStatus = 'DRAFT' | 'APPROVED' | 'VOIDED';
type DriverSettlementDirection = 'DRIVER_OWES_STORE' | 'STORE_OWES_DRIVER' | 'EVEN';

interface DeliveryManagerSettings {
  id: 'delivery_manager_settings';
  inHouseDeliveryEnabled: boolean;
  deliveryQueueMode: DeliveryQueueMode;
  driverBanksEnabled: boolean;
  driverBankReconciliationMode: DriverBankReconciliationMode;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: string;
  lastSyncAttemptAt: string | null;
  syncError: string | null;
}

interface DeliveryDriver {
  driverId: string;
  displayName: string;
  phone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: string;
  lastSyncAttemptAt: string | null;
  syncError: string | null;
}

interface DriverShift {
  driverShiftId: string;
  driverId: string;
  businessDate: string;
  status: DriverShiftStatus;
  openedAt: string;
  closedAt: string | null;
  startingBankAmountCents: number;
  bankEnabledAtShiftStart: boolean;
  reconciliationModeAtShiftStart: DriverBankReconciliationMode;
  notes: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: string;
  lastSyncAttemptAt: string | null;
  syncError: string | null;
}

interface DriverSettlementCalculation {
  orderIds: string[];
  cashOrderTotalCents: number;
  startingBankAmountCents: number;
  creditCardTipsOwedCents: number;
  netAmountCents: number;
  netDirection: DriverSettlementDirection;
  warnings: string[];
}

interface DriverSettlement extends DriverSettlementCalculation {
  settlementId: string;
  driverId: string;
  driverShiftId: string | null;
  businessDate: string;
  reconciliationMode: DriverBankReconciliationMode;
  status: DriverSettlementStatus;
  approvedByEmployeeId: string | null;
  approvedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: string;
  lastSyncAttemptAt: string | null;
  syncError: string | null;
}

interface DeliveryManagerState {
  loading: boolean;
  error: string;
  message: string;
  activeTab: 'settings' | 'drivers' | 'orders' | 'settlements';
  settings: DeliveryManagerSettings;
  drivers: DeliveryDriver[];
  shifts: DriverShift[];
  orders: any[];
  settlements: DriverSettlement[];
  settlementPreviewByDriverId: Record<string, DriverSettlementCalculation>;
  editingDriverId: string | null;
}

interface Window {
  LilposDeliveryManagerSettings: any;
  LilposDeliveryCalculations: any;
  LilposDeliveryManagerState: any;
  LilposDeliveryManagerRuntime: any;
  LilposDeliveryManagerView: any;
}
