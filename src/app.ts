let deferredInstallPrompt = null;
const lineResetTimers = new Map();
const VIEW_ALL_CATEGORIES = 'all_categories';
const VIEW_ALL_ITEMS = 'all_items';
const VIEW_FAVORITES = 'favorites';
const LONG_PRESS_MS = 3000;
const LONG_PRESS_MOVE_PX = 12;

let detachGridBlankTapListeners = null;
let detachRemoveConfirmOutsideListener = null;

const ORDER_TYPES = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  togo: 'To-Go',
  tostay: 'To-Stay',
  dinein: 'Dine-In'
};

const businessSettings = {
  dineInEnabled: true,
  tableNumbersEnabled: false,
  serverAssignmentEnabled: false
};

const MAIN_VIEWS = {
  menu: 'menu',
  orders: 'orders',
  customers: 'customers',
  payment: 'payment',
  managerPin: 'managerPin',
  managerSettings: 'managerSettings'
};

// Temporary demo PIN — UI-only gate; real PIN validation must be performed
// by the backend, tied to an employee identity and permissions.
const DEFAULT_MANAGER_PIN = '1234';

const ORDER_MGMT_FILTERS = {
  open: 'open',
  completed: 'completed',
  online: 'online',
  future: 'future'
};

const STATION_NUMBER = 1; // Default station number, centralize here for future wire-up
const MANAGER_SETTINGS_STORE_KEY = 'lilpos_manager_settings_v1';

type KeyboardMode =
  | 'micro'
  | 'compact-footer'
  | 'standard-qwerty'
  | 'external';

type KeyboardContext = 'text' | 'numeric' | 'phone' | 'money';

type IntentFieldType =
  | 'customer-search'
  | 'customer-profile-name'
  | 'customer-profile-phone'
  | 'customer-address'
  | 'menu-search'
  | 'special-instructions'
  | 'modifier-instructions'
  | 'generic-text'
  | 'numeric';

type IntentChipAction =
  | 'replace-input'
  | 'complete-input'
  | 'append-text'
  | 'toggle-order-tag';

type IntentChip = {
  id: string;
  label: string;
  action: IntentChipAction;
  value?: string;
  tagId?: string;
  source?: 'menu' | 'customer' | 'modifier' | 'order-tag' | 'recent' | 'default';
};

type IntentSuggestionContext = {
  fieldType: IntentFieldType;
  typedValue: string;
  orderType?: string;
  activeCategoryId?: string;
  activeItemId?: string;
  activeCustomerId?: string;
};

const ORDER_SPECIAL_INSTRUCTION_CHIPS = [
  'Bell broken please knock',
  'Call when arrive',
  'Leave at door',
  'Bring change 50',
  'Bring change 100'
];

const DEFAULT_KEYBOARD_MODE: KeyboardMode = 'micro';

type PrepPriceBehavior = 'none' | 'force_zero' | 'multiplier' | 'fixed' | 'delta';

type PrepSelectedColorRole = 'default' | 'warning' | 'danger';

type PrepModifierOption = {
  id: string;
  label: string;
  displayPattern: string;
  priceBehavior: PrepPriceBehavior;
  priceValue: number;
  resetsAfterUse: boolean;
  selectedColorRole?: PrepSelectedColorRole;
};

const PIZZA_TOPPING_PREPS: PrepModifierOption[] = [
  {
    id: 'no',
    label: 'NO',
    displayPattern: 'NO {modifier}',
    priceBehavior: 'force_zero',
    priceValue: 0,
    resetsAfterUse: true,
    selectedColorRole: 'danger'
  },
  {
    id: 'lite',
    label: 'LITE',
    displayPattern: 'LITE {modifier}',
    priceBehavior: 'force_zero',
    priceValue: 0,
    resetsAfterUse: true,
    selectedColorRole: 'warning'
  },
  {
    id: 'extra',
    label: 'EXTRA',
    displayPattern: 'EXTRA {modifier}',
    priceBehavior: 'multiplier',
    priceValue: 2,
    resetsAfterUse: true,
    selectedColorRole: 'warning'
  },
  {
    id: 'side',
    label: 'SIDE',
    displayPattern: '{modifier} on Side',
    priceBehavior: 'none',
    priceValue: 0,
    resetsAfterUse: true,
    selectedColorRole: 'warning'
  },
  {
    id: 'heavy',
    label: 'HEAVY',
    displayPattern: 'HEAVY {modifier}',
    priceBehavior: 'multiplier',
    priceValue: 2,
    resetsAfterUse: true,
    selectedColorRole: 'warning'
  }
];

const PREP_MODIFIER_SETS: Record<string, PrepModifierOption[]> = {
  pizza_topping_preps: PIZZA_TOPPING_PREPS
};

function prepModifierSetById(prepModifierSetId) {
  const id = String(prepModifierSetId || '').trim();
  if (!id) return [];
  return PREP_MODIFIER_SETS[id] || [];
}

function prepModifierSetForGroup(group) {
  const explicitSet = prepModifierSetById(group?.prepModifierSetId);
  if (explicitSet.length) return explicitSet;

  // Backward compatibility for older runtime payloads that do not include prepModifierSetId.
  const pricingMode = String(group?.pricingMode || '').trim().toLowerCase();
  const groupName = String(group?.name || '').trim().toLowerCase();
  const allowHalf = group?.allowHalf === true;
  const isPizzaToppingGroup = pricingMode === 'pizza_half_whole'
    || (allowHalf && groupName.includes('pizza topping'));

  if (isPizzaToppingGroup) return PIZZA_TOPPING_PREPS;
  return [];
}

function prepModifierById(group, prepId) {
  if (!group || !prepId) return null;
  const prepIdText = String(prepId).trim();
  return prepModifierSetForGroup(group).find((prep) => prep.id === prepIdText) || null;
}

function getActivePrepModifierForGroup(groupId) {
  const gid = String(groupId || '').trim();
  if (!gid) return null;
  const group = state.idx?.groupsById?.[gid];
  if (!group) return null;
  const prepId = state.selectedConfig?.activePrepModifierByGroup?.[gid];
  if (!prepId) return null;
  return prepModifierById(group, prepId);
}

function setActivePrepModifierForGroup(groupId, prepId) {
  const gid = String(groupId || '').trim();
  if (!gid) return;
  state.selectedConfig.activePrepModifierByGroup = state.selectedConfig.activePrepModifierByGroup || {};
  if (!prepId) {
    delete state.selectedConfig.activePrepModifierByGroup[gid];
    return;
  }
  state.selectedConfig.activePrepModifierByGroup[gid] = prepId;
}

function clearActivePrepModifierForGroup(groupId) {
  setActivePrepModifierForGroup(groupId, null);
}

// ── Modifier Dialog History (Undo / Redo / Start Over) ──────────────────────

function cloneDialogConfig(cfg: any): any {
  if (!cfg) return null;
  return JSON.parse(JSON.stringify(cfg));
}

function snapshotDialogState() {
  if (!state.selectedConfig || !state.modifierDialogHistory) return;
  const snap = cloneDialogConfig(state.selectedConfig);
  const { past } = state.modifierDialogHistory;
  // Deduplicate: skip if the top snapshot is already identical to the current state
  if (past.length > 0 && JSON.stringify(past[past.length - 1]) === JSON.stringify(snap)) return;
  past.push(snap);
  state.modifierDialogHistory.future = [];
}

function dialogHistoryUndo() {
  const h = state.modifierDialogHistory;
  if (!h || h.past.length === 0) return;
  const editingLineId = state.selectedConfig?.editingLineId ?? null;
  h.future.unshift(cloneDialogConfig(state.selectedConfig));
  state.selectedConfig = { ...h.past.pop(), editingLineId };
  state.startOverConfirmPending = false;
  render();
}

function dialogHistoryRedo() {
  const h = state.modifierDialogHistory;
  if (!h || h.future.length === 0) return;
  const editingLineId = state.selectedConfig?.editingLineId ?? null;
  h.past.push(cloneDialogConfig(state.selectedConfig));
  state.selectedConfig = { ...h.future.shift(), editingLineId };
  state.startOverConfirmPending = false;
  render();
}

let _startOverConfirmTimer: ReturnType<typeof setTimeout> | null = null;

function dialogHistoryStartOver() {
  if (!state.startOverConfirmPending) {
    state.startOverConfirmPending = true;
    if (_startOverConfirmTimer) clearTimeout(_startOverConfirmTimer);
    _startOverConfirmTimer = setTimeout(() => {
      if (state.startOverConfirmPending) {
        state.startOverConfirmPending = false;
        render();
      }
    }, 3000);
    render();
    return;
  }
  if (_startOverConfirmTimer) { clearTimeout(_startOverConfirmTimer); _startOverConfirmTimer = null; }
  state.startOverConfirmPending = false;
  const h = state.modifierDialogHistory;
  if (h) {
    h.past.push(cloneDialogConfig(state.selectedConfig));
    h.future = [];
  }
  const editingLineId = state.selectedConfig?.editingLineId ?? null;
  state.selectedConfig = { ...cloneDialogConfig(state.modifierDialogInitialConfig), editingLineId };
  render();
}

function isDialogAtInitialState(): boolean {
  if (!state.modifierDialogInitialConfig || !state.modifierDialogHistory) return true;
  const curr = cloneDialogConfig(state.selectedConfig);
  const init = cloneDialogConfig(state.modifierDialogInitialConfig);
  // Exclude UI-navigation and transient fields from the comparison
  for (const f of ['pizzaNav', 'pizzaFilter', 'activePrepModifierByGroup', 'editingLineId']) {
    if (curr) delete curr[f];
    if (init) delete init[f];
  }
  return JSON.stringify(curr) === JSON.stringify(init);
}

// ────────────────────────────────────────────────────────────────────────────

function resolvePrepDisplayLabel(modifierName, prepModifier) {
  const baseName = asModifierValue(modifierName);
  if (!prepModifier?.displayPattern) return baseName;
  return prepModifier.displayPattern.replace('{modifier}', baseName).trim();
}

function prepPriceMultiplier(prepModifier) {
  if (!prepModifier) return 1;
  if (prepModifier.priceBehavior === 'multiplier') {
    const factor = Number(prepModifier.priceValue || 1);
    return Number.isFinite(factor) && factor > 0 ? factor : 1;
  }
  return 1;
}

function prepAdjustedModifierPrice(basePrice, prepModifier) {
  const safeBasePrice = Number(basePrice || 0);
  if (!prepModifier) return +safeBasePrice.toFixed(2);
  const behavior = prepModifier.priceBehavior;
  const value = Number(prepModifier.priceValue || 0);

  if (behavior === 'none') return +safeBasePrice.toFixed(2);
  if (behavior === 'force_zero') return 0;
  if (behavior === 'multiplier') return +(safeBasePrice * prepPriceMultiplier(prepModifier)).toFixed(2);
  if (behavior === 'delta') return +(safeBasePrice + value).toFixed(2);
  if (behavior === 'fixed') return +value.toFixed(2);
  return +safeBasePrice.toFixed(2);
}

function prepSelectedRowClassName(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!normalizedRole || normalizedRole === 'default') return '';
  return normalizedRole === 'danger' || normalizedRole === 'warning'
    ? `prep-selected-${normalizedRole}`
    : '';
}

function filterModifierOptions(options: any[], searchText: string): any[] {
  const term = searchText.trim().toLowerCase();
  if (!term) return options;
  return options.filter((o) => (o.name || '').toLowerCase().includes(term));
}

function normalizeOrderStatus(order) {
  const rawStatus = String(order?.status || '').trim().toLowerCase();
  if (rawStatus === 'completed' || rawStatus === 'open' || rawStatus === 'canceled' || rawStatus === 'closed') {
    return rawStatus;
  }
  const paid = !!order?.paid || String(order?.paymentStatus || '').toLowerCase() === 'paid';
  return paid ? 'completed' : 'open';
}

function isStandaloneMode() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function isIosSafari() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

const state: any = {
  menu: null,
  metrics: {},
  scale: 'large',
  query: '',
  mainView: MAIN_VIEWS.menu,
  ordersFilter: ORDER_MGMT_FILTERS.open,
  ordersQuery: '',
  customersQuery: '',
  selectedOrderId: null,
  previousOrderAuditExpanded: false,
  persistedOrdersCache: [],
  persistedOrderDetailCacheById: {},
  nextDisplayOrderNumber: `${STATION_NUMBER}-00000`,
  category: VIEW_ALL_ITEMS,
  preSearchCategory: null,
  selected: null,
  selectedConfig: {},
  cart: [],
  offline: false,
  call: null,
  idx: null,
  installAvailable: false,
  installed: isStandaloneMode(),
  devToolsOpen: false,
  activityOpen: false,
  orderType: 'pickup',
  orderSource: 'unknown',
  isPhoneOrder: false,
  phoneClassifierSelected: false,
  timingType: 'asap',
  asapTime: '',
  futureDateTime: null,
  futureOrderNote: '',
  thirdClassifierSelected: false,
  scheduleDialog: {
    open: false,
    date: '',
    time: ''
  },
  asapAdjustDialog: {
    open: false,
    time: ''
  },
  removeConfirmLineId: null,
  customerName: '',
  customerPhone: '',
  customerNotes: '',
  orderSpecialInstructions: '',
  activeCustomer: null,
  customerPanelMode: 'compact',
  customerEditorMode: 'new',
  customerDraft: {
    name: '',
    phone: '',
    address1: '',
    city: '',
    state: '',
    zip: '',
    allergies: '',
    specialInstructions: ''
  },
  focusCustomerEntryOnRender: false,
  orderTypeDraftDialog: {
    open: false,
    type: null,
    name: '',
    phone: '',
    tableNumber: ''
  },
  orderTypeDetails: {
    togoName: '',
    togoPhone: '',
    dineInTableNumber: ''
  },
  mockCustomers: [],
  mockOrders: [],
  favoriteItemIds: ['item_00001', 'item_00003', 'item_00008', 'item_00021'],
  favoriteCategoryIds: [],
  showCancelConfirm: false,
  managerPinEntry: '',
  managerPinError: '',
  managerUnlocked: false,
  managerSettingsSection: null,
  keyboardMode: DEFAULT_KEYBOARD_MODE,
  sentOrdersToday: [],
  quickItemEditor: {
    itemId: null,
    price: '',
    stockMode: 'in_stock',
    stockDays: '1'
  },
  quickCategoryEditor: {
    categoryId: null,
    visible: true,
    favorite: false
  },
  addItemDraft: {
    open: false,
    name: '',
    categoryId: '',
    price: '0.00',
    description: '',
    modifierCount: '0',
    inStock: true,
    favorite: false
  },
  cartItemEditor: {
    lineId: null,
    mode: null,
    value: ''
  },
  searchRefocus: false,
  searchCursorPos: 0,
  scrollCartOnAdd: false,
  restoreMenuBoardScrollTop: null,
  lineCount: 6,
  phoneLines: [],
  selectedLineNumber: null,
  pwaDiag: {
    secure: window.isSecureContext,
    manifest: false,
    swSupported: 'serviceWorker' in navigator,
    swRegistered: false,
    swController: false,
    beforeInstallPrompt: false
  },
  deliveryInfoMissing: false,
  deliveryProfileDialog: {
    open: false,
    draft: {
      name: '',
      phone: '',
      address1: '',
      city: '',
      state: '',
      zip: '',
      allergies: '',
      specialInstructions: ''
    }
  },
  payNowMissingDialog: {
    open: false,
    issues: [],
    draft: {
      name: '',
      phone: '',
      address1: '',
      city: '',
      state: '',
      zip: '',
      allergies: '',
      specialInstructions: '',
      futureDate: '',
      futureTime: ''
    }
  },
  payLaterMissingDialog: {
    open: false,
    issues: [],
    draft: {
      name: '',
      phone: '',
      address1: '',
      city: '',
      state: '',
      zip: '',
      allergies: '',
      specialInstructions: '',
      futureDate: '',
      futureTime: ''
    }
  },
  paymentDialog: {
    open: false,
    baseTotal: 0,
    paymentType: 'Cash',
    tipMode: 'none',
    customTip: '0.00',
    entryAmount: '0.00',
    paymentLines: []
  },
  paymentPaneInput: null,
  paymentPaneState: null,
  orderSendLocked: false,
  orderNumberDialog: {
    open: false,
    orderNumber: '',
    orderId: null
  },
  newSalePendingLineNumber: null
};

function normalizeKeyboardMode(mode): KeyboardMode {
  if (mode === 'compact-footer') return 'compact-footer';
  if (mode === 'standard-qwerty') return 'standard-qwerty';
  if (mode === 'external') return 'external';
  return 'micro';
}

function keyboardModeLabel(mode: KeyboardMode) {
  if (mode === 'compact-footer') return 'Compact Footer Keyboard';
  if (mode === 'standard-qwerty') return 'Standard QWERTY Keyboard';
  if (mode === 'external') return 'External Keyboard';
  return 'Micro Keyboard';
}

function readManagerSettings() {
  try {
    const raw = localStorage.getItem(MANAGER_SETTINGS_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to read manager settings:', err);
    return {};
  }
}

function persistManagerSettings() {
  try {
    const existing = readManagerSettings();
    const next = {
      ...existing,
      keyboardMode: normalizeKeyboardMode(state.keyboardMode)
    };
    localStorage.setItem(MANAGER_SETTINGS_STORE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to persist manager settings:', err);
  }
}

function hydrateManagerSettingsFromStorage() {
  const settings = readManagerSettings();
  state.keyboardMode = normalizeKeyboardMode(settings.keyboardMode);
}

function normalizeIntentText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeIntentText(value) {
  const normalized = normalizeIntentText(value);
  return normalized ? normalized.split(' ') : [];
}

function intentFieldTypeForInput(target): IntentFieldType {
  if (!target) return 'generic-text';
  const contextAttr = String(target.getAttribute?.('data-keyboard-context') || '').toLowerCase();
  if (
    contextAttr === 'customer-search'
    || contextAttr === 'customer-profile-name'
    || contextAttr === 'customer-profile-phone'
    || contextAttr === 'customer-address'
    || contextAttr === 'menu-search'
    || contextAttr === 'special-instructions'
    || contextAttr === 'modifier-instructions'
    || contextAttr === 'generic-text'
    || contextAttr === 'numeric'
  ) {
    return contextAttr as IntentFieldType;
  }

  const id = String(target.id || '').toLowerCase();
  const name = String((target as HTMLInputElement).name || '').toLowerCase();
  const placeholder = String((target as HTMLInputElement).placeholder || '').toLowerCase();
  const blob = `${id} ${name} ${placeholder}`;

  if (id === 'query') return 'menu-search';
  if (id === 'ordersquery') return 'generic-text';
  if (id === 'customermgmtquery') return 'customer-search';
  if (id === 'orderspecialinstructionsinput') return 'special-instructions';
  if (id === 'pizzanotesinput') return 'modifier-instructions';
  if (id === 'cartitemeditorinput' && state.cartItemEditor?.mode === 'note') return 'modifier-instructions';
  if (/entryname|customermgmtname|deliveryname|paynowmissingname|paylatermissingname/.test(id)) return 'customer-profile-name';
  if (/entryphone|customermgmtphone|deliveryphone|paynowmissingphone|paylatermissingphone/.test(id)) return 'customer-profile-phone';
  if (/entryaddress1|customermgmtaddress1|deliveryaddress1|paynowmissingaddress1|paylatermissingaddress1|entrycity|customermgmtcity|deliverycity|paynowmissingcity|paylatermissingcity|entrystate|customermgmtstate|deliverystate|paynowmissingstate|paylatermissingstate|entryzip|customermgmtzip|deliveryzip|paynowmissingzip|paylatermissingzip/.test(id)) return 'customer-address';
  if (/instructions|notes/.test(blob)) {
    if (/pizza|item-specific/.test(blob)) return 'modifier-instructions';
    if (/order special/.test(blob)) return 'special-instructions';
    return 'generic-text';
  }
  if (/customer name/.test(blob)) return 'customer-profile-name';
  if (/address|city|state|zip/.test(blob)) return 'customer-address';
  if (/search menu/.test(blob)) return 'menu-search';

  if (target instanceof HTMLInputElement) {
    const type = String(target.type || '').toLowerCase();
    const inputMode = String(target.inputMode || target.getAttribute('inputmode') || '').toLowerCase();
    if (type === 'number' || inputMode === 'numeric' || inputMode === 'decimal' || inputMode === 'tel') {
      return 'numeric';
    }
  }

  return 'generic-text';
}

function looksInstructionLikePhrase(value) {
  const normalized = normalizeIntentText(value);
  if (!normalized) return false;
  if (normalized.length < 4) return false;
  const tokens = normalized.split(' ');
  const hasKeyword = tokens.some((token) => /^(no|well|light|extra|cut|side|sauce|done|crispy|toasted|dressing|salt|allergy|leave|ring)$/.test(token));
  return hasKeyword || tokens.length > 1;
}

function lastWordPrefix(value) {
  const normalized = normalizeIntentText(value);
  if (!normalized) return '';
  const tokens = normalized.split(' ');
  return tokens[tokens.length - 1] || '';
}

function scoreIntentCandidate(label, query) {
  const labelNorm = normalizeIntentText(label);
  const queryNorm = normalizeIntentText(query);
  if (!labelNorm || !queryNorm) return 0;
  if (labelNorm.startsWith(queryNorm)) return 120;
  const labelTokens = tokenizeIntentText(labelNorm);
  if (labelTokens.some((token) => token.startsWith(queryNorm))) return 90;
  if (labelNorm.includes(queryNorm)) return 60;
  const prefix = lastWordPrefix(queryNorm);
  if (prefix && labelTokens.some((token) => token.startsWith(prefix))) return 40;
  return 0;
}

function addIntentCandidate(candidates, candidate) {
  const label = String(candidate?.label || '').trim();
  if (!label) return;
  const key = normalizeIntentText(label);
  if (!key) return;
  const existing = candidates.get(key);
  if (!existing || Number(candidate.weight || 0) > Number(existing.weight || 0)) {
    candidates.set(key, candidate);
  }
}

function localMenuIntentCandidates() {
  const candidates = new Map();
  const items = lilposDataService?.getAllItems?.() || [];
  items.forEach((item, index) => {
    addIntentCandidate(candidates, {
      label: item.name,
      value: item.name,
      action: 'replace-input',
      source: 'menu',
      weight: state.favoriteItemIds?.includes(item.id) ? 130 - index : 90 - index
    });
  });
  const categories = visibleCategories?.() || [];
  categories.forEach((category, index) => {
    addIntentCandidate(candidates, {
      label: category.name,
      value: category.name,
      action: 'replace-input',
      source: 'menu',
      weight: 60 - index
    });
  });
  if (state.idx?.optsByGroup) {
    state.idx.optsByGroup.forEach((opts) => {
      (opts || []).forEach((opt) => {
        addIntentCandidate(candidates, {
          label: opt.name,
          value: opt.name,
          action: 'replace-input',
          source: 'modifier',
          weight: 40
        });
      });
    });
  }
  return Array.from(candidates.values());
}

function localCustomerSearchCandidates() {
  const candidates = new Map();

  const addCustomerSearchEntries = (customer, index = 0, source = 'customer', weightBase = 120) => {
    const name = String(customer?.name || '').trim();
    const phone = normalizePhone(customer?.phone || '');
    const phoneMasked = phoneDisplayValue(phone);
    const address = customerAddressText(customer);

    addIntentCandidate(candidates, {
      label: name,
      value: name,
      action: 'replace-input',
      source,
      weight: weightBase - index
    });

    if (phoneMasked) {
      addIntentCandidate(candidates, {
        label: name ? `${name} (${phoneMasked})` : phoneMasked,
        value: name || phoneMasked,
        action: 'replace-input',
        source,
        weight: weightBase - 8 - index
      });
    }

    if (address) {
      addIntentCandidate(candidates, {
        label: name ? `${name} - ${address}` : address,
        value: address,
        action: 'replace-input',
        source,
        weight: weightBase - 14 - index
      });
    }
  };

  (state.mockCustomers || []).forEach((customer, index) => {
    addCustomerSearchEntries(customer, index, 'customer', 130);
  });
  (state.mockOrders || []).forEach((order, index) => {
    addCustomerSearchEntries(order?.customerInfo || { name: order?.customerName || '' }, index, 'recent', 90);
  });
  persistedOrders().slice(0, 24).forEach((order, index) => {
    const customer = order?.customerSnapshot || order?.customerInfo || order?.customer || null;
    addCustomerSearchEntries(customer, index, 'recent', 100);
  });
  return Array.from(candidates.values());
}

function localOrderSpecialInstructionCandidates() {
  return ORDER_SPECIAL_INSTRUCTION_CHIPS.map((phrase, index) => ({
    label: phrase,
    value: phrase,
    action: 'replace-input',
    source: 'order-tag',
    weight: 200 - index
  }));
}

function localModifierInstructionCandidates(context: IntentSuggestionContext) {
  const candidates = new Map();
  const addPhrase = (phrase, source = 'recent', weight = 60) => {
    if (!looksInstructionLikePhrase(phrase)) return;
    addIntentCandidate(candidates, {
      label: phrase,
      value: phrase,
      action: 'complete-input',
      source,
      weight
    });
  };

  addPhrase(state.selectedConfig?.pizzaNotes, 'modifier', 85);
  (state.cart || []).forEach((line, index) => addPhrase(line?.specialInstruction, 'recent', 70 - index));

  if (state.idx?.optsByGroup) {
    state.idx.optsByGroup.forEach((opts) => {
      (opts || []).forEach((opt) => addPhrase(opt?.name, 'modifier', 50));
    });
  }

  if (context.fieldType === 'modifier-instructions' && context.activeItemId && state.idx?.itemMods) {
    const groupIds = state.idx.itemMods.get(context.activeItemId) || [];
    groupIds.forEach((groupId) => {
      const opts = state.idx?.optsByGroup?.get(groupId) || [];
      opts.forEach((opt, index) => addPhrase(opt?.name, 'modifier', 120 - index));
    });
  }

  return Array.from(candidates.values());
}

function filteredIntentChips(candidates, context: IntentSuggestionContext, limit = 8): IntentChip[] {
  const typedNorm = normalizeIntentText(context.typedValue);
  const queryForMatch = typedNorm || '';
  const withScores = candidates
    .map((candidate, index) => {
      const baseWeight = Number(candidate.weight || 0);
      const score = typedNorm ? scoreIntentCandidate(candidate.label, queryForMatch) : baseWeight;
      return {
        ...candidate,
        score,
        index
      };
    })
    .filter((entry) => {
      if (!typedNorm) return entry.score > 0;
      return entry.score >= 40;
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);

  return withScores.map((entry, index) => ({
    id: `${entry.source || 'intent'}_${index}_${normalizeIntentText(entry.label).replace(/\s+/g, '_').slice(0, 24)}`,
    label: entry.label,
    action: entry.action,
    value: entry.value || entry.label,
    source: entry.source
  }));
}

function getIntentChips(context: IntentSuggestionContext): IntentChip[] {
  if (!context || !context.fieldType) return [];

  if (context.fieldType === 'menu-search') {
    const candidates = localMenuIntentCandidates();
    return filteredIntentChips(candidates, context, 8);
  }

  if (context.fieldType === 'customer-search') {
    const candidates = localCustomerSearchCandidates();
    return filteredIntentChips(candidates, context, 8);
  }

  if (context.fieldType === 'special-instructions') {
    const candidates = localOrderSpecialInstructionCandidates();
    return filteredIntentChips(candidates, context, 8);
  }

  if (context.fieldType === 'modifier-instructions') {
    const candidates = localModifierInstructionCandidates(context);
    return filteredIntentChips(candidates, context, 8);
  }

  return [];
}

function disableNativeInputSuggestions(field: HTMLInputElement | HTMLTextAreaElement) {
  if (!field) return;

  if (field instanceof HTMLInputElement && field.type === 'search') {
    field.type = 'text';
  }

  field.setAttribute('autocomplete', 'new-password');
  field.setAttribute('autocorrect', 'off');
  field.setAttribute('autocapitalize', 'off');
  field.setAttribute('spellcheck', 'false');
  field.setAttribute('data-lilpos-keyboard', 'true');
  field.setAttribute('data-form-type', 'other');
  field.setAttribute('aria-autocomplete', 'none');
}

const keyboardController = (() => {
  let mode: KeyboardMode = DEFAULT_KEYBOARD_MODE;
  let activeKeyboardTarget: HTMLInputElement | HTMLTextAreaElement | null = null;
  let activeTargetLocator: {
    id: string;
    name: string;
    keyboardContext: string;
    keyboardKind: string;
  } | null = null;
  let keyboardVisible = false;
  let lastKnownSelection: { start: number; end: number } | null = null;
  let suppressFocusOutClose = false;
  let rootEl: HTMLElement | null = null;
  const MICRO_KEYBOARD_GAP = 8;
  let activeInputKind: 'text' | 'numeric' | 'decimal' | 'phone' | 'pin' = 'text';
  let activeIntentFieldType: IntentFieldType = 'generic-text';
  let activeIntentChips: IntentChip[] = [];

  function ensureRoot() {
    if (rootEl && document.body.contains(rootEl)) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'lilposCustomKeyboard';
    rootEl.className = 'custom-keyboard-root is-hidden';
    document.body.appendChild(rootEl);
    return rootEl;
  }

  function isSupportedInput(element) {
    if (!element) return false;
    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }
    if (!(element instanceof HTMLInputElement)) return false;
    if (element.disabled || element.readOnly) return false;
    const type = String(element.type || 'text').toLowerCase();
    const blocked = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
    if (blocked.has(type)) return false;
    return true;
  }

  function shouldShowCustomKeyboard() {
    return mode !== 'external';
  }

  function buildTargetLocator(target) {
    if (!target) return null;
    return {
      id: String(target.id || ''),
      name: String(target.name || ''),
      keyboardContext: String(target.getAttribute?.('data-keyboard-context') || '').toLowerCase(),
      keyboardKind: String(target.getAttribute?.('data-keyboard-kind') || target.getAttribute?.('data-keyboard') || '').toLowerCase()
    };
  }

  function findSupportedTarget(predicate) {
    const all = Array.from(document.querySelectorAll('input, textarea')) as Array<HTMLInputElement | HTMLTextAreaElement>;
    for (const candidate of all) {
      if (!isSupportedInput(candidate)) continue;
      if (predicate(candidate)) return candidate;
    }
    return null;
  }

  function resolveActiveKeyboardTarget() {
    if (activeKeyboardTarget && document.contains(activeKeyboardTarget)) return activeKeyboardTarget;
    if (!activeTargetLocator) return null;

    let nextTarget: HTMLInputElement | HTMLTextAreaElement | null = null;
    if (activeTargetLocator.id) {
      const byId = document.getElementById(activeTargetLocator.id);
      if (isSupportedInput(byId)) {
        nextTarget = byId as HTMLInputElement | HTMLTextAreaElement;
      }
    }
    if (!nextTarget && activeTargetLocator.name) {
      nextTarget = findSupportedTarget((candidate) => String(candidate.name || '') === activeTargetLocator?.name);
    }
    if (!nextTarget && activeTargetLocator.keyboardContext) {
      nextTarget = findSupportedTarget((candidate) => String(candidate.getAttribute('data-keyboard-context') || '').toLowerCase() === activeTargetLocator?.keyboardContext);
    }
    if (!nextTarget && activeTargetLocator.keyboardKind) {
      nextTarget = findSupportedTarget((candidate) => String(candidate.getAttribute('data-keyboard-kind') || candidate.getAttribute('data-keyboard') || '').toLowerCase() === activeTargetLocator?.keyboardKind);
    }

    activeKeyboardTarget = nextTarget;
    return activeKeyboardTarget;
  }

  function markInternalPointerInteraction() {
    suppressFocusOutClose = true;
  }

  function isElementInsideKeyboard(element) {
    if (!element || !(element instanceof Element)) return false;
    const root = ensureRoot();
    return root.contains(element);
  }

  function getKeyboardContextForTarget(target): KeyboardContext {
    if (!target) return 'text';

    const rawContext = String(target.getAttribute?.('data-keyboard-context') || '').toLowerCase();
    const rawKeyboardAttr = String(target.getAttribute?.('data-keyboard') || '').toLowerCase();
    const rawKeyboardKind = String(target.getAttribute?.('data-keyboard-kind') || '').toLowerCase();
    const declaredKind = rawKeyboardKind || rawKeyboardAttr;

    if (declaredKind === 'numeric' || declaredKind === 'number') return 'numeric';
    if (declaredKind === 'decimal' || declaredKind === 'money' || declaredKind === 'currency') return 'money';
    if (declaredKind === 'phone' || declaredKind === 'tel') return 'phone';
    if (declaredKind === 'text') return 'text';

    if (target instanceof HTMLInputElement) {
      const type = String(target.type || '').toLowerCase();
      const inputMode = String(target.inputMode || target.getAttribute('inputmode') || '').toLowerCase();

      if (type === 'number' || inputMode === 'numeric') return 'numeric';
      if (inputMode === 'decimal') return 'money';
      if (type === 'tel' || inputMode === 'tel') return 'phone';
    }

    const idNameBlob = `${target.id || ''} ${target.name || ''} ${target.className || ''} ${target.placeholder || ''}`.toLowerCase();
    if (/price|amount|tip|payment|currency|cash|total/.test(idNameBlob)) return 'money';
    if (/zip|qty|quantity|count|modifiercount|stockdays/.test(idNameBlob)) return 'numeric';
    if (/phone|mobile|tel/.test(idNameBlob) || rawContext === 'customer-profile-phone') return 'phone';

    if (rawContext === 'numeric') return 'numeric';
    if (rawContext === 'money' || rawContext === 'decimal') return 'money';
    if (rawContext === 'phone') return 'phone';

    return 'text';
  }

  function getKeyboardInputKind(target): 'text' | 'numeric' | 'decimal' | 'phone' | 'pin' {
    if (!target) return 'text';
    if (target instanceof HTMLInputElement) {
      const type = String(target.type || '').toLowerCase();
      const idNameBlob = `${target.id || ''} ${target.name || ''} ${target.className || ''} ${target.placeholder || ''}`.toLowerCase();
      if (type === 'password' && /pin/.test(idNameBlob)) return 'pin';
      if (String(target.getAttribute('data-keyboard-kind') || target.getAttribute('data-keyboard') || '').toLowerCase() === 'pin') return 'pin';
    }

    const context = getKeyboardContextForTarget(target);
    if (context === 'money') return 'decimal';
    if (context === 'phone') return 'phone';
    if (context === 'numeric') return 'numeric';
    return 'text';
  }

  function activeIntentContextForTarget(target): IntentSuggestionContext {
    return {
      fieldType: intentFieldTypeForInput(target),
      typedValue: String(target?.value || ''),
      orderType: state.orderType,
      activeCategoryId: state.category,
      activeItemId: state.selected?.id || null,
      activeCustomerId: state.activeCustomer?.id || null
    };
  }

  function refreshIntentChips() {
    const target = resolveActiveKeyboardTarget();
    if (!target || activeInputKind !== 'text') {
      activeIntentChips = [];
      return;
    }
    const context = activeIntentContextForTarget(target);
    activeIntentFieldType = context.fieldType;
    activeIntentChips = getIntentChips(context);
  }

  function keyboardRowHtml(keys, rowClass = 'kbd-row') {
    return `
      <div class="${rowClass}">
        ${keys.map((key) => {
          const label = h(String(key.label || ''));
          const keyValue = h(String(key.value || ''));
          const action = key.action ? ` data-kbd-action="${h(String(key.action))}"` : '';
          const sizeClass = key.sizeClass ? ` ${h(String(key.sizeClass))}` : '';
          return `<button type="button" class="kbd-key${sizeClass}" data-kbd-key="${keyValue}"${action}>${label}</button>`;
        }).join('')}
      </div>
    `;
  }

  function microKeyboardRowsHtml() {
    return `
      <div class="micro-keyboard-rows" aria-hidden="true">
        ${keyboardRowHtml([
          { label: '1', value: '1' },
          { label: '2', value: '2' },
          { label: '3', value: '3' },
          { label: '4', value: '4' },
          { label: '5', value: '5' },
          { label: '6', value: '6' },
          { label: '7', value: '7' },
          { label: '8', value: '8' },
          { label: '9', value: '9' },
          { label: '0', value: '0' }
        ], 'micro-keyboard-row micro-keyboard-row-10')}
        ${keyboardRowHtml([
          { label: 'Q', value: 'q' },
          { label: 'W', value: 'w' },
          { label: 'E', value: 'e' },
          { label: 'R', value: 'r' },
          { label: 'T', value: 't' },
          { label: 'Y', value: 'y' },
          { label: 'U', value: 'u' },
          { label: 'I', value: 'i' },
          { label: 'O', value: 'o' },
          { label: 'P', value: 'p' }
        ], 'micro-keyboard-row micro-keyboard-row-10')}
        ${keyboardRowHtml([
          { label: 'A', value: 'a' },
          { label: 'S', value: 's' },
          { label: 'D', value: 'd' },
          { label: 'F', value: 'f' },
          { label: 'G', value: 'g' },
          { label: 'H', value: 'h' },
          { label: 'J', value: 'j' },
          { label: 'K', value: 'k' },
          { label: 'L', value: 'l' }
        ], 'micro-keyboard-row micro-keyboard-row-9')}
        ${keyboardRowHtml([
          { label: 'Z', value: 'z' },
          { label: 'X', value: 'x' },
          { label: 'C', value: 'c' },
          { label: 'V', value: 'v' },
          { label: 'B', value: 'b' },
          { label: 'N', value: 'n' },
          { label: 'M', value: 'm' }
        ], 'micro-keyboard-row micro-keyboard-row-7')}
        ${keyboardRowHtml([
          { label: 'Clear', value: 'clear', action: 'clear', sizeClass: 'micro-keyboard-action-key' },
          { label: 'Space', value: ' ', action: 'space', sizeClass: 'micro-keyboard-action-key' },
          { label: 'Backspace', value: 'backspace', action: 'backspace', sizeClass: 'micro-keyboard-action-key' }
        ], 'micro-keyboard-actions')}
      </div>
    `;
  }

  function keyboardRowsHtml() {
    return microKeyboardRowsHtml();
  }

  function keyboardIntentRailHtml(kind: 'text' | 'numeric' | 'decimal' | 'phone' | 'pin') {
    const chips = kind === 'text' ? activeIntentChips : [];
    return `
      <div class="micro-keyboard-intent-rail" aria-label="Keyboard intent chips">
        ${chips.map((chip) => `<button type="button" class="micro-keyboard-intent-chip" data-intent-chip-id="${h(chip.id)}" title="${h(chip.label)}">${h(chip.label)}</button>`).join('')}
      </div>
    `;
  }

  function numericKeyboardGridHtml(kind: 'numeric' | 'decimal' | 'phone' | 'pin') {
    const rows = [
      [
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' }
      ],
      [
        { label: '4', value: '4' },
        { label: '5', value: '5' },
        { label: '6', value: '6' }
      ],
      [
        { label: '7', value: '7' },
        { label: '8', value: '8' },
        { label: '9', value: '9' }
      ]
    ];
    const bottomRow = [
      { label: 'Clear', value: 'clear', action: 'clear', sizeClass: 'micro-keyboard-numeric-action' },
      { label: '0', value: '0' },
      { label: 'Backspace', value: 'backspace', action: 'backspace', sizeClass: 'micro-keyboard-numeric-action' }
    ];

    return `
      <div class="micro-keyboard-numeric-grid" aria-hidden="true">
        ${rows.map((row) => keyboardRowHtml(row, 'micro-keyboard-numeric-row')).join('')}
        ${keyboardRowHtml(bottomRow, 'micro-keyboard-numeric-row')}
        ${kind === 'decimal'
          ? keyboardRowHtml([
              { label: '.', value: '.', action: 'decimal', sizeClass: 'micro-keyboard-numeric-action micro-keyboard-numeric-backspace' }
            ], 'micro-keyboard-numeric-row micro-keyboard-numeric-row-1')
          : ''}
      </div>
    `;
  }

  function numericMicroKeyboardHtml(kind: 'numeric' | 'decimal' | 'phone' | 'pin') {
    return `
      <div class="kbd-micro-shell micro-keyboard micro-keyboard--numeric">
        <div class="kbd-head micro-keyboard-header">
          ${keyboardIntentRailHtml(kind)}
          <button type="button" class="kbd-close micro-keyboard-done" data-kbd-done="1">Done</button>
        </div>
        ${numericKeyboardGridHtml(kind)}
      </div>
    `;
  }

  function microKeyboardHtml() {
    return `
      <div class="kbd-micro-shell micro-keyboard">
        <div class="kbd-head micro-keyboard-header">
          ${keyboardIntentRailHtml('text')}
          <button type="button" class="kbd-close micro-keyboard-done" data-kbd-done="1">Done</button>
        </div>
        ${microKeyboardRowsHtml()}
      </div>
    `;
  }

  function refreshIntentRailDom() {
    if (mode !== 'micro' || activeInputKind !== 'text') return;
    const root = ensureRoot();
    const rail = root.querySelector('.micro-keyboard-intent-rail');
    if (!rail) return;
    rail.innerHTML = activeIntentChips
      .map((chip) => `<button type="button" class="micro-keyboard-intent-chip" data-intent-chip-id="${h(chip.id)}" title="${h(chip.label)}">${h(chip.label)}</button>`)
      .join('');
  }

  function compactFooterKeyboardHtml() {
    return `
      <div class="kbd-footer-shell">
        <div class="kbd-head">
          <b>Compact Footer Keyboard</b>
          <button type="button" class="kbd-close" data-kbd-done="1">Done</button>
        </div>
        ${keyboardRowsHtml()}
      </div>
    `;
  }

  function standardQwertyKeyboardHtml() {
    return `
      <div class="kbd-standard-overlay">
        <div class="kbd-standard-shell">
          <div class="kbd-head">
            <b>Standard QWERTY Keyboard</b>
            <button type="button" class="kbd-close" data-kbd-done="1">Close</button>
          </div>
          ${keyboardRowsHtml()}
        </div>
      </div>
    `;
  }

  function positionMicroKeyboard(inputElement) {
    const root = ensureRoot();
    const shell = root.querySelector('.kbd-micro-shell') as HTMLElement | null;
    if (!shell) return;
    const rect = inputElement.getBoundingClientRect();
    const kind = activeInputKind;
    const desiredWidth = kind === 'text' ? 600 : 260;
    const minWidth = kind === 'text' ? 300 : 220;
    const maxWidth = Math.min(desiredWidth, Math.max(minWidth, window.innerWidth - 24));
    shell.style.width = `${maxWidth}px`;
    const keyboardWidth = shell.offsetWidth || maxWidth;
    const keyboardHeight = shell.offsetHeight || 0;
    const left = Math.min(
      Math.max(MICRO_KEYBOARD_GAP, rect.left),
      window.innerWidth - keyboardWidth - MICRO_KEYBOARD_GAP
    );
    const preferredTop = rect.bottom + MICRO_KEYBOARD_GAP;
    const forceAbove = (inputElement as HTMLElement)?.dataset?.keyboardPlacement === 'above';
    const preferredAboveTop = Math.max(MICRO_KEYBOARD_GAP, rect.top - keyboardHeight - MICRO_KEYBOARD_GAP);
    const fitsBelow = preferredTop + keyboardHeight <= window.innerHeight - MICRO_KEYBOARD_GAP;
    const fitsAbove = rect.top - keyboardHeight - MICRO_KEYBOARD_GAP >= MICRO_KEYBOARD_GAP;
    let top: number;
    if (forceAbove) {
      top = fitsAbove ? preferredAboveTop : preferredTop;
    } else {
      top = fitsBelow ? preferredTop : preferredAboveTop;
    }
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
  }

  function dispatchKeyboardInput(target) {
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function dispatchKeyboardChange(target) {
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setTargetSelection(target, start, end = start) {
    if (typeof target.setSelectionRange !== 'function') return;
    const nextStart = Math.max(0, start);
    const nextEnd = Math.max(nextStart, end);
    target.setSelectionRange(nextStart, nextEnd);
    lastKnownSelection = { start: nextStart, end: nextEnd };
  }

  function normalizeSelection(target) {
    const value = String(target.value || '');
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : value.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    lastKnownSelection = { start, end };
    return { value, start, end };
  }

  function rememberSelectionForTarget(target) {
    if (!target) return;
    const value = String(target.value || '');
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : value.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    lastKnownSelection = { start, end };
  }

  function restoreSelectionForTarget(target) {
    if (!target || !lastKnownSelection) return;
    setTargetSelection(target, lastKnownSelection.start, lastKnownSelection.end);
  }

  function focusKeyboardTarget() {
    const target = resolveActiveKeyboardTarget();
    if (!target || !document.contains(target)) return null;
    target.focus({ preventScroll: true });
    restoreSelectionForTarget(target);
    return target;
  }

  function insertTextIntoKeyboardTarget(text) {
    const target = focusKeyboardTarget();
    if (!target) return;
    const { value, start, end } = normalizeSelection(target);
    target.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const nextCaret = start + text.length;
    setTargetSelection(target, nextCaret);
    dispatchKeyboardInput(target);
  }

  function backspaceKeyboardTarget() {
    const target = focusKeyboardTarget();
    if (!target) return;
    const { value, start, end } = normalizeSelection(target);
    if (start === 0 && end === 0) return;
    if (start !== end) {
      target.value = `${value.slice(0, start)}${value.slice(end)}`;
      setTargetSelection(target, start);
      dispatchKeyboardInput(target);
      return;
    }
    target.value = `${value.slice(0, Math.max(0, start - 1))}${value.slice(end)}`;
    setTargetSelection(target, Math.max(0, start - 1));
    dispatchKeyboardInput(target);
  }

  function clearKeyboardTarget() {
    const target = focusKeyboardTarget();
    if (!target) return;
    target.value = '';
    setTargetSelection(target, 0);
    dispatchKeyboardInput(target);
    dispatchKeyboardChange(target);
  }

  function applyIntentChipToTarget(chip: IntentChip) {
    const target = focusKeyboardTarget();
    if (!target) return;
    const currentValue = String(target.value || '');
    const nextText = String(chip.value || chip.label || '').trim();
    if (!nextText) return;

    if (chip.action === 'replace-input') {
      target.value = nextText;
      setTargetSelection(target, nextText.length);
      dispatchKeyboardInput(target);
      refreshIntentChips();
      refreshIntentRailDom();
      return;
    }

    if (chip.action === 'toggle-order-tag') {
      const currentNorm = normalizeIntentText(currentValue);
      const nextNorm = normalizeIntentText(nextText);
      if (currentNorm.includes(nextNorm)) {
        const nextValue = currentValue.replace(new RegExp(nextText, 'ig'), '').replace(/\s+/g, ' ').trim();
        target.value = nextValue;
        setTargetSelection(target, nextValue.length);
      } else {
        const nextValue = `${currentValue.trim()}${currentValue.trim() ? ' ' : ''}${nextText}`;
        target.value = nextValue;
        setTargetSelection(target, nextValue.length);
      }
      dispatchKeyboardInput(target);
      refreshIntentChips();
      refreshIntentRailDom();
      return;
    }

    const { value, start, end } = normalizeSelection(target);
    if (chip.action === 'append-text') {
      const left = value.slice(0, start).trimEnd();
      const right = value.slice(end).trimStart();
      const nextValue = `${left}${left ? ' ' : ''}${nextText}${right ? ` ${right}` : ''}`.trim();
      target.value = nextValue;
      setTargetSelection(target, nextValue.length);
      dispatchKeyboardInput(target);
      refreshIntentChips();
      refreshIntentRailDom();
      return;
    }

    const tokenStart = (() => {
      let idx = start;
      while (idx > 0 && !/\s/.test(value[idx - 1])) idx -= 1;
      return idx;
    })();
    const tokenEnd = (() => {
      let idx = end;
      while (idx < value.length && !/\s/.test(value[idx])) idx += 1;
      return idx;
    })();
    const nextValue = `${value.slice(0, tokenStart)}${nextText}${value.slice(tokenEnd)}`;
    target.value = nextValue;
    setTargetSelection(target, tokenStart + nextText.length);
    dispatchKeyboardInput(target);
    refreshIntentChips();
    refreshIntentRailDom();
  }

  function handleIntentChipSelection(chipId) {
    if (!chipId || activeInputKind !== 'text') return;
    const chip = activeIntentChips.find((entry) => entry.id === chipId);
    if (!chip) return;
    applyIntentChipToTarget(chip);
  }

  function stabilizeMicroKeyboardAfterEdit() {
    if (mode !== 'micro' || !keyboardVisible) return;
    const target = resolveActiveKeyboardTarget();
    if (!target) {
      hideKeyboard();
      return;
    }
    // Preserve caret across render-sync so typed characters continue left-to-right.
    showKeyboardForInput(target, { source: 'keyboard-edit', skipRememberSelection: true });
    positionMicroKeyboard(target);
    restoreSelectionForTarget(target);
  }

  function handleMicroKeyboardAction(action, keyValue) {
    if (action === 'done') {
      hideKeyboard();
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') active.blur();
      return;
    }
    if (action === 'backspace') {
      backspaceKeyboardTarget();
      refreshIntentChips();
      refreshIntentRailDom();
      stabilizeMicroKeyboardAfterEdit();
      return;
    }
    if (action === 'clear') {
      clearKeyboardTarget();
      refreshIntentChips();
      refreshIntentRailDom();
      stabilizeMicroKeyboardAfterEdit();
      return;
    }
    if (action === 'space') {
      insertTextIntoKeyboardTarget(' ');
      refreshIntentChips();
      refreshIntentRailDom();
      stabilizeMicroKeyboardAfterEdit();
      return;
    }
    if (action === 'decimal') {
      const target = focusKeyboardTarget();
      if (!target) return;
      if (activeInputKind !== 'decimal') return;
      const value = String(target.value || '');
      if (value.includes('.')) return;
      insertTextIntoKeyboardTarget('.');
      refreshIntentChips();
      refreshIntentRailDom();
      stabilizeMicroKeyboardAfterEdit();
      return;
    }
    insertTextIntoKeyboardTarget(keyValue);
    refreshIntentChips();
    refreshIntentRailDom();
    stabilizeMicroKeyboardAfterEdit();
  }

  function showKeyboardForInput(inputElement, _context: any = {}) {
    if (!inputElement || !isSupportedInput(inputElement)) {
      hideKeyboard();
      return;
    }
    disableNativeInputSuggestions(inputElement);
    activeKeyboardTarget = inputElement;
    activeTargetLocator = buildTargetLocator(inputElement);
    if (!_context.skipRememberSelection) {
      rememberSelectionForTarget(inputElement);
    }
    activeInputKind = getKeyboardInputKind(inputElement);
    activeIntentFieldType = activeInputKind === 'text' ? intentFieldTypeForInput(inputElement) : 'generic-text';
    refreshIntentChips();
    if (!shouldShowCustomKeyboard()) {
      hideKeyboard();
      return;
    }

    const root = ensureRoot();
    keyboardVisible = true;
    root.className = `custom-keyboard-root mode-${mode}`;
    if (mode === 'micro') {
      root.innerHTML = activeInputKind === 'text'
        ? microKeyboardHtml()
        : numericMicroKeyboardHtml(activeInputKind);
      positionMicroKeyboard(inputElement);
      return;
    }
    if (mode === 'compact-footer') {
      root.innerHTML = compactFooterKeyboardHtml();
      return;
    }
    root.innerHTML = standardQwertyKeyboardHtml();
  }

  function hideKeyboard() {
    const root = ensureRoot();
    keyboardVisible = false;
    root.className = `custom-keyboard-root is-hidden mode-${mode}`;
    root.innerHTML = '';
    activeInputKind = 'text';
    activeIntentFieldType = 'generic-text';
    activeIntentChips = [];
  }

  function closeKeyboardFromDone() {
    // Ensure focus-out reconciliation does not immediately reopen after Done.
    suppressFocusOutClose = false;
    hideKeyboard();
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === 'function') active.blur();
  }

  function getKeyboardMode() {
    return mode;
  }

  function setKeyboardMode(nextMode, options: any = {}) {
    mode = normalizeKeyboardMode(nextMode);
    state.keyboardMode = mode;
    if (options.persist !== false) persistManagerSettings();

    if (!shouldShowCustomKeyboard()) {
      hideKeyboard();
      return;
    }
    const target = resolveActiveKeyboardTarget();
    if (target && document.contains(target)) {
      showKeyboardForInput(target, { source: 'mode-change' });
    } else {
      hideKeyboard();
    }
  }

  function getActiveInput() {
    return resolveActiveKeyboardTarget();
  }

  function syncKeyboardAfterRender() {
    if (!keyboardVisible) return;
    if (!shouldShowCustomKeyboard()) {
      hideKeyboard();
      return;
    }
    const target = resolveActiveKeyboardTarget();
    if (!target) {
      hideKeyboard();
      return;
    }
    showKeyboardForInput(target, { source: 'render-sync', skipRememberSelection: true });
  }

  function shouldKeepKeyboardOpenOnFocusOut(nextElement) {
    if (isElementInsideKeyboard(nextElement)) {
      suppressFocusOutClose = false;
      return true;
    }
    if (!suppressFocusOutClose) return false;
    suppressFocusOutClose = false;
    return true;
  }

  return {
    getKeyboardMode,
    setKeyboardMode,
    shouldShowCustomKeyboard,
    showKeyboardForInput,
    hideKeyboard,
    closeKeyboardFromDone,
    isSupportedInput,
    getActiveInput,
    positionMicroKeyboard,
    handleMicroKeyboardAction,
    handleIntentChipSelection,
    refreshIntentChips,
    getActiveInputKind: () => activeInputKind,
    getActiveIntentFieldType: () => activeIntentFieldType,
    syncKeyboardAfterRender,
    isElementInsideKeyboard,
    markInternalPointerInteraction,
    shouldKeepKeyboardOpenOnFocusOut
  };
})();

let keyboardLifecycleInstalled = false;

function installKeyboardLifecycleEvents() {
  if (keyboardLifecycleInstalled) return;
  keyboardLifecycleInstalled = true;

  document.addEventListener('focusin', (event) => {
    const target = event.target as Element;
    if (!keyboardController.isSupportedInput(target)) return;
    keyboardController.showKeyboardForInput(target as HTMLInputElement | HTMLTextAreaElement, { source: 'focusin' });
  });

  document.addEventListener('focusout', (event) => {
    const target = event.target as Element;
    if (!keyboardController.isSupportedInput(target)) return;
    const nextFromEvent = event.relatedTarget as Element | null;
    window.setTimeout(() => {
      const nextActive = document.activeElement as Element | null;
      if (keyboardController.shouldKeepKeyboardOpenOnFocusOut(nextFromEvent) || keyboardController.shouldKeepKeyboardOpenOnFocusOut(nextActive)) {
        const active = keyboardController.getActiveInput();
        if (active && document.contains(active)) {
          keyboardController.showKeyboardForInput(active, { source: 'keyboard-internal-focus-shift' });
          return;
        }
      }
      if (keyboardController.isSupportedInput(nextActive)) {
        keyboardController.showKeyboardForInput(nextActive as HTMLInputElement | HTMLTextAreaElement, { source: 'focus-shift' });
        return;
      }
      keyboardController.hideKeyboard();
    }, 0);
  });

  document.addEventListener('click', (event) => {
    const el = event.target as Element;
    if (!el) return;
    if (!el.closest('[data-kbd-done]')) return;
    keyboardController.closeKeyboardFromDone();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    keyboardController.hideKeyboard();
  });

  document.addEventListener('pointerdown', (event) => {
    const el = event.target as Element;
    if (!el) return;
    if (!keyboardController.isElementInsideKeyboard(el)) return;
    if (el.closest('[data-kbd-done]')) {
      keyboardController.closeKeyboardFromDone();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    keyboardController.markInternalPointerInteraction();
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('mousedown', (event) => {
    const el = event.target as Element;
    if (!el) return;
    if (!keyboardController.isElementInsideKeyboard(el)) return;
    keyboardController.markInternalPointerInteraction();
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('click', (event) => {
    const el = event.target as Element;
    const key = el?.closest('.kbd-key') as HTMLElement | null;
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    const keyValue = key.dataset.kbdKey || '';
    const action = key.dataset.kbdAction || '';
    keyboardController.handleMicroKeyboardAction(action, keyValue);
  });

  document.addEventListener('click', (event) => {
    const el = event.target as Element;
    const chip = el?.closest('.micro-keyboard-intent-chip') as HTMLElement | null;
    if (!chip) return;
    event.preventDefault();
    event.stopPropagation();
    keyboardController.handleIntentChipSelection(chip.dataset.intentChipId || '');
  });

  document.addEventListener('input', (event) => {
    const target = event.target as Element;
    if (!keyboardController.isSupportedInput(target)) return;
    if (keyboardController.getKeyboardMode() !== 'micro') return;
    if (keyboardController.getActiveInputKind() !== 'text') return;
    if (keyboardController.getActiveInput() !== target) return;
    keyboardController.showKeyboardForInput(target as HTMLInputElement | HTMLTextAreaElement, { source: 'input-change' });
  });

  document.addEventListener('click', (event) => {
    const el = event.target as Element;
    if (!el) return;
    if (!el.closest('[data-order-type],[data-cat],[data-item],[data-pizza-nav],[data-pizza-filter],[data-pizza-prep-group],[data-mod-group],[data-pre-group]')) return;
    window.setTimeout(() => {
      const focused = document.activeElement as Element | null;
      if (!keyboardController.isSupportedInput(focused)) return;
      if (keyboardController.getKeyboardMode() !== 'micro') return;
      if (keyboardController.getActiveInputKind() !== 'text') return;
      keyboardController.showKeyboardForInput(focused as HTMLInputElement | HTMLTextAreaElement, { source: 'context-change' });
    }, 0);
  });

  window.addEventListener('resize', () => {
    const activeInput = keyboardController.getActiveInput();
    if (!activeInput) return;
    if (keyboardController.getKeyboardMode() !== 'micro') return;
    keyboardController.positionMicroKeyboard(activeInput);
  });

  window.addEventListener('scroll', () => {
    const activeInput = keyboardController.getActiveInput();
    if (!activeInput) return;
    if (keyboardController.getKeyboardMode() !== 'micro') return;
    keyboardController.positionMicroKeyboard(activeInput);
  }, true);
}

function baseMockCustomers() {
  return [
    {
      id: 'cust_001',
      name: 'Maria Rossi',
      phone: '(201) 555-1201',
      address1: '114 Hudson Ave',
      city: 'Bayonne',
      state: 'NJ',
      zip: '07002',
      allergies: 'Tree nuts',
      specialInstructions: 'Extra crispy pie, ring bell once'
    },
    {
      id: 'cust_002',
      name: 'Tony Greco',
      phone: '(551) 555-8722',
      address1: '',
      city: '',
      state: '',
      zip: '',
      allergies: '',
      specialInstructions: ''
    },
    {
      id: 'cust_003',
      name: 'Nina Santiago',
      phone: '(732) 555-6671',
      address1: '62 River Rd',
      city: 'Hoboken',
      state: 'NJ',
      zip: '07030',
      allergies: '',
      specialInstructions: 'Please include paper plates'
    },
    {
      id: 'cust_004',
      name: 'Frank DeLuca',
      phone: '(908) 555-9300',
      address1: '201 Market St',
      city: 'Elizabeth',
      state: 'NJ',
      zip: '07201',
      allergies: 'Gluten sensitivity',
      specialInstructions: ''
    }
  ];
}

state.mockCustomers = baseMockCustomers();

function baseMockOrders() {
  return [
    {
      id: 'ord_1001',
      number: '1001',
      customerName: 'Maria Rossi',
      orderType: 'delivery',
      status: 'open',
      source: 'phone',
      onlineOnly: false,
      timeLabel: '6:12 PM',
      total: 32.45,
      lines: ['Large Pepperoni', 'Garlic Knots', 'Soda']
    },
    {
      id: 'ord_1002',
      number: '1002',
      customerName: 'Guest',
      orderType: 'pickup',
      status: 'open',
      source: 'counter',
      onlineOnly: false,
      timeLabel: '6:25 PM',
      total: 18.0,
      lines: ['2 Slices', 'Bottle Water']
    },
    {
      id: 'ord_0998',
      number: '0998',
      customerName: 'Nina Santiago',
      orderType: 'delivery',
      status: 'completed',
      source: 'online',
      onlineOnly: true,
      timeLabel: '5:02 PM',
      total: 41.7,
      lines: ['Family Pie', 'Garden Salad']
    },
    {
      id: 'ord_0996',
      number: '0996',
      customerName: 'Tony Greco',
      orderType: 'togo',
      status: 'completed',
      source: 'counter',
      onlineOnly: false,
      timeLabel: '4:48 PM',
      total: 14.5,
      lines: ['Calzone']
    },
    {
      id: 'ord_1011',
      number: '1011',
      customerName: 'Web Guest',
      orderType: 'pickup',
      status: 'open',
      source: 'online',
      onlineOnly: true,
      timeLabel: '6:41 PM',
      total: 22.95,
      lines: ['Small Veggie', 'Breadsticks']
    }
  ];
}

state.mockOrders = baseMockOrders();

function normalizePhone(value: string) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10);
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);

  if (!digits) return '';

  if (digits.length <= 3) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function phoneDisplayValue(value: string) {
  const digits = normalizePhone(value || '');
  return digits ? formatPhone(digits) : '';
}

function countDigitsBeforeIndex(value: string, index: number) {
  const safeValue = String(value || '');
  const safeIndex = Math.max(0, Math.min(index, safeValue.length));
  let count = 0;
  for (let i = 0; i < safeIndex; i += 1) {
    if (/\d/.test(safeValue[i])) count += 1;
  }
  return count;
}

function caretIndexForDigitCount(formatted: string, digitCount: number) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen >= digitCount) return i + 1;
    }
  }
  return formatted.length;
}

function syncPhoneInputMask(input: HTMLInputElement) {
  const current = String(input.value || '');
  const caret = typeof input.selectionStart === 'number' ? input.selectionStart : current.length;
  const digitsBeforeCaret = countDigitsBeforeIndex(current, caret);
  const digits = normalizePhone(current);
  const formatted = formatPhone(digits);
  input.value = formatted;
  const nextCaret = caretIndexForDigitCount(formatted, digitsBeforeCaret);
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(nextCaret, nextCaret);
  }
  return digits;
}

function customerAddressText(customer) {
  return [customer?.address1, customer?.city, customer?.state, customer?.zip].filter(Boolean).join(', ');
}

function findKnownCustomerByPhone(phone) {
  return lilposDataService.lookupCustomerByPhone(phone);
}

function applyCustomerSummary(customer) {
  const normalizedPhone = normalizePhone(customer?.phone || '');
  state.activeCustomer = customer ? { ...customer, phone: normalizedPhone } : customer;
  state.customerPanelMode = 'compact';
  state.customerName = customer?.name || '';
  state.customerPhone = normalizedPhone;
  const notes = [customer?.allergies ? `Allergies: ${customer.allergies}` : '', customer?.specialInstructions ? `Instructions: ${customer.specialInstructions}` : ''].filter(Boolean).join(' | ');
  state.customerNotes = notes;
}

function deliveryAddressText(customerLike) {
  return String(customerLike?.address1 || '').trim();
}

function hasDeliveryProfile(customerLike) {
  if (!customerLike) return false;
  return !!String(customerLike.name || '').trim()
    && !!normalizePhone(customerLike.phone)
    && !!deliveryAddressText(customerLike);
}

function profileDraftFromCustomer(customer) {
  return {
    name: customer?.name || '',
    phone: normalizePhone(customer?.phone || ''),
    address1: customer?.address1 || '',
    city: customer?.city || '',
    state: customer?.state || '',
    zip: customer?.zip || '',
    allergies: customer?.allergies || '',
    specialInstructions: customer?.specialInstructions || ''
  };
}

function customerHasSnapshotData(customer) {
  if (!customer || typeof customer !== 'object') return false;
  return !!(
    String(customer.name || '').trim()
    || normalizePhone(customer.phone)
    || String(customer.address1 || '').trim()
    || String(customer.city || '').trim()
    || String(customer.state || '').trim()
    || String(customer.zip || '').trim()
    || String(customer.allergies || '').trim()
    || String(customer.specialInstructions || '').trim()
    || String(customer.notes || '').trim()
  );
}

function findCustomerById(customerId) {
  if (!customerId) return null;
  return (state.mockCustomers || []).find((customer) => customer.id === customerId) || null;
}

function resolveOrderCustomerSnapshot(order) {
  const embedded = order?.customerSnapshot || order?.customerInfo || order?.customer || null;
  if (customerHasSnapshotData(embedded)) {
    return { ...embedded };
  }

  const customerId = embedded?.id || order?.customerId || order?.customerRefId || null;
  const tableCustomer = findCustomerById(customerId);
  if (tableCustomer) {
    return { ...tableCustomer };
  }

  return embedded ? { ...embedded } : {};
}

function currentCustomerLike() {
  return state.activeCustomer || state.customerDraft || null;
}

function openCustomerEditor() {
  if (!state.activeCustomer) return;
  state.customerEditorMode = 'edit';
  state.customerDraft = profileDraftFromCustomer(state.activeCustomer);
  state.customerPanelMode = 'entry';
  render();
}

function openDeliveryProfileDialog() {
  const source = currentCustomerLike();
  state.deliveryProfileDialog = {
    open: true,
    draft: profileDraftFromCustomer(source)
  };
}

function closeDeliveryProfileDialog(markMissing) {
  state.deliveryProfileDialog.open = false;
  if (markMissing) state.deliveryInfoMissing = true;
}

async function upsertCustomerProfileDraft(draft) {
  const normalizedPhone = normalizePhone(draft.phone || '');
  const existing = findKnownCustomerByPhone(normalizedPhone);
  const customer = {
    id: existing?.id || `cust_${Date.now()}`,
    name: draft.name || 'Walk-in Caller',
    phone: normalizedPhone,
    address1: draft.address1,
    city: draft.city,
    state: draft.state,
    zip: draft.zip,
    allergies: draft.allergies,
    specialInstructions: draft.specialInstructions
  };

  const persisted = lilposDataService.upsertCustomer(customer) || customer;
  state.mockCustomers = lilposDataService.getCustomers();
  applyCustomerSummary(persisted);
  state.deliveryInfoMissing = false;

  if (state.menu) {
    try {
      await persistMenuLocal();
    } catch (err) {
      console.error('Failed to persist customer update:', err);
    }
  }

  return persisted;
}

function parseCurrencyInput(value) {
  return parseImpliedDecimalCurrencyInput(value);
}

function tipTotalForDialog(dialog) {
  const base = Number(dialog.baseTotal || 0);
  if (dialog.tipMode === 'p10') return +(base * 0.10).toFixed(2);
  if (dialog.tipMode === 'p15') return +(base * 0.15).toFixed(2);
  if (dialog.tipMode === 'p20') return +(base * 0.20).toFixed(2);
  if (dialog.tipMode === 'custom') return parseCurrencyInput(dialog.customTip);
  return 0;
}

function paymentTotals(dialog = state.paymentDialog) {
  const baseTotal = +(Number(dialog.baseTotal || 0)).toFixed(2);
  const tipTotal = tipTotalForDialog(dialog);
  const amountDue = +(baseTotal + tipTotal).toFixed(2);
  const amountPaid = +(dialog.paymentLines.reduce((sum, line) => sum + Number(line.amount || 0) + Number(line.tipAmount || 0), 0)).toFixed(2);
  const remaining = +Math.max(0, amountDue - amountPaid).toFixed(2);
  const change = +Math.max(0, amountPaid - amountDue).toFixed(2);
  const hasCash = dialog.paymentLines.some((line) => line.paymentType === 'Cash');
  return {
    baseTotal,
    tipTotal,
    amountDue,
    amountPaid,
    remaining,
    change,
    changeDue: hasCash ? change : 0
  };
}

function getPayNowValidation() {
  const issues = [];
  const customer = currentCustomerLike() || {};
  if (!Array.isArray(state.cart) || state.cart.length === 0) {
    issues.push({ key: 'items', label: 'Add at least one ticket item.' });
  }
  if (!String(state.orderType || '').trim()) {
    issues.push({ key: 'orderType', label: 'Select an order type.' });
  }

  if (state.orderType === 'delivery') {
    if (!String(customer.name || '').trim()) issues.push({ key: 'name', label: 'Customer name is required for Delivery.' });
    if (!normalizePhone(customer.phone)) issues.push({ key: 'phone', label: 'Phone is required for Delivery.' });
    if (!deliveryAddressText(customer)) issues.push({ key: 'address1', label: 'Address is required for Delivery.' });
  }

  if (state.orderType === 'togo' || state.orderType === 'tostay' || state.orderType === 'dinein') {
    // To-Go, To-Stay, Dine-In: no customer fields required
  }

  if (state.timingType === 'future' && !state.futureDateTime) {
    issues.push({ key: 'futureDateTime', label: 'Future orders require a date and time.' });
  }

  return { ok: issues.length === 0, issues };
}

function getPayLaterValidation() {
  return getPayNowValidation();
}

function closeOrderNumberDialog() {
  state.orderNumberDialog.open = false;
  state.orderNumberDialog.orderNumber = '';
  state.orderNumberDialog.orderId = null;
}

function openOrderNumberDialog(orderNumber, orderId) {
  state.orderNumberDialog.open = true;
  state.orderNumberDialog.orderNumber = orderNumber || '';
  state.orderNumberDialog.orderId = orderId || null;
}

async function printOrderNumberReceipt(kind) {
  const order = await hydratePersistedOrderDetail(state.orderNumberDialog.orderId);
  if (!order) {
    alert('Order data is no longer available in local history.');
    return;
  }
  const payload = {
    kind,
    orderNumber: order.orderNumber,
    stationNumber: order.stationNumber,
    businessDate: order.businessDate,
    total: order.total,
    customer: order.customer,
    lines: order.lines,
    rawSnapshot: order.rawSnapshot || order.payloadSnapshot || null
  };
  alert(JSON.stringify(payload, null, 2).slice(0, 4000));
}

function buildMissingInfoDraft() {
  const customer = currentCustomerLike() || {};
  const futureDate = state.futureDateTime ? new Date(state.futureDateTime) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const baseParts = nowLocalParts();
  const dateValue = futureDate && !Number.isNaN(futureDate.getTime())
    ? `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`
    : baseParts.date;
  const timeValue = futureDate && !Number.isNaN(futureDate.getTime())
    ? `${pad(futureDate.getHours())}:${pad(futureDate.getMinutes())}`
    : baseParts.time;

  return {
    name: customer.name || '',
    phone: normalizePhone(customer.phone || ''),
    address1: customer.address1 || '',
    city: customer.city || '',
    state: customer.state || '',
    zip: customer.zip || '',
    allergies: customer.allergies || '',
    specialInstructions: customer.specialInstructions || '',
    futureDate: dateValue,
    futureTime: timeValue
  };
}

function openPayNowMissingDialog(issues) {
  state.payNowMissingDialog = {
    open: true,
    issues,
    draft: buildMissingInfoDraft()
  };
}

function closePayNowMissingDialog() {
  state.payNowMissingDialog.open = false;
}

function openPayLaterMissingDialog(issues) {
  state.payLaterMissingDialog = {
    open: true,
    issues,
    draft: buildMissingInfoDraft()
  };
}

function closePayLaterMissingDialog() {
  state.payLaterMissingDialog.open = false;
}

function openPaymentDialog() {
  state.paymentDialog = {
    open: true,
    baseTotal: ticketGrandTotal(),
    paymentType: 'Cash',
    tipMode: 'none',
    customTip: '0.00',
    entryAmount: '0.00',
    paymentLines: []
  };
}

function paymentPaneOrderTypeLabel(orderType: string) {
  return ORDER_TYPES[orderType] || orderType || 'Unknown';
}

function paymentPaneCustomerSummary() {
  const customer = currentCustomerLike() || {};
  return {
    name: String(customer.name || '').trim() || '',
    phone: phoneDisplayValue(normalizePhone(customer.phone || '')) || ''
  };
}

function paymentPaneOrderItems() {
  return (state.cart || []).map((line) => {
    const qty = Math.max(1, Number(line.qty || 1));
    const linePrice = Math.max(0, Number(line.price || 0));
    return {
      id: line.lineId || '',
      name: line.name || 'Item',
      qty,
      priceCents: Math.round(linePrice * 100),
      subtitle: line.size ? String(line.size) : ''
    };
  });
}

function updateOrderPhoneFromPaymentPane(phoneValue: string) {
  const normalizedPhone = normalizePhone(phoneValue || '');
  state.customerPhone = normalizedPhone;
  state.customerDraft.phone = normalizedPhone;

  if (state.activeCustomer) {
    state.activeCustomer = {
      ...state.activeCustomer,
      phone: normalizedPhone
    };
  }

  if (state.orderType === 'pickup' || state.orderType === 'togo') {
    state.orderTypeDetails.togoPhone = normalizedPhone;
  }

  if (state.paymentPaneInput) {
    state.paymentPaneInput.customer = {
      ...state.paymentPaneInput.customer,
      phone: phoneDisplayValue(normalizedPhone) || ''
    };
  }
}

function seedPaymentDialogForPaneCompletion(paymentType: string, amountDue: number, totalCents: number) {
  state.paymentDialog = {
    open: false,
    baseTotal: +(totalCents / 100).toFixed(2),
    paymentType,
    tipMode: 'none',
    customTip: '0.00',
    entryAmount: '0.00',
    paymentLines: [{
      id: uid(),
      paymentType,
      amount: amountDue,
      tipAmount: 0
    }]
  };
}

function mockSendTextPaymentLink(phoneDigits: string): Promise<{ ok: boolean; status: TextPaymentLinkStatus; message?: string }> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ ok: true, status: 'sent' });
    }, 350);
  });
}

function mockRemoveSavedCard(_cardId: string): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ ok: true }), 300);
  });
}

function baseMockSavedPaymentMethods(): Record<string, SavedPaymentMethodDisplay[]> {
  return {
    cust_001: [
      { savedPaymentMethodId: 'pm_001_visa', customerId: 'cust_001', cardBrand: 'visa', lastFour: '4242', expirationMonth: 8, expirationYear: 2028, isDefault: true, lastUsedAt: '2026-07-10T14:23:00Z', status: 'active' },
      { savedPaymentMethodId: 'pm_001_mc', customerId: 'cust_001', cardBrand: 'mastercard', lastFour: '5187', expirationMonth: 11, expirationYear: 2027, lastUsedAt: '2026-06-05T11:00:00Z', status: 'active' },
      { savedPaymentMethodId: 'pm_001_amex', customerId: 'cust_001', cardBrand: 'amex', lastFour: '1005', expirationMonth: 4, expirationYear: 2029, lastUsedAt: '2026-04-01T09:30:00Z', status: 'active' }
    ],
    cust_002: [
      { savedPaymentMethodId: 'pm_002_disc', customerId: 'cust_002', cardBrand: 'discover', lastFour: '6011', expirationMonth: 3, expirationYear: 2026, lastUsedAt: '2026-07-15T16:00:00Z', status: 'active' }
    ]
  };
}

function buildSavedPaymentMethods(customerId: string): SavedPaymentMethodDisplay[] {
  if (!customerId) return [];
  const allMethods = baseMockSavedPaymentMethods();
  const cards = (allMethods[customerId] || []).filter((c) => c.status === 'active');
  return cards.sort((a, b) => {
    const dateA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const dateB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return dateB - dateA;
  });
}

function buildPaymentPaneInput() {
  const subtotalCents = Math.round(cartTotal() * 100);
  const taxCents = Math.round(ticketTax() * 100);
  const totalCents = Math.round(ticketGrandTotal() * 100);
  return {
    displayOrderNumber: state.nextDisplayOrderNumber || `${lilposDataService.getStationNumber()}-00000`,
    orderTypeLabel: paymentPaneOrderTypeLabel(state.orderType),
    stationName: `Main Station`,
    subtotalCents,
    taxCents,
    totalCents,
    tipCents: 0,
    paymentsAppliedCents: 0,
    remainingBalanceCents: totalCents,
    customer: paymentPaneCustomerSummary(),
    items: paymentPaneOrderItems(),
    orderType: state.orderType,
    selectedMethod: 'cash' as PaymentMethod,
    savedPaymentMethods: buildSavedPaymentMethods(state.activeCustomer?.id || ''),
    // TODO: gate canRemoveSavedCards on manager role or merchant-level permission once the role system is wired
    canRemoveSavedCards: state.managerUnlocked
  };
}

function openPaymentPane() {
  if (!window.LilposPaymentPane) return;
  const input = buildPaymentPaneInput();
  state.paymentPaneInput = input;
  state.paymentPaneState = window.LilposPaymentPane.createStateFromInput(input);
  state.mainView = MAIN_VIEWS.payment;
}

async function handlePaymentPanePrimaryAction() {
  if (!state.paymentPaneState || !state.paymentPaneInput) return;
  if (state.orderSendLocked || state.paymentPaneState.isSubmitting) return;

  const paneState = state.paymentPaneState;
  const isCard = paneState.selectedPaymentMethod === 'card';
  const isCash = paneState.selectedPaymentMethod === 'cash';
  const isTextPaymentLink = paneState.selectedPaymentMethod === 'text-payment-link';

  if (!isCard && !isCash && !isTextPaymentLink) {
    state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, { type: 'set-error', message: 'This payment method is coming soon.' });
    render();
    return;
  }

  if (isTextPaymentLink) {
    const phoneDigits = normalizePhone(paneState.textPaymentLinkPhoneDigits || state.paymentPaneInput.customer.phone || state.customerPhone);

    if (paneState.textPaymentLinkStatus === 'paid') {
      state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, { type: 'set-submitting', submitting: true });
      render();

      const amountDue = +(paneState.remainingBalanceCents / 100).toFixed(2);
      seedPaymentDialogForPaneCompletion('Text Payment Link', amountDue, paneState.totalCents);
      completePayNowOrder();
      if (!state.orderSendLocked) {
        state.paymentPaneState = null;
        state.paymentPaneInput = null;
        state.mainView = MAIN_VIEWS.menu;
      }
      return;
    }

    if (paneState.textPaymentLinkStatus === 'sent' || paneState.textPaymentLinkStatus === 'pending') {
      state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, {
        type: 'set-error',
        message: 'Payment link already sent. Wait for payment confirmation before completing the order.'
      });
      render();
      return;
    }

    if (phoneDigits.length < 10) {
      state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, {
        type: 'set-error',
        message: 'Enter a mobile number before texting the payment link.'
      });
      render();
      return;
    }

    updateOrderPhoneFromPaymentPane(phoneDigits);
    state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, { type: 'text-link-set-status', status: 'sending' });
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'set-submitting', submitting: true });
    render();

    const result = await mockSendTextPaymentLink(phoneDigits);
    if (!state.paymentPaneState) return;

    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
      type: 'text-link-set-status',
      status: result.ok ? result.status : 'failed',
      errorMessage: result.ok ? '' : (result.message || 'Unable to send payment link.')
    });
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'set-submitting', submitting: false });
    render();
    return;
  }

  if (isCash && paneState.cashReceivedCents < paneState.remainingBalanceCents) {
    state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, { type: 'set-error', message: 'Cash received must cover remaining balance.' });
    render();
    return;
  }

  state.paymentPaneState = window.LilposPaymentPane.reducer(paneState, { type: 'set-submitting', submitting: true });
  render();

  if (isCard) {
    // Keep provider-neutral; this is a typed placeholder until terminal hook exists.
    const cofMsg = paneState.selectedSavedCardId
      ? 'Card on file integration not configured yet.'
      : 'Card terminal integration not configured yet.';
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'set-card-status', status: 'error', errorMessage: cofMsg });
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'set-submitting', submitting: false });
    render();
    return;
  }

  // Reuse existing payment completion pipeline for persistence, receipts, and send semantics.
  const amountDue = +(paneState.remainingBalanceCents / 100).toFixed(2);
  seedPaymentDialogForPaneCompletion('Cash', amountDue, paneState.totalCents);

  completePayNowOrder();
  if (!state.orderSendLocked) {
    state.paymentPaneState = null;
    state.paymentPaneInput = null;
    state.mainView = MAIN_VIEWS.menu;
  }
}

function closePaymentDialog() {
  state.paymentDialog.open = false;
}

function addMockPaymentLine() {
  const amount = parseCurrencyInput(state.paymentDialog.entryAmount);
  if (amount <= 0) return;
  const totals = paymentTotals();
  const lineTip = state.paymentDialog.paymentLines.length === 0 ? totals.tipTotal : 0;
  state.paymentDialog.paymentLines = [
    ...state.paymentDialog.paymentLines,
    {
      id: uid(),
      paymentType: state.paymentDialog.paymentType,
      amount,
      tipAmount: lineTip
    }
  ];
  state.paymentDialog.entryAmount = '0.00';
}

function removeMockPaymentLine(lineId) {
  state.paymentDialog.paymentLines = state.paymentDialog.paymentLines.filter((line) => line.id !== lineId);
}

function appendPaymentEntry(char) {
  const digits = currencyDigits(state.paymentDialog.entryAmount || '');
  if (char === 'clear') {
    state.paymentDialog.entryAmount = '0.00';
    return;
  }
  if (char === 'back') {
    state.paymentDialog.entryAmount = formatImpliedDecimalCurrencyInput(digits.slice(0, -1));
    return;
  }
  if (!/^[0-9]$/.test(char)) return;
  state.paymentDialog.entryAmount = formatImpliedDecimalCurrencyInput((digits + char).slice(0, 9));
}

function resetTicketAfterPayment() {
  state.cart = [];
  state.removeConfirmLineId = null;
  state.activeCustomer = null;
  state.customerPanelMode = 'compact';
  state.customerName = '';
  state.customerPhone = '';
  state.customerNotes = '';
  state.orderSpecialInstructions = '';
  state.customerDraft = {
    name: '',
    phone: '',
    address1: '',
    city: '',
    state: '',
    zip: '',
    allergies: '',
    specialInstructions: ''
  };
  state.focusCustomerEntryOnRender = false;
  state.orderTypeDraftDialog = { open: false, type: null, name: '', phone: '', tableNumber: '' };
  state.orderTypeDetails = { togoName: '', togoPhone: '', dineInTableNumber: '' };
  resetOrderClassifiers();
}

function hasTicketCustomerData() {
  const customer = currentCustomerLike() || {};
  return !!(
    String(customer.name || '').trim()
    || normalizePhone(customer.phone)
    || String(customer.address1 || '').trim()
    || String(customer.city || '').trim()
    || String(customer.state || '').trim()
    || String(customer.zip || '').trim()
    || String(customer.allergies || '').trim()
    || String(customer.specialInstructions || '').trim()
    || String(state.customerNotes || '').trim()
  );
}

function hasActiveTicketState() {
  return !!(
    (Array.isArray(state.cart) && state.cart.length > 0)
    || hasTicketCustomerData()
    || !!String(state.orderSpecialInstructions || '').trim()
    || !!state.call
    || state.selectedLineNumber != null
    || state.timingType === 'future'
    || !!state.asapTime
  );
}

function resetForNewSale() {
  state.cart = [];
  state.removeConfirmLineId = null;
  state.selectedOrderId = null;
  state.mainView = MAIN_VIEWS.menu;
  state.category = VIEW_ALL_CATEGORIES;
  state.query = '';
  state.ordersQuery = '';
  state.preSearchCategory = null;
  state.selected = null;
  state.selectedConfig = {};
  state.activeCustomer = null;
  state.customerPanelMode = 'compact';
  state.customerName = '';
  state.customerPhone = '';
  state.customerNotes = '';
  state.orderSpecialInstructions = '';
  state.call = null;
  state.selectedLineNumber = null;
  state.customerDraft = {
    name: '',
    phone: '',
    address1: '',
    city: '',
    state: '',
    zip: '',
    allergies: '',
    specialInstructions: ''
  };
  state.focusCustomerEntryOnRender = false;
  state.orderTypeDraftDialog = { open: false, type: null, name: '', phone: '', tableNumber: '' };
  state.orderTypeDetails = { togoName: '', togoPhone: '', dineInTableNumber: '' };
  resetOrderClassifiers();
}

function requestNewSale(pendingLineNumber = null) {
  if (hasActiveTicketState()) {
    state.newSalePendingLineNumber = pendingLineNumber;
    state.showCancelConfirm = true;
    render();
    return;
  }

  const lineNumber = pendingLineNumber;
  state.newSalePendingLineNumber = null;
  resetForNewSale();
  if (lineNumber != null) {
    const line = getLine(lineNumber);
    if (line?.state === 'ringing') {
      openIncomingLine(lineNumber);
      return;
    }
    render();
    return;
  }
  render();
}

async function completePayNowOrder() {
  if (state.orderSendLocked) return;
  const totals = paymentTotals();
  if (state.paymentDialog.paymentLines.length === 0 || totals.remaining > 0) {
    alert('Payment is incomplete. Add enough payment to cover the balance.');
    return;
  }

  state.orderSendLocked = true;

  const payload = ticketPayload('send-order');
  const orderNumber = await lilposDataService.buildOrderNumber();
  
  payload.paymentIntent = 'pay_now';
  payload.paymentActionLabel = 'Send & Pay Now';
  payload.paymentStatus = 'paid';
  payload.paymentMethodSummary = state.paymentDialog.paymentLines.map((line) => line.paymentType).join(', ');
  payload.tipTotal = totals.tipTotal;
  payload.amountDue = totals.amountDue;
  payload.amountPaid = totals.amountPaid;
  payload.changeDue = totals.changeDue;
  payload.paymentLines = state.paymentDialog.paymentLines.map((line) => ({
    paymentType: line.paymentType,
    amount: Number(line.amount || 0),
    tipAmount: Number(line.tipAmount || 0)
  }));
  payload.paymentMock = {
    processor: 'LOCAL_MOCK',
    approvedAt: new Date().toISOString()
  };
  payload.orderNumber = orderNumber;

  const persistedOrder = {
    id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    orderNumber,
    localTicketId: payload.ticketId,
    stationNumber: lilposDataService.getStationNumber(),
    businessDate: lilposDataService.getBusinessDate(),
    createdTimestamp: nowIso(),
    updatedTimestamp: nowIso(),
    orderType: payload.orderType,
    orderSource: payload.orderSource,
    timingType: payload.timingType,
    asapTime: payload.asapTime,
    futureDateTime: payload.futureDateTime,
    orderSpecialInstructions: payload.orderSpecialInstructions,
    status: 'completed',
    paymentStatus: 'paid',
    paid: true,
    paymentMethodSummary: payload.paymentMethodSummary,
    paymentLines: payload.paymentLines,
    auditEvents: [
      { event: 'Entered', timestamp: nowIso(), employeeShortName: 'System' },
      { event: 'Sent', timestamp: nowIso(), employeeShortName: 'System' },
      { event: 'Paid', timestamp: nowIso(), employeeShortName: 'System' },
      { event: 'Closed', timestamp: nowIso(), employeeShortName: 'System' }
    ],
    customer: payload.customer,
    customerSnapshot: payload.customer,
    customerInfo: payload.customer,
    normalizedPhone: normalizePhone(payload.customer?.phone),
    lines: payload.lines,
    subtotal: payload.subtotal,
    tax: payload.tax,
    total: payload.total,
    rawSnapshot: payload,
    payloadSnapshot: payload
  };

  try {
    const snapshot = await lilposDataService.saveOrderHistorySnapshot({
      orderId: persistedOrder.id,
      displayOrderNumber: persistedOrder.orderNumber,
      stationId: persistedOrder.stationNumber,
      businessDate: persistedOrder.businessDate,
      orderType: persistedOrder.orderType,
      orderStatus: persistedOrder.status,
      paymentStatus: persistedOrder.paymentStatus,
      storedDisplayName: persistedOrder.customer?.name || 'Guest',
      storedPhone: persistedOrder.customer?.phone || '',
      storedAddressSummary: persistedOrder.customer?.address1 || '',
      subtotal: persistedOrder.subtotal,
      tax: persistedOrder.tax,
      total: persistedOrder.total,
      amountPaid: totals.amountPaid,
      remainingBalanceCents: 0,
      openedAt: persistedOrder.createdTimestamp,
      sentAt: persistedOrder.createdTimestamp,
      completedAt: persistedOrder.updatedTimestamp,
      closedAt: persistedOrder.updatedTimestamp,
      createdAt: persistedOrder.createdTimestamp,
      updatedAt: persistedOrder.updatedTimestamp,
      sourceSnapshot: {
        orderSpecialInstructions: persistedOrder.orderSpecialInstructions,
        timingType: persistedOrder.timingType,
        asapTime: persistedOrder.asapTime,
        futureDateTime: persistedOrder.futureDateTime,
        orderSource: persistedOrder.orderSource,
        customer: persistedOrder.customer,
        paymentMethodSummary: persistedOrder.paymentMethodSummary
      }
    });

    await lilposDataService.saveOrderHistoryItems(snapshot.historyId, persistedOrder.id, persistedOrder.lines || []);

    for (const auditEvent of persistedOrder.auditEvents || []) {
      await lilposDataService.appendOrderEvent({
        orderId: persistedOrder.id,
        historyId: snapshot.historyId,
        businessDate: persistedOrder.businessDate,
        label: auditEvent.event,
        eventTimestamp: auditEvent.timestamp,
        employeeShortName: auditEvent.employeeShortName || 'System'
      });
    }

    for (const line of persistedOrder.paymentLines || []) {
      await lilposDataService.savePaymentHistory({
        orderId: persistedOrder.id,
        historyId: snapshot.historyId,
        paymentType: line.paymentType,
        amount: Number(line.amount || 0) + Number(line.tipAmount || 0),
        paidAt: persistedOrder.updatedTimestamp,
        employeeShortName: 'System'
      });
    }

    await refreshPersistedOrdersCache({ refreshNextOrderNumber: true, renderAfter: false });
    state.persistedOrderDetailCacheById[persistedOrder.id] = {
      ...persistedOrder,
      status: normalizeOrderStatus(persistedOrder)
    };
  } catch (err) {
    console.error('Unable to persist order history record:', err);
    state.orderSendLocked = false;
    alert('Unable to persist this order locally. Ticket has not been reset.');
    return;
  }

  state.sentOrdersToday.unshift({
    ticketId: payload.ticketId,
    at: new Date().toLocaleTimeString(),
    total: payload.total,
    orderType: payload.orderTypeLabel,
    paymentIntent: payload.paymentIntent,
    paymentStatus: payload.paymentStatus
  });

  closePaymentDialog();
  closePayNowMissingDialog();
  resetTicketAfterPayment();
  if (payload.orderType === 'togo' || payload.orderType === 'tostay') {
    openOrderNumberDialog(orderNumber, persistedOrder.id);
  } else {
    alert(JSON.stringify(payload, null, 2).slice(0, 4000));
  }
  state.orderSendLocked = false;
  render();
}

async function completePayLaterOrder() {
  if (state.orderSendLocked) return;
  state.orderSendLocked = true;
  const payload = ticketPayload('send-order');
  const orderNumber = await lilposDataService.buildOrderNumber();
  
  payload.paymentIntent = 'pay_later';
  payload.paymentActionLabel = 'Send & Pay Later';
  payload.paymentStatus = 'pay_later';
  payload.paymentLines = [];
  payload.paymentMock = {
    processor: 'LOCAL_MOCK',
    approvedAt: null
  };
  payload.orderNumber = orderNumber;

  const persistedOrder = {
    id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    orderNumber,
    localTicketId: payload.ticketId,
    stationNumber: lilposDataService.getStationNumber(),
    businessDate: lilposDataService.getBusinessDate(),
    createdTimestamp: nowIso(),
    updatedTimestamp: nowIso(),
    orderType: payload.orderType,
    orderSource: payload.orderSource,
    timingType: payload.timingType,
    asapTime: payload.asapTime,
    futureDateTime: payload.futureDateTime,
    orderSpecialInstructions: payload.orderSpecialInstructions,
    status: 'open',
    paymentStatus: 'pay_later',
    paid: false,
    paymentMethodSummary: '',
    paymentLines: [],
    auditEvents: [
      { event: 'Entered', timestamp: nowIso(), employeeShortName: 'System' },
      { event: 'Sent', timestamp: nowIso(), employeeShortName: 'System' }
    ],
    customer: payload.customer,
    customerSnapshot: payload.customer,
    customerInfo: payload.customer,
    normalizedPhone: normalizePhone(payload.customer?.phone),
    lines: payload.lines,
    subtotal: payload.subtotal,
    tax: payload.tax,
    total: payload.total,
    rawSnapshot: payload,
    payloadSnapshot: payload
  };

  try {
    const snapshot = await lilposDataService.saveOrderHistorySnapshot({
      orderId: persistedOrder.id,
      displayOrderNumber: persistedOrder.orderNumber,
      stationId: persistedOrder.stationNumber,
      businessDate: persistedOrder.businessDate,
      orderType: persistedOrder.orderType,
      orderStatus: persistedOrder.status,
      paymentStatus: persistedOrder.paymentStatus,
      storedDisplayName: persistedOrder.customer?.name || 'Guest',
      storedPhone: persistedOrder.customer?.phone || '',
      storedAddressSummary: persistedOrder.customer?.address1 || '',
      subtotal: persistedOrder.subtotal,
      tax: persistedOrder.tax,
      total: persistedOrder.total,
      amountPaid: 0,
      openedAt: persistedOrder.createdTimestamp,
      sentAt: persistedOrder.createdTimestamp,
      createdAt: persistedOrder.createdTimestamp,
      updatedAt: persistedOrder.updatedTimestamp,
      sourceSnapshot: {
        orderSpecialInstructions: persistedOrder.orderSpecialInstructions,
        timingType: persistedOrder.timingType,
        asapTime: persistedOrder.asapTime,
        futureDateTime: persistedOrder.futureDateTime,
        orderSource: persistedOrder.orderSource,
        customer: persistedOrder.customer,
        paymentMethodSummary: persistedOrder.paymentMethodSummary
      }
    });

    await lilposDataService.saveOrderHistoryItems(snapshot.historyId, persistedOrder.id, persistedOrder.lines || []);

    for (const auditEvent of persistedOrder.auditEvents || []) {
      await lilposDataService.appendOrderEvent({
        orderId: persistedOrder.id,
        historyId: snapshot.historyId,
        businessDate: persistedOrder.businessDate,
        label: auditEvent.event,
        eventTimestamp: auditEvent.timestamp,
        employeeShortName: auditEvent.employeeShortName || 'System'
      });
    }

    await refreshPersistedOrdersCache({ refreshNextOrderNumber: true, renderAfter: false });
    state.persistedOrderDetailCacheById[persistedOrder.id] = {
      ...persistedOrder,
      status: normalizeOrderStatus(persistedOrder)
    };
  } catch (err) {
    console.error('Unable to persist order history record:', err);
    state.orderSendLocked = false;
    alert('Unable to persist this order locally. Ticket has not been reset.');
    return;
  }

  state.sentOrdersToday.unshift({
    ticketId: payload.ticketId,
    at: new Date().toLocaleTimeString(),
    total: payload.total,
    orderType: payload.orderTypeLabel,
    paymentIntent: payload.paymentIntent,
    paymentStatus: payload.paymentStatus
  });

  closePayLaterMissingDialog();
  resetTicketAfterPayment();
  if (payload.orderType === 'togo' || payload.orderType === 'tostay') {
    openOrderNumberDialog(orderNumber, persistedOrder.id);
  } else {
    alert(JSON.stringify(payload, null, 2).slice(0, 4000));
  }
  state.orderSendLocked = false;
  render();
}

function beginUnknownCustomerEntry(line) {
  const address = line?.address || {};
  state.customerPanelMode = 'entry';
  state.activeCustomer = null;
  state.customerDraft = {
    name: line?.callerName || '',
    phone: normalizePhone(line?.phoneNumber || ''),
    address1: address.street || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || '',
    allergies: '',
    specialInstructions: ''
  };
  
  // Pre-fill phone from caller ID for pickup/to-go if not already set
  if (!state.customerDraft.phone && line?.phoneNumber && (state.orderType === 'pickup' || state.orderType === 'togo')) {
    state.customerDraft.phone = normalizePhone(line.phoneNumber);
  }
}

function createEmptyPhoneLine(lineNumber) {
  return {
    lineNumber,
    state: 'idle',
    phoneNumber: '',
    callerName: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip: ''
    },
    rawDetails: {},
    matchType: '',
    claimedByStation: '',
    lastUpdatedAt: new Date().toISOString()
  };
}

function initPhoneLines(count = 6) {
  return Array.from({ length: count }, (_, i) => createEmptyPhoneLine(i + 1));
}

state.phoneLines = initPhoneLines(state.lineCount);

function getLine(lineNumber) {
  return state.phoneLines.find((l) => l.lineNumber === lineNumber);
}

function toAddressText(address) {
  const parts = [address?.street, address?.city, address?.state, address?.zip].filter(Boolean);
  return parts.join(', ');
}

function updateLine(lineNumber, patch) {
  const line = getLine(lineNumber);
  if (!line) return;
  Object.assign(line, patch, { lastUpdatedAt: nowIso() });
}

function clearLineResetTimer(lineNumber) {
  const existing = lineResetTimers.get(lineNumber);
  if (existing) {
    clearTimeout(existing);
    lineResetTimers.delete(lineNumber);
  }
}

function moveLineToEnded(lineNumber) {
  const line = getLine(lineNumber);
  if (!line) return;
  clearLineResetTimer(lineNumber);
  const marker = nowIso();
  updateLine(lineNumber, { state: 'ended', claimedByStation: '', lastUpdatedAt: marker });
  const timerId = setTimeout(() => {
    const current = getLine(lineNumber);
    if (!current) return;
    if (current.state === 'ended') {
      state.phoneLines = state.phoneLines.map((entry) => {
        if (entry.lineNumber !== lineNumber) return entry;
        return createEmptyPhoneLine(lineNumber);
      });
      if (state.selectedLineNumber === lineNumber) state.selectedLineNumber = null;
      render();
    }
    lineResetTimers.delete(lineNumber);
  }, 7000);
  lineResetTimers.set(lineNumber, timerId);
}

function mockCallerPayload(lineNumber) {
  const first = ['Anthony', 'Maria', 'Sal', 'Jess', 'Nina', 'Frank', 'Luca', 'Pat'];
  const last = ['Rossi', 'Bianchi', 'Marino', 'DeLuca', 'Santiago', 'Ortiz', 'Greco'];
  const streets = ['Oak Ave', 'Market St', 'River Rd', 'Maple Dr', 'Hudson Ave', 'Union St'];
  const cities = ['Bayonne', 'Jersey City', 'Newark', 'Hoboken', 'Elizabeth'];
  const phone = `${sample(['201', '551', '732', '908'])}${Math.floor(100 + Math.random() * 899)}${Math.floor(1000 + Math.random() * 8999)}`;
  const callerName = `${sample(first)} ${sample(last)}`;
  const address = {
    street: `${Math.floor(10 + Math.random() * 980)} ${sample(streets)}`,
    city: sample(cities),
    state: 'NJ',
    zip: String(Math.floor(7000 + Math.random() * 899)).padStart(5, '0')
  };
  return {
    lineNumber,
    phoneNumber: phone,
    callerName,
    address,
    rawDetails: {
      ani: phone,
      dnis: `Line-${lineNumber}`,
      carrier: sample(['Verizon', 'T-Mobile', 'AT&T']),
      accountTag: sample(['Returning', 'New Caller', 'VIP']),
      spamScore: Math.floor(Math.random() * 20)
    }
  };
}

function knownCustomerCallerPayload(lineNumber, customer) {
  const includeAddress = Math.random() > 0.25;
  const includeName = Math.random() > 0.15;
  const address = includeAddress ? { street: customer.address1, city: customer.city, state: customer.state, zip: customer.zip } : { street: '', city: '', state: '', zip: '' };
  return {
    lineNumber,
    phoneNumber: normalizePhone(customer.phone),
    callerName: includeName ? customer.name : '',
    address,
    rawDetails: {
      ani: normalizePhone(customer.phone),
      dnis: `Line-${lineNumber}`,
      matchType: 'known-customer',
      customerId: customer.id,
      loyaltyTier: sample(['Bronze', 'Silver', 'Gold'])
    }
  };
}

function unknownCallerPayload(lineNumber) {
  const payload = mockCallerPayload(lineNumber);
  return {
    ...payload,
    callerName: Math.random() > 0.5 ? '' : payload.callerName,
    address: Math.random() > 0.45 ? payload.address : { street: '', city: '', state: '', zip: '' },
    rawDetails: {
      ...payload.rawDetails,
      matchType: 'unknown-customer'
    }
  };
}

function updatePwaDiagnostics() {
  state.pwaDiag.secure = window.isSecureContext;
  state.pwaDiag.manifest = !!document.querySelector('link[rel="manifest"]');
  state.pwaDiag.swSupported = 'serviceWorker' in navigator;
  state.pwaDiag.swController = !!navigator.serviceWorker?.controller;
}

function pwaDiagnosticsText() {
  const d = state.pwaDiag;
  const flag = (name, ok) => `${name}:${ok ? 'Y' : 'N'}`;
  return `PWA ${flag('secure', d.secure)} ${flag('manifest', d.manifest)} ${flag('sw', d.swRegistered)} ${flag('controlled', d.swController)} ${flag('prompt', d.beforeInstallPrompt)}`;
}

window.onerror = function(message, source, lineno, colno, error) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div class="errorBox"><h1>LilPOS mock crashed</h1><p>${String(message)}</p><pre>${String(error?.stack || '')}</pre><button onclick="location.reload()">Reload</button></div>`;
  }
  console.error(message, source, lineno, colno, error);
};

window.onunhandledrejection = function(event) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div class="errorBox"><h1>LilPOS async error</h1><p>${String(event.reason?.message || event.reason)}</p><pre>${String(event.reason?.stack || '')}</pre><button onclick="location.reload()">Reload</button></div>`;
  }
  console.error(event.reason);
};

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nowIso = () => new Date().toISOString();
const makeId = (prefix, i) => `${prefix}_${String(i).padStart(5, '0')}`;

function persistedOrders() {
  return Array.isArray(state.persistedOrdersCache) ? state.persistedOrdersCache : [];
}

async function refreshPersistedOrdersCache(options: any = {}) {
  const rows = await lilposDataService.listHistoricalOrdersCompat();
  state.persistedOrdersCache = rows;
  if (options.refreshNextOrderNumber !== false) {
    state.nextDisplayOrderNumber = await lilposDataService.buildOrderNumber();
  }
  if (options.renderAfter) {
    render();
  }
}

async function hydratePersistedOrderDetail(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return null;
  if (state.persistedOrderDetailCacheById[id]) {
    return state.persistedOrderDetailCacheById[id];
  }
  const detail = await lilposDataService.getHistoricalOrderByIdCompat(id);
  if (detail) {
    state.persistedOrderDetailCacheById[id] = detail;
  }
  return detail;
}

async function selectOrderForDetail(orderId) {
  state.selectedOrderId = orderId || null;
  state.previousOrderAuditExpanded = false;
  if (state.selectedOrderId) {
    await hydratePersistedOrderDetail(state.selectedOrderId);
  }
  render();
}

function uid() {
  return 'line_' + Math.random().toString(36).slice(2) + Date.now();
}

function nowLocalParts() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const rounded = new Date(now.getTime());
  const mins = rounded.getMinutes();
  rounded.setMinutes(mins < 30 ? 30 : 60, 0, 0);
  const time = `${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`;
  return { date, time };
}

function parseLocalDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function currencyDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function formatImpliedDecimalCurrencyInput(value) {
  const digits = currencyDigits(value);
  if (!digits) return '0.00';
  const cents = Number(digits);
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : '0.00';
}

function parseImpliedDecimalCurrencyInput(value) {
  return Number(formatImpliedDecimalCurrencyInput(value));
}

function attachCurrencyInputBehavior(input, onValueChange) {
  if (!input) return;
  const apply = (rawValue, notify = true) => {
    const formatted = formatImpliedDecimalCurrencyInput(rawValue);
    input.value = formatted;
    if (notify && typeof onValueChange === 'function') {
      onValueChange(formatted, parseImpliedDecimalCurrencyInput(formatted));
    }
  };

  apply(input.value || '', false);

  input.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (/^[0-9]$/.test(key)) return;
    if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(key)) return;
    if (key.length === 1) event.preventDefault();
  });

  input.addEventListener('input', () => {
    apply(input.value || '');
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
}

function formatTimeValueLabel(timeValue) {
  const local = parseLocalDateTime(nowLocalParts().date, timeValue);
  if (!local) return '';
  return local.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatFutureLabel(dateTimeIso) {
  if (!dateTimeIso) return '';
  const d = new Date(dateTimeIso);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
  const month = d.toLocaleDateString([], { month: 'short' });
  const day = d.getDate();
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${weekday} ${month} ${day} ${timePart}`;
}

function setPhoneClassifier(selected: any, sourceHint?: any) {
  state.phoneClassifierSelected = !!selected;
  state.isPhoneOrder = !!selected;
  if (selected) {
    state.orderSource = sourceHint || state.orderSource || 'phone';
  } else if (state.orderType === 'togo' || state.orderType === 'tostay' || state.orderType === 'dinein') {
    state.orderSource = 'counter';
  } else if (state.orderSource === 'phone' || state.orderSource === 'callerId' || state.orderSource === 'unknown') {
    state.orderSource = 'counter';
  }
}

function hasCallerIdLineContext() {
  return state.selectedLineNumber != null || !!state.call;
}

function hasCustomerContext() {
  return !!(
    state.activeCustomer
    || String(state.customerDraft?.name || '').trim()
    || normalizePhone(state.customerDraft?.phone || '')
  );
}

function hasCallerOrCustomerContext() {
  return hasCallerIdLineContext() || hasCustomerContext();
}

function openOrFocusAddCustomerForm() {
  state.customerPanelMode = 'entry';
  state.customerEditorMode = 'new';
  state.focusCustomerEntryOnRender = true;
}

function closeOrderTypeDraftDialog() {
  state.orderTypeDraftDialog = {
    open: false,
    type: null,
    name: '',
    phone: '',
    tableNumber: ''
  };
}

function openOrderTypeDraftDialog(type: 'togo' | 'dinein') {
  const seed = type === 'togo'
    ? {
        name: state.orderTypeDetails.togoName || '',
        phone: phoneDisplayValue(state.orderTypeDetails.togoPhone || '')
      }
    : {
        tableNumber: state.orderTypeDetails.dineInTableNumber || ''
      };

  state.orderTypeDraftDialog = {
    open: true,
    type,
    name: seed.name || '',
    phone: seed.phone || '',
    tableNumber: seed.tableNumber || ''
  };
}

function commitOrderType(nextType) {
  state.orderType = nextType;

  if (nextType !== 'togo') {
    state.orderTypeDetails.togoName = '';
    state.orderTypeDetails.togoPhone = '';
  }
  if (nextType !== 'dinein') {
    state.orderTypeDetails.dineInTableNumber = '';
  }

  if (nextType === 'togo' || nextType === 'tostay' || nextType === 'dinein') {
    setPhoneClassifier(false);
    state.orderSource = 'counter';
    state.deliveryInfoMissing = false;
    return;
  }

  if (hasCallerIdLineContext()) {
    setPhoneClassifier(true, 'callerId');
  } else {
    setPhoneClassifier(false, 'counter');
  }

  if (nextType === 'delivery' && !hasDeliveryProfile(currentCustomerLike())) {
    state.deliveryInfoMissing = true;
    openOrFocusAddCustomerForm();
    return;
  }

  state.deliveryInfoMissing = false;
}

function handleOrderTypeSelection(nextType) {
  if (!nextType) return;

  if (nextType === 'togo') {
    openOrderTypeDraftDialog('togo');
    return;
  }

  if (nextType === 'dinein') {
    openOrderTypeDraftDialog('dinein');
    return;
  }

  closeOrderTypeDraftDialog();
  commitOrderType(nextType);

  if ((nextType === 'pickup' || nextType === 'delivery') && !hasCallerOrCustomerContext()) {
    openOrFocusAddCustomerForm();
  }
}

function cancelOrderTypeDraftDialog() {
  closeOrderTypeDraftDialog();
}

function startTogoFromDraftDialog() {
  const draft = state.orderTypeDraftDialog;
  const nextName = String(draft.name || '').trim();
  const nextPhone = normalizePhone(draft.phone || '');
  state.orderTypeDetails.togoName = nextName;
  state.orderTypeDetails.togoPhone = nextPhone;
  closeOrderTypeDraftDialog();
  commitOrderType('togo');
}

function startDineInFromDraftDialog() {
  const draft = state.orderTypeDraftDialog;
  state.orderTypeDetails.dineInTableNumber = String(draft.tableNumber || '').trim();
  closeOrderTypeDraftDialog();
  commitOrderType('dinein');
}

function openScheduleDialog() {
  const base = state.futureDateTime ? new Date(state.futureDateTime) : null;
  if (base && !Number.isNaN(base.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    state.scheduleDialog = {
      open: true,
      date: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`,
      time: `${pad(base.getHours())}:${pad(base.getMinutes())}`
    };
  } else {
    const parts = nowLocalParts();
    state.scheduleDialog = {
      open: true,
      date: parts.date,
      time: parts.time
    };
  }
}

function openAsapAdjustDialog() {
  state.asapAdjustDialog = {
    open: true,
    time: state.asapTime || nowLocalParts().time
  };
}

function closeAsapAdjustDialog() {
  state.asapAdjustDialog = { open: false, time: '' };
}

function shiftAsapAdjustTime(minutes) {
  const base = parseLocalDateTime(nowLocalParts().date, state.asapAdjustDialog.time || nowLocalParts().time);
  if (!base) return;
  base.setMinutes(base.getMinutes() + Number(minutes || 0));
  const pad = (n) => String(n).padStart(2, '0');
  state.asapAdjustDialog.time = `${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

function saveAsapAdjustTime() {
  if (!state.asapAdjustDialog.time) return;
  state.timingType = 'asap';
  state.futureDateTime = null;
  state.futureOrderNote = '';
  state.asapTime = state.asapAdjustDialog.time;
  closeAsapAdjustDialog();
}

function clearAsapAdjustTime() {
  state.timingType = 'asap';
  state.futureDateTime = null;
  state.futureOrderNote = '';
  state.asapTime = '';
  closeAsapAdjustDialog();
}

function closeScheduleDialog() {
  state.scheduleDialog = { open: false, date: '', time: '' };
}

function saveScheduledOrder() {
  const when = parseLocalDateTime(state.scheduleDialog.date, state.scheduleDialog.time);
  if (!when) {
    alert('Please choose a valid date and time.');
    return;
  }
  state.timingType = 'future';
  state.asapTime = '';
  state.futureDateTime = when.toISOString();
  state.futureOrderNote = `Ready/Requested: ${formatFutureLabel(state.futureDateTime)}`;
  closeScheduleDialog();
}

function clearRemoveConfirmation() {
  if (!state.removeConfirmLineId) return;
  state.removeConfirmLineId = null;
  render();
}

function mockFoodImageDataUri(label, hue) {
  const safe = String(label || 'Food').replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,66%)"/><stop offset="1" stop-color="hsl(${(hue + 42) % 360},75%,52%)"/></linearGradient></defs><rect width="240" height="160" fill="url(#g)"/><circle cx="56" cy="46" r="20" fill="rgba(255,255,255,.22)"/><circle cx="186" cy="92" r="34" fill="rgba(255,255,255,.16)"/><rect x="14" y="114" width="212" height="30" rx="8" fill="rgba(15,23,42,.32)"/><text x="24" y="134" font-size="16" font-family="Segoe UI,Arial" fill="white">${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function asModifierValue(value) {
  return String(value == null ? '' : value);
}

function getGroupPreModifierOptions(group) {
  if (!group || !group.preModifierType || !Array.isArray(group.preModifierOptions)) return [];
  return group.preModifierOptions
    .map((opt) => {
      if (opt == null) return null;
      if (typeof opt === 'string') {
        return { value: asModifierValue(opt), label: asModifierValue(opt) };
      }
      const value = asModifierValue(opt.value ?? opt.id ?? opt.label);
      const label = asModifierValue(opt.label ?? opt.name ?? value);
      if (!value) return null;
      return { value, label };
    })
    .filter(Boolean);
}

function groupSupportsPreModifier(group) {
  return !!(group && group.preModifierType && getGroupPreModifierOptions(group).length);
}

function getSelectedPreModifierValue(groupId) {
  const group = state.idx?.groupsById?.[groupId];
  const options = getGroupPreModifierOptions(group);
  if (!options.length) return null;
  const selected = state.selectedConfig?.preModifiers?.[groupId];
  if (selected && options.some((opt) => opt.value === selected)) return selected;
  return options[0].value;
}

function getSelectedPreModifierLabel(groupId, value) {
  const group = state.idx?.groupsById?.[groupId];
  const options = getGroupPreModifierOptions(group);
  const match = options.find((opt) => opt.value === value);
  return match ? match.label : asModifierValue(value);
}

function getModifierSelectionPrice(option, preModifierValue) {
  if (!option) return 0;
  const normalized = asModifierValue(preModifierValue).toLowerCase();
  if (normalized.includes('half') && Number.isFinite(option.halfPrice)) return option.halfPrice;
  if ((normalized.includes('whole') || !normalized) && Number.isFinite(option.wholePrice)) return option.wholePrice;
  return Number.isFinite(option.price) ? option.price : 0;
}

function isCustomPizzaModifierCategoryName(categoryName) {
  const normalized = String(categoryName || '').trim().toLowerCase();
  return normalized === 'pizza' || normalized === 'specialty pizza';
}

function itemUsesCustomPizzaModifierUi(item) {
  if (!item) return false;
  const categoryId = item.categoryId;
  const category = state.idx?.catsById?.[categoryId]
    || lilposDataService.indexes.categoriesById.get(categoryId)
    || null;
  return isCustomPizzaModifierCategoryName(category?.name);
}

function getPizzaToppingGroup(item) {
  if (!item || !state.idx?.itemMods) return null;
  const groupIds = state.idx.itemMods.get(item.id) || [];
  return groupIds.map((gid) => state.idx.groupsById[gid]).find((group) => group?.pricingMode === 'pizza_half_whole') || null;
}

function pizzaSideFromPreModifier(value) {
  const normalized = asModifierValue(value).toUpperCase();
  if (normalized.includes('HALF 1') || normalized === 'LEFT') return 'left';
  if (normalized.includes('HALF 2') || normalized === 'RIGHT') return 'right';
  return 'whole';
}

function pizzaPreModifierFromSide(side) {
  if (side === 'left') return { value: 'HALF 1', label: 'Left' };
  if (side === 'right') return { value: 'HALF 2', label: 'Right' };
  return { value: 'WHOLE', label: 'Whole' };
}

function pizzaCategoryForOptionName(name) {
  const value = asModifierValue(name).toLowerCase();
  const meats = ['pepperoni', 'sausage', 'meatball', 'bacon', 'ham', 'chicken', 'prosciutto', 'anchovies'];
  const cheeses = ['cheese', 'ricotta', 'mozzarella', 'feta', 'parmesan', 'provolone'];
  const veggies = ['mushroom', 'onion', 'pepper', 'olive', 'spinach', 'broccoli', 'jalapeno', 'banana pepper', 'artichoke', 'eggplant', 'tomato', 'basil'];
  if (meats.some((token) => value.includes(token))) return 'MEATS';
  if (cheeses.some((token) => value.includes(token))) return 'CHEESES';
  if (veggies.some((token) => value.includes(token))) return 'VEGGIES';
  return 'OTHER';
}

function getPizzaUnitPrice(option, item, side, sizeName) {
  if (!option) return 0;
  const sizeEntry = (item.sizeSchema || []).find((s) => s.name === sizeName);
  const sizeId = sizeEntry?.sizeId;
  if (sizeId && option.sizePrices && Number.isFinite(option.sizePrices[sizeId])) {
    const whole = Number(option.sizePrices[sizeId]);
    if (side === 'whole') return whole;
    return +(whole / 2).toFixed(2);
  }
  if (side === 'whole' && Number.isFinite(option.wholePrice)) return Number(option.wholePrice);
  if ((side === 'left' || side === 'right') && Number.isFinite(option.halfPrice)) return Number(option.halfPrice);
  return Number(option.price || 0);
}

function normalizeStoredPrepModifier(entry, group) {
  const explicitId = String(entry?.prepModifierId || '').trim();
  if (explicitId) return prepModifierById(group, explicitId);
  const explicitLabel = String(entry?.prepModifierLabel || '').trim().toLowerCase();
  if (explicitLabel) {
    return prepModifierSetForGroup(group).find((prep) => prep.label.toLowerCase() === explicitLabel) || null;
  }
  return null;
}

function buildPizzaModifierEntry(group, option, item, side, multiplier, sizeName, prepModifier = null) {
  const safeMultiplier = Math.max(1, Math.min(3, Number(multiplier || 1)));
  const basePrice = +getPizzaUnitPrice(option, item, side, sizeName).toFixed(2);
  const totalPriceBeforePrep = +(basePrice * safeMultiplier).toFixed(2);
  const finalPrice = prepAdjustedModifierPrice(totalPriceBeforePrep, prepModifier);
  const pre = pizzaPreModifierFromSide(side);
  const resolvedLabel = resolvePrepDisplayLabel(option?.name || '', prepModifier);
  return {
    modifierGroupId: group.id,
    modifierGroupName: group.name,
    optionId: option?.id || null,
    optionLabel: option?.name || '',
    optionName: resolvedLabel,
    resolvedLabel,
    price: finalPrice,
    preModifierType: 'portion',
    preModifierValue: pre.value,
    preModifierLabel: pre.label,
    prepModifierSetId: group?.prepModifierSetId || null,
    prepModifierId: prepModifier?.id || null,
    prepModifierLabel: prepModifier?.label || null,
    prepDisplayPattern: prepModifier?.displayPattern || null,
    prepPriceBehavior: prepModifier?.priceBehavior || null,
    prepPriceValue: Number(prepModifier?.priceValue || 0),
    prepResetsAfterUse: !!prepModifier?.resetsAfterUse,
    prepSelectedColorRole: prepModifier?.selectedColorRole || null,
    side,
    multiplier: safeMultiplier,
    quantityMultiplier: safeMultiplier,
    prepMultiplier: prepPriceMultiplier(prepModifier),
    unitPrice: basePrice,
    basePrice,
    finalPrice,
    totalPrice: finalPrice,
    toppingId: option?.id || null,
    toppingName: option?.name || ''
  };
}

function getPizzaSelection(groupId, optionId) {
  return normalizedSelectedMods(groupId).find((entry) => entry.optionId === optionId) || null;
}

function togglePizzaSelection(group, option, side) {
  if (!group || !option || !state.selected) return;
  state.selectedConfig.mods = state.selectedConfig.mods || {};
  const current = normalizedSelectedMods(group.id);
  const existing = current.find((entry) => entry.optionId === option.id);
  const activePrepModifier = getActivePrepModifierForGroup(group.id);
  const existingPrepModifier = normalizeStoredPrepModifier(existing, group);
  const prepModifier = activePrepModifier || existingPrepModifier || null;
  const selectedSide = existing?.side || pizzaSideFromPreModifier(existing?.preModifierValue);
  const samePrep = String(existing?.prepModifierId || '') === String(prepModifier?.id || '');
  if (existing && selectedSide === side && !activePrepModifier && samePrep) {
    state.selectedConfig.mods[group.id] = current.filter((entry) => entry.optionId !== option.id);
    return;
  }
  const multiplier = existing?.multiplier || 1;
  const sizeName = state.selectedConfig.size || state.selected.sizeSchema?.[0]?.name || null;
  const next = buildPizzaModifierEntry(group, option, state.selected, side, multiplier, sizeName, prepModifier);
  state.selectedConfig.mods[group.id] = [...current.filter((entry) => entry.optionId !== option.id), next];
  if (activePrepModifier?.resetsAfterUse) {
    clearActivePrepModifierForGroup(group.id);
  }
}

function cyclePizzaSelectionMultiplier(group, option) {
  if (!group || !option || !state.selected) return;
  state.selectedConfig.mods = state.selectedConfig.mods || {};
  const current = normalizedSelectedMods(group.id);
  const existing = current.find((entry) => entry.optionId === option.id);
  const activePrepModifier = getActivePrepModifierForGroup(group.id);
  const existingPrepModifier = normalizeStoredPrepModifier(existing, group);
  const prepModifier = activePrepModifier || existingPrepModifier || null;
  const side = existing?.side || pizzaSideFromPreModifier(existing?.preModifierValue) || 'whole';
  const multiplier = existing?.multiplier ? (existing.multiplier >= 3 ? 1 : existing.multiplier + 1) : 2;
  const sizeName = state.selectedConfig.size || state.selected.sizeSchema?.[0]?.name || null;
  const next = buildPizzaModifierEntry(group, option, state.selected, side, multiplier, sizeName, prepModifier);
  state.selectedConfig.mods[group.id] = [...current.filter((entry) => entry.optionId !== option.id), next];
  if (activePrepModifier?.resetsAfterUse) {
    clearActivePrepModifierForGroup(group.id);
  }
}

function resizePizzaSelectionPrices(item, sizeName) {
  const group = getPizzaToppingGroup(item);
  if (!group) return;
  const options = state.idx?.optsByGroup?.get(group.id) || [];
  const byOptionId = new Map(options.map((opt) => [opt.id, opt]));
  const current = normalizedSelectedMods(group.id);
  state.selectedConfig.mods = state.selectedConfig.mods || {};
  state.selectedConfig.mods[group.id] = current.map((entry) => {
    const option = byOptionId.get(entry.optionId);
    const side = entry.side || pizzaSideFromPreModifier(entry.preModifierValue) || 'whole';
    const multiplier = Math.max(1, Math.min(3, Number(entry.multiplier || 1)));
    if (!option) return entry;
    const prepModifier = normalizeStoredPrepModifier(entry, group);
    return buildPizzaModifierEntry(group, option, item, side, multiplier, sizeName, prepModifier);
  });
}

function selectedModifierTotal(): number {
  const all: any[] = Object.values(state.selectedConfig?.mods || {}).flat() as any[];
  return +all.reduce((sum: number, entry: any) => sum + Number(entry?.price || 0), 0).toFixed(2);
}

function pizzaSelectionSummary(groupId) {
  const selections = normalizedSelectedMods(groupId);
  const bySide = { whole: [], left: [], right: [] };
  selections.forEach((entry) => {
    const side = entry.side || pizzaSideFromPreModifier(entry.preModifierValue) || 'whole';
    const displayLabel = entry.resolvedLabel || entry.optionName || entry.optionLabel || '';
    const text = entry.multiplier > 1 ? `${displayLabel} ${entry.multiplier}X` : displayLabel;
    if (!bySide[side]) bySide[side] = [];
    bySide[side].push(text);
  });
  return bySide;
}

function pizzaGroupHasSelections(groupId) {
  return normalizedSelectedMods(groupId).length > 0;
}

function pizzaPrepHasSelections(groups, pizzaGroupId) {
  return groups
    .filter((group) => group.id !== pizzaGroupId)
    .some((group) => normalizedSelectedMods(group.id).length > 0);
}

function normalizedSelectedMods(groupId) {
  const raw = state.selectedConfig?.mods?.[groupId] || [];
  return raw.map((entry) => {
    if (entry && typeof entry === 'object') return entry;
    return {
      modifierGroupId: groupId,
      modifierGroupName: state.idx?.groupsById?.[groupId]?.name || '',
      optionId: null,
      optionName: asModifierValue(entry),
      price: 0,
      preModifierType: null,
      preModifierValue: null,
      preModifierLabel: null
    };
  });
}

function buildSelectedModifierEntry(group, option, preModifierValue) {
  const preValue = preModifierValue || null;
  return {
    modifierGroupId: group.id,
    modifierGroupName: group.name,
    optionId: option?.id || null,
    optionName: option?.name || '',
    price: getModifierSelectionPrice(option, preValue),
    preModifierType: preValue ? (group.preModifierType || null) : null,
    preModifierValue: preValue,
    preModifierLabel: preValue ? getSelectedPreModifierLabel(group.id, preValue) : null
  };
}

function getPreModifierCounts(groupId) {
  const counts = Object.create(null);
  normalizedSelectedMods(groupId).forEach((entry) => {
    if (!entry.preModifierValue) return;
    counts[entry.preModifierValue] = (counts[entry.preModifierValue] || 0) + 1;
  });
  return counts;
}

function selectionLabel(modifier) {
  const name = modifier?.resolvedLabel || modifier?.optionName || modifier?.optionLabel || '';
  const multiplier = Number(modifier?.multiplier || 1);
  const nameWithMultiplier = multiplier > 1 ? `${name} ${multiplier}X` : name;
  const price = Number(modifier?.price || 0);
  return price > 0 ? `${nameWithMultiplier} ${money(price)}` : nameWithMultiplier;
}

function formatGroupedModifiers(mods) {
  const normalized = (Array.isArray(mods) ? mods : []).map((entry) => {
    if (entry && typeof entry === 'object') return entry;
    return {
      modifierGroupId: null,
      modifierGroupName: '',
      optionId: null,
      optionName: asModifierValue(entry),
      price: 0,
      preModifierType: null,
      preModifierValue: null,
      preModifierLabel: null
    };
  });

  const groupedMap = new Map();
  const flatModifiers = [];

  normalized.forEach((modifier) => {
    if (!modifier.modifierGroupId) {
      flatModifiers.push(modifier);
      return;
    }

    if (!groupedMap.has(modifier.modifierGroupId)) {
      groupedMap.set(modifier.modifierGroupId, {
        modifierGroupId: modifier.modifierGroupId,
        modifierGroupName: modifier.modifierGroupName || state.idx?.groupsById?.[modifier.modifierGroupId]?.name || 'Modifiers',
        hasPreModifier: !!modifier.preModifierType,
        preModifierGroups: [],
        modifiers: []
      });
    }

    const groupEntry = groupedMap.get(modifier.modifierGroupId);
    if (modifier.preModifierType) {
      groupEntry.hasPreModifier = true;
    }
    groupEntry.modifiers.push(modifier);
  });

  const groupedModifiers = Array.from(groupedMap.values()).map((groupEntry) => {
    if (!groupEntry.hasPreModifier) {
      return {
        modifierGroupId: groupEntry.modifierGroupId,
        modifierGroupName: groupEntry.modifierGroupName,
        modifiers: groupEntry.modifiers.map((m) => ({ ...m }))
      };
    }

    const configured = getGroupPreModifierOptions(state.idx?.groupsById?.[groupEntry.modifierGroupId]);
    const byPre = new Map();
    groupEntry.modifiers.forEach((m) => {
      const value = m.preModifierValue || '__none__';
      if (!byPre.has(value)) {
        byPre.set(value, {
          preModifierValue: m.preModifierValue || null,
          preModifierLabel: m.preModifierLabel || m.preModifierValue || 'Default',
          modifiers: []
        });
      }
      byPre.get(value).modifiers.push({ ...m });
    });

    const preModifierGroups = [];
    configured.forEach((opt) => {
      const found = byPre.get(opt.value);
      if (found && found.modifiers.length) {
        preModifierGroups.push({
          preModifierValue: opt.value,
          preModifierLabel: opt.label,
          modifiers: found.modifiers
        });
      }
      byPre.delete(opt.value);
    });

    byPre.forEach((value) => {
      if (value.modifiers.length) preModifierGroups.push(value);
    });

    return {
      modifierGroupId: groupEntry.modifierGroupId,
      modifierGroupName: groupEntry.modifierGroupName,
      preModifierGroups
    };
  });

  return { groupedModifiers, flatModifiers };
}

function groupedModifiersCartHtml(mods) {
  const structured = formatGroupedModifiers(mods);
  const sections = [];

  structured.groupedModifiers.forEach((group) => {
    sections.push(`<small class="line-mod-group">${h(group.modifierGroupName)}:</small>`);
    if (Array.isArray(group.preModifierGroups) && group.preModifierGroups.length) {
      group.preModifierGroups.forEach((pre) => {
        sections.push(`<small class="line-mod-pre">${h(pre.preModifierLabel)}:</small>`);
        pre.modifiers.forEach((modifier) => {
          sections.push(`<small class="line-mod-option">+ ${h(selectionLabel(modifier))}</small>`);
        });
      });
    } else {
      (group.modifiers || []).forEach((modifier) => {
        sections.push(`<small class="line-mod-option">+ ${h(selectionLabel(modifier))}</small>`);
      });
    }
  });

  structured.flatModifiers.forEach((modifier) => {
    sections.push(`<small class="line-mod-option">+ ${h(selectionLabel(modifier))}</small>`);
  });

  return sections.join('');
}

function preModifierButtonsHtml(group) {
  if (!groupSupportsPreModifier(group)) return '';
  const options = getGroupPreModifierOptions(group);
  const selectedValue = getSelectedPreModifierValue(group.id);
  const counts = getPreModifierCounts(group.id);
  return `
    <div class="chips premod-row">
      ${options.map((opt) => {
        const count = counts[opt.value] || 0;
        const label = count > 0 ? `${opt.label} (${count})` : opt.label;
        return `<button class="chip ${selectedValue === opt.value ? 'active' : ''}" data-pre-group="${group.id}" data-pre-value="${h(opt.value)}">${h(label)}</button>`;
      }).join('')}
    </div>
  `;
}

function h(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function generateMenu(scale = 'large'): any {
  const t0 = performance.now();
  const cfg = scale === 'huge' ? { cats: 34, itemsPerCat: 44, toppings: 110, mods: 70 } : scale === 'large' ? { cats: 22, itemsPerCat: 28, toppings: 72, mods: 42 } : { cats: 12, itemsPerCat: 18, toppings: 40, mods: 24 };
  const categoryNames = ['Pizza', 'Specialty Pizza', 'Sicilian & Grandma', 'Slices', 'Calzones & Rolls', 'Appetizers', 'Salads', 'Heros', 'Wraps', 'Burgers', 'Pasta', 'Baked Pasta', 'Dinners', 'Seafood', 'Kids', 'Soups', 'Desserts', 'Beverages', 'Catering Half Trays', 'Catering Full Trays', 'Lunch Specials', 'Family Bundles', 'Chicken', 'Veal', 'Eggplant', 'Paninis', 'Gluten Free', 'Vegan', 'Side Orders', 'Sauces', 'Breakfast', 'Late Night', 'Party Packages', 'Coupons'];
  const itemWords = ['Classic', 'House', 'Deluxe', 'Grandma', 'Buffalo', 'BBQ', 'Vodka', 'Margarita', 'Primavera', 'Supreme', 'Brooklyn', 'Garden', 'Rustica', 'Napoli', 'Sicilian', 'Spicy', 'Garlic', 'Crispy', 'Stuffed', 'Loaded', 'Parmigiana', 'Francese', 'Marsala', 'Alfredo', 'Pesto', 'Balsamic', 'Mediterranean', 'Tuscan'];
  const bases = ['Cheese Pizza', 'Chicken Cutlet Hero', 'Meatball Parm', 'Penne Vodka', 'Caesar Salad', 'Cheeseburger', 'Mozzarella Sticks', 'Garlic Knots', 'Chicken Wings', 'Eggplant Rollatini', 'Baked Ziti', 'Shrimp Scampi', 'Buffalo Chicken Wrap', 'Greek Salad', 'Sausage Roll', 'Chicken Francese', 'Veal Marsala', 'Grandma Pie', 'Stuffed Shells', 'Cannoli'];
  const sizes = [
    { id: 'size_personal', name: 'Personal', multiplier: 0.62 },
    { id: 'size_small', name: 'Small', multiplier: 0.78 },
    { id: 'size_medium', name: 'Medium', multiplier: 1 },
    { id: 'size_large', name: 'Large', multiplier: 1.24 },
    { id: 'size_xlarge', name: 'X-Large', multiplier: 1.48 },
    { id: 'size_half_tray', name: 'Half Tray', multiplier: 2.9 },
    { id: 'size_full_tray', name: 'Full Tray', multiplier: 5.4 }
  ];
  const categories = [];
  const items = [];
  const modifierGroups = [];
  const modifierOptions = [];
  const itemModifierGroups = [];
  const printerRoutes = [];
  const taxRules = [{ id: 'tax_food', name: 'Food Tax', rate: 0.06625 }, { id: 'tax_none', name: 'No Tax', rate: 0 }];
  const toppingNames = ['Pepperoni', 'Sausage', 'Mushrooms', 'Onions', 'Green Peppers', 'Black Olives', 'Fresh Garlic', 'Extra Cheese', 'Meatball', 'Bacon', 'Ham', 'Pineapple', 'Spinach', 'Broccoli', 'Ricotta', 'Fresh Mozzarella', 'Roasted Peppers', 'Chicken', 'Anchovies', 'Jalapenos', 'Banana Peppers', 'Artichokes', 'Eggplant', 'Sun-Dried Tomato', 'Prosciutto', 'Hot Honey', 'Basil', 'Tomato', 'Vodka Sauce', 'Pesto', 'Buffalo Sauce', 'BBQ Sauce'];
  const sideNames = ['Pasta', 'Salad', 'French Fries', 'Rice', 'Vegetables', 'Garlic Bread', 'Soup', 'Mashed Potatoes', 'Side Caesar', 'Side Greek Salad'];
  const cookNames = ['Light Cook', 'Regular Cook', 'Well Done', 'Extra Crispy', 'Do Not Cut', 'Cut in Squares', 'No Salt', 'Sauce on Side', 'Dressing on Side', 'Extra Sauce'];
  const drinkNames = ['Coke', 'Diet Coke', 'Sprite', 'Root Beer', 'Orange Soda', 'Water', 'Iced Tea', 'Lemonade', 'Dr Pepper', 'Ginger Ale'];

  // Fixed sample items for the primary pizza categories. These replace the
  // random item-name generator for these categories only.
  const fixedItemsByCategory: Record<string, string[]> = {
    Pizza: [
      'Plain Pie',
      'Margherita Pie',
      'Sicilian Pie',
      'Pepperoni Pie',
      'Sausage Pie',
      'Vodka Pie',
      'Gluten Free Pie'
    ],
    'Specialty Pizza': [
      'Buffalo Chicken Pie',
      'Chicken Bacon Ranch Pie',
      'Hawaiian Pie',
      'Chicken Marsala Pie',
      'Chicken Francese Pie',
      'Vegetable Pie'
    ],
    'Sicilian & Grandma': [
      'Sicilian Pie',
      'Grandma Pie',
      'Brooklyn Pie'
    ]
  };

  function addGroup(name: any, type: any, options: any[], rules: any = {}) {
    const gid = makeId('grp', modifierGroups.length + 1);
    modifierGroups.push({
      id: gid,
      name,
      type,
      min: rules.min || 0,
      max: rules.max || 999,
      pricingMode: rules.pricingMode || 'flat',
      allowHalf: !!rules.allowHalf,
      nested: !!rules.nested,
      prepModifierSetId: rules.prepModifierSetId || null,
      preModifierType: rules.preModifierType || null,
      preModifierOptions: Array.isArray(rules.preModifierOptions)
        ? rules.preModifierOptions.map((opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return {
              value: asModifierValue(opt?.value ?? opt?.id ?? opt?.label),
              label: asModifierValue(opt?.label ?? opt?.name ?? opt?.value)
            };
          }).filter((opt) => opt.value)
        : null
    });
    options.forEach((o, idx) => {
      const oid = `${gid}_opt_${String(idx + 1).padStart(3, '0')}`;
      modifierOptions.push({
        id: oid,
        groupId: gid,
        name: o.name,
        price: o.price || 0,
        wholePrice: o.wholePrice,
        halfPrice: o.halfPrice,
        sizePrices: o.sizePrices || null,
        childGroupId: o.childGroupId || null
      });
    });
    return gid;
  }

  const toppingOptions = Array.from({ length: cfg.toppings }, (_, i) => {
    const name = i < toppingNames.length ? toppingNames[i] : `${sample(['Premium', 'Imported', 'House', 'Fire-Roasted'])} ${sample(toppingNames)} ${i}`;
    return {
      name,
      wholePrice: 2 + (i % 6) * 0.5,
      halfPrice: 1.25 + (i % 5) * 0.35,
      sizePrices: {
        size_personal: 1.25,
        size_small: 1.75,
        size_medium: 2.25,
        size_large: 2.75,
        size_xlarge: 3.5
      }
    };
  });

  const pizzaToppingsGroup = addGroup('Pizza Toppings - Half/Whole Size Aware', 'multi-select', toppingOptions, {
    allowHalf: true,
    pricingMode: 'pizza_half_whole',
    prepModifierSetId: 'pizza_topping_preps',
    preModifierType: 'portion',
    preModifierOptions: [
      { value: 'WHOLE', label: 'WHOLE' },
      { value: 'HALF 1', label: 'HALF 1' },
      { value: 'HALF 2', label: 'HALF 2' }
    ]
  });
  const cookingGroup = addGroup('Cooking / Prep Instructions', 'multi-select', cookNames.map((n) => ({ name: n, price: 0 })), { max: 5 });
  const sideGroup = addGroup('Dinner Side Choice', 'single-select', sideNames.map((n, i) => ({ name: n, price: i > 5 ? 1.5 : 0 })), { min: 1, max: 1 });
  const wingSauceGroup = addGroup('Wing Sauce', 'single-select', ['Mild', 'Hot', 'BBQ', 'Garlic Parm', 'Teriyaki', 'Honey Mustard', 'Mango Habanero', 'Plain'].map((n) => ({ name: n, price: 0 })), { min: 1, max: 1 });
  const heroAddonsGroup = addGroup('Hero Add-ons', 'multi-select', ['Extra Cheese', 'Hot Peppers', 'Sweet Peppers', 'Mushrooms', 'Onions', 'Lettuce/Tomato', 'Bacon', 'Avocado'].map((n, i) => ({ name: n, price: i > 5 ? 2 : 1 })), { max: 6 });
  const nestedSauceGroup = addGroup('Sauce on Item', 'single-select', ['Marinara', 'Vodka Sauce', 'Alfredo', 'Pesto', 'Buffalo', 'BBQ', 'No Sauce'].map((n, i) => ({ name: n, price: i > 1 && i < 5 ? 1.5 : 0 })), { max: 1 });
  const pastaChoiceGroup = addGroup('Pasta Choice', 'single-select', ['Spaghetti', 'Penne', 'Linguine', 'Angel Hair', 'Rigatoni', 'Fettuccine', 'Gluten Free Penne'].map((n, i) => ({ name: n, price: i === 6 ? 3 : 0, childGroupId: i < 6 ? nestedSauceGroup : null })), { min: 1, max: 1, nested: true });
  const couponDrinkGroup = addGroup('Bundle Drink', 'single-select', drinkNames.map((n) => ({ name: n, price: 0 })), { min: 1, max: 1 });

  for (let c = 0; c < cfg.cats; c++) {
    const cid = makeId('cat', c + 1);
    const cname = categoryNames[c] || `Category ${c + 1}`;
    categories.push({
      id: cid,
      name: cname,
      sortOrder: c + 1,
      printerRouteId: c % 5 === 0 ? 'printer_pizza' : c % 4 === 0 ? 'printer_cold' : 'printer_kitchen',
      imageUrl: c % 5 === 0 ? mockFoodImageDataUri(cname, (c * 41) % 360) : null
    });
    printerRoutes.push({
      id: `route_${cid}`,
      categoryId: cid,
      kitchenPrinter: c % 5 === 0 ? 'Pizza Printer' : c % 4 === 0 ? 'Cold Station' : 'Kitchen Printer',
      receiptPrinter: 'Front Receipt'
    });

    const fixedCategoryItems = fixedItemsByCategory[cname] || null;
    const categoryItemCount = fixedCategoryItems ? fixedCategoryItems.length : cfg.itemsPerCat;

    for (let j = 0; j < categoryItemCount; j++) {
      const globalIndex = c * cfg.itemsPerCat + j + 1;
      const id = makeId('item', globalIndex);
      const isPizza = /Pizza|Sicilian|Slices/.test(cname) || j % 13 === 0;
      const isPizzaLike = /Pizza|Sicilian|Slices/.test(cname) || j % 13 === 0;
      const usesCustomPizzaModifierUi = isCustomPizzaModifierCategoryName(cname);
      const isDinner = /Dinner|Seafood|Veal|Chicken|Eggplant/.test(cname);
      const isPasta = /Pasta/.test(cname) || j % 17 === 0;
      const isHero = /Heros|Wraps|Paninis|Burgers/.test(cname);
      const isCatering = /Catering/.test(cname);
      const basePrice = +(6 + (j % 11) * 1.45 + (c % 7) * 0.85).toFixed(2);

      const item = {
        id,
        categoryId: cid,
        name: fixedCategoryItems?.[j] || `${sample(itemWords)} ${sample(bases)}`,
        description: fixedCategoryItems
          ? `${fixedCategoryItems[j]} sample menu item.`
          : `Mock item ${globalIndex} with realistic nested modifiers, routing, pricing, and register display data.`,
        sortOrder: j + 1,
        fixedPrice: !isPizzaLike && !isCatering && j % 4 !== 0,
        basePrice,
        imageUrl: null,
        taxRuleId: c % 9 === 0 ? 'tax_none' : 'tax_food',
        printerRouteId: categories[c].printerRouteId,
        sizeSchema: null,
        modifierUiType: usesCustomPizzaModifierUi ? 'pizza' : 'standard',
        isPizzaItem: !!usesCustomPizzaModifierUi,
        popular: j < 4,
        active: true
      };

      if (!item.fixedPrice) {
        const applicable = isCatering ? sizes.slice(5) : isPizzaLike ? sizes.slice(0, 5) : sizes.slice(1, 4);
        item.sizeSchema = applicable.map((s) => ({ sizeId: s.id, name: s.name, price: +(basePrice * s.multiplier).toFixed(2) }));
      }

      if (globalIndex % 29 === 0 || (isPizzaLike && j < 2) || (isDinner && j === 0)) {
        item.imageUrl = mockFoodImageDataUri(item.name, (globalIndex * 17) % 360);
      }

      items.push(item);

      if (usesCustomPizzaModifierUi) itemModifierGroups.push({ itemId: id, groupId: pizzaToppingsGroup }, { itemId: id, groupId: cookingGroup });
      if (isDinner) itemModifierGroups.push({ itemId: id, groupId: sideGroup }, { itemId: id, groupId: cookingGroup });
      if (isPasta) itemModifierGroups.push({ itemId: id, groupId: pastaChoiceGroup }, { itemId: id, groupId: cookingGroup });
      if (isHero) itemModifierGroups.push({ itemId: id, groupId: heroAddonsGroup }, { itemId: id, groupId: cookingGroup });
      if (/Wings|Appetizers/.test(cname) || j % 19 === 0) itemModifierGroups.push({ itemId: id, groupId: wingSauceGroup });
      if (/Family|Coupons/.test(cname) || j % 23 === 0) itemModifierGroups.push({ itemId: id, groupId: couponDrinkGroup });
    }
  }

  const menu: any = {
    merchantDetailId: 350,
    locationId: 350,
    registerPackageVersion: Date.now(),
    generatedAt: nowIso(),
    scale,
    counts: {
      categories: categories.length,
      items: items.length,
      modifierGroups: modifierGroups.length,
      modifierOptions: modifierOptions.length,
      itemModifierGroups: itemModifierGroups.length
    },
    taxRules,
    sizes,
    categories,
    items,
    modifierGroups,
    modifierOptions,
    itemModifierGroups,
    printerRoutes,
    registerSettings: {
      mode: 'PRINT_ONLY',
      keepReprintMinutes: 60,
      currency: 'USD',
      orderTypes: ['Pickup', 'Delivery', 'To-Go', 'To-Stay'],
      defaultOrderType: 'Pickup'
    }
  };

  menu.generateMs = +(performance.now() - t0).toFixed(2);
  return menu;
}

const { buildLilposRuntimePackageFromLegacy, createLilposDataService }: any = window.LilposRuntime;
const lilposDataService = createLilposDataService({
  nowIso,
  normalizePhone,
  isItemOutOfStock,
  getLineCount: () => state.lineCount,
  getFallbackCustomers: () => state.mockCustomers
});
window.lilposDataService = lilposDataService;

function runtimeSeed() {
  return {
    favoriteItemIds: state.favoriteItemIds,
    favoriteCategoryIds: state.favoriteCategoryIds,
    customers: state.mockCustomers
  };
}

function ensureMockImages(runtimePkg) {
  const items = runtimePkg?.itemTiles || runtimePkg?.items;
  const categories = runtimePkg?.categories;
  if (!Array.isArray(items)) return;
  items.forEach((item, idx) => {
    if (!item || item.imageUrl) return;
    const shouldAdd = idx % 29 === 0 || /pizza|wings|pasta|salad/i.test(String(item.name || ''));
    if (shouldAdd && idx % 3 === 0) {
      item.imageUrl = mockFoodImageDataUri(item.name || 'Food Item', (idx * 29) % 360);
    }
  });

  if (Array.isArray(categories)) {
    categories.forEach((category, idx) => {
      if (!category || category.imageUrl) return;
      if (idx % 5 === 0) {
        category.imageUrl = mockFoodImageDataUri(category.name || 'Category', (idx * 41) % 360);
      }
    });
  }
}

function loadRuntimeIntoState(input) {
  lilposDataService.loadRuntimePackage(input, runtimeSeed());
  state.menu = lilposDataService.runtimePackage;
  ensureMockImages(state.menu);
  state.idx = lilposDataService.getLegacyIndex();
}

function ensureActiveCategory() {
  if (!state.menu?.categories?.length) return;
  const regular = lilposDataService.indexes.categoriesById.get(state.category);
  if (!state.category || (regular && regular.hidden)) {
    state.category = VIEW_ALL_ITEMS;
  }
}

async function loadFromDb() {
  await lilposDataService.ensureHistoryPersistenceReady();
  await refreshPersistedOrdersCache({ refreshNextOrderNumber: true, renderAfter: false });
  const t0 = performance.now();
  const cached = await lilposDataService.getRuntimeCache('activeMenu');
  const ms = +(performance.now() - t0).toFixed(2);
  if (cached) {
    loadRuntimeIntoState(cached);
    hydrateUiStateFromMenu();
    state.metrics = {
      ...state.metrics,
      loadIndexedDbMs: ms,
      packageBytes: new Blob([JSON.stringify(state.menu)]).size,
      indexMs: state.idx.indexMs
    };

    // Boundary for future obfuscation: persisted runtime package can later be compact/encrypted/signed/compressed.
    if (cached.runtimeKind !== 'lilpos-runtime-package-v1') {
      await lilposDataService.saveRuntimeCache('activeMenu', state.menu);
    }

    ensureActiveCategory();
    render();
  }
}

async function generateAndStore() {
  const legacy = generateMenu(state.scale);
  const runtime = buildLilposRuntimePackageFromLegacy(legacy, runtimeSeed());
  runtime.generateMs = legacy.generateMs;
  loadRuntimeIntoState(runtime);
  const bytes = new Blob([JSON.stringify(state.menu)]).size;
  const t0 = performance.now();
  await lilposDataService.saveRuntimeCache('activeMenu', state.menu);
  const storeMs = +(performance.now() - t0).toFixed(2);

  const t1 = performance.now();
  const back = await lilposDataService.getRuntimeCache('activeMenu');
  const readMs = +(performance.now() - t1).toFixed(2);

  loadRuntimeIntoState(back);
  hydrateUiStateFromMenu();
  state.metrics = {
    generateMs: legacy.generateMs,
    storeIndexedDbMs: storeMs,
    loadIndexedDbMs: readMs,
    packageBytes: bytes,
    indexMs: state.idx.indexMs
  };
  ensureActiveCategory();
  render();
}

async function generateSeed(scale) {
  state.scale = scale;
  await generateAndStore();
}

async function clearAll() {
  await lilposDataService.clearRuntimeCache();
  Object.assign(state, { menu: null, metrics: {}, cart: [], selected: null, idx: null, category: VIEW_ALL_ITEMS, favoriteCategoryIds: [], sentOrdersToday: [], orderSpecialInstructions: '' });
  state.removeConfirmLineId = null;
  state.orderTypeDraftDialog = { open: false, type: null, name: '', phone: '', tableNumber: '' };
  state.orderTypeDetails = { togoName: '', togoPhone: '', dineInTableNumber: '' };
  resetOrderClassifiers();
  render();
}

function clearTicket() {
  state.cart = [];
  state.removeConfirmLineId = null;
  state.orderSpecialInstructions = '';
  state.orderTypeDetails = { togoName: '', togoPhone: '', dineInTableNumber: '' };
  state.orderTypeDraftDialog = { open: false, type: null, name: '', phone: '', tableNumber: '' };
  render();
}

function setActiveOrderSpecialInstructions(value) {
  if (selectedOrderForDetail()) return;
  state.orderSpecialInstructions = String(value || '').slice(0, 280);
}

function clearActiveOrderSpecialInstructions() {
  state.orderSpecialInstructions = '';
}

function syncOrderSpecialInstructionsLiveUi() {
  const live = document.querySelector('#orderSpecialInstructionsLive') as HTMLElement | null;
  const clearBtn = document.querySelector('#clearOrderSpecialInstructionsBtn') as HTMLButtonElement | null;
  const value = String(state.orderSpecialInstructions || '').trim();
  const locked = !!selectedOrderForDetail();

  if (clearBtn) {
    clearBtn.disabled = locked || !value;
  }

  if (live) {
    if (value) {
      live.textContent = `Special Instructions: ${value}`;
      live.classList.remove('is-hidden');
    } else {
      live.textContent = '';
      live.classList.add('is-hidden');
    }
  }
}

function resetOrderClassifiers() {
  state.orderType = 'pickup';
  state.orderSource = 'unknown';
  state.isPhoneOrder = false;
  state.phoneClassifierSelected = false;
  state.timingType = 'asap';
  state.asapTime = '';
  state.futureDateTime = null;
  state.futureOrderNote = '';
  state.thirdClassifierSelected = false;
  state.deliveryInfoMissing = false;
  state.orderTypeDraftDialog = { open: false, type: null, name: '', phone: '', tableNumber: '' };
  closeScheduleDialog();
  closeAsapAdjustDialog();
}

function parseOrderFutureTimestamp(order) {
  if (!order?.futureDateTime) return null;
  const parsed = new Date(order.futureDateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function isQueuedFutureOrder(order, nowTs = Date.now()) {
  if (!order) return false;
  if (order.status === 'completed' || order.status === 'canceled') return false;
  const futureTs = parseOrderFutureTimestamp(order);
  if (futureTs == null) return false;
  const timingType = String(order.timingType || '').toLowerCase();
  return timingType === 'future' && futureTs > nowTs;
}

function orderQueueFilterMatch(order, queueFilter, nowTs = Date.now()) {
  const isFuture = isQueuedFutureOrder(order, nowTs);
  if (queueFilter === ORDER_MGMT_FILTERS.future) return isFuture;
  if (queueFilter === ORDER_MGMT_FILTERS.open) return order.status === 'open' && !isFuture;
  if (queueFilter === ORDER_MGMT_FILTERS.completed) return order.status === 'completed';
  if (queueFilter === ORDER_MGMT_FILTERS.online) return !!order.onlineOnly && !isFuture;
  return true;
}

function dedupeOrderRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row?.id || '');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function queueCountForFilter(queueFilter) {
  return filteredOrderManagementRows({ queueFilter, applyQuery: false }).length;
}

function orderQueueChips() {
  return [
    { id: ORDER_MGMT_FILTERS.open, label: 'Open' },
    { id: ORDER_MGMT_FILTERS.completed, label: 'Completed' },
    { id: ORDER_MGMT_FILTERS.online, label: 'Online Only' },
    { id: ORDER_MGMT_FILTERS.future, label: 'Future Orders' }
  ];
}

function filteredOrderManagementRows(options: any = {}) {
  const queueFilter = options.queueFilter || state.ordersFilter;
  const applyQuery = options.applyQuery !== false;
  const q = applyQuery ? String(state.ordersQuery || '').trim().toLowerCase() : '';
  const nowTs = Date.now();
  const persistedRows = persistedOrders().map((order) => ({
    id: order.id,
    number: order.orderNumber,
    customerName: order.customer?.name || 'Guest',
    orderType: order.orderType,
    status: normalizeOrderStatus(order),
    source: order.orderSource,
    onlineOnly: String(order.orderSource || '').toLowerCase() === 'online',
    timeLabel: order.timingType === 'future' && order.futureDateTime
      ? `Future: ${formatFutureLabel(order.futureDateTime)}`
      : new Date(order.createdTimestamp).toLocaleTimeString(),
    createdTimestamp: order.createdTimestamp,
    timingType: order.timingType || 'asap',
    futureDateTime: order.futureDateTime || null,
    total: Number(order.total || 0),
    paymentStatus: order.paymentStatus,
    paid: !!order.paid,
    isPersisted: true
  }));

  const legacyRows = (state.mockOrders || []).map((order) => ({
    ...order,
    status: normalizeOrderStatus(order),
    paymentStatus: order.paymentStatus || (order.status === 'completed' ? 'paid' : 'unpaid'),
    paid: typeof order.paid === 'boolean' ? order.paid : order.status === 'completed',
    timeLabel: order.timingType === 'future' && order.futureDateTime
      ? `Future: ${formatFutureLabel(order.futureDateTime)}`
      : order.timeLabel,
    timingType: order.timingType || 'asap',
    futureDateTime: order.futureDateTime || null,
    isPersisted: false
  }));

  const allOrders = dedupeOrderRows([...persistedRows, ...legacyRows]);

  const filtered = allOrders.filter((order) => {
    if (!orderQueueFilterMatch(order, queueFilter, nowTs)) return false;
    if (!q) return true;
    const blob = `${order.number} ${order.customerName} ${ORDER_TYPES[order.orderType] || order.orderType} ${order.status} ${order.source}`.toLowerCase();
    return blob.includes(q);
  });

  if (queueFilter === ORDER_MGMT_FILTERS.future) {
    filtered.sort((a, b) => {
      const aFuture = parseOrderFutureTimestamp(a);
      const bFuture = parseOrderFutureTimestamp(b);
      const aTs = aFuture == null ? Number.POSITIVE_INFINITY : aFuture;
      const bTs = bFuture == null ? Number.POSITIVE_INFINITY : bFuture;
      if (aTs !== bTs) return aTs - bTs;
      const aCreated = new Date(a.createdTimestamp || 0).getTime();
      const bCreated = new Date(b.createdTimestamp || 0).getTime();
      return aCreated - bCreated;
    });
  }

  return filtered;
}

function formatOrderNumberForDisplay(orderNumber) {
  const raw = String(orderNumber || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return String(Number(raw));
  const stationPattern = raw.match(/^(\d+)-0*(\d+)$/);
  if (stationPattern) return `${stationPattern[1]}-${Number(stationPattern[2])}`;
  return raw;
}

function resolveStoredOrderIdentity(order) {
  const candidates = [
    order?.customer?.name,
    order?.customerName,
    order?.customerLabel,
    order?.orderLabel,
    order?.orderIdentity,
    order?.displayName
  ];
  const best = candidates.find((value) => String(value || '').trim());
  return String(best || 'Guest').trim();
}

function resolvePreviousOrderPaymentLines(order) {
  const sources = [
    order?.paymentLines,
    order?.rawSnapshot?.paymentLines,
    order?.payloadSnapshot?.paymentLines,
    order?.payment?.lines
  ];
  const lines = sources.find((entry) => Array.isArray(entry) && entry.length) || [];
  return lines.map((line) => {
    const lastFourRaw = String(line?.lastFour || line?.last4 || line?.cardLastFour || '').replace(/\D/g, '');
    return {
      paymentType: String(line?.paymentType || line?.type || line?.tenderType || '').trim(),
      amount: Number(line?.amount || line?.paidAmount || 0) || 0,
      cardBrand: String(line?.cardBrand || line?.brand || line?.cardType || '').trim(),
      lastFour: lastFourRaw.length >= 4 ? lastFourRaw.slice(-4) : ''
    };
  });
}

function paymentTypeToIcon(typeLabel) {
  const normalized = String(typeLabel || '').toLowerCase();
  if (normalized.includes('cash')) return 'cash';
  if (normalized.includes('gift')) return 'gift';
  if (normalized.includes('split')) return 'split';
  if (normalized.includes('text') || normalized.includes('link') || normalized.includes('phone')) return 'link';
  if (normalized.includes('card') || normalized.includes('credit') || normalized.includes('debit') || normalized.includes('visa') || normalized.includes('mastercard') || normalized.includes('amex') || normalized.includes('discover')) return 'card';
  return 'payment';
}

function paymentTypeDisplayLabel(typeLabel) {
  const normalized = String(typeLabel || '').toLowerCase();
  if (normalized.includes('cash')) return 'Cash';
  if (normalized.includes('gift')) return 'Gift Card';
  if (normalized.includes('split')) return 'Split Tender';
  if (normalized.includes('text') || normalized.includes('link') || normalized.includes('phone')) return 'Text Payment Link';
  if (normalized.includes('card') || normalized.includes('credit') || normalized.includes('debit') || normalized.includes('visa') || normalized.includes('mastercard') || normalized.includes('amex') || normalized.includes('discover')) return 'Credit/Debit Card';
  return typeLabel ? String(typeLabel) : 'Other tender';
}

function previousOrderPaymentSummaryHtml(order) {
  const status = String(order?.status || '').toLowerCase();
  const isClosedOrCompleted = status === 'completed' || status === 'closed';
  if (!isClosedOrCompleted || !order?.paid) return '';

  const lines = resolvePreviousOrderPaymentLines(order).filter((line) => line.paymentType || line.amount > 0 || line.cardBrand || line.lastFour);
  const summaryText = String(order?.paymentMethodSummary || '').trim();

  if (!lines.length && !summaryText) {
    return `<div class="order-payment-method unavailable"><span class="order-payment-method-icon icon-glyph">${navIcon('payment')}</span><span>Payment method unavailable</span></div>`;
  }

  if (lines.length > 1) {
    const withAmounts = lines.filter((line) => line.amount > 0);
    const splitDetails = withAmounts.length
      ? withAmounts.map((line) => `${paymentTypeDisplayLabel(line.paymentType)} ${money(line.amount)}`).join(' • ')
      : 'Split Tender';
    return `<div class="order-payment-method split"><span class="order-payment-method-icon icon-glyph">${navIcon('split')}</span><span>${h(splitDetails)}</span></div>`;
  }

  const line = lines[0] || null;
  const iconName = line ? paymentTypeToIcon(line.paymentType) : paymentTypeToIcon(summaryText);
  let displayLabel = summaryText;
  if (line) {
    const normalizedLabel = paymentTypeDisplayLabel(line.paymentType);
    if (normalizedLabel === 'Credit/Debit Card' && line.cardBrand && line.lastFour) {
      const brand = line.cardBrand.charAt(0).toUpperCase() + line.cardBrand.slice(1).toLowerCase();
      displayLabel = `${brand} •••• ${line.lastFour}`;
    } else if (normalizedLabel === 'Credit/Debit Card' && summaryText) {
      displayLabel = summaryText;
    } else {
      displayLabel = normalizedLabel;
    }
  }

  return `<div class="order-payment-method"><span class="order-payment-method-icon icon-glyph">${navIcon(iconName)}</span><span>${h(displayLabel || 'Payment method unavailable')}</span></div>`;
}

function formatAuditEventTime(value) {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function normalizeAuditEventLabel(label) {
  const raw = String(label || '').trim();
  if (!raw) return 'Updated';
  const lower = raw.toLowerCase();
  const map = {
    entered: 'Entered',
    updated: 'Updated',
    sent: 'Sent',
    paid: 'Paid',
    partially_paid: 'Partially Paid',
    partiallypaid: 'Partially Paid',
    completed: 'Completed',
    closed: 'Closed',
    canceled: 'Canceled',
    voided: 'Voided',
    refunded: 'Refunded',
    reopened: 'Reopened',
    reprinted: 'Reprinted'
  };
  return map[lower] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

function resolveOrderAuditRows(order) {
  const authoritativeSources = [
    order?.auditEvents,
    order?.auditTrail,
    order?.history,
    order?.events,
    order?.rawSnapshot?.auditEvents,
    order?.payloadSnapshot?.auditEvents
  ];
  const source = authoritativeSources.find((entry) => Array.isArray(entry) && entry.length) || [];
  if (source.length) {
    return source.map((event) => ({
      label: normalizeAuditEventLabel(event?.label || event?.event || event?.type || event?.status || 'Updated'),
      timestamp: event?.timestamp || event?.at || event?.createdAt || event?.time || event?.when || null,
      employee: String(event?.employeeShortName || event?.employeeInitials || event?.employeeCode || event?.employeeId || event?.employee || event?.by || 'System').trim() || 'System'
    })).sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
  }

  const fallbackRows = [];
  if (order?.createdTimestamp) fallbackRows.push({ label: 'Entered', timestamp: order.createdTimestamp, employee: 'System' });
  if (order?.paid && order?.updatedTimestamp) fallbackRows.push({ label: 'Paid', timestamp: order.updatedTimestamp, employee: 'System' });
  if ((String(order?.status || '').toLowerCase() === 'completed' || String(order?.status || '').toLowerCase() === 'closed') && order?.updatedTimestamp) {
    fallbackRows.push({ label: 'Closed', timestamp: order.updatedTimestamp, employee: 'System' });
  }
  return fallbackRows;
}

function previousOrderHistorySummaryLine(order) {
  const typeLabel = ORDER_TYPES[order?.orderType] || order?.orderType || 'Unknown';
  const statusLabel = String(order?.status || 'open');
  const paymentLabel = String(order?.paymentStatus || (order?.paid ? 'paid' : 'unpaid'));
  const timeLabel = String(order?.timeLabel || '').trim();
  const timingLabel = order?.timingType === 'future' && order?.futureDateTime
    ? `Future: ${formatFutureLabel(order.futureDateTime)}`
    : 'ASAP';
  const rightTail = [timeLabel, timingLabel].filter(Boolean).join(' ');
  if (!rightTail) return `${typeLabel} | ${statusLabel} | ${paymentLabel}`;
  return `${typeLabel} | ${statusLabel} | ${paymentLabel} | ${rightTail}`;
}

function previousOrderAuditTrailHtml(order) {
  const rows = resolveOrderAuditRows(order);
  const expanded = !!state.previousOrderAuditExpanded;
  const toggleGlyph = expanded ? '&#9650;' : '&#9660;';
  const summaryLine = previousOrderHistorySummaryLine(order);
  return `
    <div class="order-audit-trail">
      <div class="order-audit-toggle-row">
        <small class="order-audit-summary">${h(summaryLine)}</small>
        <button
          id="togglePreviousOrderAudit"
          class="order-audit-toggle-btn"
          aria-label="${expanded ? 'Collapse order history' : 'Expand order history'}"
          aria-expanded="${expanded ? 'true' : 'false'}"
          title="${expanded ? 'Collapse order history' : 'Expand order history'}"
        >${toggleGlyph}</button>
      </div>
      ${expanded && rows.length ? `
        <div class="order-audit-list">
          ${rows.map((row) => `
            <div class="order-audit-row">
              <span class="order-audit-event">${h(row.label)}</span>
              <span class="order-audit-time">${h(formatAuditEventTime(row.timestamp))}</span>
              <span class="order-audit-employee">${h(row.employee || 'System')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function selectedOrderForDetail() {
  if (!state.selectedOrderId) return null;
  const persistedOrder = state.persistedOrderDetailCacheById[state.selectedOrderId]
    || persistedOrders().find((entry) => entry.id === state.selectedOrderId)
    || null;
  if (persistedOrder) {
    const customer = resolveOrderCustomerSnapshot(persistedOrder);
    const lines = Array.isArray(persistedOrder.lines) ? persistedOrder.lines : [];
    const status = normalizeOrderStatus(persistedOrder);
    return {
      id: persistedOrder.id,
      number: persistedOrder.orderNumber,
      customerName: customer.name || 'Guest',
      customerLabel: persistedOrder.customerLabel || persistedOrder.rawSnapshot?.customerLabel || '',
      orderLabel: persistedOrder.orderLabel || persistedOrder.rawSnapshot?.orderLabel || '',
      orderIdentity: persistedOrder.orderIdentity || persistedOrder.rawSnapshot?.orderIdentity || '',
      displayName: persistedOrder.displayName || persistedOrder.rawSnapshot?.displayName || '',
      customer,
      orderType: persistedOrder.orderType,
      status,
      paymentStatus: persistedOrder.paymentStatus || (persistedOrder.paid ? 'paid' : 'unpaid'),
      paid: !!persistedOrder.paid,
      source: persistedOrder.orderSource,
      onlineOnly: persistedOrder.orderSource === 'online',
      timeLabel: new Date(persistedOrder.createdTimestamp).toLocaleTimeString(),
      total: persistedOrder.total,
      subtotal: persistedOrder.subtotal,
      tax: persistedOrder.tax,
      timingType: persistedOrder.timingType,
      asapTime: persistedOrder.asapTime,
      futureDateTime: persistedOrder.futureDateTime,
      orderSpecialInstructions: persistedOrder.orderSpecialInstructions || persistedOrder.rawSnapshot?.orderSpecialInstructions || '',
      paymentMethodSummary: persistedOrder.paymentMethodSummary || persistedOrder.rawSnapshot?.paymentMethodSummary || '',
      paymentLines: persistedOrder.paymentLines || persistedOrder.rawSnapshot?.paymentLines || persistedOrder.payloadSnapshot?.paymentLines || [],
      auditEvents: persistedOrder.auditEvents || persistedOrder.auditTrail || persistedOrder.history || persistedOrder.events || persistedOrder.rawSnapshot?.auditEvents || persistedOrder.payloadSnapshot?.auditEvents || [],
      createdTimestamp: persistedOrder.createdTimestamp,
      updatedTimestamp: persistedOrder.updatedTimestamp,
      lines,
      isPersisted: true
    };
  }

  const order = (state.mockOrders || []).find((entry) => entry.id === state.selectedOrderId);
  if (order) {
    const derivedSubtotal = +(Number(order.total || 0) / 1.06625).toFixed(2);
    const derivedTax = +(Number(order.total || 0) - derivedSubtotal).toFixed(2);
    return {
      id: order.id,
      number: order.number,
      customerName: order.customerName || 'Guest',
      customerLabel: order.customerLabel || '',
      orderLabel: order.orderLabel || '',
      orderIdentity: order.orderIdentity || '',
      displayName: order.displayName || '',
      customer: {
        name: order.customerName || 'Guest'
      },
      orderType: order.orderType,
      status: normalizeOrderStatus(order),
      paymentStatus: order.paymentStatus || (order.status === 'completed' ? 'paid' : 'unpaid'),
      paid: typeof order.paid === 'boolean' ? order.paid : order.status === 'completed',
      source: order.source,
      onlineOnly: !!order.onlineOnly,
      timeLabel: order.timeLabel,
      total: Number(order.total || 0),
      subtotal: derivedSubtotal,
      tax: derivedTax,
      timingType: 'asap',
      asapTime: null,
      futureDateTime: null,
      orderSpecialInstructions: order.orderSpecialInstructions || '',
      paymentMethodSummary: order.paymentMethodSummary || '',
      paymentLines: order.paymentLines || [],
      auditEvents: order.auditEvents || order.auditTrail || order.history || order.events || [],
      createdTimestamp: null,
      updatedTimestamp: null,
      lines: (order.lines || []).map((name, idx) => ({
        lineId: `legacy_${order.id}_${idx}`,
        name,
        qty: 1,
        price: 0,
        size: '',
        mods: []
      })),
      isPersisted: false
    };
  }

  return null;
}

function isNewOrderState() {
  return !selectedOrderForDetail();
}

function cancelSaleConfirmed() {
  const lineNumber = state.newSalePendingLineNumber;
  state.newSalePendingLineNumber = null;
  resetForNewSale();
  state.showCancelConfirm = false;
  if (lineNumber != null) {
    const line = getLine(lineNumber);
    if (line?.state === 'ringing') {
      openIncomingLine(lineNumber);
      return;
    }
    render();
    return;
  }
  render();
}

function simulateCall() {
  const idle = state.phoneLines.find((l) => l.state === 'idle');
  const targetLine = idle ? idle.lineNumber : sample(state.phoneLines).lineNumber;
  simulateCallOnLine(targetLine);
}

function simulateCallOnLine(lineNumber) {
  const useKnown = Math.random() > 0.45;
  const payload = useKnown ? knownCustomerCallerPayload(lineNumber, sample(state.mockCustomers)) : unknownCallerPayload(lineNumber);
  clearLineResetTimer(lineNumber);
  updateLine(lineNumber, {
    state: 'ringing',
    phoneNumber: normalizePhone(payload.phoneNumber),
    callerName: payload.callerName,
    address: payload.address,
    rawDetails: payload.rawDetails,
    matchType: payload.rawDetails.matchType || '',
    claimedByStation: ''
  });
  state.call = {
    phone: normalizePhone(payload.phoneNumber),
    name: payload.callerName,
    line: lineNumber,
    at: new Date().toLocaleTimeString(),
    address: toAddressText(payload.address),
    details: payload.rawDetails
  };
  render();
}

function simulateIncomingCalls(count) {
  const shuffled = [...state.phoneLines].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, Math.min(count, state.phoneLines.length));
  chosen.forEach((line, idx) => {
    const payload = idx % 2 === 0 ? knownCustomerCallerPayload(line.lineNumber, sample(state.mockCustomers)) : unknownCallerPayload(line.lineNumber);
    clearLineResetTimer(line.lineNumber);
    updateLine(line.lineNumber, {
      state: 'ringing',
      phoneNumber: normalizePhone(payload.phoneNumber),
      callerName: payload.callerName,
      address: payload.address,
      rawDetails: payload.rawDetails,
      matchType: payload.rawDetails.matchType || '',
      claimedByStation: ''
    });
  });
  const first = chosen[0] ? getLine(chosen[0].lineNumber) : null;
  if (first) {
    state.call = {
      phone: first.phoneNumber,
      name: first.callerName || 'Unknown Caller',
      line: first.lineNumber,
      at: new Date().toLocaleTimeString(),
      address: toAddressText(first.address),
      details: first.rawDetails
    };
  }
  render();
}

function openIncomingLine(lineNumber) {
  const line = getLine(lineNumber);
  if (!line || line.state !== 'ringing') return;
  clearLineResetTimer(lineNumber);
  updateLine(lineNumber, { state: 'claimed', claimedByStation: 'Counter 1' });
  const known = findKnownCustomerByPhone(line.phoneNumber);
  if (known) {
    applyCustomerSummary(known);
  } else {
    beginUnknownCustomerEntry(line);
  }
  state.selectedLineNumber = lineNumber;
  state.call = {
    phone: line.phoneNumber,
    name: line.callerName,
    line: line.lineNumber,
    at: new Date().toLocaleTimeString(),
    address: toAddressText(line.address),
    details: line.rawDetails
  };
  setPhoneClassifier(true, 'callerId');
  render();
}

async function saveDraftCustomer(startTicketAfterSave) {
  const draft = state.customerDraft;
  if (!normalizePhone(draft.phone)) {
    alert('Phone number is required for customer save.');
    return;
  }
  const customer = await upsertCustomerProfileDraft(draft);
  if (startTicketAfterSave) {
    state.customerNotes = [customer.allergies ? `Allergies: ${customer.allergies}` : '', customer.specialInstructions ? `Instructions: ${customer.specialInstructions}` : ''].filter(Boolean).join(' | ');
  }

  state.customerEditorMode = 'new';

  render();
}

function cancelDraftCustomer() {
  if (state.customerEditorMode === 'edit' && state.activeCustomer) {
    state.customerDraft = profileDraftFromCustomer(state.activeCustomer);
  }
  state.customerEditorMode = 'new';
  state.customerPanelMode = 'compact';
  render();
}

function claimLine(lineNumber) {
  const line = getLine(lineNumber);
  if (!line || line.state === 'idle') return;
  clearLineResetTimer(lineNumber);
  updateLine(lineNumber, { state: 'claimed', claimedByStation: 'Counter 1' });
  state.selectedLineNumber = null;
  render();
}

function dismissLine(lineNumber) {
  const line = getLine(lineNumber);
  if (!line || line.state === 'idle' || line.state === 'ended') return;
  state.selectedLineNumber = null;
  moveLineToEnded(lineNumber);
  render();
}

function endAllCalls() {
  state.phoneLines.forEach((line) => {
    if (line.state !== 'idle' && line.state !== 'ended') {
      moveLineToEnded(line.lineNumber);
    }
  });
  state.selectedLineNumber = null;
  render();
}

function startTicketFromLine(lineNumber) {
  const line = getLine(lineNumber);
  if (!line) return;
  const known = findKnownCustomerByPhone(line.phoneNumber);
  if (known) {
    applyCustomerSummary(known);
  } else {
    beginUnknownCustomerEntry(line);
    render();
    return;
  }
  const addr = toAddressText(line.address);
  state.call = {
    phone: line.phoneNumber,
    name: line.callerName,
    line: line.lineNumber,
    at: new Date().toLocaleTimeString(),
    address: addr,
    details: line.rawDetails
  };
  updateLine(lineNumber, { state: 'claimed', claimedByStation: 'Counter 1' });
  state.selectedLineNumber = null;
  setPhoneClassifier(true, 'callerId');
  render();
}

function getFiltered() {
  if (!state.menu) return [];

  const t0 = performance.now();
  let list = lilposDataService.getAllItems();
  const searching = !!state.query.trim();

  if (searching) {
    list = lilposDataService.searchItems(state.query);
  } else if (state.category === VIEW_FAVORITES) {
    list = lilposDataService.getFavoriteTiles().items;
  } else if (state.category !== VIEW_ALL_ITEMS && state.category !== VIEW_ALL_CATEGORIES) {
    list = lilposDataService.getItemsForCategory(state.category);
  }

  const maxVisible = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 96 : 180;
  const out = list.slice(0, maxVisible);

  state.metrics = {
    ...state.metrics,
    lastFilterMs: +(performance.now() - t0).toFixed(2),
    visibleItems: out.length
  };

  return out;
}

function visibleCategories() {
  return lilposDataService.getVisibleCategories();
}

function isRegularCategorySelected() {
  if (!state.menu || !state.category) return false;
  if (state.query.trim()) return false;
  if (state.category === VIEW_ALL_CATEGORIES || state.category === VIEW_ALL_ITEMS || state.category === VIEW_FAVORITES) return false;
  const cat = lilposDataService.indexes.categoriesById.get(state.category);
  return !!cat && !cat.hidden;
}

function isItemOutOfStock(item) {
  if (!item?.oos || item.oos.mode === 'in_stock') return false;
  if (item.oos.mode === 'forever') return true;
  if (!item.oos.untilIso) return false;
  return new Date(item.oos.untilIso).getTime() > Date.now();
}

function outOfStockLabel(item) {
  if (!isItemOutOfStock(item)) return '';
  if (item.oos?.mode === 'today') return 'Out of Stock (Today)';
  if (item.oos?.mode === 'days') return `Out of Stock (${Number(item.oos.days || 0)} days)`;
  return 'Out of Stock';
}

function endOfTodayIso() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function syncMenuUiState() {
  if (!state.menu) return;
  state.menu.favorites = {
    itemIds: [...state.favoriteItemIds],
    categoryIds: [...state.favoriteCategoryIds]
  };
  state.menu.customers = [...state.mockCustomers];
}

function hydrateUiStateFromMenu() {
  const favorites = state.menu?.favorites || {};
  if (Array.isArray(favorites.itemIds)) {
    state.favoriteItemIds = [...new Set(favorites.itemIds)];
  }
  if (Array.isArray(favorites.categoryIds)) {
    state.favoriteCategoryIds = [...new Set(favorites.categoryIds)];
  }
  if (Array.isArray(state.menu?.customers) && state.menu.customers.length) {
    state.mockCustomers = [...state.menu.customers];
  }
  if (lilposDataService.runtimePackage) {
    lilposDataService.runtimePackage.customers = [...state.mockCustomers];
    lilposDataService.rebuildIndexes();
    state.idx = lilposDataService.getLegacyIndex();
  }
}

async function persistMenuLocal() {
  if (!state.menu) return;
  syncMenuUiState();
  // Future obfuscation boundary: this payload can later become compact/encrypted/signed/compressed.
  await lilposDataService.saveRuntimeCache('activeMenu', state.menu);
}

function closeAddItemDialog() {
  state.addItemDraft = {
    open: false,
    name: '',
    categoryId: '',
    price: '0.00',
    description: '',
    modifierCount: '0',
    inStock: true,
    favorite: false
  };
  render();
}

function openAddItemDialog(categoryId) {
  if (!isRegularCategorySelected()) return;
  state.addItemDraft = {
    open: true,
    name: '',
    categoryId: categoryId || state.category || '',
    price: '0.00',
    description: '',
    modifierCount: '0',
    inStock: true,
    favorite: false
  };
  render();
}

function nextItemId(menu) {
  const max = (menu.itemTiles || []).reduce((best, item) => {
    const match = /^item_(\d+)$/.exec(item.id);
    if (!match) return best;
    return Math.max(best, Number(match[1]));
  }, 0);
  return makeId('item', max + 1);
}

async function saveNewItemFromDialog() {
  const draft = state.addItemDraft;
  const name = String(draft.name || '').trim();
  const description = String(draft.description || '').trim();
  const categoryId = String(draft.categoryId || '').trim();
  const priceNum = parseImpliedDecimalCurrencyInput(draft.price);
  const modifierCount = Math.max(0, Math.floor(Number(draft.modifierCount || 0)));

  if (!name) {
    alert('Item name is required.');
    return;
  }
  if (!categoryId || !lilposDataService.indexes.categoriesById.has(categoryId)) {
    alert('Category is required.');
    return;
  }
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    alert('A valid price is required.');
    return;
  }

  const category = lilposDataService.indexes.categoriesById.get(categoryId);
  const sortOrder = lilposDataService.getItemsForCategory(categoryId).reduce((best, item) => Math.max(best, Number(item.sortOrder || 0)), 0) + 1;
  const newItem = {
    id: nextItemId(state.menu),
    categoryId,
    name,
    description: description || 'Custom item added from register grid',
    sortOrder,
    fixedPrice: true,
    basePrice: +priceNum.toFixed(2),
    taxRuleId: 'tax_food',
    printerRouteId: category?.printerRouteId || 'printer_kitchen',
    sizeSchema: null,
    popular: false,
    active: true,
    mockModifierCount: modifierCount,
    oos: draft.inStock ? null : { mode: 'forever', untilIso: null, days: null }
  };

  lilposDataService.addNewItem(newItem);
  state.menu = lilposDataService.runtimePackage;
  state.idx = lilposDataService.getLegacyIndex();
  if (draft.favorite && !state.favoriteItemIds.includes(newItem.id)) {
    state.favoriteItemIds.push(newItem.id);
    syncMenuUiState();
    lilposDataService.rebuildIndexes();
    state.idx = lilposDataService.getLegacyIndex();
  }

  state.category = categoryId;
  state.query = '';
  state.preSearchCategory = null;
  state.addItemDraft = {
    open: false,
    name: '',
    categoryId: '',
    price: '0.00',
    description: '',
    modifierCount: '0',
    inStock: true,
    favorite: false
  };

  try {
    await persistMenuLocal();
  } catch (err) {
    console.error('Failed to persist new item:', err);
    alert('Item was added but failed to save to local store.');
  }

  render();
}

function bindLongPress(element, onTap, onLongPress) {
  if (!element) return;
  let timerId = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let longPressed = false;
  let moved = false;
  let pointerTapAt = 0;

  const clearTimer = () => {
    if (timerId) clearTimeout(timerId);
    timerId = null;
  };

  const resetGesture = () => {
    clearTimer();
    pointerId = null;
    longPressed = false;
    moved = false;
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    resetGesture();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timerId = setTimeout(() => {
      longPressed = true;
      onLongPress();
    }, LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if ((dx * dx) + (dy * dy) > (LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX)) {
      moved = true;
      clearTimer();
    }
  });

  element.addEventListener('pointerup', (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    const shouldTap = !longPressed && !moved;
    resetGesture();
    if (shouldTap) {
      pointerTapAt = Date.now();
      onTap();
    }
  });

  element.addEventListener('pointercancel', resetGesture);
  element.addEventListener('pointerleave', (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    moved = true;
    clearTimer();
  });

  // Keyboard/assistive click fallback, while suppressing duplicate synthetic click after pointer tap.
  element.addEventListener('click', (event) => {
    if (Date.now() - pointerTapAt < 350) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onTap();
  });
}

function bindItemTilePress(element, itemId) {
  if (!element) return;
  let timerId = null;
  let startX = 0;
  let startY = 0;
  let longPressed = false;

  const clearTimer = () => {
    if (timerId) clearTimeout(timerId);
    timerId = null;
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    longPressed = false;
    startX = event.clientX;
    startY = event.clientY;
    clearTimer();
    timerId = setTimeout(() => {
      longPressed = true;
      openItemQuickEdit(itemId);
    }, LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (event) => {
    if (!timerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if ((dx * dx) + (dy * dy) > (LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX)) {
      clearTimer();
    }
  });

  element.addEventListener('pointerup', clearTimer);
  element.addEventListener('pointercancel', clearTimer);
  element.addEventListener('pointerleave', clearTimer);

  element.addEventListener('click', () => {
    if (longPressed) {
      longPressed = false;
      return;
    }
    const item = lilposDataService.getItemById(itemId);
    if (!item) return;
    if (isItemOutOfStock(item)) {
      alert(`${item.name} is out of stock.`);
      return;
    }
    if (itemHasModifierGroups(item)) {
      openItem(itemId);
      return;
    }
    addItemDirectFromMenuCard(itemId);
  });
}

function setupGridBlankAddTap(menuGrid, menuBoard) {
  if (!menuGrid || !menuBoard) return () => {};
  const onClick = (event) => {
    if (!isRegularCategorySelected()) return;
    if (state.addItemDraft.open || state.selected || state.quickItemEditor.itemId || state.quickCategoryEditor.categoryId) return;
    const target = event.target;
    const isGridBlank = target === menuGrid;
    const isAddZone = target?.id === 'gridAddZone';
    if (!isGridBlank && !isAddZone) return;
    openAddItemDialog(state.category);
  };
  menuGrid.addEventListener('click', onClick);
  return () => {
    menuGrid.removeEventListener('click', onClick);
  };
}

function openItemQuickEdit(itemId) {
  const item = lilposDataService.getItemById(itemId);
  if (!item) return;
  let stockMode = 'in_stock';
  let stockDays = '1';
  if (item.oos?.mode === 'today') stockMode = 'today';
  if (item.oos?.mode === 'forever') stockMode = 'forever';
  if (item.oos?.mode === 'days') {
    stockMode = 'days';
    stockDays = String(item.oos.days || 1);
  }
  state.quickItemEditor = {
    itemId,
    price: formatImpliedDecimalCurrencyInput(String(item.fixedPrice ? item.basePrice : item.sizeSchema?.[0]?.price || item.basePrice)),
    stockMode,
    stockDays
  };
  render();
}

function closeItemQuickEdit() {
  state.quickItemEditor = { itemId: null, price: '', stockMode: 'in_stock', stockDays: '1' };
  render();
}

async function saveItemQuickEdit() {
  const editor = state.quickItemEditor;
  const item = lilposDataService.getItemById(editor.itemId);
  if (!item) return;
  const price = parseImpliedDecimalCurrencyInput(editor.price);
  if (!Number.isFinite(price) || price <= 0) {
    alert('A valid item price is required.');
    return;
  }

  const nextPatch: any = { basePrice: +price.toFixed(2) };
  if (item.sizeSchema?.length) {
    nextPatch.sizeSchema = [...item.sizeSchema];
    nextPatch.sizeSchema[0] = { ...nextPatch.sizeSchema[0], price: +price.toFixed(2) };
  }

  if (editor.stockMode === 'in_stock') {
    nextPatch.oos = null;
  } else if (editor.stockMode === 'today') {
    nextPatch.oos = { mode: 'today', untilIso: endOfTodayIso(), days: null };
  } else if (editor.stockMode === 'days') {
    const days = Math.max(1, Math.floor(Number(editor.stockDays || 1)));
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    nextPatch.oos = { mode: 'days', untilIso: until, days };
  } else {
    nextPatch.oos = { mode: 'forever', untilIso: null, days: null };
  }

  lilposDataService.updateItem(editor.itemId, nextPatch);
  state.menu = lilposDataService.runtimePackage;
  state.idx = lilposDataService.getLegacyIndex();

  try {
    await persistMenuLocal();
  } catch (err) {
    console.error('Failed to save item quick edit:', err);
  }

  state.quickItemEditor = { itemId: null, price: '', stockMode: 'in_stock', stockDays: '1' };
  render();
}

function openCategoryQuickEdit(categoryId) {
  const cat = lilposDataService.indexes.categoriesById.get(categoryId);
  if (!cat) return;
  state.quickCategoryEditor = {
    categoryId,
    visible: !cat.hidden,
    favorite: state.favoriteCategoryIds.includes(categoryId)
  };
  render();
}

function closeCategoryQuickEdit() {
  state.quickCategoryEditor = { categoryId: null, visible: true, favorite: false };
  render();
}

async function saveCategoryQuickEdit() {
  const editor = state.quickCategoryEditor;
  const cat = lilposDataService.indexes.categoriesById.get(editor.categoryId);
  if (!cat) return;
  lilposDataService.updateCategory(editor.categoryId, { hidden: !editor.visible });
  state.menu = lilposDataService.runtimePackage;
  state.idx = lilposDataService.getLegacyIndex();

  if (editor.favorite) {
    if (!state.favoriteCategoryIds.includes(cat.id)) state.favoriteCategoryIds.push(cat.id);
  } else {
    state.favoriteCategoryIds = state.favoriteCategoryIds.filter((id) => id !== cat.id);
  }

  syncMenuUiState();
  lilposDataService.rebuildIndexes();
  state.idx = lilposDataService.getLegacyIndex();

  const updatedCat = lilposDataService.indexes.categoriesById.get(editor.categoryId);
  if (updatedCat?.hidden && state.category === updatedCat.id) {
    state.category = VIEW_ALL_ITEMS;
  }

  try {
    await persistMenuLocal();
  } catch (err) {
    console.error('Failed to save category quick edit:', err);
  }

  state.quickCategoryEditor = { categoryId: null, visible: true, favorite: false };
  ensureActiveCategory();
  render();
}

function categoryTilesHtml() {
  if (!state.menu) return '';
  const cats = visibleCategories();
  return `
    <div class="category-tile-grid">
      ${cats.map((c) => categoryTileButtonHtml(c)).join('')}
    </div>
  `;
}

function categoryTileButtonHtml(category, metaText = '') {
  const hasImage = !!category?.imageUrl;
  return `
    <button class="category-tile ${hasImage ? 'has-image' : 'no-image'}" data-open-category="${category.id}" data-cat-edit="${category.id}">
      <div class="category-tile-main">
        <div class="category-tile-text">
          <b>${h(category.name)}</b>
          ${metaText ? `<small>${h(metaText)}</small>` : ''}
        </div>
        ${hasImage ? `<div class="category-tile-image"><img src="${h(category.imageUrl)}" alt="${h(category.name)}" loading="lazy" decoding="async" /></div>` : ''}
      </div>
    </button>
  `;
}

function cartTotal() {
  return state.cart.reduce((s, l) => s + l.qty * l.price, 0);
}

function ticketTax() {
  return +(cartTotal() * 0.06625).toFixed(2);
}

function ticketGrandTotal() {
  return +(cartTotal() + ticketTax()).toFixed(2);
}

function canSendOrder(ticket, orderType) {
  const hasItems = Array.isArray(ticket) && ticket.length > 0;
  const hasOrderType = !!String(orderType || '').trim();
  if (!hasItems) return { ok: false, message: 'Add items to send order.' };
  if (!hasOrderType) return { ok: false, message: 'Missing required order details.' };
  if (orderType === 'delivery' && !hasDeliveryProfile(currentCustomerLike())) {
    return { ok: false, message: 'Delivery requires name, phone, and address.' };
  }
  return { ok: true, message: '' };
}

function getSendActionState(ticket, orderType) {
  const hasItems = Array.isArray(ticket) && ticket.length > 0;
  const hasOrderType = !!String(orderType || '').trim();
  const base = !hasItems
    ? { ok: false, message: 'Add items to send order.' }
    : !hasOrderType
      ? { ok: false, message: 'Select an order type.' }
      : { ok: true, message: '' };
  const message = base.message;

  return {
    payNow: { ...base },
    payLater: { ...base },
    message
  };
}

function ticketPayload(kind: any): any {
  const orderTypeLabel = ORDER_TYPES[state.orderType] || state.orderType;
  const futureLabel = formatFutureLabel(state.futureDateTime);
  const timingType = state.timingType === 'future' && state.futureDateTime ? 'future' : 'asap';
  const asapTimingLabel = state.asapTime ? `${orderTypeLabel} ${formatTimeValueLabel(state.asapTime)}` : 'ASAP';
  const futureOrderNote = timingType === 'future' ? (state.futureOrderNote || `Ready/Requested: ${futureLabel}`) : `Ready/Requested: ${asapTimingLabel}`;

  const lines = state.cart.map((line) => {
    const grouped = formatGroupedModifiers(line.mods);
    return {
      ...line,
      groupedModifiers: grouped.groupedModifiers.map((group) => {
        if (Array.isArray(group.preModifierGroups)) {
          return {
            modifierGroupId: group.modifierGroupId,
            modifierGroupName: group.modifierGroupName,
            preModifierGroups: group.preModifierGroups.map((pre) => ({
              preModifierValue: pre.preModifierValue,
              preModifierLabel: pre.preModifierLabel,
              modifiers: pre.modifiers.map((m) => ({ ...m }))
            }))
          };
        }
        return {
          modifierGroupId: group.modifierGroupId,
          modifierGroupName: group.modifierGroupName,
          modifiers: (group.modifiers || []).map((m) => ({ ...m }))
        };
      })
    };
  });

  return {
    ticketId: `TEMP-${Date.now()}`,
    mode: 'PRINT_ONLY',
    kind,
    createdAt: new Date().toLocaleString(),
    orderType: state.orderType,
    orderTypeLabel,
    orderSource: state.orderSource,
    isPhoneOrder: state.isPhoneOrder,
    phoneClassifierSelected: state.phoneClassifierSelected,
    timingType,
    asapTime: timingType === 'asap' && state.asapTime ? state.asapTime : null,
    futureDateTime: timingType === 'future' ? state.futureDateTime : null,
    futureOrderNote,
    orderSpecialInstructions: state.orderSpecialInstructions,
    printTimingNote: timingType === 'future' ? `FUTURE ORDER\nReady/Requested: ${futureLabel}` : `Ready/Requested: ${asapTimingLabel}`,
    orderTypeDetails: {
      togoName: state.orderTypeDetails.togoName || '',
      togoPhone: normalizePhone(state.orderTypeDetails.togoPhone || ''),
      dineInTableNumber: state.orderTypeDetails.dineInTableNumber || ''
    },
    customer: {
      id: state.activeCustomer?.id || null,
      name: state.activeCustomer?.name || state.customerDraft.name || state.customerName,
      phone: normalizePhone(state.activeCustomer?.phone || state.customerDraft.phone || state.customerPhone),
      address1: state.activeCustomer?.address1 || state.customerDraft.address1,
      city: state.activeCustomer?.city || state.customerDraft.city,
      state: state.activeCustomer?.state || state.customerDraft.state,
      zip: state.activeCustomer?.zip || state.customerDraft.zip,
      allergies: state.activeCustomer?.allergies || state.customerDraft.allergies,
      specialInstructions: state.activeCustomer?.specialInstructions || state.customerDraft.specialInstructions,
      notes: state.customerNotes
    },
    call: state.call,
    lines,
    subtotal: cartTotal(),
    tax: ticketTax(),
    total: ticketGrandTotal(),
    offline: state.offline
  };
}

function sendOrderAction(paymentMode) {
  if (state.orderSendLocked) return;
  const actionState = getSendActionState(state.cart, state.orderType);
  const check = paymentMode === 'pay_later' ? actionState.payLater : actionState.payNow;
  if (!check.ok) {
    render();
    return;
  }

  if (paymentMode === 'pay_now') {
    const payNowCheck = getPayNowValidation();
    if (!payNowCheck.ok) {
      openPayNowMissingDialog(payNowCheck.issues);
      render();
      return;
    }
    openPaymentPane();
    render();
    return;
  }

  const payLaterCheck = getPayLaterValidation();
  if (!payLaterCheck.ok) {
    openPayLaterMissingDialog(payLaterCheck.issues);
    render();
    return;
  }
  completePayLaterOrder();
}

function activeOrderTypeDetailRowsHtml() {
  const orderType = String(state.orderType || '').toLowerCase();
  const togoName = String(state.orderTypeDetails?.togoName || state.customerDraft?.name || '').trim();
  const togoPhone = normalizePhone(state.orderTypeDetails?.togoPhone || state.customerDraft?.phone || '');
  const dineInTable = String(state.orderTypeDetails?.dineInTableNumber || '').trim();

  if (orderType === 'togo' || orderType === 'tostay') {
    if (!togoName && !togoPhone) return '';
    return `
      ${togoName ? `<small><b>Guest Name:</b> ${h(togoName)}</small>` : ''}
      ${togoPhone ? `<small><b>Guest Phone:</b> ${h(phoneDisplayValue(togoPhone))}</small>` : ''}
    `;
  }

  if (orderType === 'dinein') {
    if (!dineInTable) return '';
    return `<small><b>Table:</b> ${h(dineInTable)}</small>`;
  }

  return '';
}

function compactCustomerSummaryHtml() {
  const orderTypeDetailsHtml = activeOrderTypeDetailRowsHtml();

  if (!state.activeCustomer) {
    if (orderTypeDetailsHtml) {
      return `
        <div class="customer-summary empty-summary">
          ${orderTypeDetailsHtml}
        </div>
      `;
    }

    return `
      <div class="customer-summary empty-summary">
        <b>No customer selected</b>
        <small>Tap a ringing line to load caller details.</small>
        ${orderTypeDetailsHtml}
      </div>
    `;
  }

  const c = state.activeCustomer;
  return `
    <div class="customer-summary customer-summary-populated">
      <div class="sum-top"><b>${h(c.name)}</b><span>${h(phoneDisplayValue(c.phone))}</span></div>
      ${customerAddressText(c) ? `<small>${h(customerAddressText(c))}</small>` : ''}
      ${orderTypeDetailsHtml}
      <div class="sum-tags">
        ${c.allergies ? `<span class="tag warn">Allergy: ${h(c.allergies)}</span>` : ''}
        ${c.specialInstructions ? `<span class="tag">${h(c.specialInstructions)}</span>` : ''}
      </div>
      <button id="editCustomer" class="edit-customer-btn" title="Edit customer">✎</button>
    </div>
  `;
}

function expandedCustomerEntryHtml() {
  const d = state.customerDraft;
  return `
    <div class="customer-entry expanded">
      <div class="entry-grid">
        <input id="entryName" data-keyboard-context="customer-profile-name" placeholder="Customer name" value="${h(d.name)}" />
        <input id="entryPhone" type="tel" inputmode="tel" autocomplete="tel" data-keyboard-kind="phone" data-keyboard-context="customer-profile-phone" placeholder="Phone" value="${h(phoneDisplayValue(d.phone))}" />
        <input id="entryAddress1" data-keyboard-context="customer-address" placeholder="Address" value="${h(d.address1)}" />
        <input id="entryCity" data-keyboard-context="customer-address" placeholder="City" value="${h(d.city)}" />
        <input id="entryState" data-keyboard-context="customer-address" placeholder="State" value="${h(d.state)}" />
        <input id="entryZip" data-keyboard-context="customer-address" placeholder="ZIP" value="${h(d.zip)}" />
        <div class="entry-field entry-span-2"><input id="entryAllergies" aria-label="Allergies" placeholder="Allergies" value="${h(d.allergies)}" /></div>
        <div class="entry-field entry-span-2"><textarea id="entryInstructions" aria-label="Customer Notes" placeholder="Customer Notes">${h(d.specialInstructions)}</textarea></div>
      </div>
      <div class="entry-actions customer-entry-actions">
        <button id="saveCustomer" class="btn-primary">Save Customer</button>
        <button id="cancelCustomer" class="btn-secondary">Cancel</button>
        <button id="startTicketCustomer" class="btn-success">Start Ticket</button>
      </div>
    </div>
  `;
}

function printKitchenTicket() {
  alert(JSON.stringify(ticketPayload('kitchen'), null, 2).slice(0, 4000));
}

function printCustomerReceipt() {
  alert(JSON.stringify(ticketPayload('receipt'), null, 2).slice(0, 4000));
}

function removeLine(id) {
  state.cart = state.cart.filter((x) => x.lineId !== id);
  if (state.removeConfirmLineId === id) state.removeConfirmLineId = null;
  render();
}

function changeQty(id, delta) {
  const line = state.cart.find((x) => x.lineId === id);
  if (!line) return;
  line.qty = Math.max(1, line.qty + delta);
  render();
}

function dismissKeyboardBeforeModalOpen() {
  keyboardController.hideKeyboard();
  const active = document.activeElement as HTMLElement | null;
  if (active && typeof active.blur === 'function') {
    active.blur();
  }
}

function openItem(id) {
  const item = lilposDataService.getItemById(id);
  if (!item || isItemOutOfStock(item)) return;
  dismissKeyboardBeforeModalOpen();
  state.selected = item;
  const preModifiers = {};
  const groups = (state.idx?.itemMods?.get(item.id) || []).map((gid) => state.idx?.groupsById?.[gid]).filter(Boolean);
  groups.forEach((group) => {
    const options = getGroupPreModifierOptions(group);
    if (options.length) preModifiers[group.id] = options[0].value;
  });
  state.selectedConfig = {
    size: state.selected?.sizeSchema?.[0]?.name || null,
    mods: {},
    preModifiers,
    activePrepModifierByGroup: {},
    pizzaFilter: 'ALL',
    pizzaNav: 'pizza',
    pizzaNotes: '',
    editingLineId: null
  };
  state.modifierDialogInitialConfig = cloneDialogConfig(state.selectedConfig);
  state.modifierDialogHistory = { past: [], future: [] };
  state.startOverConfirmPending = false;
  state.modifierSearch = '';
  render();
}

function itemModifierGroups(item) {
  if (!item || !state.idx?.itemMods) return [];
  return (state.idx.itemMods.get(item.id) || []).map((gid) => state.idx?.groupsById?.[gid]).filter(Boolean);
}

function groupHasConfigurableOptions(group) {
  if (!group || !state.idx?.optsByGroup) return false;
  return (state.idx.optsByGroup.get(group.id) || []).length > 0;
}

function groupRequiredSelectionCount(group) {
  const candidate = Number(
    group?.minSelections
    ?? group?.minimumSelections
    ?? group?.minimum
    ?? group?.min
    ?? group?.requiredCount
    ?? (group?.required ? 1 : 0)
  );
  return Number.isFinite(candidate) ? Math.max(0, candidate) : 0;
}

function itemHasConfigurableModifiers(item) {
  return itemModifierGroups(item).some((group) => groupHasConfigurableOptions(group));
}

function itemHasRequiredModifiers(item) {
  return itemModifierGroups(item).some((group) => groupHasConfigurableOptions(group) && groupRequiredSelectionCount(group) > 0);
}

function shouldShowItemCardActions(item) {
  return itemHasConfigurableModifiers(item);
}

function shouldPlusOpenModifierDialog(item) {
  return itemHasRequiredModifiers(item);
}

function itemHasModifierGroups(item) {
  return itemModifierGroups(item).length > 0;
}

function addItemDirectFromMenuCard(itemId) {
  const item = lilposDataService.getItemById(itemId);
  if (!item) return;
  if (isItemOutOfStock(item)) {
    alert(`${item.name} is out of stock.`);
    return;
  }
  const menuBoard = document.querySelector('.menu-board');
  if (menuBoard) {
    state.restoreMenuBoardScrollTop = menuBoard.scrollTop;
  }
  const defaultSize = item.sizeSchema?.[0]?.name || null;
  const price = item.fixedPrice ? item.basePrice : item.sizeSchema?.[0]?.price || item.basePrice;
  addItem(item, {
    size: defaultSize,
    mods: [],
    price
  });
}

function normalizedModifierCompareEntry(entry) {
  if (entry && typeof entry === 'object') {
    return {
      modifierGroupId: entry.modifierGroupId || null,
      modifierGroupName: asModifierValue(entry.modifierGroupName || ''),
      optionId: entry.optionId || null,
      optionLabel: asModifierValue(entry.optionLabel || ''),
      optionName: asModifierValue(entry.optionName || ''),
      resolvedLabel: asModifierValue(entry.resolvedLabel || ''),
      prepModifierSetId: asModifierValue(entry.prepModifierSetId || ''),
      prepModifierId: asModifierValue(entry.prepModifierId || ''),
      prepModifierLabel: asModifierValue(entry.prepModifierLabel || ''),
      prepDisplayPattern: asModifierValue(entry.prepDisplayPattern || ''),
      prepPriceBehavior: asModifierValue(entry.prepPriceBehavior || ''),
      prepPriceValue: +Number(entry.prepPriceValue || 0).toFixed(2),
      prepSelectedColorRole: asModifierValue(entry.prepSelectedColorRole || ''),
      preModifierType: asModifierValue(entry.preModifierType || ''),
      preModifierValue: asModifierValue(entry.preModifierValue || ''),
      preModifierLabel: asModifierValue(entry.preModifierLabel || ''),
      side: asModifierValue(entry.side || ''),
      multiplier: Math.max(1, Math.min(3, Number(entry.multiplier || 1))),
      price: +Number(entry.price || 0).toFixed(2)
    };
  }
  return {
    modifierGroupId: null,
    modifierGroupName: '',
    optionId: null,
    optionName: asModifierValue(entry),
    preModifierType: '',
    preModifierValue: '',
    preModifierLabel: '',
    side: '',
    multiplier: 1,
    price: 0
  };
}

function configurationKeyForLine(item, configured, lineLike = null) {
  const size = configured?.size ?? lineLike?.size ?? item?.sizeSchema?.[0]?.name ?? null;
  const modsRaw = Array.isArray(configured?.mods)
    ? configured.mods
    : Array.isArray(lineLike?.mods)
    ? lineLike.mods
    : [];
  const mods = modsRaw
    .map((entry) => normalizedModifierCompareEntry(entry))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const specialInstruction = String(configured?.specialInstruction ?? lineLike?.specialInstruction ?? '').trim();
  const forName = String(lineLike?.forName || '').trim();
  const price = +Number(configured?.price ?? lineLike?.price ?? 0).toFixed(2);
  return JSON.stringify({
    itemId: item?.id || lineLike?.itemId || null,
    size,
    mods,
    specialInstruction,
    forName,
    price
  });
}

function findExactCartLineMatch(item, configured) {
  const incomingKey = configurationKeyForLine(item, configured, null);
  return state.cart.find((line) => {
    if (line.itemId !== item.id) return false;
    const existingKey = configurationKeyForLine(item, null, line);
    return existingKey === incomingKey;
  }) || null;
}

function addItem(item, configured) {
  if (isItemOutOfStock(item)) return;
  const price = configured?.price ?? (item.fixedPrice ? item.basePrice : item.sizeSchema?.[0]?.price || item.basePrice);
  if (configured?.editingLineId) {
    const line = state.cart.find((entry) => entry.lineId === configured.editingLineId);
    if (line) {
      line.itemId = item.id;
      line.name = item.name;
      line.size = configured?.size;
      line.mods = configured?.mods || [];
      line.price = price;
      if (typeof configured.specialInstruction === 'string') line.specialInstruction = configured.specialInstruction;
    }
  } else {
    const matchingLine = findExactCartLineMatch(item, {
      ...configured,
      price
    });
    if (matchingLine) {
      matchingLine.qty = Math.max(1, Number(matchingLine.qty || 1) + 1);
      state.scrollCartOnAdd = true;
      state.selected = null;
      render();
      return;
    }
    state.cart.push({
      lineId: uid(),
      itemId: item.id,
      name: item.name,
      size: configured?.size,
      mods: configured?.mods || [],
      qty: 1,
      price,
      specialInstruction: configured?.specialInstruction || '',
      forName: ''
    });
  }
  state.scrollCartOnAdd = true;
  state.selected = null;
  render();
}

function openLineItemEditor(lineId) {
  const line = state.cart.find((entry) => entry.lineId === lineId);
  if (!line) return;
  const item = lilposDataService.getItemById(line.itemId);
  if (!item || isItemOutOfStock(item)) return;

  dismissKeyboardBeforeModalOpen();

  const preModifiers = {};
  const groups = (state.idx?.itemMods?.get(item.id) || []).map((gid) => state.idx?.groupsById?.[gid]).filter(Boolean);
  groups.forEach((group) => {
    const options = getGroupPreModifierOptions(group);
    if (options.length) preModifiers[group.id] = options[0].value;
  });

  const byGroup = {};
  (line.mods || []).forEach((entry) => {
    if (!entry?.modifierGroupId) return;
    byGroup[entry.modifierGroupId] = byGroup[entry.modifierGroupId] || [];
    byGroup[entry.modifierGroupId].push({ ...entry });
    if (entry.preModifierValue) preModifiers[entry.modifierGroupId] = entry.preModifierValue;
  });

  state.selected = item;
  state.selectedConfig = {
    size: line.size || item.sizeSchema?.[0]?.name || null,
    mods: byGroup,
    preModifiers,
    activePrepModifierByGroup: {},
    pizzaFilter: 'ALL',
    pizzaNav: 'pizza',
    pizzaNotes: line.specialInstruction || '',
    editingLineId: line.lineId
  };
  state.modifierDialogInitialConfig = cloneDialogConfig(state.selectedConfig);
  state.modifierDialogHistory = { past: [], future: [] };
  state.startOverConfirmPending = false;
  state.modifierSearch = '';
  render();
}

function openCartItemEditor(lineId, mode) {
  const line = state.cart.find((x) => x.lineId === lineId);
  if (!line) return;
  state.cartItemEditor = {
    lineId,
    mode,
    value: mode === 'note' ? (line.specialInstruction || '') : (line.forName || '')
  };
  render();
}

function saveCartItemEditor() {
  const { lineId, mode, value } = state.cartItemEditor;
  const line = state.cart.find((x) => x.lineId === lineId);
  if (!line) return;
  if (mode === 'note') line.specialInstruction = value.trim();
  if (mode === 'for') line.forName = value.trim();
  state.cartItemEditor = { lineId: null, mode: null, value: '' };
  render();
}

function closeCartItemEditor() {
  state.cartItemEditor = { lineId: null, mode: null, value: '' };
  render();
}

function isModSelected(gid, name) {
  const group = state.idx?.groupsById?.[gid];
  const current = normalizedSelectedMods(gid);
  if (groupSupportsPreModifier(group)) {
    const activePre = getSelectedPreModifierValue(gid);
    return current.some((entry) => entry.optionName === name && entry.preModifierValue === activePre);
  }
  return current.some((entry) => entry.optionName === name);
}

function toggleMod(groupId, name) {
  const group = state.idx.groupsById[groupId];
  state.selectedConfig.mods = state.selectedConfig.mods || {};
  const options = state.idx.optsByGroup.get(groupId) || [];
  const option = options.find((opt) => opt.name === name);
  if (!option) return;

  const curr = normalizedSelectedMods(groupId);
  const supportsPre = groupSupportsPreModifier(group);
  const activePre = supportsPre ? getSelectedPreModifierValue(groupId) : null;
  const sameSelection = (entry) => entry.optionId === option.id && (!supportsPre || entry.preModifierValue === activePre);

  if (group.type === 'single-select') {
    const retained = supportsPre ? curr.filter((entry) => entry.preModifierValue !== activePre) : [];
    if (curr.some(sameSelection)) {
      state.selectedConfig.mods[groupId] = retained;
    } else {
      state.selectedConfig.mods[groupId] = [...retained, buildSelectedModifierEntry(group, option, activePre)];
    }
  } else if (curr.some(sameSelection)) {
    state.selectedConfig.mods[groupId] = curr.filter((entry) => !sameSelection(entry));
  } else {
    state.selectedConfig.mods[groupId] = [...curr, buildSelectedModifierEntry(group, option, activePre)];
  }
  render();
}

async function installApp() {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      state.installAvailable = false;
      render();
      return;
    } catch (err) {
      console.error('Install prompt failed:', err);
    }
  }
  if (isIosSafari()) {
    alert('To install on iPhone/iPad, tap Share and then Add to Home Screen.');
  }
}

function installUiState() {
  if (state.installed) return { label: 'Installed', enabled: false, hint: '' };
  if (state.installAvailable) return { label: 'Install App', enabled: true, hint: '' };
  if (isIosSafari()) return { label: 'Add to Home Screen', enabled: true, hint: 'Use Safari Share menu for install.' };
  if (!window.isSecureContext) return { label: 'Install Unavailable', enabled: false, };
  return { label: 'Install Unavailable', enabled: false, hint: 'Waiting for browser install eligibility.' };
}

function categoryRailHtml() {
  const cats = visibleCategories();
  return `
    <aside class="category-rail">
      <div class="rail-fixed">
        <button data-cat="${VIEW_ALL_CATEGORIES}" class="cat-btn ${state.category === VIEW_ALL_CATEGORIES ? 'active' : ''}">All Categories</button>
        <button data-cat="${VIEW_ALL_ITEMS}" class="cat-btn ${state.category === VIEW_ALL_ITEMS ? 'active' : ''}">All Items</button>
        <button data-cat="${VIEW_FAVORITES}" class="cat-btn ${state.category === VIEW_FAVORITES ? 'active' : ''}">My Favorites</button>
      </div>
      <div class="rail-list">
        ${cats.map((c) => `<button data-cat="${c.id}" data-cat-edit="${c.id}" class="cat-btn ${state.category === c.id ? 'active' : ''}">${h(c.name)}</button>`).join('')}
      </div>
    </aside>
  `;
}

function incomingEntriesHtml() {
  const sampleEntries = [
    { source: 'AI Phone Order', text: 'Queued: 1 pending mock call order' },
    { source: 'StreamOrders', text: 'No live integration. Demo event only.' },
    { source: 'Local Activity', text: `${state.sentOrdersToday.length} sent today` },
    { source: 'Caller ID', text: state.call ? `${state.call.name} ${state.call.phone}` : 'Listening for next caller event' }
  ];
  return sampleEntries.map((e) => `<li><b>${h(e.source)}:</b> ${h(e.text)}</li>`).join('');
}

function lineTileBody(line) {
  if (line.state === 'idle') {
    return `<small>Idle</small>`;
  }
  if (line.state === 'ended') {
    return `<small>Ended - returning to idle</small>`;
  }
  if (line.state === 'claimed') {
    return `
      ${line.phoneNumber ? `<b>${h(phoneDisplayValue(line.phoneNumber))}</b>` : ''}
      <small>Claimed</small>
      <small>Claimed by ${h(line.claimedByStation || 'Counter 1')}</small>
    `;
  }
  const address = toAddressText(line.address);
  const sourceMeta = line.rawDetails?.carrier || line.rawDetails?.source;
  const carrier = sourceMeta ? `<small>${h(sourceMeta)}</small>` : '';
  return `
    ${line.phoneNumber ? `<b>${h(phoneDisplayValue(line.phoneNumber))}</b>` : ''}
    ${line.callerName ? `<small>${h(line.callerName)}</small>` : ''}
    ${address ? `<small>${h(address)}</small>` : ''}
    ${carrier}
  `;
}

function hasKnownCustomerRecord(line) {
  return line.state !== 'idle'
    && line.matchType === 'known-customer'
    && !!line.rawDetails?.customerId;
}

function lineHasSavedCardOnFile(line) {
  if (!hasKnownCustomerRecord(line)) return false;
  return buildSavedPaymentMethods(String(line.rawDetails?.customerId || '')).length > 0;
}

function lineMatchClass(line) {
  if (line.state === 'idle') return '';
  return line.matchType === 'known-customer' ? 'known' : 'unknown';
}

function lineRingingClass(line) {
  return line.state === 'ringing' && !line.claimedByStation ? 'line-ringing' : '';
}

function navIcon(name) {
  const icons = {
    clock: '<circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path>',
    orders: '<path d="M7 4h10l1 2v14l-2-1-2 1-2-1-2 1-2-1-2 1V6l1-2z"></path><path d="M9 9h6"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>',
    calendar: '<rect x="5" y="6" width="14" height="13" rx="2"></rect><path d="M8 4v4"></path><path d="M16 4v4"></path><path d="M5 10h14"></path>',
    customer: '<circle cx="12" cy="8" r="3"></circle><path d="M6 19c.8-3.2 3-5 6-5s5.2 1.8 6 5"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    pencil: '<path d="M16.9 3.9a2.1 2.1 0 0 1 3 3L9.2 17.6l-4.4 1.1 1.1-4.4L16.9 3.9z"></path><path d="M15.5 5.3l3.2 3.2"></path>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M7 9h.01M17 15h.01"></path>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h4"></path>',
    gift: '<rect x="4" y="8" width="16" height="12" rx="2"></rect><path d="M12 8v12"></path><path d="M4 12h16"></path><path d="M12 8c-1.8 0-3.2-1.2-3.2-2.7S10 3 12 5.4C14 3 15.2 3.8 15.2 5.3S13.8 8 12 8z"></path>',
    split: '<path d="M12 4v16"></path><path d="M4 8h7"></path><path d="M13 16h7"></path><path d="M6 6l-2 2 2 2"></path><path d="M18 14l2 2-2 2"></path>',
    link: '<path d="M10.5 13.5l3-3"></path><path d="M8.2 15.8l-1.4 1.4a3 3 0 0 1-4.2-4.2l2.1-2.1a3 3 0 0 1 4.2 0"></path><path d="M15.8 8.2l1.4-1.4a3 3 0 1 1 4.2 4.2l-2.1 2.1a3 3 0 0 1-4.2 0"></path>',
    payment: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h3"></path><path d="M12 15h5"></path>'
  };
  return `<svg class="nav-svg" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
}

function customerRecordIcon() {
  return '<span class="line-customer-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"></circle><path d="M6 19c.8-3.2 3-5 6-5s5.2 1.8 6 5"></path></svg></span>';
}

function lineCardOnFileIcon() {
  return '<span class="line-card-on-file-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h4"></path></svg></span>';
}

function phoneLinesFooterHtml() {
  return `
    <footer class="line-footer">
      <div class="line-grid">
        ${state.phoneLines.map((line) => `
          <button class="line-tile ${line.state} ${lineMatchClass(line)} ${lineRingingClass(line)}" data-line-tile="${line.lineNumber}">
            ${hasKnownCustomerRecord(line) ? customerRecordIcon() : ''}
            ${lineHasSavedCardOnFile(line) ? lineCardOnFileIcon() : ''}
            <span class="line-title">Line ${line.lineNumber}</span>
            ${lineTileBody(line)}
          </button>
        `).join('')}
      </div>
    </footer>
  `;
}

function lineModalHtml() {
  const line = getLine(state.selectedLineNumber);
  if (!line || line.state !== 'ringing') return '';
  const detailRows = Object.entries(line.rawDetails || {}).map(([k, v]) => `<li><b>${h(k)}:</b> ${h(v)}</li>`).join('');
  const address = toAddressText(line.address);
  return `
    <div class="modal-backdrop">
      <div class="call-modal">
        <h3>Incoming Caller - Line ${line.lineNumber}</h3>
        ${line.phoneNumber ? `<p><b>Phone:</b> ${h(phoneDisplayValue(line.phoneNumber))}</p>` : ''}
        ${line.callerName ? `<p><b>Name:</b> ${h(line.callerName)}</p>` : ''}
        ${address ? `<p><b>Address:</b> ${h(address)}</p>` : ''}
        ${detailRows ? `<ul>${detailRows}</ul>` : ''}
        <div class="call-modal-actions">
          <button id="startTicketLine" class="btn-success" data-line-action="${line.lineNumber}">Start Ticket</button>
          <button id="claimLine" class="btn-primary" data-line-action="${line.lineNumber}">Claim Call</button>
          <button id="dismissLine" class="btn-secondary" data-line-action="${line.lineNumber}">Dismiss</button>
        </div>
      </div>
    </div>
  `;
}

function menuBoardHtml(filtered) {
  const searching = !!state.query.trim();
  const showCategoryTiles = !searching && state.category === VIEW_ALL_CATEGORIES;
  const favoriteCats = visibleCategories().filter((c) => state.favoriteCategoryIds.includes(c.id));
  const showFavorites = !searching && state.category === VIEW_FAVORITES;
  const showFavoritesEmpty = showFavorites && favoriteCats.length === 0 && filtered.length === 0;
  const showItems = !showCategoryTiles && !showFavoritesEmpty;
  const allowBlankTap = !searching && isRegularCategorySelected();
  return `
    <section class="menu-board">
      <div class="menu-tools">
        <div class="search-wrap">
          <input id="query" type="text" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" data-lilpos-keyboard="true" data-form-type="other" aria-autocomplete="none" placeholder="Search menu..." value="${h(state.query)}" />
        </div>
        <button id="clearSearch" class="btn-secondary" ${state.query ? '' : 'disabled'}>Clear Search</button>
        <button id="toggleActivity" class="btn-secondary">Incoming</button>
      </div>
      ${state.activityOpen ? `<div class="incoming-panel"><button id="simulateCall" class="btn-success">Simulate Caller ID</button><div class="line-sim-buttons">${state.phoneLines.map((l) => `<button class="btn-secondary" data-sim-line="${l.lineNumber}">Ring Line ${l.lineNumber}</button>`).join('')}</div><ul>${incomingEntriesHtml()}</ul></div>` : ''}
      ${!state.menu ? '<div class="empty"><h2>Menu not loaded</h2><p>Open Dev Tools and run Generate + Store Menu or Load DB.</p></div>' : ''}
      ${showCategoryTiles ? categoryTilesHtml() : ''}
      ${showFavorites && favoriteCats.length ? `<div class="favorites-cats"><h4>Favorite Categories</h4><div class="category-tile-grid">${favoriteCats.map((c) => categoryTileButtonHtml(c, 'Favorite category')).join('')}</div></div>` : ''}
      ${showFavoritesEmpty ? '<div class="empty"><h2>No favorites yet</h2><p>Favorite buttons will appear here.</p></div>' : ''}
      ${showFavorites && filtered.length ? '<h4 class="fav-items-title">Favorite Items</h4>' : ''}
      <div id="menuGrid" class="menu-grid ${showItems ? '' : 'hidden'}" data-add-tap-enabled="${allowBlankTap ? '1' : '0'}">
        ${filtered.map((item) => {
          const cat = state.idx?.catsById[item.categoryId];
          const modCount = state.idx?.itemMods.get(item.id)?.length || 0;
          const hasConfigurableModifiers = shouldShowItemCardActions(item);
          const plusOpensModifierDialog = shouldPlusOpenModifierDialog(item);
          const basePrice = item.fixedPrice ? money(item.basePrice) : `${money(item.sizeSchema?.[0]?.price)}+`;
          const oos = isItemOutOfStock(item);
          const hasImage = !!item.imageUrl;
          return `
            <div class="pos-item-shell ${hasConfigurableModifiers ? 'has-item-actions' : ''}">
              <button class="pos-item ${oos ? 'out-of-stock' : ''} ${hasImage ? 'has-image' : 'no-image'}" data-item="${item.id}">
                <div class="pos-item-main">
                  <div class="pos-item-text ${hasConfigurableModifiers ? 'has-item-actions' : ''}">
                    <div class="row1"><b>${h(item.name)}</b><span>${h(basePrice)}</span></div>
                    <div class="row2"><span>${h(cat?.name || '')}</span><span>${modCount} mods</span></div>
                    ${oos ? `<div class="oos-pill">${h(outOfStockLabel(item))}</div>` : ''}
                  </div>
                  ${hasImage ? `<div class="pos-item-image"><img src="${h(item.imageUrl)}" alt="${h(item.name)}" loading="lazy" decoding="async" /></div>` : ''}
                </div>
              </button>
              ${hasConfigurableModifiers ? `
                <div class="pos-item-actions" aria-label="Item actions">
                  <button
                    class="icon-btn"
                    data-item-action="plus"
                    data-item-action-item="${item.id}"
                    data-item-plus-dialog="${plusOpensModifierDialog ? '1' : '0'}"
                    title="${plusOpensModifierDialog ? 'Add with modifiers' : 'Quick add'}"
                    aria-label="${plusOpensModifierDialog ? 'Add with modifiers' : 'Quick add'}"
                  >+</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
        ${allowBlankTap && showItems ? '<div id="gridAddZone" class="grid-add-zone" aria-hidden="true"></div>' : ''}
      </div>
    </section>
  `;
}

function orderSpecialInstructionsBarHtml() {
  if (!isNewOrderState()) return '';
  const locked = !!selectedOrderForDetail();
  const value = state.orderSpecialInstructions || '';
  return `
    <div class="order-special-bar">
      <div class="order-special-input-wrap ${locked ? 'locked' : ''}">
        <input
          id="orderSpecialInstructionsInput"
          data-keyboard-context="special-instructions"
          type="text"
          maxlength="280"
          placeholder="Special order instructions..."
          value="${h(value)}"
          ${locked ? 'disabled' : ''}
        />
        <button
          id="clearOrderSpecialInstructionsBtn"
          class="order-special-clear-btn"
          title="Clear special order instructions"
          aria-label="Clear special order instructions"
          ${locked || !value ? 'disabled' : ''}
        >&#10005;</button>
      </div>
    </div>
  `;
}

function renderHomeMenuView(filtered) {
  return `
    <section class="center-menu-pane">
      ${menuBoardHtml(filtered)}
      ${orderSpecialInstructionsBarHtml()}
    </section>
  `;
}

function renderCustomerManagementView() {
  const q = String(state.customersQuery || '').trim().toLowerCase();
  const normalizedQ = normalizePhone(state.customersQuery || '');
  const matches = (state.mockCustomers || []).filter((customer) => {
    if (!q) return true;
    const blob = `${customer.name} ${customer.phone} ${customer.address1} ${customer.city} ${customer.state} ${customer.zip}`.toLowerCase();
    return blob.includes(q) || (normalizedQ ? normalizePhone(customer.phone).includes(normalizedQ) : false);
  });
  const d = state.customerDraft || {};
  return `
    <section class="menu-board center-view customer-mgmt-view">
      <div class="view-head">
        <h3>Customer Management</h3>
        <button id="customerBackToMenu" class="btn-secondary">Back to Menu</button>
      </div>
      <div class="menu-tools">
        <div class="search-wrap">
          <input id="customerMgmtQuery" data-keyboard-kind="text" data-keyboard-context="customer-search" placeholder="Search customer by name, phone, or address" value="${h(state.customersQuery)}" />
        </div>
      </div>
      <div class="customer-mgmt-shell">
        <div class="customer-mgmt-results">
          <h4>Matches</h4>
          ${matches.length ? matches.map((customer) => `
            <button class="customer-result-tile" data-customer-select="${customer.id}">
              <b>${h(customer.name || 'Guest')}</b>
              <small>${h(phoneDisplayValue(customer.phone) || 'No phone')}</small>
              <small>${h(customerAddressText(customer) || 'No address')}</small>
            </button>
          `).join('') : '<p class="muted">No matching customers.</p>'}
        </div>
        <div class="customer-mgmt-form customer-entry expanded">
          <h4>Customer Profile</h4>
          <div class="entry-grid">
            <input id="customerMgmtName" data-keyboard-context="customer-profile-name" placeholder="Customer name" value="${h(d.name || '')}" />
            <input id="customerMgmtPhone" type="tel" inputmode="tel" autocomplete="tel" data-keyboard-kind="phone" data-keyboard-context="customer-profile-phone" placeholder="Phone" value="${h(phoneDisplayValue(d.phone || ''))}" />
            <input id="customerMgmtAddress1" data-keyboard-context="customer-address" placeholder="Street address" value="${h(d.address1 || '')}" />
            <input id="customerMgmtCity" data-keyboard-context="customer-address" placeholder="City" value="${h(d.city || '')}" />
            <input id="customerMgmtState" data-keyboard-context="customer-address" placeholder="State" value="${h(d.state || '')}" />
            <input id="customerMgmtZip" data-keyboard-context="customer-address" placeholder="ZIP" value="${h(d.zip || '')}" />
            <input id="customerMgmtAllergies" placeholder="Customer note / allergy note" value="${h(d.allergies || '')}" />
            <input id="customerMgmtInstructions" placeholder="Special instructions" value="${h(d.specialInstructions || '')}" />
          </div>
          <div class="entry-actions">
            <button id="customerMgmtApply" class="btn-primary">Save Customer</button>
            <button id="customerMgmtCancel" class="btn-secondary">Cancel</button>
            <button id="customerMgmtStartTicket" class="btn-success">Start Ticket</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderOrderTile(order) {
  const typeLabel = ORDER_TYPES[order.orderType] || order.orderType;
  const paid = !!order.paid || String(order.paymentStatus || '').toLowerCase() === 'paid';
  const paidClass = paid ? 'paid' : 'unpaid';
  const paidText = paid ? 'PAID' : 'NOT PAID';
  const displayNumber = formatOrderNumberForDisplay(order.number);
  return `
    <button class="order-mgmt-tile" data-open-order="${order.id}">
      <div class="order-tile-badge-row">
        <span class="order-payment-badge ${paidClass}">${paidText}</span>
      </div>
      <div class="order-mgmt-top">
        <b>#${h(displayNumber)}</b>
        <span class="order-status ${order.status}">${h(order.status)}</span>
      </div>
      <div class="order-mgmt-mid">
        <div>${h(order.customerName || 'Guest')}</div>
        <small>${h(typeLabel)} | ${h(order.timeLabel)}</small>
      </div>
      <div class="order-mgmt-bottom">
        <small>${order.onlineOnly ? 'Online Only' : h(order.source || 'Counter')}</small>
        <b>${money(order.total)}</b>
      </div>
    </button>
  `;
}

function renderOrdersManagementView() {
  const rows = filteredOrderManagementRows();
  const chips = orderQueueChips();
  return `
    <section class="menu-board center-view orders-mgmt-view">
      <div class="view-head">
        <h3>Orders Management</h3>
        <button id="ordersBackToMenu" class="btn-secondary">Back to Menu</button>
      </div>
      <div class="menu-tools">
        <div class="search-wrap">
          <input id="ordersQuery" placeholder="Search by order #, customer, type, source" value="${h(state.ordersQuery)}" />
        </div>
      </div>
      <div class="orders-filter-row">
        ${chips.map((chip) => `
          <button class="pill orders-filter-pill ${state.ordersFilter === chip.id ? 'active' : ''}" data-orders-filter="${chip.id}">
            <span class="orders-filter-pill-label">${chip.label}</span>
            <span class="orders-filter-pill-count">(${queueCountForFilter(chip.id)})</span>
          </button>
        `).join('')}
      </div>
      <div class="orders-mgmt-grid">
        ${rows.length ? rows.map((order) => renderOrderTile(order)).join('') : '<p class="muted">No matching orders for this filter.</p>'}
      </div>
    </section>
  `;
}

function renderManagerPinView() {
  const dots = '&#9679;'.repeat(state.managerPinEntry.length) + '&#9675;'.repeat(4 - state.managerPinEntry.length);
  return `
    <div class="mgr-pin-view">
      <div class="mgr-pin-card">
        <h2 class="mgr-pin-title">Manager Access</h2>
        <p class="mgr-pin-instruction">Enter manager PIN</p>
        <div class="mgr-pin-display" aria-label="PIN entry">${dots}</div>
        ${state.managerPinError ? `<div class="mgr-pin-error">${h(state.managerPinError)}</div>` : ''}
        <div class="mgr-pin-keypad">
          ${[1,2,3,4,5,6,7,8,9].map((d) => `<button class="mgr-pin-key" data-pin-digit="${d}">${d}</button>`).join('')}
          <button class="mgr-pin-key mgr-pin-key-action" data-pin-clear>Clear</button>
          <button class="mgr-pin-key" data-pin-digit="0">0</button>
          <button class="mgr-pin-key mgr-pin-key-action" data-pin-back>&#9003;</button>
        </div>
        <button id="mgrPinCancel" class="btn-secondary mgr-pin-cancel">Cancel</button>
      </div>
    </div>
  `;
}

function renderManagerSystemStatusView() {
  const online = !state.offline;
  const serverConnected = !state.offline;
  const statusCard = (label, ok, value = '') => `
    <div class="mgr-status-card ${ok ? 'ok' : 'bad'}">
      <span class="mgr-status-label">${h(label)}</span>
      <span class="mgr-status-value">${h(value || (ok ? 'OK' : 'Not Available'))}</span>
    </div>
  `;
  
  return `
    <div class="mgr-section-content">
      <h3>System Status</h3>
      <div class="mgr-status-grid">
        ${statusCard('Menu Cache', !!state.menu, state.menu ? `v${state.menu.packageVersion}` : '')}
        ${statusCard('Online Status', online)}
        ${statusCard('LilServer Connection', serverConnected)}
        ${statusCard('Printer', true, 'Online')}
        ${statusCard('Caller ID', true, 'Listening')}
        ${statusCard('Secure Context', state.pwaDiag.secure)}
        ${statusCard('Manifest', state.pwaDiag.manifest)}
        ${statusCard('Service Worker Supported', state.pwaDiag.swSupported)}
        ${statusCard('Service Worker Registered', state.pwaDiag.swRegistered)}
        ${statusCard('Service Worker Controlled', state.pwaDiag.swController)}
        ${statusCard('Install Prompt', state.pwaDiag.beforeInstallPrompt)}
        ${statusCard('App Installed', state.installed)}
      </div>
      <button id="mgrStatusBack" class="btn-secondary">Back to Settings</button>
    </div>
  `;
}

function renderManagerInstallView() {
  const install = installUiState();
  return `
    <div class="mgr-section-content">
      <h3>Application & Installation</h3>
      <div class="mgr-install-section">
        <h4>Install Status</h4>
        <p class="mgr-install-status-text">
          ${state.installed ? 'LilPOS is installed on this device.' : 'LilPOS is not installed. Use the button below to add it.'}
        </p>
        ${install.hint ? `<p class="mgr-install-hint">${h(install.hint)}</p>` : ''}
        ${!state.installed ? `<button id="mgrInstallApp" class="btn-primary" ${install.enabled ? '' : 'disabled'}>${h(install.label)}</button>` : '<p class="muted">Installed – remove via device settings to reinstall.</p>'}
      </div>
      <div class="mgr-pwa-info">
        <h4>PWA Features</h4>
        <ul class="mgr-pwa-list">
          <li><b>Secure Context:</b> ${state.pwaDiag.secure ? 'Yes' : 'No'}</li>
          <li><b>Service Worker:</b> ${state.pwaDiag.swSupported ? 'Supported' : 'Not supported'}</li>
          <li><b>Service Worker Registered:</b> ${state.pwaDiag.swRegistered ? 'Yes' : 'No'}</li>
          <li><b>Service Worker Active:</b> ${state.pwaDiag.swController ? 'Yes' : 'No'}</li>
        </ul>
      </div>
      <button id="mgrInstallBack" class="btn-secondary">Back to Settings</button>
    </div>
  `;
}

function renderManagerDevToolsView() {
  const payload = JSON.stringify(ticketPayload('raw-preview'), null, 2);
  return `
    <div class="mgr-section-content mgr-devtools">
      <h3>Developer Tools</h3>
      <div class="mgr-devtools-controls">
        <div class="mgr-devtools-section">
          <h4>Menu Generation</h4>
          <select id="mgrScale">
            <option value="medium" ${state.scale === 'medium' ? 'selected' : ''}>Medium data</option>
            <option value="large" ${state.scale === 'large' ? 'selected' : ''}>Large data</option>
            <option value="huge" ${state.scale === 'huge' ? 'selected' : ''}>Huge data</option>
          </select>
          <button id="mgrGenerate" class="btn-primary">Generate + Store Menu</button>
          <button id="mgrSeedMedium" class="btn-secondary">Load Medium Seed</button>
          <button id="mgrSeedLarge" class="btn-secondary">Load Large Seed</button>
          <button id="mgrSeedHuge" class="btn-secondary">Load Huge Seed</button>
        </div>
        <div class="mgr-devtools-section">
          <h4>Database</h4>
          <button id="mgrLoad" class="btn-primary">Load DB</button>
          <button id="mgrClear" class="btn-danger">Clear DB</button>
        </div>
        <div class="mgr-devtools-section">
          <h4>Network</h4>
          <button id="mgrToggleOffline" class="btn-secondary">${state.offline ? 'Go Online' : 'Go Offline'}</button>
        </div>
      </div>
      <div class="mgr-devtools-metrics">
        <h4>Metrics</h4>
        <div class="metric"><span>Menu</span><b>${state.menu ? `${state.menu.counts.items} items` : 'No cache'}</b></div>
        <div class="metric"><span>Generate</span><b>${state.metrics.generateMs ? `${state.metrics.generateMs} ms` : '-'}</b></div>
        <div class="metric"><span>Store IndexedDB</span><b>${state.metrics.storeIndexedDbMs ? `${state.metrics.storeIndexedDbMs} ms` : '-'}</b></div>
        <div class="metric"><span>Load IndexedDB</span><b>${state.metrics.loadIndexedDbMs ? `${state.metrics.loadIndexedDbMs} ms` : '-'}</b></div>
        <div class="metric"><span>Filter</span><b>${state.metrics.lastFilterMs ? `${state.metrics.lastFilterMs} ms` : '-'}</b></div>
        <div class="metric"><span>Package</span><b>${state.metrics.packageBytes ? `${(state.metrics.packageBytes / 1024 / 1024).toFixed(2)} MB` : '-'}</b></div>
      </div>
      <div class="mgr-devtools-section">
        <h4>Caller ID Simulation</h4>
        <div class="call-sim-actions">
          <button class="btn-success" data-mgr-sim-count="1">Simulate 1 Incoming Call</button>
          <button class="btn-success" data-mgr-sim-count="2">Simulate 2 Incoming Calls</button>
          <button class="btn-success" data-mgr-sim-count="3">Simulate 3 Incoming Calls</button>
          <button class="btn-success" data-mgr-sim-count="4">Simulate 4 Incoming Calls</button>
          <button class="btn-danger" id="mgrEndAllCalls">End All Calls</button>
        </div>
        <div class="line-sim-buttons" style="margin-top:8px;">
          ${state.phoneLines.map((l) => `<button class="btn-secondary ${l.state === 'idle' || l.state === 'ended' ? 'disabled' : ''}" data-mgr-end-line="${l.lineNumber}" ${l.state === 'idle' || l.state === 'ended' ? 'disabled' : ''}>End Line ${l.lineNumber}</button>`).join('')}
        </div>
      </div>
      <div class="mgr-devtools-section">
        <h4>Raw Ticket Payload</h4>
        <pre class="mgr-raw-box">${h(payload.slice(0, 4000))}</pre>
      </div>
      <button id="mgrDevToolsBack" class="btn-secondary">Back to Settings</button>
    </div>
  `;
}

function renderManagerKeyboardOptionsView() {
  const selectedMode = normalizeKeyboardMode(state.keyboardMode);
  return `
    <div class="mgr-section-content mgr-keyboard-options-view">
      <h3>Keyboard Options</h3>
      <div class="mgr-setting-row mgr-keyboard-setting-row">
        <div class="mgr-setting-label-wrap">
          <b class="mgr-setting-label">Keyboard Options</b>
          <small class="muted">Choose how LilPOS shows on-screen keyboard UI for supported inputs.</small>
        </div>
        <div class="mgr-setting-control mgr-keyboard-radio-group" role="radiogroup" aria-label="Keyboard Options">
          <label><input type="radio" name="keyboardMode" value="micro" data-keyboard-mode="micro" ${selectedMode === 'micro' ? 'checked' : ''} /> Micro Keyboard</label>
          <label><input type="radio" name="keyboardMode" value="compact-footer" data-keyboard-mode="compact-footer" ${selectedMode === 'compact-footer' ? 'checked' : ''} /> Compact Footer Keyboard</label>
          <label><input type="radio" name="keyboardMode" value="standard-qwerty" data-keyboard-mode="standard-qwerty" ${selectedMode === 'standard-qwerty' ? 'checked' : ''} /> Standard QWERTY</label>
          <label><input type="radio" name="keyboardMode" value="external" data-keyboard-mode="external" ${selectedMode === 'external' ? 'checked' : ''} /> External Keyboard</label>
        </div>
      </div>
      <div class="mgr-setting-note muted">Current: ${h(keyboardModeLabel(selectedMode))}</div>
    </div>
  `;
}

const MANAGER_SETTINGS_TILES = [
  { id: 'system',      icon: '&#9881;',  title: 'System Status',     desc: 'Menu cache, online/offline, software status' },
  { id: 'install',     icon: '&#128640;',title: 'Application & Installation', desc: 'Install app, PWA features' },
  { id: 'devtools',    icon: '&#127942;',title: 'Developer Tools',   desc: 'Generate menu, load seeds, diagnostics' },
  { id: 'menu',        icon: '&#9776;',  title: 'Menu',              desc: 'Manage menu layout and categories' },
  { id: 'categories',  icon: '&#8853;',  title: 'Categories',        desc: 'Add, rename, hide categories' },
  { id: 'items',       icon: '&#9783;',  title: 'Items',             desc: 'Edit items, prices, and modifiers' },
  { id: 'outofstock',  icon: '&#9747;',  title: 'Out of Stock',      desc: 'Mark items unavailable' },
  { id: 'printers',    icon: '&#9113;',  title: 'Printers',          desc: 'Printer routes and station config' },
  { id: 'callerid',    icon: '&#9742;',  title: 'Caller ID',         desc: 'Caller ID lines and integration' },
  { id: 'payments',    icon: '&#36;',    title: 'Payments',          desc: 'Payment methods and terminals' },
  { id: 'employees',   icon: '&#128100;',title: 'Employees',         desc: 'Employee records and PINs' },
  { id: 'permissions', icon: '&#128274;',title: 'Permissions',       desc: 'Role-based access control' },
  { id: 'keyboard',    icon: '&#9000;',  title: 'Keyboard Options',  desc: 'On-screen keyboard mode and behavior' },
  { id: 'stations',    icon: '&#128421;',title: 'Stations',          desc: 'Register and station settings' },
  { id: 'ordersettings', icon: '&#128203;', title: 'Order Settings', desc: 'Order types, timing, and defaults' },
  { id: 'reports',     icon: '&#128200;',title: 'Reports',           desc: 'Sales summaries and activity' },
  { id: 'business',    icon: '&#127981;',title: 'Business Settings', desc: 'Name, address, hours, and tax' },
  { id: 'subscription', icon: '&#11088;',title: 'Subscription & Features', desc: 'Plan, tier, and enabled features' }
];

function renderManagerSettingsView() {
  const activeSection = state.managerSettingsSection;
  
  // Display working sections with their own views
  if (activeSection === 'system') {
    return `
      <div class="mgr-settings-view">
        <div class="mgr-settings-header">
          <h2>Manager Settings</h2>
          <div class="mgr-settings-header-actions">
            <button id="mgrStatusBack" class="btn-secondary">&#8592; Back</button>
            <button id="mgrLock" class="btn-danger">Lock Manager</button>
          </div>
        </div>
        <div class="mgr-section-wrapper">
          ${renderManagerSystemStatusView()}
        </div>
      </div>
    `;
  }
  if (activeSection === 'install') {
    return `
      <div class="mgr-settings-view">
        <div class="mgr-settings-header">
          <h2>Manager Settings</h2>
          <div class="mgr-settings-header-actions">
            <button id="mgrInstallBack" class="btn-secondary">&#8592; Back</button>
            <button id="mgrLock" class="btn-danger">Lock Manager</button>
          </div>
        </div>
        <div class="mgr-section-wrapper">
          ${renderManagerInstallView()}
        </div>
      </div>
    `;
  }
  if (activeSection === 'devtools') {
    return `
      <div class="mgr-settings-view">
        <div class="mgr-settings-header">
          <h2>Manager Settings</h2>
          <div class="mgr-settings-header-actions">
            <button id="mgrDevToolsBack" class="btn-secondary">&#8592; Back</button>
            <button id="mgrLock" class="btn-danger">Lock Manager</button>
          </div>
        </div>
        <div class="mgr-section-wrapper">
          ${renderManagerDevToolsView()}
        </div>
      </div>
    `;
  }
  if (activeSection === 'keyboard') {
    return `
      <div class="mgr-settings-view">
        <div class="mgr-settings-header">
          <h2>Manager Settings</h2>
          <div class="mgr-settings-header-actions">
            <button id="mgrKeyboardBack" class="btn-secondary">&#8592; Back</button>
            <button id="mgrLock" class="btn-danger">Lock Manager</button>
          </div>
        </div>
        <div class="mgr-section-wrapper">
          ${renderManagerKeyboardOptionsView()}
        </div>
      </div>
    `;
  }
  
  // Default: show placeholder for remaining sections
  if (activeSection) {
    return `
      <div class="mgr-settings-view">
        <div class="mgr-settings-header">
          <h2>Manager Settings</h2>
          <div class="mgr-settings-header-actions">
            <button id="mgrSectionBack" class="btn-secondary">&#8592; Back</button>
            <button id="mgrLock" class="btn-danger">Lock Manager</button>
          </div>
        </div>
        <div class="mgr-section-coming-soon">
          <div class="mgr-coming-soon-icon">&#9881;</div>
          <h3>${h(MANAGER_SETTINGS_TILES.find((t) => t.id === activeSection)?.title || activeSection)}</h3>
          <p class="muted">This settings section is coming soon.</p>
          <button id="mgrSectionBack" class="btn-secondary">&#8592; Back to Settings</button>
        </div>
      </div>
    `;
  }
  
  // Default: show settings tile grid
  return `
    <div class="mgr-settings-view">
      <div class="mgr-settings-header">
        <h2>Manager Settings</h2>
        <div class="mgr-settings-header-actions">
          <button id="mgrBackToMenu" class="btn-secondary">&#8592; Back to Menu</button>
          <button id="mgrLock" class="btn-danger">Lock Manager</button>
        </div>
      </div>
      <div class="mgr-tiles-grid">
        ${MANAGER_SETTINGS_TILES.map((tile) => `
          <button class="mgr-tile" data-mgr-tile="${tile.id}">
            <span class="mgr-tile-icon" aria-hidden="true">${tile.icon}</span>
            <span class="mgr-tile-title">${h(tile.title)}</span>
            <span class="mgr-tile-desc">${h(tile.desc)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPaymentPaneView() {
  if (!state.paymentPaneInput || !state.paymentPaneState) {
    return `
      <section class="menu-board center-view">
        <div class="empty">
          <h2>Payment unavailable</h2>
          <p>Open payment from an active ticket.</p>
        </div>
      </section>
    `;
  }
  return window.LilposPaymentPane.renderPane(state.paymentPaneInput, state.paymentPaneState);
}

function renderMainAreaView(filtered) {
  if (state.mainView === MAIN_VIEWS.customers) return renderCustomerManagementView();
  if (state.mainView === MAIN_VIEWS.orders) return renderOrdersManagementView();
  if (state.mainView === MAIN_VIEWS.payment) return renderPaymentPaneView();
  if (state.mainView === MAIN_VIEWS.managerPin) return renderManagerPinView();
  if (state.mainView === MAIN_VIEWS.managerSettings) return renderManagerSettingsView();
  return renderHomeMenuView(filtered);
}

function previousOrderCustomerBubbleHtml(order) {
  const safeCustomer = order?.customer || {};
  const identityLabel = resolveStoredOrderIdentity({
    customerName: order?.customerName,
    customerLabel: order?.customerLabel,
    orderLabel: order?.orderLabel,
    orderIdentity: order?.orderIdentity,
    displayName: order?.displayName,
    customer: safeCustomer,
    customerNameFallback: safeCustomer.name
  });
  const cityStateZip = [safeCustomer.city, safeCustomer.state, safeCustomer.zip].filter(Boolean).join(' ');
  const hasDetails = !!(
    normalizePhone(safeCustomer.phone)
    || String(safeCustomer.address1 || '').trim()
    || cityStateZip
    || String(safeCustomer.allergies || '').trim()
    || String(safeCustomer.notes || '').trim()
    || String(safeCustomer.specialInstructions || '').trim()
  );

  if (!hasDetails) {
    return `
      <div class="customer-summary previous-order-customer">
        <div class="sum-top">
          <b>${h(identityLabel || 'Guest')}</b>
        </div>
      </div>
    `;
  }

  return `
    <div class="customer-summary previous-order-customer previous-order-customer-populated">
      <div class="sum-top">
        <b>${h(identityLabel || 'Guest')}</b>
        ${safeCustomer.phone ? `<span>${h(phoneDisplayValue(safeCustomer.phone))}</span>` : ''}
      </div>
      ${safeCustomer.address1 ? `<small><b>Address:</b> ${h(safeCustomer.address1)}</small>` : ''}
      ${cityStateZip ? `<small><b>City/State/Zip:</b> ${h(cityStateZip)}</small>` : ''}
      ${safeCustomer.allergies ? `<small><b>Allergies:</b> ${h(safeCustomer.allergies)}</small>` : ''}
      ${safeCustomer.notes ? `<small><b>Customer Notes:</b> ${h(safeCustomer.notes)}</small>` : ''}
      ${safeCustomer.specialInstructions ? `<small><b>Instructions:</b> ${h(safeCustomer.specialInstructions)}</small>` : ''}
    </div>
  `;
}

function renderOrderDetailInTicketPane() {
  const order = selectedOrderForDetail();
  if (!order) return '';
  const typeLabel = ORDER_TYPES[order.orderType] || order.orderType;
  const paidClass = order.paid ? 'paid' : 'unpaid';
  const paidText = order.paid ? 'PAID' : 'NOT PAID';
  const displayNumber = formatOrderNumberForDisplay(order.number);
  return `
    <section class="ticket-section order-detail-pane">
      <div class="order-detail-head">
        <b>Viewing Order #${h(displayNumber)}</b>
        <button id="previousOrderEditBtn" class="previous-order-edit-btn" title="Edit completed order (coming soon)" aria-label="Edit completed order (coming soon)">
          <span class="icon-glyph">${navIcon('pencil')}</span>
        </button>
      </div>
      <div class="order-payment-row">
        <div class="order-payment-badge ${paidClass}">${paidText}</div>
        ${previousOrderPaymentSummaryHtml(order)}
      </div>
      ${previousOrderAuditTrailHtml(order)}
      ${order.orderSpecialInstructions ? `<small><b>Order Instructions:</b> ${h(order.orderSpecialInstructions)}</small>` : ''}
      ${previousOrderCustomerBubbleHtml(order)}
      <div class="order-detail-lines">
        ${(order.lines || []).map((line) => {
          const lineName = line?.name || line?.itemName || line?.title || 'Item';
          const qty = Number(line?.qty || 1);
          const size = line?.size ? `<span>${h(line.size)}</span>` : '';
          const mods = Array.isArray(line?.mods) && line.mods.length ? groupedModifiersCartHtml(line.mods) : '';
          const note = line?.specialInstruction ? `<small class="line-note">Note: ${h(line.specialInstruction)}</small>` : '';
          const forName = line?.forName ? `<small class="line-for">For: ${h(line.forName)}</small>` : '';
          const linePrice = Number(line?.price || 0);
          return `
            <div class="order-detail-line-item">
              <div class="order-detail-line-main">
                <b>${qty}x ${h(lineName)}</b>
                ${size}
                ${mods}
                ${note}
                ${forName}
              </div>
              <b>${money(linePrice * qty)}</b>
            </div>
          `;
        }).join('')}
      </div>
      <div class="order-detail-totals">
        <div><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
        <div><span>Tax</span><b>${money(order.tax)}</b></div>
        <div class="grand"><span>Total</span><b>${money(order.total)}</b></div>
      </div>
    </section>
  `;
}

function ticketPanelHtml() {
  const viewingPreviousOrder = !!selectedOrderForDetail();
  const showOrderSpecialInstructions = isNewOrderState();
  const sendState = getSendActionState(state.cart, state.orderType);
  const canCancelSale = state.cart.length > 0;
  const orderTypeLabel = ORDER_TYPES[state.orderType] || state.orderType;
  const timingLabel = state.timingType === 'future' && state.futureDateTime
    ? `Future: ${formatFutureLabel(state.futureDateTime)}`
    : (state.asapTime ? `Today ${formatTimeValueLabel(state.asapTime)}` : 'ASAP');
  
  return `
    <aside class="ticket-panel" data-view-mode="${viewingPreviousOrder ? 'previous' : 'active'}">
      <div class="ticket-panel-fixed ${viewingPreviousOrder ? 'is-hidden' : ''}">
        <div class="ticket-total-row ticket-section">
          <button id="newSaleBtn" class="btn-new-sale">New Sale</button>
          <div class="ticket-total-display">${money(ticketGrandTotal())}</div>
        </div>
        <div class="ticket-head ticket-section">
          <div class="timing-wrap">
            <small class="timing-badge ${state.timingType === 'future' ? 'future' : 'asap'}">${h(timingLabel)}</small>
            ${state.timingType !== 'future' ? `<button id="asapClockBtn" class="timing-clock-btn" title="Adjust ASAP time" aria-label="Adjust ASAP time"><span class="icon-glyph">${navIcon('clock')}</span></button>` : ''}
          </div>
          <div class="classifier-row">
            <button id="ordersViewBtn" class="icon-pill ${state.mainView === MAIN_VIEWS.orders ? 'active' : ''}" title="Orders management" aria-label="Orders management"><span class="icon-glyph">${navIcon('orders')}</span></button>
            <button id="calendarClassifier" class="icon-pill ${state.timingType === 'future' ? 'active' : ''}" title="Future order" aria-label="Future order"><span class="icon-glyph">${navIcon('calendar')}</span></button>
            <button id="customerMgmtBtn" class="icon-pill ${state.mainView === MAIN_VIEWS.customers ? 'active' : ''}" title="Customer management" aria-label="Customer management"><span class="icon-glyph">${navIcon('customer')}</span></button>
          </div>
        </div>
        <div class="order-type ticket-section">
          <button data-order-type="pickup" class="pill order-type-tile ${state.orderType === 'pickup' ? 'active' : ''}">
            <span class="order-type-icon" aria-hidden="true">🚶</span>
            <span class="order-type-label">Pickup</span>
          </button>
          <button data-order-type="delivery" class="pill order-type-tile ${state.orderType === 'delivery' ? 'active' : ''}">
            <span class="order-type-icon" aria-hidden="true">🚚</span>
            <span class="order-type-label">Delivery</span>
          </button>
          <button data-order-type="togo" class="pill order-type-tile ${state.orderType === 'togo' ? 'active' : ''}">
            <span class="order-type-icon" aria-hidden="true">🛍</span>
            <span class="order-type-label">To-Go</span>
          </button>
          <button data-order-type="tostay" class="pill order-type-tile ${state.orderType === 'tostay' ? 'active' : ''}">
            <span class="order-type-icon" aria-hidden="true">🍽</span>
            <span class="order-type-label">To-Stay</span>
          </button>
          ${businessSettings.dineInEnabled ? `<button data-order-type="dinein" class="pill order-type-tile ${state.orderType === 'dinein' ? 'active' : ''}"><span class="order-type-icon" aria-hidden="true">🪑</span><span class="order-type-label">Dine-In</span></button>` : ''}
        </div>
        ${state.deliveryInfoMissing ? '<div class="ticket-section delivery-warning">Delivery requires customer name, phone, and address.</div>' : ''}
        <div class="customer-shell ticket-section ${state.customerPanelMode === 'entry' ? 'is-entry' : 'is-compact'}">
          ${state.customerPanelMode === 'entry' ? expandedCustomerEntryHtml() : compactCustomerSummaryHtml()}
        </div>
      </div>
      <div class="ticket-panel-scroll">
        ${viewingPreviousOrder ? `
          ${renderOrderDetailInTicketPane()}
          <div class="ticket-footer ticket-section previous-order-footer">
            <div class="ticket-actions primary-actions">
              <button id="clearOrderDetail" class="btn-secondary" style="width: 100%;">Close</button>
            </div>
          </div>
        ` : `
          <div class="ticket-lines ticket-section">
            ${state.cart.length === 0 ? '<p class="muted">NO ITEMS IN CHECKOUT</p>' : ''}
            ${state.cart.map((l) => `
              <div class="line-item">
                <div class="line-main">
                  <b>${h(l.name)}</b>
                  ${l.size ? `<span>${h(l.size)}</span>` : ''}
                  ${groupedModifiersCartHtml(l.mods)}
                  ${l.specialInstruction ? `<small class="line-note">Note: ${h(l.specialInstruction)}</small>` : ''}
                  ${l.forName ? `<small class="line-for">For: ${h(l.forName)}</small>` : ''}
                </div>
                <div class="line-controls">
                  <button data-dec="${l.lineId}" class="qty-btn">-</button>
                  <span class="qty">${l.qty}</span>
                  <button data-inc="${l.lineId}" class="qty-btn">+</button>
                  <b>${money(l.price * l.qty)}</b>
                  <div class="line-actions">
                    <button data-editmods="${l.lineId}" class="icon-btn" title="Edit item modifiers">✎</button>
                    <button data-note="${l.lineId}" class="icon-btn" title="Item Note / Special Instruction">🗒</button>
                    <button data-for="${l.lineId}" class="icon-btn" title="This item is for...">👤</button>
                    <div class="remove-wrap">
                      <button data-remove="${l.lineId}" class="icon-btn del-circle" title="Remove item">✕</button>
                      ${state.removeConfirmLineId === l.lineId ? `<div class="remove-confirm"><span>Remove?</span><div><button data-remove-yes="${l.lineId}" class="btn-danger">Yes</button><button data-remove-no="${l.lineId}" class="btn-secondary">No</button></div></div>` : ''}
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="ticket-footer ticket-section">
            ${showOrderSpecialInstructions ? `<div id="orderSpecialInstructionsLive" class="order-special-live ${state.orderSpecialInstructions ? '' : 'is-hidden'}">${state.orderSpecialInstructions ? `Special Instructions: ${h(state.orderSpecialInstructions)}` : ''}</div>` : ''}
            <div class="totals">
              <div><span>Subtotal</span><b>${money(cartTotal())}</b></div>
              <div><span>Tax</span><b>${money(ticketTax())}</b></div>
              <div class="grand"><span>Total</span><b>${money(ticketGrandTotal())}</b></div>
            </div>
            <div class="ticket-actions primary-actions">
              <button id="sendPayNow" class="btn-pay-now" ${sendState.payNow.ok ? '' : 'disabled'}>Send &amp; Pay Now</button>
              <button id="sendPayLater" class="btn-pay-later" ${sendState.payLater.ok ? '' : 'disabled'}>Send &amp; Pay Later</button>
            </div>
            ${sendState.message ? `<small class="send-hint">${h(sendState.message)}</small>` : ''}
            <div class="ticket-actions secondary-actions">
              <button id="cancelSaleBottom" class="btn-cancel-sale" ${canCancelSale ? '' : 'disabled'}>Cancel Sale</button>
            </div>
          </div>
        `}
      </div>
    </aside>
  `;
}

function scheduleDialogHtml() {
  if (!state.scheduleDialog.open) return '';
  return `
    <div class="modal-backdrop">
      <div class="call-modal">
        <h3>Future Order</h3>
        <p>Choose when this order should be ready/requested.</p>
        <div class="schedule-grid">
          <label>
            Date
            <input id="scheduleDate" class="editor-input" type="date" value="${h(state.scheduleDialog.date)}" />
          </label>
          <label>
            Time
            <input id="scheduleTime" class="editor-input" type="time" value="${h(state.scheduleDialog.time)}" />
          </label>
        </div>
        <div class="call-modal-actions">
          <button id="saveSchedule" class="btn-success">Save</button>
          <button id="cancelSchedule" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function newSaleConfirmDialogHtml() {
  if (!state.showCancelConfirm) return '';
  return `
    <div class="modal-backdrop">
      <div class="call-modal">
        <h3>New Sale</h3>
        <p>If you continue, all information on this ticket will be lost</p>
        <div class="call-modal-actions">
          <button id="newSaleContinue" class="btn-danger">Continue</button>
          <button id="newSaleGoBack" class="btn-secondary">Go Back</button>
        </div>
      </div>
    </div>
  `;
}

function orderNumberDialogHtml() {
  if (!state.orderNumberDialog.open) return '';
  return `
    <div class="modal-backdrop">
      <div class="call-modal order-number-dialog">
        <h3>Your Order Number Is:</h3>
        <div class="order-number-value">${h(state.orderNumberDialog.orderNumber)}</div>
        <div class="call-modal-actions order-number-actions">
          <button id="orderPrintCustomer" class="btn-secondary">Print customer receipt</button>
          <button id="orderPrintMerchant" class="btn-secondary">Print merchant receipt</button>
          <button id="orderPrintBoth" class="btn-secondary">Print both</button>
        </div>
        <div class="call-modal-actions">
          <button id="orderNumberDone" class="btn-success">Done</button>
        </div>
      </div>
    </div>
  `;
}

function orderTypeDraftDialogHtml() {
  const draft = state.orderTypeDraftDialog;
  if (!draft.open || !draft.type) return '';
  const isTogo = draft.type === 'togo';

  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal">
        <h3>${isTogo ? 'Start To-Go Order' : 'Start Dine-In Order'}</h3>
        <p>${isTogo ? 'Name and phone are optional for To-Go.' : 'Table number is optional for Dine-In.'}</p>
        ${isTogo ? `
          <div class="entry-grid">
            <input id="togoDraftName" data-keyboard-context="customer-profile-name" placeholder="Optional name" value="${h(draft.name || '')}" />
            <input id="togoDraftPhone" type="tel" inputmode="tel" autocomplete="tel" data-keyboard-kind="phone" data-keyboard-context="customer-profile-phone" placeholder="Optional phone" value="${h(draft.phone || '')}" />
          </div>
        ` : `
          <div class="entry-grid">
            <input id="dineinDraftTable" inputmode="numeric" data-keyboard-kind="numeric" data-keyboard-context="numeric" placeholder="Optional table number" value="${h(draft.tableNumber || '')}" />
          </div>
        `}
        <div class="call-modal-actions">
          <button id="startOrderTypeDraftBtn" class="btn-success">Start Order</button>
          <button id="cancelOrderTypeDraftBtn" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function asapAdjustDialogHtml() {
  if (!state.asapAdjustDialog.open) return '';
  return `
    <div class="modal-backdrop">
      <div class="call-modal asap-adjust-modal">
        <h3>Adjust Same-Day Time</h3>
        <p>Set a quick ready/requested time without using Future order mode.</p>
        <label>
          Time
          <input id="asapAdjustTime" class="editor-input" type="time" value="${h(state.asapAdjustDialog.time)}" />
        </label>
        <div class="quick-time-row">
          <button data-asap-shift="15" class="btn-secondary">+15</button>
          <button data-asap-shift="30" class="btn-secondary">+30</button>
          <button data-asap-shift="45" class="btn-secondary">+45</button>
        </div>
        <div class="call-modal-actions">
          <button id="saveAsapAdjust" class="btn-success">Apply Time</button>
          <button id="clearAsapAdjust" class="btn-secondary">Reset to ASAP</button>
          <button id="cancelAsapAdjust" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function deliveryProfileDialogHtml() {
  if (!state.deliveryProfileDialog.open) return '';
  const d = state.deliveryProfileDialog.draft;
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal">
        <h3>Delivery Customer Required</h3>
        <p>Name, phone, and address are required for Delivery.</p>
        <div class="entry-grid">
          <input id="deliveryName" data-keyboard-context="customer-profile-name" placeholder="Customer name *" value="${h(d.name)}" />
          <input id="deliveryPhone" type="tel" inputmode="tel" autocomplete="tel" data-keyboard-kind="phone" data-keyboard-context="customer-profile-phone" placeholder="Phone *" value="${h(phoneDisplayValue(d.phone))}" />
          <input id="deliveryAddress1" data-keyboard-context="customer-address" placeholder="Address *" value="${h(d.address1)}" />
          <input id="deliveryCity" data-keyboard-context="customer-address" placeholder="City" value="${h(d.city)}" />
          <input id="deliveryState" data-keyboard-context="customer-address" placeholder="State" value="${h(d.state)}" />
          <input id="deliveryZip" data-keyboard-context="customer-address" placeholder="ZIP" value="${h(d.zip)}" />
          <input id="deliveryAllergies" placeholder="Allergies" value="${h(d.allergies)}" />
          <input id="deliveryInstructions" placeholder="Special instructions" value="${h(d.specialInstructions)}" />
        </div>
        <div class="call-modal-actions">
          <button id="saveDeliveryProfile" class="btn-success">Save</button>
          <button id="cancelDeliveryProfile" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function payNowMissingDialogHtml() {
  if (!state.payNowMissingDialog.open) return '';
  const d = state.payNowMissingDialog.draft;
  const issueItems = state.payNowMissingDialog.issues
    .map((issue) => `<li>${h(issue.label)}</li>`)
    .join('');
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal paynow-missing-modal">
        <h3>Missing Info Before Payment</h3>
        <p>Complete required details to continue with Send &amp; Pay Now.</p>
        ${issueItems ? `<ul>${issueItems}</ul>` : ''}
        <div class="entry-grid">
          <input id="payNowMissingName" data-keyboard-context="customer-profile-name" placeholder="Customer name" value="${h(d.name)}" />
          <input id="payNowMissingPhone" type="tel" inputmode="tel" autocomplete="tel" data-keyboard-kind="phone" data-keyboard-context="customer-profile-phone" placeholder="Phone" value="${h(phoneDisplayValue(d.phone))}" />
          <input id="payNowMissingAddress1" data-keyboard-context="customer-address" placeholder="Address" value="${h(d.address1)}" />
          <input id="payNowMissingCity" data-keyboard-context="customer-address" placeholder="City" value="${h(d.city)}" />
          <input id="payNowMissingState" data-keyboard-context="customer-address" placeholder="State" value="${h(d.state)}" />
          <input id="payNowMissingZip" data-keyboard-context="customer-address" placeholder="ZIP" value="${h(d.zip)}" />
          <input id="payNowMissingAllergies" placeholder="Allergies" value="${h(d.allergies)}" />
          <input id="payNowMissingInstructions" placeholder="Special instructions" value="${h(d.specialInstructions)}" />
        </div>
        ${state.timingType === 'future' ? `
          <div class="schedule-grid">
            <label>
              Date
              <input id="payNowMissingFutureDate" class="editor-input" type="date" value="${h(d.futureDate)}" />
            </label>
            <label>
              Time
              <input id="payNowMissingFutureTime" class="editor-input" type="time" value="${h(d.futureTime)}" />
            </label>
          </div>
        ` : ''}
        <div class="call-modal-actions">
          <button id="savePayNowMissing" class="btn-success">Continue to Payment</button>
          <button id="cancelPayNowMissing" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function payLaterMissingDialogHtml() {
  if (!state.payLaterMissingDialog.open) return '';
  const d = state.payLaterMissingDialog.draft;
  const issueItems = state.payLaterMissingDialog.issues
    .map((issue) => `<li>${h(issue.label)}</li>`)
    .join('');
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal paynow-missing-modal">
        <h3>Missing Info Before Sending</h3>
        <p>Complete required details to continue with Send &amp; Pay Later.</p>
        ${issueItems ? `<ul>${issueItems}</ul>` : ''}
        <div class="entry-grid">
          <input id="payLaterMissingName" data-keyboard-context="customer-profile-name" placeholder="Customer name" value="${h(d.name)}" />
          <input id="payLaterMissingPhone" type="tel" inputmode="tel" autocomplete="tel" data-keyboard-kind="phone" data-keyboard-context="customer-profile-phone" placeholder="Phone" value="${h(phoneDisplayValue(d.phone))}" />
          <input id="payLaterMissingAddress1" data-keyboard-context="customer-address" placeholder="Address" value="${h(d.address1)}" />
          <input id="payLaterMissingCity" data-keyboard-context="customer-address" placeholder="City" value="${h(d.city)}" />
          <input id="payLaterMissingState" data-keyboard-context="customer-address" placeholder="State" value="${h(d.state)}" />
          <input id="payLaterMissingZip" data-keyboard-context="customer-address" placeholder="ZIP" value="${h(d.zip)}" />
          <input id="payLaterMissingAllergies" placeholder="Allergies" value="${h(d.allergies)}" />
          <input id="payLaterMissingInstructions" placeholder="Special instructions" value="${h(d.specialInstructions)}" />
        </div>
        ${state.timingType === 'future' ? `
          <div class="schedule-grid">
            <label>
              Date
              <input id="payLaterMissingFutureDate" class="editor-input" type="date" value="${h(d.futureDate)}" />
            </label>
            <label>
              Time
              <input id="payLaterMissingFutureTime" class="editor-input" type="time" value="${h(d.futureTime)}" />
            </label>
          </div>
        ` : ''}
        <div class="call-modal-actions">
          <button id="savePayLaterMissing" class="btn-success">Send Order</button>
          <button id="cancelPayLaterMissing" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function paymentDialogHtml() {
  if (!state.paymentDialog.open) return '';
  const d = state.paymentDialog;
  const totals = paymentTotals(d);
  const canComplete = d.paymentLines.length > 0 && totals.remaining <= 0;
  const payTypes = ['Cash', 'Card', 'Gift', 'Other'];
  const tipModes = [
    { id: 'none', label: 'No Tip' },
    { id: 'p10', label: '10%' },
    { id: 'p15', label: '15%' },
    { id: 'p20', label: '20%' },
    { id: 'custom', label: 'Custom' }
  ];
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal payment-modal">
        <h3>Take Payment</h3>
        <p>Total due: <b>${money(totals.amountDue)}</b></p>
        <div class="payment-rows">
          <div class="payment-row">
            ${payTypes.map((type) => `<button class="chip ${d.paymentType === type ? 'active' : ''}" data-pay-type="${h(type)}">${h(type)}</button>`).join('')}
          </div>
          <div class="payment-row">
            ${tipModes.map((mode) => `<button class="chip ${d.tipMode === mode.id ? 'active' : ''}" data-tip-mode="${mode.id}">${mode.label}</button>`).join('')}
          </div>
          ${d.tipMode === 'custom' ? `<input id="paymentCustomTip" class="editor-input" type="text" inputmode="decimal" data-keyboard-kind="decimal" placeholder="Custom tip" value="${h(d.customTip)}" />` : ''}
          <div class="payment-entry-row">
            <input id="paymentEntryAmount" class="editor-input" type="text" inputmode="decimal" data-keyboard-kind="decimal" placeholder="Payment amount" value="${h(d.entryAmount)}" />
            <button id="addPaymentLine" class="btn-success">Add Payment</button>
          </div>
          <div class="payment-keypad">
            <button data-pay-key="7">7</button><button data-pay-key="8">8</button><button data-pay-key="9">9</button>
            <button data-pay-key="4">4</button><button data-pay-key="5">5</button><button data-pay-key="6">6</button>
            <button data-pay-key="1">1</button><button data-pay-key="2">2</button><button data-pay-key="3">3</button>
            <button data-pay-key=".">.</button><button data-pay-key="0">0</button><button data-pay-key="back">⌫</button>
            <button class="wide" data-pay-key="clear">Clear</button>
          </div>
          <div class="payment-lines">
            ${d.paymentLines.length === 0 ? '<small class="muted">No payment lines yet.</small>' : d.paymentLines.map((line) => `
              <div class="payment-line">
                <span>${h(line.paymentType)}</span>
                <span>${money(line.amount)}${line.tipAmount ? ` + tip ${money(line.tipAmount)}` : ''}</span>
                <button class="btn-danger" data-remove-payment="${line.id}">Remove</button>
              </div>
            `).join('')}
          </div>
          <div class="payment-summary">
            <div><span>Base Total</span><b>${money(totals.baseTotal)}</b></div>
            <div><span>Tip</span><b>${money(totals.tipTotal)}</b></div>
            <div><span>Paid</span><b>${money(totals.amountPaid)}</b></div>
            <div><span>Remaining</span><b>${money(totals.remaining)}</b></div>
            <div><span>Change</span><b>${money(totals.changeDue)}</b></div>
          </div>
        </div>
        <div class="call-modal-actions">
          <button id="completePayNow" class="btn-success" ${canComplete ? '' : 'disabled'}>Complete Order</button>
          <button id="cancelPaymentDialog" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function cartItemEditorHtml() {
  if (!state.cartItemEditor.lineId) return '';
  const isNote = state.cartItemEditor.mode === 'note';
  const title = isNote ? 'Item Note / Special Instruction' : 'This item is for...';
  return `
    <div class="modal-backdrop">
      <div class="call-modal">
        <h3>${title}</h3>
        <input id="cartItemEditorInput" class="editor-input" value="${h(state.cartItemEditor.value)}" placeholder="Enter ${isNote ? 'special instruction' : 'name'}" />
        <div class="call-modal-actions">
          <button id="saveCartItemEditor" class="btn-success">Save</button>
          <button id="cancelCartItemEditor" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function addItemDialogHtml() {
  if (!state.addItemDraft.open || !state.menu) return '';
  const d = state.addItemDraft;
  const cats = visibleCategories();
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal">
        <h3>Add New Item</h3>
        <div class="add-item-form">
          <label>
            Item Name
            <input id="newItemName" class="editor-input" value="${h(d.name)}" placeholder="Required" />
          </label>
          <label>
            Category
            <select id="newItemCategory" class="editor-input">
              <option value="">Select category</option>
              ${cats.map((c) => `<option value="${c.id}" ${d.categoryId === c.id ? 'selected' : ''}>${h(c.name)}</option>`).join('')}
            </select>
          </label>
          <label>
            Base Price
            <input id="newItemPrice" class="editor-input" type="text" inputmode="decimal" data-keyboard-kind="decimal" value="${h(d.price)}" placeholder="Required" />
          </label>
          <label>
            Description / Short Label
            <input id="newItemDescription" class="editor-input" value="${h(d.description)}" placeholder="Optional" />
          </label>
          <label>
            Mock Modifier Group Count
            <input id="newItemModifierCount" class="editor-input" type="number" step="1" min="0" value="${h(d.modifierCount)}" />
          </label>
          <label class="checkbox-row">
            <input id="newItemInStock" type="checkbox" ${d.inStock ? 'checked' : ''} />
            In stock
          </label>
          <label class="checkbox-row">
            <input id="newItemFavorite" type="checkbox" ${d.favorite ? 'checked' : ''} />
            Add to My Favorites
          </label>
        </div>
        <div class="call-modal-actions">
          <button id="saveNewItem" class="btn-success">Save Item</button>
          <button id="cancelNewItem" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function itemQuickEditDialogHtml() {
  const editor = state.quickItemEditor;
  if (!editor.itemId || !state.menu) return '';
  const item = lilposDataService.getItemById(editor.itemId);
  if (!item) return '';
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal">
        <h3>Item Quick Edit</h3>
        <p><b>${h(item.name)}</b></p>
        <div class="add-item-form">
          <label>
            Current Item Price
            <input id="quickItemPrice" class="editor-input" type="text" inputmode="decimal" data-keyboard-kind="decimal" value="${h(editor.price)}" />
          </label>
          <label>
            Stock Status
            <select id="quickItemStockMode" class="editor-input">
              <option value="in_stock" ${editor.stockMode === 'in_stock' ? 'selected' : ''}>In Stock</option>
              <option value="today" ${editor.stockMode === 'today' ? 'selected' : ''}>Out of Stock (Today only)</option>
              <option value="days" ${editor.stockMode === 'days' ? 'selected' : ''}>Out of Stock (X days)</option>
              <option value="forever" ${editor.stockMode === 'forever' ? 'selected' : ''}>Out of Stock (Forever)</option>
            </select>
          </label>
          ${editor.stockMode === 'days' ? `<label>Days<input id="quickItemStockDays" class="editor-input" type="number" min="1" step="1" value="${h(editor.stockDays)}" /></label>` : ''}
        </div>
        <div class="call-modal-actions">
          <button id="saveQuickItem" class="btn-success">Save</button>
          <button id="cancelQuickItem" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function categoryQuickEditDialogHtml() {
  const editor = state.quickCategoryEditor;
  if (!editor.categoryId || !state.menu) return '';
  const cat = lilposDataService.indexes.categoriesById.get(editor.categoryId);
  if (!cat) return '';
  return `
    <div class="modal-backdrop">
      <div class="call-modal manager-modal">
        <h3>Category Quick Edit</h3>
        <p><b>${h(cat.name)}</b></p>
        <div class="add-item-form">
          <label class="checkbox-row">
            <input id="quickCategoryVisible" type="checkbox" ${editor.visible ? 'checked' : ''} />
            Category visible in register
          </label>
          <label class="checkbox-row">
            <input id="quickCategoryFavorite" type="checkbox" ${editor.favorite ? 'checked' : ''} />
            Add this category to My Favorites
          </label>
        </div>
        <div class="call-modal-actions">
          <button id="saveQuickCategory" class="btn-success">Save</button>
          <button id="cancelQuickCategory" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function pizzaHalfIcon(side: 'left' | 'right'): string {
  // Render only the half-circle (half moon): arc + straight flat edge
  // Left: arc goes counterclockwise (sweep-flag=0), flat edge is the diameter on the right
  // Right: arc goes clockwise (sweep-flag=1), flat edge is the diameter on the left
  const halfPath = side === 'left'
    ? 'M12,2 A10,10 0 0,0 12,22 Z'
    : 'M12,2 A10,10 0 0,1 12,22 Z';
  const dots = side === 'left'
    ? '<circle cx="7" cy="9" r="1.3"/><circle cx="8" cy="15" r="1.3"/>'
    : '<circle cx="17" cy="9" r="1.3"/><circle cx="16" cy="15" r="1.3"/>';
  return `<svg class="pizza-half-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path class="pizza-half-fill" d="${halfPath}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

function renderModifierGroupStandard(group) {
  return `
    <section>
      <h3>${h(group.name)} <small>${h(group.type)} ${group.allowHalf ? '- half/whole' : ''}</small></h3>
      ${preModifierButtonsHtml(group)}
      <div class="chips">
        ${(state.idx.optsByGroup.get(group.id) || []).slice(0, 48).map((o) => `<button class="chip ${isModSelected(group.id, o.name) ? 'active' : ''}" data-mod-group="${group.id}" data-mod-name="${h(o.name)}">${h(o.name)}${o.price ? ` ${money(o.price)}` : ''}${o.wholePrice ? ` W ${money(o.wholePrice)}` : ''}</button>`).join('')}
      </div>
    </section>
  `;
}

function pizzaModifierModalHtml(item, groups, pizzaGroup) {
  const activeTab = state.selectedConfig.pizzaFilter || 'ALL';
  const activeNav = state.selectedConfig.pizzaNav || 'pizza';
  const size = state.selectedConfig.size || item.sizeSchema?.[0]?.name || null;
  const options = state.idx.optsByGroup.get(pizzaGroup.id) || [];
  const filtered = options.filter((option) => activeTab === 'ALL' || pizzaCategoryForOptionName(option.name) === activeTab);
  const prepGroups = groups.filter((g) => g.id !== pizzaGroup.id);
  const prepModifierSet = prepModifierSetForGroup(pizzaGroup);
  const activePrepModifier = getActivePrepModifierForGroup(pizzaGroup.id);
  const summary = pizzaSelectionSummary(pizzaGroup.id);
  const basePrice = item.fixedPrice ? item.basePrice : item.sizeSchema?.find((s) => s.name === size)?.price || item.basePrice;
  const modsPrice = selectedModifierTotal();
  const total = +(basePrice + modsPrice).toFixed(2);
  const pizzaDone = !!size || pizzaGroupHasSelections(pizzaGroup.id);
  const prepDone = pizzaPrepHasSelections(groups, pizzaGroup.id);
  const notesDone = !!(state.selectedConfig.pizzaNotes || '').trim();

  const canUndo = !!(state.modifierDialogHistory?.past?.length);
  const canRedo = !!(state.modifierDialogHistory?.future?.length);
  const atInitial = isDialogAtInitialState();
  const startOverPending = !!state.startOverConfirmPending;

  return `
    <div class="modal-backdrop">
      <div class="modal pizza-mod-modal">
        <header>
          <div class="modal-header-title">
            <h2>${h(item.name)}</h2>
            <p>${h(item.description)}</p>
          </div>
          <div class="modal-header-actions">
            <div class="modal-header-history-actions">
              <button id="modUndo" class="modal-action-btn mod-btn-icon" ${canUndo ? '' : 'disabled'} title="Undo last change" aria-label="Undo">↩</button>
              <button id="modRedo" class="modal-action-btn mod-btn-icon" ${canRedo ? '' : 'disabled'} title="Redo" aria-label="Redo">↪</button>
              <button id="modStartOver" class="modal-action-btn mod-btn-label${startOverPending ? ' start-over-confirm' : ''}" ${atInitial && !startOverPending ? 'disabled' : ''} title="Start Over?">${startOverPending ? 'Confirm?' : 'Start Over?'}</button>
            </div>
            <button id="closeModal" class="modal-close-btn" title="Close" aria-label="Close">✕</button>
          </div>
        </header>
        <div class="pizza-summary-bar">
          <span class="pizza-summary-label">Selected</span>
          <span class="pizza-summary-chip"><b>Size</b>${h(size || 'None')}</span>
          ${summary.whole.length ? `<span class="pizza-summary-chip"><b>Whole</b>${h(summary.whole.join(', '))}</span>` : ''}
          ${summary.left.length ? `<span class="pizza-summary-chip"><b>Left</b>${h(summary.left.join(', '))}</span>` : ''}
          ${summary.right.length ? `<span class="pizza-summary-chip"><b>Right</b>${h(summary.right.join(', '))}</span>` : ''}
        </div>
        <div class="pizza-modal-body">
          <nav class="pizza-nav">
            <button class="pizza-nav-btn ${activeNav === 'pizza' ? 'active' : ''}" data-pizza-nav="pizza">
              <span>Size + Toppings</span>
              ${pizzaDone ? '<span class="pizza-nav-check" aria-hidden="true">&#10003;</span>' : ''}
            </button>
            <button class="pizza-nav-btn ${activeNav === 'prep' ? 'active' : ''}" data-pizza-nav="prep">
              <span>Cooking / Prep</span>
              ${prepDone ? '<span class="pizza-nav-check" aria-hidden="true">&#10003;</span>' : ''}
            </button>
            <button class="pizza-nav-btn ${activeNav === 'notes' ? 'active' : ''}" data-pizza-nav="notes">
              <span>Special Instructions</span>
              ${notesDone ? '<span class="pizza-nav-check" aria-hidden="true">&#10003;</span>' : ''}
            </button>
            ${prepModifierSet.length ? `
              <section class="pizza-prep-panel">
                <small class="pizza-prep-title">PREPS</small>
                <div class="pizza-prep-grid">
                  ${prepModifierSet.map((prep) => `
                    <button
                      class="pizza-prep-btn ${activePrepModifier?.id === prep.id ? 'active' : ''}"
                      data-pizza-prep-group="${pizzaGroup.id}"
                      data-pizza-prep-id="${prep.id}"
                    >${h(prep.label)}</button>
                  `).join('')}
                </div>
                <small class="pizza-prep-hint ${activePrepModifier ? 'active' : ''}">
                  ${activePrepModifier
                    ? `Next topping tap applies ${h(activePrepModifier.label)}`
                    : 'Tap a prep, then tap a topping'}
                </small>
              </section>
            ` : ''}
          </nav>
          <div class="pizza-content">
            ${activeNav === 'pizza' ? `
              <section>
                <h3>Size</h3>
                <div class="chips">${(item.sizeSchema || []).map((s) => `<button class="chip ${size === s.name ? 'active' : ''}" data-size="${h(s.name)}">${h(s.name)} ${money(s.price)}</button>`).join('')}</div>
              </section>
              <section>
                <h3>Pizza Toppings</h3>
                <div class="pizza-toppings-controls">
                  <div class="pizza-filter-tabs">
                    ${['ALL', 'MEATS', 'CHEESES', 'VEGGIES', 'OTHER'].map((tab) => `<button class="pizza-filter-tab ${activeTab === tab ? 'active' : ''}" data-pizza-filter="${tab}">${tab}</button>`).join('')}
                  </div>
                  <div class="modifier-search-bar">
                    <span class="modifier-search-icon" aria-hidden="true">&#128269;</span>
                    <input
                      id="modifierSearchInput"
                      class="modifier-search-input"
                      type="text"
                      placeholder="Search toppings..."
                      value="${h(state.modifierSearch || '')}"
                      autocomplete="off"
                      data-keyboard-placement="above"
                    />
                    ${(state.modifierSearch || '') ? `<button class="modifier-search-clear" id="modifierSearchClear" aria-label="Clear search">✕</button>` : ''}
                  </div>
                </div>
                ${(() => {
                  const searchFiltered = filterModifierOptions(filtered, state.modifierSearch || '');
                  if (!searchFiltered.length) {
                    return `<p class="modifier-search-empty muted">No toppings match "${h(state.modifierSearch || '')}"</p>`;
                  }
                  return `<div class="pizza-row-list">
                  ${searchFiltered.map((option) => {
                    const selected = getPizzaSelection(pizzaGroup.id, option.id);
                    const side = selected?.side || pizzaSideFromPreModifier(selected?.preModifierValue) || 'whole';
                    const multiplier = Math.max(1, Math.min(3, Number(selected?.multiplier || 1)));
                    const storedPrepModifier = normalizeStoredPrepModifier(selected, pizzaGroup);
                    const previewPrepModifier = activePrepModifier || storedPrepModifier || null;
                    const displayName = resolvePrepDisplayLabel(option.name, previewPrepModifier);
                    const livePrice = prepAdjustedModifierPrice(getPizzaUnitPrice(option, item, side, size) * multiplier, previewPrepModifier);
                    const selectedRowClass = prepSelectedRowClassName(selected?.prepSelectedColorRole);
                    const selectedStatusText = selected
                      ? `${h(side.charAt(0).toUpperCase() + side.slice(1))}${multiplier > 1 ? ` · ${multiplier}X` : ''} selected`
                      : 'Tap for Whole';
                    const prepPreviewText = activePrepModifier ? ` · ${h(activePrepModifier.label)} preview` : '';
                    return `
                      <div class="pizza-top-row ${side === 'whole' && selected ? 'whole-selected' : ''} ${selected ? selectedRowClass : ''}">
                        <button class="pizza-top-main" data-pizza-whole="${option.id}">
                          <span class="pizza-top-name">${h(displayName)}</span>
                          <span class="pizza-top-sub">${selectedStatusText}${prepPreviewText}</span>
                          <span class="pizza-top-price">${money(livePrice)}</span>
                        </button>
                        <div class="pizza-side-controls">
                          <button class="pizza-side-btn ${side === 'left' ? 'active' : ''}" data-pizza-side="left" data-pizza-option="${option.id}" aria-label="Left half" title="Left half">${pizzaHalfIcon('left')}</button>
                          <button class="pizza-side-btn ${side === 'right' ? 'active' : ''}" data-pizza-side="right" data-pizza-option="${option.id}" aria-label="Right half" title="Right half">${pizzaHalfIcon('right')}</button>
                          <button class="pizza-side-btn ${multiplier > 1 ? 'active mult' : ''}" data-pizza-mult="${option.id}">${multiplier}X</button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>`;
                })()
                }
              </section>
            ` : ''}
            ${activeNav === 'prep' ? `${prepGroups.map((g) => renderModifierGroupStandard(g)).join('') || '<section><p class="muted">No prep groups for this item.</p></section>'}` : ''}
            ${activeNav === 'notes' ? `
              <section>
                <h3>Special Instructions</h3>
                <textarea id="pizzaNotesInput" class="pizza-notes-input" placeholder="Item-specific instructions">${h(state.selectedConfig.pizzaNotes || '')}</textarea>
                <small class="muted">These notes apply to this item line only.</small>
              </section>
            ` : ''}
          </div>
        </div>
        <footer>
          <b>Base ${money(basePrice)} | Mods ${money(modsPrice)} | Total ${money(total)}</b>
          <button id="addToTicket" class="btn-success">${state.selectedConfig.editingLineId ? 'Update item' : 'Add to ticket'}</button>
        </footer>
      </div>
    </div>
  `;
}

function modalHtml(item) {
  const groups = (state.idx.itemMods.get(item.id) || []).map((gid) => state.idx.groupsById[gid]).filter(Boolean);
  const pizzaGroup = getPizzaToppingGroup(item);
  if (itemUsesCustomPizzaModifierUi(item) && pizzaGroup) {
    return pizzaModifierModalHtml(item, groups, pizzaGroup);
  }
  const size = state.selectedConfig.size || item.sizeSchema?.[0]?.name || null;

  const canUndo = !!(state.modifierDialogHistory?.past?.length);
  const canRedo = !!(state.modifierDialogHistory?.future?.length);
  const atInitial = isDialogAtInitialState();
  const startOverPending = !!state.startOverConfirmPending;

  return `
    <div class="modal-backdrop">
      <div class="modal">
        <header>
          <div class="modal-header-title">
            <h2>${h(item.name)}</h2>
            <p>${h(item.description)}</p>
          </div>
          <div class="modal-header-actions">
            <div class="modal-header-history-actions">
              <button id="modUndo" class="modal-action-btn mod-btn-icon" ${canUndo ? '' : 'disabled'} title="Undo last change" aria-label="Undo">↩</button>
              <button id="modRedo" class="modal-action-btn mod-btn-icon" ${canRedo ? '' : 'disabled'} title="Redo" aria-label="Redo">↪</button>
              <button id="modStartOver" class="modal-action-btn mod-btn-label${startOverPending ? ' start-over-confirm' : ''}" ${atInitial && !startOverPending ? 'disabled' : ''} title="Start Over?">${startOverPending ? 'Confirm?' : 'Start Over?'}</button>
            </div>
            <button id="closeModal" class="modal-close-btn" title="Close" aria-label="Close">✕</button>
          </div>
        </header>
        ${item.sizeSchema ? `<section><h3>Size</h3><div class="chips">${item.sizeSchema.map((s) => `<button class="chip ${size === s.name ? 'active' : ''}" data-size="${h(s.name)}">${h(s.name)} ${money(s.price)}</button>`).join('')}</div></section>` : ''}
        <div class="mod-scroll">
          ${groups.length ? `
            <div class="modifier-search-bar">
              <span class="modifier-search-icon" aria-hidden="true">&#128269;</span>
              <input
                id="modifierSearchInput"
                class="modifier-search-input"
                type="text"
                placeholder="Search modifiers..."
                value="${h(state.modifierSearch || '')}"
                autocomplete="off"
                data-keyboard-placement="above"
              />
              ${(state.modifierSearch || '') ? `<button class="modifier-search-clear" id="modifierSearchClear" aria-label="Clear search">✕</button>` : ''}
            </div>
          ` : ''}
          ${groups.map((g) => {
            const groupOpts = filterModifierOptions(
              (state.idx.optsByGroup.get(g.id) || []).slice(0, 48),
              state.modifierSearch || ''
            );
            return `
            <section>
              <h3>${h(g.name)} <small>${h(g.type)} ${g.allowHalf ? '- half/whole' : ''}</small></h3>
              ${preModifierButtonsHtml(g)}
              <div class="chips">
                ${groupOpts.map((o) => `<button class="chip ${isModSelected(g.id, o.name) ? 'active' : ''}" data-mod-group="${g.id}" data-mod-name="${h(o.name)}">${h(o.name)}${o.price ? ` ${money(o.price)}` : ''}${o.wholePrice ? ` W ${money(o.wholePrice)}` : ''}</button>`).join('')}
                ${groupOpts.length === 0 ? `<span class="modifier-search-empty muted">No options match "${h(state.modifierSearch || '')}"</span>` : ''}
              </div>
            </section>
          `;
          }).join('')}
        </div>
        <footer>
          <b>Base ${money(item.fixedPrice ? item.basePrice : item.sizeSchema?.find((s) => s.name === size)?.price || item.basePrice)}</b>
          <button id="addToTicket" class="btn-success">Add to ticket</button>
        </footer>
      </div>
    </div>
  `;
}

function render() {
  updatePwaDiagnostics();
  const filtered = getFiltered();
  document.getElementById('app').innerHTML = `
    <div class="pos-app">
      <header class="mgr-cog-header">
        <div class="mgr-cog-icon" id="managerSettingsBtn" title="Manager Settings" aria-label="Manager Settings">${navIcon('gear')}</div>
      </header>
      <main class="workspace">
        ${categoryRailHtml()}
        ${renderMainAreaView(filtered)}
        ${ticketPanelHtml()}
      </main>
      ${phoneLinesFooterHtml()}
      ${state.selected ? modalHtml(state.selected) : ''}
      ${lineModalHtml()}
      ${scheduleDialogHtml()}
      ${asapAdjustDialogHtml()}
      ${deliveryProfileDialogHtml()}
      ${payNowMissingDialogHtml()}
      ${payLaterMissingDialogHtml()}
      ${newSaleConfirmDialogHtml()}
      ${orderNumberDialogHtml()}
      ${orderTypeDraftDialogHtml()}
      ${cartItemEditorHtml()}
      ${itemQuickEditDialogHtml()}
      ${categoryQuickEditDialogHtml()}
      ${addItemDialogHtml()}
    </div>
  `;
  applyBrowserInputSuggestionGuards();
  attachEvents();
  keyboardController.syncKeyboardAfterRender();

  if (state.searchRefocus) {
    const cursorPos = state.searchCursorPos;
    state.searchRefocus = false;
    requestAnimationFrame(() => {
      const input = document.querySelector('#query');
      if (!input) return;
      input.focus();
      const safePos = Math.max(0, Math.min(cursorPos, input.value.length));
      input.setSelectionRange(safePos, safePos);
    });
  }

  if (state.focusCustomerEntryOnRender) {
    state.focusCustomerEntryOnRender = false;
    requestAnimationFrame(() => {
      const input = (document.querySelector('#entryName') || document.querySelector('#customerMgmtName')) as HTMLInputElement | null;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
    });
  }

  if (state.scrollCartOnAdd) {
    state.scrollCartOnAdd = false;
    requestAnimationFrame(() => {
      const ticketPanel = document.querySelector('.ticket-panel');
      const lines = document.querySelector('.ticket-lines');
      const lastLine = lines?.lastElementChild;
      if (lastLine) {
        lastLine.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
      if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) {
        if (ticketPanel) {
          const rect = ticketPanel.getBoundingClientRect();
          const needsMove = rect.top < 12 || rect.bottom > window.innerHeight;
          if (needsMove) {
            const targetY = Math.max(0, window.scrollY + rect.top - 10);
            window.scrollTo({ top: targetY, behavior: 'auto' });
          }
        }
      }
    });
  }

  if (typeof state.restoreMenuBoardScrollTop === 'number') {
    const restoreTop = state.restoreMenuBoardScrollTop;
    state.restoreMenuBoardScrollTop = null;
    requestAnimationFrame(() => {
      const menuBoard = document.querySelector('.menu-board');
      if (!menuBoard) return;
      menuBoard.scrollTop = restoreTop;
    });
  }
}

function applyBrowserInputSuggestionGuards() {
  const root = document.getElementById('app');
  if (!root) return;
  root.querySelectorAll('input, textarea').forEach((field) => {
    const input = field as HTMLInputElement | HTMLTextAreaElement;
    if (!keyboardController.isSupportedInput(input)) return;
    disableNativeInputSuggestions(input);
  });
}

function updateSearchQuery(next, cursorPos, preserveFocus = true) {
  const prev = state.query;
  if (!prev.trim() && next.trim()) {
    state.preSearchCategory = state.category;
  }
  state.query = next;
  state.mainView = MAIN_VIEWS.menu;
  if (!next.trim() && state.preSearchCategory) {
    state.category = state.preSearchCategory;
    state.preSearchCategory = null;
  }
  state.searchRefocus = !!preserveFocus;
  if (preserveFocus) {
    state.searchCursorPos = typeof cursorPos === 'number' ? cursorPos : next.length;
  }
  render();
}

function attachEvents() {
  const $ = (sel) => document.querySelector(sel);

  if (detachGridBlankTapListeners) {
    detachGridBlankTapListeners();
    detachGridBlankTapListeners = null;
  }
  detachGridBlankTapListeners = setupGridBlankAddTap($('#menuGrid'), document.querySelector('.menu-board'));

  if (detachRemoveConfirmOutsideListener) {
    detachRemoveConfirmOutsideListener();
    detachRemoveConfirmOutsideListener = null;
  }
  const onDocPointerDown = (event) => {
    if (!state.removeConfirmLineId) return;
    if (event.target && event.target.closest('.remove-wrap')) return;
    state.removeConfirmLineId = null;
    render();
  };
  document.addEventListener('pointerdown', onDocPointerDown);
  detachRemoveConfirmOutsideListener = () => document.removeEventListener('pointerdown', onDocPointerDown);

  $('#toggleDevTools')?.addEventListener('click', () => {
    state.devToolsOpen = !state.devToolsOpen;
    render();
  });

  // Manager dev tools button listeners (with mgr- prefix)
  $('#mgrScale')?.addEventListener('change', (e) => {
    state.scale = e.target.value;
  });
  $('#mgrGenerate')?.addEventListener('click', generateAndStore);
  $('#mgrSeedMedium')?.addEventListener('click', () => generateSeed('medium'));
  $('#mgrSeedLarge')?.addEventListener('click', () => generateSeed('large'));
  $('#mgrSeedHuge')?.addEventListener('click', () => generateSeed('huge'));
  $('#mgrLoad')?.addEventListener('click', loadFromDb);
  $('#mgrClear')?.addEventListener('click', clearAll);
  $('#mgrToggleOffline')?.addEventListener('click', () => {
    state.offline = !state.offline;
    render();
  });
  $('#mgrInstallApp')?.addEventListener('click', installApp);
  document.querySelectorAll('[data-mgr-sim-count]').forEach((b) => {
    b.addEventListener('click', () => simulateIncomingCalls(Number(b.dataset.mgrSimCount)));
  });
  document.querySelectorAll('[data-mgr-end-line]').forEach((b) => {
    b.addEventListener('click', () => {
      const lineNumber = Number(b.dataset.mgrEndLine);
      const line = getLine(lineNumber);
      if (line && line.state !== 'idle' && line.state !== 'ended') {
        moveLineToEnded(lineNumber);
        if (state.selectedLineNumber === lineNumber) state.selectedLineNumber = null;
        render();
      }
    });
  });
  $('#mgrEndAllCalls')?.addEventListener('click', endAllCalls);

  // Back button listeners for manager sections
  $('#mgrStatusBack')?.addEventListener('click', () => {
    state.managerSettingsSection = null;
    render();
  });
  $('#mgrInstallBack')?.addEventListener('click', () => {
    state.managerSettingsSection = null;
    render();
  });
  $('#mgrDevToolsBack')?.addEventListener('click', () => {
    state.managerSettingsSection = null;
    render();
  });
  $('#mgrKeyboardBack')?.addEventListener('click', () => {
    state.managerSettingsSection = null;
    render();
  });

  document.querySelectorAll('input[name="keyboardMode"][data-keyboard-mode]').forEach((input) => {
    input.addEventListener('change', () => {
      const target = input as HTMLInputElement;
      if (!target.checked) return;
      keyboardController.setKeyboardMode(target.value);
      render();
    });
  });

  $('#managerSettingsBtn')?.addEventListener('click', () => {
    if (state.managerUnlocked) {
      state.mainView = MAIN_VIEWS.managerSettings;
      state.managerSettingsSection = null;
    } else {
      state.managerPinEntry = '';
      state.managerPinError = '';
      state.mainView = MAIN_VIEWS.managerPin;
    }
    render();
  });

  $('#mgrPinCancel')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.menu;
    state.managerPinEntry = '';
    state.managerPinError = '';
    render();
  });

  document.querySelectorAll('[data-pin-digit]').forEach((b) => {
    b.addEventListener('click', () => {
      if (state.managerPinEntry.length >= 4) return;
      state.managerPinEntry += (b as HTMLElement).dataset.pinDigit || '';
      state.managerPinError = '';
      if (state.managerPinEntry.length === 4) {
        if (state.managerPinEntry === DEFAULT_MANAGER_PIN) {
          state.managerUnlocked = true;
          state.mainView = MAIN_VIEWS.managerSettings;
          state.managerSettingsSection = null;
          state.managerPinEntry = '';
          state.managerPinError = '';
        } else {
          state.managerPinError = 'Incorrect PIN';
          state.managerPinEntry = '';
        }
      }
      render();
    });
  });

  document.querySelector('[data-pin-clear]')?.addEventListener('click', () => {
    state.managerPinEntry = '';
    state.managerPinError = '';
    render();
  });

  document.querySelector('[data-pin-back]')?.addEventListener('click', () => {
    state.managerPinEntry = state.managerPinEntry.slice(0, -1);
    state.managerPinError = '';
    render();
  });

  $('#mgrBackToMenu')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.menu;
    render();
  });

  $('#mgrSettingsBack')?.addEventListener('click', () => {
    state.managerSettingsSection = null;
    state.mainView = MAIN_VIEWS.managerSettings;
    render();
  });

  $('#mgrSectionBack')?.addEventListener('click', () => {
    state.managerSettingsSection = null;
    render();
  });

  $('#mgrLock')?.addEventListener('click', () => {
    state.managerUnlocked = false;
    state.managerPinEntry = '';
    state.managerPinError = '';
    state.mainView = MAIN_VIEWS.menu;
    render();
  });

  document.querySelectorAll('[data-mgr-tile]').forEach((b) => {
    b.addEventListener('click', () => {
      state.managerSettingsSection = (b as HTMLElement).dataset.mgrTile || null;
      render();
    });
  });

  $('#toggleActivity')?.addEventListener('click', () => {
    state.activityOpen = !state.activityOpen;
    render();
  });

  $('#simulateCall')?.addEventListener('click', simulateCall);
  document.querySelectorAll('[data-sim-count]').forEach((b) => {
    b.addEventListener('click', () => simulateIncomingCalls(Number(b.dataset.simCount)));
  });
  document.querySelectorAll('[data-sim-line]').forEach((b) => {
    b.addEventListener('click', () => simulateCallOnLine(Number(b.dataset.simLine)));
  });
  document.querySelectorAll('[data-end-line]').forEach((b) => {
    b.addEventListener('click', () => {
      const lineNumber = Number(b.dataset.endLine);
      const line = getLine(lineNumber);
      if (line && line.state !== 'idle' && line.state !== 'ended') {
        moveLineToEnded(lineNumber);
        if (state.selectedLineNumber === lineNumber) state.selectedLineNumber = null;
        render();
      }
    });
  });
  $('#endAllCalls')?.addEventListener('click', endAllCalls);

  document.querySelectorAll('[data-line-tile]').forEach((b) => {
    b.addEventListener('click', () => {
      const lineNumber = Number(b.dataset.lineTile);
      const line = getLine(lineNumber);
      if (line?.state === 'ringing') {
        if (state.selectedOrderId) {
          requestNewSale(lineNumber);
          return;
        }
        openIncomingLine(lineNumber);
        return;
      }

      if (state.selectedOrderId) {
        requestNewSale(lineNumber);
      }
    });
  });

  $('#startTicketLine')?.addEventListener('click', (e) => startTicketFromLine(Number(e.currentTarget.dataset.lineAction)));
  $('#claimLine')?.addEventListener('click', (e) => claimLine(Number(e.currentTarget.dataset.lineAction)));
  $('#dismissLine')?.addEventListener('click', (e) => dismissLine(Number(e.currentTarget.dataset.lineAction)));

  $('#installApp')?.addEventListener('click', installApp);

  const queryInput = $('#query');
  queryInput?.addEventListener('input', (e) => updateSearchQuery(e.target.value, e.target.selectionStart));
  queryInput?.addEventListener('change', (e) => updateSearchQuery(e.target.value, e.target.selectionStart, false));

  $('#clearSearch')?.addEventListener('click', () => {
    state.query = '';
    if (state.preSearchCategory) {
      state.category = state.preSearchCategory;
      state.preSearchCategory = null;
    }
    render();
  });

  $('#orderSpecialInstructionsInput')?.addEventListener('input', (e) => {
    setActiveOrderSpecialInstructions(e.target.value);
    syncOrderSpecialInstructionsLiveUi();
  });

  $('#orderSpecialInstructionsInput')?.addEventListener('change', (e) => {
    setActiveOrderSpecialInstructions(e.target.value);
    syncOrderSpecialInstructionsLiveUi();
  });

  $('#clearOrderSpecialInstructionsBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearActiveOrderSpecialInstructions();
    const input = document.querySelector('#orderSpecialInstructionsInput');
    if (input) {
      input.value = '';
      input.focus();
    }
    syncOrderSpecialInstructionsLiveUi();
  });

  document.querySelectorAll('[data-cat]').forEach((b) => {
    bindLongPress(
      b,
      () => {
        state.mainView = MAIN_VIEWS.menu;
        state.category = b.dataset.cat;
        render();
      },
      () => {
        if (!b.dataset.catEdit) return;
        openCategoryQuickEdit(b.dataset.catEdit);
      }
    );
  });

  document.querySelectorAll('[data-open-category]').forEach((b) => {
    bindLongPress(
      b,
      () => {
        state.mainView = MAIN_VIEWS.menu;
        state.category = b.dataset.openCategory;
        render();
      },
      () => {
        if (!b.dataset.catEdit) return;
        openCategoryQuickEdit(b.dataset.catEdit);
      }
    );
  });

  document.querySelectorAll('[data-item]').forEach((b) => {
    bindItemTilePress(b, b.dataset.item);
  });

  document.querySelectorAll('[data-item-action]').forEach((b) => {
    b.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const itemId = b.dataset.itemActionItem;
      if (!itemId) return;
      if (b.dataset.itemAction === 'plus') {
        const item = lilposDataService.getItemById(itemId);
        if (!item) return;
        if (b.dataset.itemPlusDialog === '1') {
          openItem(itemId);
          return;
        }
        addItemDirectFromMenuCard(itemId);
      }
    });
  });

  document.querySelectorAll('[data-open-order]').forEach((b) => {
    b.addEventListener('click', async () => {
      await selectOrderForDetail(b.dataset.openOrder);
    });
  });

  document.querySelectorAll('[data-orders-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.ordersFilter = b.dataset.ordersFilter || ORDER_MGMT_FILTERS.open;
      render();
    });
  });

  document.querySelectorAll('[data-customer-select]').forEach((b) => {
    b.addEventListener('click', () => {
      const customer = (state.mockCustomers || []).find((entry) => entry.id === b.dataset.customerSelect);
      if (!customer) return;
      state.customerDraft = profileDraftFromCustomer(customer);
      applyCustomerSummary(customer);
      render();
    });
  });

  document.querySelectorAll('[data-order-type]').forEach((b) => {
    b.addEventListener('click', () => {
      handleOrderTypeSelection(b.dataset.orderType);
      render();
    });
  });

  $('#togoDraftName')?.addEventListener('input', (e) => {
    state.orderTypeDraftDialog.name = e.target.value;
  });
  $('#togoDraftPhone')?.addEventListener('input', (e) => {
    state.orderTypeDraftDialog.phone = syncPhoneInputMask(e.target as HTMLInputElement);
  });
  $('#dineinDraftTable')?.addEventListener('input', (e) => {
    state.orderTypeDraftDialog.tableNumber = String(e.target.value || '').replace(/[^0-9]/g, '').slice(0, 6);
  });
  $('#startOrderTypeDraftBtn')?.addEventListener('click', () => {
    if (state.orderTypeDraftDialog.type === 'togo') {
      startTogoFromDraftDialog();
    } else if (state.orderTypeDraftDialog.type === 'dinein') {
      startDineInFromDraftDialog();
    }
    render();
  });
  $('#cancelOrderTypeDraftBtn')?.addEventListener('click', () => {
    cancelOrderTypeDraftDialog();
    render();
  });

  $('#editCustomer')?.addEventListener('click', openCustomerEditor);

  $('#ordersViewBtn')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.orders;
    state.ordersFilter = ORDER_MGMT_FILTERS.open;
    render();
  });

  $('#calendarClassifier')?.addEventListener('click', () => {
    openScheduleDialog();
    render();
  });

  $('#asapClockBtn')?.addEventListener('click', () => {
    openAsapAdjustDialog();
    render();
  });

  $('#customerMgmtBtn')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.customers;
    render();
  });

  $('#ordersBackToMenu')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.menu;
    render();
  });

  $('#customerBackToMenu')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.menu;
    render();
  });

  $('#ordersQuery')?.addEventListener('input', (e) => {
    state.ordersQuery = e.target.value;
    render();
  });

  $('#customerMgmtQuery')?.addEventListener('input', (e) => {
    state.customersQuery = e.target.value;
    render();
  });

  $('#customerMgmtName')?.addEventListener('input', (e) => {
    state.customerDraft.name = e.target.value;
  });
  $('#customerMgmtPhone')?.addEventListener('input', (e) => {
    state.customerDraft.phone = syncPhoneInputMask(e.target as HTMLInputElement);
  });
  $('#customerMgmtAddress1')?.addEventListener('input', (e) => {
    state.customerDraft.address1 = e.target.value;
  });
  $('#customerMgmtCity')?.addEventListener('input', (e) => {
    state.customerDraft.city = e.target.value;
  });
  $('#customerMgmtState')?.addEventListener('input', (e) => {
    state.customerDraft.state = e.target.value;
  });
  $('#customerMgmtZip')?.addEventListener('input', (e) => {
    state.customerDraft.zip = e.target.value;
  });
  $('#customerMgmtAllergies')?.addEventListener('input', (e) => {
    state.customerDraft.allergies = e.target.value;
  });
  $('#customerMgmtInstructions')?.addEventListener('input', (e) => {
    state.customerDraft.specialInstructions = e.target.value;
  });

  $('#customerMgmtApply')?.addEventListener('click', () => saveDraftCustomer(false));
  $('#customerMgmtStartTicket')?.addEventListener('click', () => saveDraftCustomer(true));
  $('#customerMgmtCancel')?.addEventListener('click', () => {
    cancelDraftCustomer();
    state.mainView = MAIN_VIEWS.menu;
    render();
  });

  $('#clearOrderDetail')?.addEventListener('click', () => {
    state.selectedOrderId = null;
    state.previousOrderAuditExpanded = false;
    render();
  });

  $('#previousOrderEditBtn')?.addEventListener('click', () => {
    alert('Editing completed orders is not yet available');
  });

  $('#togglePreviousOrderAudit')?.addEventListener('click', () => {
    state.previousOrderAuditExpanded = !state.previousOrderAuditExpanded;
    render();
  });

  $('#scheduleDate')?.addEventListener('input', (e) => {
    state.scheduleDialog.date = e.target.value;
  });
  $('#scheduleTime')?.addEventListener('input', (e) => {
    state.scheduleDialog.time = e.target.value;
  });
  $('#saveSchedule')?.addEventListener('click', () => {
    saveScheduledOrder();
    render();
  });
  $('#cancelSchedule')?.addEventListener('click', () => {
    closeScheduleDialog();
    render();
  });

  $('#asapAdjustTime')?.addEventListener('input', (e) => {
    state.asapAdjustDialog.time = e.target.value;
  });
  document.querySelectorAll('[data-asap-shift]').forEach((b) => {
    b.addEventListener('click', () => {
      shiftAsapAdjustTime(Number(b.dataset.asapShift || 0));
      render();
    });
  });
  $('#saveAsapAdjust')?.addEventListener('click', () => {
    saveAsapAdjustTime();
    render();
  });
  $('#clearAsapAdjust')?.addEventListener('click', () => {
    clearAsapAdjustTime();
    render();
  });
  $('#cancelAsapAdjust')?.addEventListener('click', () => {
    closeAsapAdjustDialog();
    render();
  });

  $('#entryName')?.addEventListener('input', (e) => {
    state.customerDraft.name = e.target.value;
  });
  $('#entryPhone')?.addEventListener('input', (e) => {
    state.customerDraft.phone = syncPhoneInputMask(e.target as HTMLInputElement);
  });
  $('#entryAddress1')?.addEventListener('input', (e) => {
    state.customerDraft.address1 = e.target.value;
  });
  $('#entryCity')?.addEventListener('input', (e) => {
    state.customerDraft.city = e.target.value;
  });
  $('#entryState')?.addEventListener('input', (e) => {
    state.customerDraft.state = e.target.value;
  });
  $('#entryZip')?.addEventListener('input', (e) => {
    state.customerDraft.zip = e.target.value;
  });
  $('#entryAllergies')?.addEventListener('input', (e) => {
    state.customerDraft.allergies = e.target.value;
  });
  $('#entryInstructions')?.addEventListener('input', (e) => {
    state.customerDraft.specialInstructions = e.target.value;
  });
  $('#saveCustomer')?.addEventListener('click', () => saveDraftCustomer(false));
  $('#cancelCustomer')?.addEventListener('click', cancelDraftCustomer);
  $('#startTicketCustomer')?.addEventListener('click', () => saveDraftCustomer(true));

  $('#deliveryName')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.name = e.target.value;
  });
  $('#deliveryPhone')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.phone = syncPhoneInputMask(e.target as HTMLInputElement);
  });
  $('#deliveryAddress1')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.address1 = e.target.value;
  });
  $('#deliveryCity')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.city = e.target.value;
  });
  $('#deliveryState')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.state = e.target.value;
  });
  $('#deliveryZip')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.zip = e.target.value;
  });
  $('#deliveryAllergies')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.allergies = e.target.value;
  });
  $('#deliveryInstructions')?.addEventListener('input', (e) => {
    state.deliveryProfileDialog.draft.specialInstructions = e.target.value;
  });
  $('#saveDeliveryProfile')?.addEventListener('click', async () => {
    const draft = state.deliveryProfileDialog.draft;
    if (!String(draft.name || '').trim() || !normalizePhone(draft.phone) || !String(draft.address1 || '').trim()) {
      alert('Delivery requires customer name, phone, and address.');
      return;
    }
    await upsertCustomerProfileDraft(draft);
    closeDeliveryProfileDialog(false);
    render();
  });
  $('#cancelDeliveryProfile')?.addEventListener('click', () => {
    closeDeliveryProfileDialog(true);
    render();
  });

  $('#payNowMissingName')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.name = e.target.value;
  });
  $('#payNowMissingPhone')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.phone = syncPhoneInputMask(e.target as HTMLInputElement);
  });
  $('#payNowMissingAddress1')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.address1 = e.target.value;
  });
  $('#payNowMissingCity')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.city = e.target.value;
  });
  $('#payNowMissingState')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.state = e.target.value;
  });
  $('#payNowMissingZip')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.zip = e.target.value;
  });
  $('#payNowMissingAllergies')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.allergies = e.target.value;
  });
  $('#payNowMissingInstructions')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.specialInstructions = e.target.value;
  });
  $('#payNowMissingFutureDate')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.futureDate = e.target.value;
  });
  $('#payNowMissingFutureTime')?.addEventListener('input', (e) => {
    state.payNowMissingDialog.draft.futureTime = e.target.value;
  });
  $('#savePayNowMissing')?.addEventListener('click', async () => {
    const d = state.payNowMissingDialog.draft;
    const hasName = !!String(d.name || '').trim();
    const hasPhone = !!normalizePhone(d.phone);
    const hasAddress = !!String(d.address1 || '').trim();

    // Keep entered customer details on the active ticket even without saving a customer profile.
    state.customerDraft = {
      ...state.customerDraft,
      name: d.name || '',
      phone: d.phone || '',
      address1: d.address1 || '',
      city: d.city || '',
      state: d.state || '',
      zip: d.zip || '',
      allergies: d.allergies || '',
      specialInstructions: d.specialInstructions || ''
    };

    if (state.orderType === 'delivery' && (!hasName || !hasPhone || !hasAddress)) {
      alert('Delivery requires customer name, phone, and address.');
      return;
    }

    if (state.timingType === 'future') {
      const when = parseLocalDateTime(d.futureDate, d.futureTime);
      if (!when) {
        alert('Please choose a valid future date and time.');
        return;
      }
      state.futureDateTime = when.toISOString();
      state.futureOrderNote = `Ready/Requested: ${formatFutureLabel(state.futureDateTime)}`;
    }

    if (hasPhone) {
      await upsertCustomerProfileDraft({
        name: d.name,
        phone: d.phone,
        address1: d.address1,
        city: d.city,
        state: d.state,
        zip: d.zip,
        allergies: d.allergies,
        specialInstructions: d.specialInstructions
      });
    }

    closePayNowMissingDialog();
    const validation = getPayNowValidation();
    if (!validation.ok) {
      openPayNowMissingDialog(validation.issues);
      render();
      return;
    }
    openPaymentPane();
    render();
  });
  $('#cancelPayNowMissing')?.addEventListener('click', () => {
    closePayNowMissingDialog();
    render();
  });

  $('#payLaterMissingName')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.name = e.target.value;
  });
  $('#payLaterMissingPhone')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.phone = syncPhoneInputMask(e.target as HTMLInputElement);
  });
  $('#payLaterMissingAddress1')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.address1 = e.target.value;
  });
  $('#payLaterMissingCity')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.city = e.target.value;
  });
  $('#payLaterMissingState')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.state = e.target.value;
  });
  $('#payLaterMissingZip')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.zip = e.target.value;
  });
  $('#payLaterMissingAllergies')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.allergies = e.target.value;
  });
  $('#payLaterMissingInstructions')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.specialInstructions = e.target.value;
  });
  $('#payLaterMissingFutureDate')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.futureDate = e.target.value;
  });
  $('#payLaterMissingFutureTime')?.addEventListener('input', (e) => {
    state.payLaterMissingDialog.draft.futureTime = e.target.value;
  });
  $('#savePayLaterMissing')?.addEventListener('click', async () => {
    const d = state.payLaterMissingDialog.draft;
    const hasName = !!String(d.name || '').trim();
    const hasPhone = !!normalizePhone(d.phone);
    const hasAddress = !!String(d.address1 || '').trim();

    // Keep entered customer details on the active ticket even without saving a customer profile.
    state.customerDraft = {
      ...state.customerDraft,
      name: d.name || '',
      phone: d.phone || '',
      address1: d.address1 || '',
      city: d.city || '',
      state: d.state || '',
      zip: d.zip || '',
      allergies: d.allergies || '',
      specialInstructions: d.specialInstructions || ''
    };

    if (state.orderType === 'delivery' && (!hasName || !hasPhone || !hasAddress)) {
      alert('Delivery requires customer name, phone, and address.');
      return;
    }

    if (state.timingType === 'future') {
      const when = parseLocalDateTime(d.futureDate, d.futureTime);
      if (!when) {
        alert('Please choose a valid future date and time.');
        return;
      }
      state.futureDateTime = when.toISOString();
      state.futureOrderNote = `Ready/Requested: ${formatFutureLabel(state.futureDateTime)}`;
    }

    if (hasPhone) {
      await upsertCustomerProfileDraft({
        name: d.name,
        phone: d.phone,
        address1: d.address1,
        city: d.city,
        state: d.state,
        zip: d.zip,
        allergies: d.allergies,
        specialInstructions: d.specialInstructions
      });
    }

    closePayLaterMissingDialog();
    const validation = getPayLaterValidation();
    if (!validation.ok) {
      openPayLaterMissingDialog(validation.issues);
      render();
      return;
    }
    completePayLaterOrder();
  });
  $('#cancelPayLaterMissing')?.addEventListener('click', () => {
    closePayLaterMissingDialog();
    render();
  });

  document.querySelectorAll('[data-lilpay-method]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state.paymentPaneState) return;
      const rawMethod = (b as HTMLElement).dataset.lilpayMethod || 'cash';
      const method: PaymentMethod = ['cash', 'card', 'text-payment-link', 'split', 'gift-or-other'].includes(rawMethod)
        ? (rawMethod as PaymentMethod)
        : 'cash';
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
        type: 'select-method',
        method
      });
      render();
    });
  });

  document.querySelectorAll('[data-lilpay-key]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state.paymentPaneState) return;
      const key = (b as HTMLElement).dataset.lilpayKey || '';
      if (key === 'backspace') {
        state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'cash-backspace' });
      } else if (/^[0-9]$/.test(key)) {
        state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'cash-digit', digit: key });
      }
      render();
    });
  });

  document.querySelectorAll('[data-lilpay-quick]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state.paymentPaneState) return;
      const raw = (b as HTMLElement).dataset.lilpayQuick || '';
      if (raw === 'exact') {
        state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'cash-exact' });
      } else {
        state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
          type: 'cash-set-amount',
          cents: Math.max(0, Number(raw || 0))
        });
      }
      render();
    });
  });

  document.querySelectorAll('[data-lilpay-text-phone="1"]').forEach((field) => {
    const input = field as HTMLInputElement;
    input.addEventListener('input', () => {
      if (!state.paymentPaneState) return;
      const normalizedPhone = syncPhoneInputMask(input);
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
        type: 'text-link-set-phone',
        value: normalizedPhone
      });
      updateOrderPhoneFromPaymentPane(normalizedPhone);
    });

    input.addEventListener('blur', () => {
      render();
    });
  });

  document.querySelectorAll('[data-lilpay-text-status]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state.paymentPaneState) return;
      const rawStatus = (b as HTMLElement).dataset.lilpayTextStatus || 'ready';
      const nextStatus: TextPaymentLinkStatus = ['ready', 'sending', 'sent', 'pending', 'paid', 'failed', 'expired'].includes(rawStatus)
        ? (rawStatus as TextPaymentLinkStatus)
        : 'ready';
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
        type: 'text-link-set-status',
        status: nextStatus
      });
      render();
    });
  });

  document.querySelectorAll('[data-lilpay-back="1"]').forEach((b) => {
    b.addEventListener('click', () => {
      state.mainView = MAIN_VIEWS.menu;
      state.paymentPaneState = null;
      state.paymentPaneInput = null;
      render();
    });
  });

  $('[data-lilpay-send-unpaid="1"]')?.addEventListener('click', () => {
    state.mainView = MAIN_VIEWS.menu;
    state.paymentPaneState = null;
    state.paymentPaneInput = null;
    completePayLaterOrder();
  });

  $('[data-lilpay-pay-send="1"]')?.addEventListener('click', () => {
    if (!state.paymentPaneState) return;
    if (state.paymentPaneState.selectedPaymentMethod === 'cash') {
      handlePaymentPanePrimaryAction();
      return;
    }
    if (state.paymentPaneState.selectedPaymentMethod === 'text-payment-link' && state.paymentPaneState.textPaymentLinkStatus === 'paid') {
      handlePaymentPanePrimaryAction();
      return;
    }
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
      type: 'set-error',
      message: state.paymentPaneState.selectedPaymentMethod === 'text-payment-link'
        ? 'Text the link first, then wait for payment confirmation before completing the order.'
        : 'Pay & Send is available after card integration is configured.'
    });
    render();
  });

  $('[data-lilpay-primary-action="1"]')?.addEventListener('click', () => {
    handlePaymentPanePrimaryAction();
  });

  $('[data-lilpay-manual-entry="1"]')?.addEventListener('click', () => {
    if (!state.paymentPaneState) return;
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
      type: 'set-error',
      message: 'Manual card entry is not wired yet.'
    });
    render();
  });

  $('[data-lilpay-split-payment="1"]')?.addEventListener('click', () => {
    if (!state.paymentPaneState) return;
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
      type: 'set-error',
      message: 'Split payment is coming soon.'
    });
    render();
  });

  $('[data-lilpay-card-retry="1"]')?.addEventListener('click', () => {
    if (!state.paymentPaneState) return;
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
      type: 'set-card-status',
      status: 'ready'
    });
    render();
  });

  document.querySelectorAll('[data-lilpay-cof-select]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!state.paymentPaneState) return;
      const rawId = (el as HTMLElement).dataset.lilpayCofSelect || '';
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
        type: 'cof-select-card',
        id: rawId || null
      });
      render();
    });
  });

  document.querySelectorAll('[data-lilpay-cof-initiate-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.paymentPaneState) return;
      const cardId = (btn as HTMLElement).dataset.lilpayCofInitiateRemove || '';
      if (!cardId) return;
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
        type: 'cof-initiate-remove',
        id: cardId
      });
      render();
    });
  });

  $('[data-lilpay-cof-cancel-remove="1"]')?.addEventListener('click', () => {
    if (!state.paymentPaneState) return;
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'cof-cancel-remove' });
    render();
  });

  $('[data-lilpay-cof-confirm-remove="1"]')?.addEventListener('click', async () => {
    if (!state.paymentPaneState) return;
    const cardId = state.paymentPaneState.removingCardId;
    if (!cardId || state.paymentPaneState.isSubmitting) return;

    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'set-submitting', submitting: true });
    render();

    const result = await mockRemoveSavedCard(cardId);
    if (!state.paymentPaneState) return;

    if (result.ok) {
      if (state.paymentPaneInput) {
        state.paymentPaneInput = {
          ...state.paymentPaneInput,
          savedPaymentMethods: (state.paymentPaneInput.savedPaymentMethods || []).filter((c) => c.savedPaymentMethodId !== cardId)
        };
      }
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'cof-remove-success', id: cardId });
    } else {
      state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, {
        type: 'cof-remove-failed',
        id: cardId,
        message: result.message || 'Failed to remove card. Please try again.'
      });
    }
    state.paymentPaneState = window.LilposPaymentPane.reducer(state.paymentPaneState, { type: 'set-submitting', submitting: false });
    render();
  });

  document.querySelectorAll('[data-pay-type]').forEach((b) => {
    b.addEventListener('click', () => {
      state.paymentDialog.paymentType = b.dataset.payType || 'Cash';
      render();
    });
  });
  document.querySelectorAll('[data-tip-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      state.paymentDialog.tipMode = b.dataset.tipMode || 'none';
      render();
    });
  });
  attachCurrencyInputBehavior($('#paymentCustomTip'), (formatted) => {
    state.paymentDialog.customTip = formatted;
    render();
  });
  attachCurrencyInputBehavior($('#paymentEntryAmount'), (formatted) => {
    state.paymentDialog.entryAmount = formatted;
  });
  document.querySelectorAll('[data-pay-key]').forEach((b) => {
    b.addEventListener('click', () => {
      appendPaymentEntry(b.dataset.payKey);
      render();
    });
  });
  $('#addPaymentLine')?.addEventListener('click', () => {
    addMockPaymentLine();
    render();
  });
  document.querySelectorAll('[data-remove-payment]').forEach((b) => {
    b.addEventListener('click', () => {
      removeMockPaymentLine(b.dataset.removePayment);
      render();
    });
  });
  $('#completePayNow')?.addEventListener('click', completePayNowOrder);
  $('#cancelPaymentDialog')?.addEventListener('click', () => {
    closePaymentDialog();
    render();
  });

  document.querySelectorAll('[data-remove]').forEach((b) => {
    b.addEventListener('click', () => {
      const lineId = b.dataset.remove;
      state.removeConfirmLineId = state.removeConfirmLineId === lineId ? null : lineId;
      render();
    });
  });
  document.querySelectorAll('[data-remove-yes]').forEach((b) => {
    b.addEventListener('click', () => removeLine(b.dataset.removeYes));
  });
  document.querySelectorAll('[data-remove-no]').forEach((b) => {
    b.addEventListener('click', () => {
      state.removeConfirmLineId = null;
      render();
    });
  });
  document.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => openCartItemEditor(b.dataset.note, 'note')));
  document.querySelectorAll('[data-for]').forEach((b) => b.addEventListener('click', () => openCartItemEditor(b.dataset.for, 'for')));
  document.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.inc, 1)));
  document.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.dec, -1)));
  $('#cartItemEditorInput')?.addEventListener('input', (e) => {
    state.cartItemEditor.value = e.target.value;
  });
  $('#saveCartItemEditor')?.addEventListener('click', saveCartItemEditor);
  $('#cancelCartItemEditor')?.addEventListener('click', closeCartItemEditor);

  attachCurrencyInputBehavior($('#quickItemPrice'), (formatted) => {
    state.quickItemEditor.price = formatted;
  });
  $('#quickItemStockMode')?.addEventListener('change', (e) => {
    state.quickItemEditor.stockMode = e.target.value;
    render();
  });
  $('#quickItemStockDays')?.addEventListener('input', (e) => {
    state.quickItemEditor.stockDays = e.target.value;
  });
  $('#saveQuickItem')?.addEventListener('click', saveItemQuickEdit);
  $('#cancelQuickItem')?.addEventListener('click', closeItemQuickEdit);

  $('#quickCategoryVisible')?.addEventListener('change', (e) => {
    state.quickCategoryEditor.visible = !!e.target.checked;
  });
  $('#quickCategoryFavorite')?.addEventListener('change', (e) => {
    state.quickCategoryEditor.favorite = !!e.target.checked;
  });
  $('#saveQuickCategory')?.addEventListener('click', saveCategoryQuickEdit);
  $('#cancelQuickCategory')?.addEventListener('click', closeCategoryQuickEdit);

  $('#newItemName')?.addEventListener('input', (e) => {
    state.addItemDraft.name = e.target.value;
  });
  $('#newItemCategory')?.addEventListener('change', (e) => {
    state.addItemDraft.categoryId = e.target.value;
  });
  attachCurrencyInputBehavior($('#newItemPrice'), (formatted) => {
    state.addItemDraft.price = formatted;
  });
  $('#newItemDescription')?.addEventListener('input', (e) => {
    state.addItemDraft.description = e.target.value;
  });
  $('#newItemModifierCount')?.addEventListener('input', (e) => {
    state.addItemDraft.modifierCount = e.target.value;
  });
  $('#newItemInStock')?.addEventListener('change', (e) => {
    state.addItemDraft.inStock = !!e.target.checked;
  });
  $('#newItemFavorite')?.addEventListener('change', (e) => {
    state.addItemDraft.favorite = !!e.target.checked;
  });
  $('#saveNewItem')?.addEventListener('click', saveNewItemFromDialog);
  $('#cancelNewItem')?.addEventListener('click', closeAddItemDialog);

  $('#sendPayNow')?.addEventListener('click', () => sendOrderAction('pay_now'));
  $('#sendPayLater')?.addEventListener('click', () => sendOrderAction('pay_later'));
  $('#newSaleBtn')?.addEventListener('click', () => requestNewSale());
  $('#cancelSaleBottom')?.addEventListener('click', clearTicket);
  $('#newSaleGoBack')?.addEventListener('click', () => {
    state.showCancelConfirm = false;
    state.newSalePendingLineNumber = null;
    render();
  });
  $('#newSaleContinue')?.addEventListener('click', cancelSaleConfirmed);

  $('#orderPrintCustomer')?.addEventListener('click', () => printOrderNumberReceipt('customer_receipt'));
  $('#orderPrintMerchant')?.addEventListener('click', () => printOrderNumberReceipt('merchant_receipt'));
  $('#orderPrintBoth')?.addEventListener('click', () => printOrderNumberReceipt('both_receipts'));
  $('#orderNumberDone')?.addEventListener('click', () => {
    closeOrderNumberDialog();
    render();
  });

  $('#modUndo')?.addEventListener('click', () => dialogHistoryUndo());
  $('#modRedo')?.addEventListener('click', () => dialogHistoryRedo());
  $('#modStartOver')?.addEventListener('click', () => dialogHistoryStartOver());

  const modSearchInput = $('#modifierSearchInput') as HTMLInputElement | null;
  modSearchInput?.addEventListener('input', () => {
    state.modifierSearch = modSearchInput.value;
    // Re-render to filter; keyboard controller will resync focus
    render();
  });
  $('#modifierSearchClear')?.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep focus in search input
  });
  $('#modifierSearchClear')?.addEventListener('click', () => {
    state.modifierSearch = '';
    const inp = $('#modifierSearchInput') as HTMLInputElement | null;
    if (inp) { inp.value = ''; inp.focus(); }
    render();
  });

  $('#closeModal')?.addEventListener('click', () => {
    state.selected = null;
    state.modifierDialogHistory = null;
    state.modifierDialogInitialConfig = null;
    state.startOverConfirmPending = false;
    state.modifierSearch = '';
    if (_startOverConfirmTimer) { clearTimeout(_startOverConfirmTimer); _startOverConfirmTimer = null; }
    render();
  });

  document.querySelectorAll('[data-size]').forEach((b) => {
    b.addEventListener('click', () => {
      snapshotDialogState();
      state.selectedConfig.size = b.dataset.size;
      if (state.selected && itemUsesCustomPizzaModifierUi(state.selected)) {
        resizePizzaSelectionPrices(state.selected, state.selectedConfig.size);
      }
      render();
    });
  });

  document.querySelectorAll('[data-pizza-nav]').forEach((b) => {
    b.addEventListener('click', () => {
      state.selectedConfig.pizzaNav = b.dataset.pizzaNav;
      state.modifierSearch = '';
      render();
    });
  });

  document.querySelectorAll('[data-pizza-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.selectedConfig.pizzaFilter = b.dataset.pizzaFilter;
      render();
    });
  });

  document.querySelectorAll('[data-pizza-prep-group]').forEach((b) => {
    b.addEventListener('click', () => {
      const groupId = b.dataset.pizzaPrepGroup;
      const prepId = b.dataset.pizzaPrepId;
      if (!groupId || !prepId) return;
      const existing = getActivePrepModifierForGroup(groupId);
      if (existing?.id === prepId) {
        clearActivePrepModifierForGroup(groupId);
      } else {
        setActivePrepModifierForGroup(groupId, prepId);
      }
      render();
    });
  });

  document.querySelectorAll('[data-pizza-whole]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = state.selected;
      const group = getPizzaToppingGroup(item);
      const option = (state.idx?.optsByGroup?.get(group?.id) || []).find((entry) => entry.id === b.dataset.pizzaWhole);
      if (!group || !option) return;
      snapshotDialogState();
      togglePizzaSelection(group, option, 'whole');
      render();
    });
  });

  document.querySelectorAll('[data-pizza-side]').forEach((b) => {
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = state.selected;
      const group = getPizzaToppingGroup(item);
      const option = (state.idx?.optsByGroup?.get(group?.id) || []).find((entry) => entry.id === b.dataset.pizzaOption);
      if (!group || !option) return;
      snapshotDialogState();
      togglePizzaSelection(group, option, b.dataset.pizzaSide === 'left' ? 'left' : 'right');
      render();
    });
  });

  document.querySelectorAll('[data-pizza-mult]').forEach((b) => {
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = state.selected;
      const group = getPizzaToppingGroup(item);
      const option = (state.idx?.optsByGroup?.get(group?.id) || []).find((entry) => entry.id === b.dataset.pizzaMult);
      if (!group || !option) return;
      snapshotDialogState();
      cyclePizzaSelectionMultiplier(group, option);
      render();
    });
  });

  $('#pizzaNotesInput')?.addEventListener('focus', () => {
    snapshotDialogState();
  });
  $('#pizzaNotesInput')?.addEventListener('input', (e) => {
    state.selectedConfig.pizzaNotes = e.target.value;
  });

  document.querySelectorAll('[data-mod-group]').forEach((b) => {
    b.addEventListener('click', () => {
      snapshotDialogState();
      toggleMod(b.dataset.modGroup, b.dataset.modName);
    });
  });

  document.querySelectorAll('[data-pre-group]').forEach((b) => {
    b.addEventListener('click', () => {
      const groupId = b.dataset.preGroup;
      const preValue = b.dataset.preValue;
      if (!groupId || !preValue) return;
      snapshotDialogState();
      state.selectedConfig.preModifiers = state.selectedConfig.preModifiers || {};
      state.selectedConfig.preModifiers[groupId] = preValue;
      render();
    });
  });

  $('#addToTicket')?.addEventListener('click', () => {
    const item = state.selected;
    if (!item || isItemOutOfStock(item)) return;
    const size = state.selectedConfig.size || item.sizeSchema?.[0]?.name || null;
    const mods = Object.values(state.selectedConfig.mods || {}).flat().map((entry) => {
      if (entry && typeof entry === 'object') return entry;
      return {
        modifierGroupId: null,
        modifierGroupName: '',
        optionId: null,
        optionName: asModifierValue(entry),
        price: 0,
        preModifierType: null,
        preModifierValue: null,
        preModifierLabel: null
      };
    });
    const basePrice = item.fixedPrice ? item.basePrice : item.sizeSchema?.find((s) => s.name === size)?.price || item.basePrice;
    const modifiersPrice = itemUsesCustomPizzaModifierUi(item) ? +(mods as any[]).reduce((sum: number, entry: any) => sum + Number(entry.price || 0), 0).toFixed(2) : 0;
    const price = +(basePrice + modifiersPrice).toFixed(2);
    addItem(item, {
      size,
      mods,
      price,
      editingLineId: state.selectedConfig.editingLineId,
      specialInstruction: itemUsesCustomPizzaModifierUi(item) ? (state.selectedConfig.pizzaNotes || '') : undefined
    });
  });

  document.querySelectorAll('[data-editmods]').forEach((b) => {
    b.addEventListener('click', () => openLineItemEditor(b.dataset.editmods));
  });

  $('#scale')?.addEventListener('change', (e) => {
    state.scale = e.target.value;
  });
  $('#generate')?.addEventListener('click', generateAndStore);
  $('#seedMedium')?.addEventListener('click', () => generateSeed('medium'));
  $('#seedLarge')?.addEventListener('click', () => generateSeed('large'));
  $('#seedHuge')?.addEventListener('click', () => generateSeed('huge'));
  $('#load')?.addEventListener('click', loadFromDb);
  $('#clear')?.addEventListener('click', clearAll);
  $('#toggleOffline')?.addEventListener('click', () => {
    state.offline = !state.offline;
    render();
  });

  // Handle scroll state for ticket-panel-scroll shadow/divider
  const ticketPanelScroll = document.querySelector('.ticket-panel-scroll');
  if (ticketPanelScroll) {
    const updateScrollState = () => {
      if (ticketPanelScroll.scrollTop > 0) {
        ticketPanelScroll.classList.add('is-scrolled');
      } else {
        ticketPanelScroll.classList.remove('is-scrolled');
      }
    };
    ticketPanelScroll.addEventListener('scroll', updateScrollState);
    // Call once on attach to set initial state
    updateScrollState();
  }
}

hydrateManagerSettingsFromStorage();
installKeyboardLifecycleEvents();
keyboardController.setKeyboardMode(state.keyboardMode, { persist: false });
render();
loadFromDb();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  state.installAvailable = true;
  state.pwaDiag.beforeInstallPrompt = true;
  render();
});

window.addEventListener('appinstalled', () => {
  state.installed = true;
  state.installAvailable = false;
  deferredInstallPrompt = null;
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    updatePwaDiagnostics();
    navigator.serviceWorker.register('./sw.js').then(() => {
      state.pwaDiag.swRegistered = true;
      updatePwaDiagnostics();
      render();
    }).catch((err) => {
      state.pwaDiag.swRegistered = false;
      console.error('Service worker registration failed:', err);
      updatePwaDiagnostics();
      render();
    });
  });
}
