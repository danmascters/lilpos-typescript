/// <reference path="./delivery-manager.types.ts" />

(function(global: any) {
  'use strict';
  const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[c]);
  const money = (cents: any) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
  const statusLabel = (value: any) => ({ PENDING_DELIVERY:'Pending Delivery', ASSIGNED:'Assigned', OUT_FOR_DELIVERY:'Out for Delivery', DELIVERED:'Delivered', RETURNED:'Returned', CANCELED:'Canceled' } as any)[value] || value;

  function settingsView(state: DeliveryManagerState) {
    const s = state.settings;
    return `<div class="delivery-card"><h3>Delivery Settings</h3>
      <label class="delivery-toggle"><input type="checkbox" name="inHouseDeliveryEnabled" ${s.inHouseDeliveryEnabled ? 'checked' : ''}> Enable In-House Delivery</label>
      <fieldset data-delivery-dependent="inHouseDeliveryEnabled" ${s.inHouseDeliveryEnabled ? '' : 'disabled'}><legend>Delivery Queue Behavior</legend>
        <label><input type="radio" name="deliveryQueueMode" value="main_orders" ${s.deliveryQueueMode === 'main_orders' ? 'checked' : ''}> Keep delivery orders in main Orders queue</label>
        <label><input type="radio" name="deliveryQueueMode" value="dedicated_delivery_queue" ${s.deliveryQueueMode === 'dedicated_delivery_queue' ? 'checked' : ''}> Show delivery orders in dedicated Delivery queue</label>
      </fieldset>
      <label class="delivery-toggle"><input type="checkbox" name="driverBanksEnabled" ${s.driverBanksEnabled ? 'checked' : ''}> Enable Driver Banks</label>
      <fieldset data-delivery-dependent="driverBanksEnabled" ${s.driverBanksEnabled ? '' : 'disabled'}><legend>Driver Bank Reconciliation</legend>
        <label><input type="radio" name="driverBankReconciliationMode" value="end_of_shift" ${s.driverBankReconciliationMode === 'end_of_shift' ? 'checked' : ''}> End of shift</label>
        <label><input type="radio" name="driverBankReconciliationMode" value="per_order" ${s.driverBankReconciliationMode === 'per_order' ? 'checked' : ''}> Per order</label>
      </fieldset><button id="deliverySaveSettings" class="btn-success">Save Settings</button></div>`;
  }

  function driversView(state: DeliveryManagerState) {
    const editing = state.drivers.find((d) => d.driverId === state.editingDriverId);
    return `<div class="delivery-two-col"><div class="delivery-card"><h3>Drivers</h3>
      ${state.drivers.length ? state.drivers.map((d) => `<div class="delivery-driver-row"><div><b>${esc(d.displayName)}</b><small>${esc(d.phone || 'No phone')} · ${d.active ? 'Active' : 'Inactive'}</small></div><div><button class="btn-secondary" data-delivery-edit-driver="${d.driverId}">Edit</button><button class="${d.active ? 'btn-danger' : 'btn-success'}" data-delivery-toggle-driver="${d.driverId}">${d.active ? 'Deactivate' : 'Activate'}</button></div></div>`).join('') : '<p class="muted">No drivers yet.</p>'}
      </div><div class="delivery-card"><h3>${editing ? 'Edit Driver' : 'Add Driver'}</h3><input id="deliveryDriverName" placeholder="Driver name" value="${esc(editing?.displayName || '')}"><input id="deliveryDriverPhone" placeholder="Phone (optional)" value="${esc(editing?.phone || '')}"><div><button id="deliverySaveDriver" class="btn-success">${editing ? 'Save Driver' : 'Add Driver'}</button>${editing ? '<button id="deliveryCancelDriverEdit" class="btn-secondary">Cancel</button>' : ''}</div></div></div>`;
  }

  function ordersView(state: DeliveryManagerState) {
    const activeDrivers = state.drivers.filter((d) => d.active);
    const settledOrderIds = new Set(state.settlements.filter((settlement) => settlement.status === 'APPROVED').flatMap((settlement) => settlement.orderIds || []));
    return `<div class="delivery-card"><h3>Delivery Orders</h3>${state.orders.length ? state.orders.map((o) => {
      const driver = state.drivers.find((d) => d.driverId === o.assignedDriverId);
      const actions = o.deliveryStatus === 'PENDING_DELIVERY' ? '' : o.deliveryStatus === 'ASSIGNED' ? 'OUT_FOR_DELIVERY|RETURNED|CANCELED' : o.deliveryStatus === 'OUT_FOR_DELIVERY' ? 'DELIVERED|RETURNED|CANCELED' : '';
      const terminal = ['DELIVERED', 'RETURNED', 'CANCELED'].includes(o.deliveryStatus);
      const settlementAction = state.settings.driverBankReconciliationMode === 'per_order' && o.deliveryStatus === 'DELIVERED'
        ? settledOrderIds.has(String(o.id || o.orderId)) ? '<span class="delivery-status-badge status-delivered">Settled</span>' : `<button class="btn-primary" data-delivery-order-settlement="${o.id}">Settle Order</button>`
        : '';
      return `<div class="delivery-order-row"><div><b>#${esc(o.orderNumber || o.displayOrderNumber || o.id)}</b><span class="delivery-status-badge status-${String(o.deliveryStatus || '').toLowerCase()}">${esc(statusLabel(o.deliveryStatus))}</span><small>${esc(driver?.displayName || 'Unassigned')} · ${money(o.totalCents)}</small></div><div class="delivery-order-actions">${terminal ? '' : `<select data-delivery-driver-select="${o.id}"><option value="">Select driver</option>${activeDrivers.map((d) => `<option value="${d.driverId}" ${d.driverId === o.assignedDriverId ? 'selected' : ''}>${esc(d.displayName)}</option>`).join('')}</select><button data-delivery-assign="${o.id}" class="btn-secondary">Assign</button>`}${actions.split('|').filter(Boolean).map((s) => `<button class="btn-secondary" data-delivery-status="${o.id}|${s}">${esc(statusLabel(s))}</button>`).join('')}${settlementAction}</div></div>`;
    }).join('') : '<p class="muted">No in-house delivery orders.</p>'}</div>`;
  }

  function settlementsView(state: DeliveryManagerState) {
    return `<div class="delivery-settlement-grid">${state.drivers.filter((d) => d.active).map((d) => {
      const shift = state.shifts.find((s) => s.driverId === d.driverId && s.status === 'OPEN');
      const calc = state.settlementPreviewByDriverId[d.driverId] || global.LilposDeliveryCalculations.calculate({ orders: [], shift });
      const driverOrders = state.orders.filter((order) => order.assignedDriverId === d.driverId && (!shift || order.businessDate === shift.businessDate));
      const assignedCount = driverOrders.filter((order) => order.deliveryStatus === 'ASSIGNED').length;
      const outCount = driverOrders.filter((order) => order.deliveryStatus === 'OUT_FOR_DELIVERY').length;
      const deliveredCount = driverOrders.filter((order) => order.deliveryStatus === 'DELIVERED').length;
      const cashDeliveryCount = driverOrders.filter((order) => order.deliveryStatus === 'DELIVERED' && (order.paymentLines || []).some((payment: any) => String(payment.paymentType || '').toLowerCase().includes('cash'))).length;
      const netLabel = calc.netDirection === 'DRIVER_OWES_STORE' ? 'Driver owes store' : calc.netDirection === 'STORE_OWES_DRIVER' ? 'Store owes driver' : 'Settled even';
      return `<div class="delivery-card"><h3>${esc(d.displayName)}</h3><p>${shift ? `Shift opened ${esc(new Date(shift.openedAt).toLocaleTimeString())}` : 'No open shift'}</p><div class="delivery-driver-metrics"><span>Assigned <b>${assignedCount}</b></span><span>Out <b>${outCount}</b></span><span>Delivered <b>${deliveredCount}</b></span><span>Cash deliveries <b>${cashDeliveryCount}</b></span></div>${shift ? `<button class="btn-secondary" data-delivery-close-shift="${shift.driverShiftId}">Close Shift</button>` : `<input type="number" min="0" step="0.01" data-delivery-bank="${d.driverId}" placeholder="Starting bank" ${state.settings.driverBanksEnabled ? '' : 'disabled'}><button class="btn-success" data-delivery-open-shift="${d.driverId}">Open Shift</button>`}<div class="delivery-settlement-lines"><span>Cash collected <b>${money(calc.cashOrderTotalCents)}</b></span><span>Starting bank <b>${money(calc.startingBankAmountCents)}</b></span><span>Card tips owed <b>${money(calc.creditCardTipsOwedCents)}</b></span><strong>${netLabel}: ${money(calc.netAmountCents)}</strong></div>${calc.warnings.length ? `<p class="delivery-warning">Unable to calculate settlement for some orders due to missing payment details.</p>` : ''}<button class="btn-primary" data-delivery-draft-settlement="${d.driverId}" ${calc.orderIds.length || calc.startingBankAmountCents ? '' : 'disabled'}>Create Settlement Draft</button></div>`;
    }).join('')}</div><div class="delivery-card"><h3>Settlement Records</h3>${state.settlements.length ? state.settlements.map((s) => `<div class="delivery-driver-row"><div><b>${esc(state.drivers.find((d) => d.driverId === s.driverId)?.displayName || s.driverId)}</b><small>${esc(s.status)} · ${esc(s.netDirection)} · ${money(s.netAmountCents)}</small></div>${s.status === 'DRAFT' ? `<button class="btn-success" data-delivery-approve-settlement="${s.settlementId}">Approve</button>` : ''}</div>`).join('') : '<p class="muted">No settlement records.</p>'}<p class="muted">V1 records settlement results only. Cash drawer payouts are not created.</p></div>`;
  }

  function render(state: DeliveryManagerState) {
    const body = state.activeTab === 'settings' ? settingsView(state) : state.activeTab === 'drivers' ? driversView(state) : state.activeTab === 'orders' ? ordersView(state) : settlementsView(state);
    return `<div class="delivery-manager"><div class="delivery-tabs">${[['settings','Settings'],['drivers','Drivers'],['orders','Delivery Orders'],['settlements','Driver Banks / Settlement']].map(([id,label]) => `<button data-delivery-tab="${id}" class="${state.activeTab === id ? 'active' : ''}">${label}</button>`).join('')}</div>${state.error ? `<div class="delivery-error">${esc(state.error)}</div>` : ''}${state.message ? `<div class="delivery-message">${esc(state.message)}</div>` : ''}${state.loading ? '<p class="muted">Loading…</p>' : body}</div>`;
  }
  global.LilposDeliveryManagerView = { render, statusLabel };
})(window);
