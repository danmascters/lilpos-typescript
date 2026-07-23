/// <reference path="./payment-types.ts" />
/// <reference path="./split-payment-pane.ts" />

function paymentMethodTabLabel(method: PaymentMethod): string {
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'split') return 'Split Payment';
  if (method === 'text-payment-link') return 'Text a Payment Link';
  return 'Gift Card / Other';
}

function orderDetailItemsHtml(items: PaymentPaneOrderItem[]): string {
  return items.slice(0, 8).map((item) => `
    <div class="lilpay-item-row">
      <span class="lilpay-item-qty">${Math.max(1, Number(item.qty || 1))}</span>
      <span class="lilpay-item-name">${item.name}</span>
      <span class="lilpay-item-price">${formatCents(item.priceCents * Math.max(1, Number(item.qty || 1)))}</span>
    </div>
    ${item.subtitle ? `<div class="lilpay-item-subtitle">${item.subtitle}</div>` : ''}
  `).join('');
}

function rightSummaryHtml(input: PaymentPaneInput, state: PaymentPaneState): string {
  return `
    <aside class="lilpay-side-panel">
      <section class="lilpay-side-card">
        <h3>Order Summary</h3>
        <div class="lilpay-summary-row"><span>Subtotal</span><b>${formatCents(state.subtotalCents)}</b></div>
        <div class="lilpay-summary-row"><span>Tax</span><b>${formatCents(state.taxCents)}</b></div>
        ${state.tipCents > 0 ? `<div class="lilpay-summary-row"><span>Tip</span><b>${formatCents(state.tipCents)}</b></div>` : ''}
        <div class="lilpay-summary-row lilpay-summary-total"><span>Total</span><b>${formatCents(state.totalCents)}</b></div>
        ${state.paymentsAppliedCents > 0 ? `<div class="lilpay-summary-row"><span>Payments Applied</span><b>- ${formatCents(state.paymentsAppliedCents)}</b></div>` : ''}
        <div class="lilpay-remaining-box"><span>Remaining Balance</span><b>${formatCents(state.remainingBalanceCents)}</b></div>
      </section>
      <section class="lilpay-side-card lilpay-order-details">
        <h3>Order Details</h3>
        ${input.customer?.name ? `<div class="lilpay-customer">${input.customer.name}</div>` : ''}
        ${input.customer?.phone ? `<div class="lilpay-customer">${input.customer.phone}</div>` : ''}
        <div class="lilpay-items-scroll">${orderDetailItemsHtml(input.items)}</div>
        <div class="lilpay-order-type-row"><span>Order Type</span><b>${input.orderTypeLabel}</b></div>
      </section>
    </aside>
  `;
}

function centerPaneHtml(input: PaymentPaneInput, state: PaymentPaneState): string {
  if (state.selectedPaymentMethod === 'cash') return cashPaymentPaneHtml(state);
  if (state.selectedPaymentMethod === 'card') return cardPaymentPaneHtml(input, state);
  if (state.selectedPaymentMethod === 'text-payment-link') return textPaymentLinkPaneHtml(state);
  if (state.selectedPaymentMethod === 'split') return splitPaymentPaneHtml(input, state);
  return `
    <section class="lilpay-center-card lilpay-coming-soon" aria-label="Coming soon payment method">
      <h3>${paymentMethodTabLabel(state.selectedPaymentMethod)}</h3>
      <p>Coming soon</p>
    </section>
  `;
}

function methodTabsHtml(selected: PaymentMethod): string {
  const methods: PaymentMethod[] = ['cash', 'card', 'text-payment-link', 'split', 'gift-or-other'];
  return `
    <div class="lilpay-method-tabs" role="tablist" aria-label="Payment methods">
      ${methods.map((method) => `
        <button
          type="button"
          class="lilpay-method-tab ${selected === method ? 'active' : ''}"
          data-lilpay-method="${method}"
          aria-selected="${selected === method ? 'true' : 'false'}"
          role="tab"
        >
          ${paymentMethodTabLabel(method)}
        </button>
      `).join('')}
    </div>
  `;
}

function contextualPrimaryActionLabel(input: PaymentPaneInput, state: PaymentPaneState): string {
  if (state.selectedPaymentMethod === 'split') {
    if (state.splitWorkspace?.remainingCents === 0) {
      return input.paymentContextSource === 'orders-management' ? 'Complete Payment' : 'Complete & Send';
    }
    return 'Process Split Portion';
  }

  if (state.selectedPaymentMethod === 'text-payment-link') {
    return state.textPaymentLinkStatus === 'paid' ? 'Complete Confirmed Payment' : 'Text Payment Link';
  }
  if (state.selectedPaymentMethod === 'card' && state.selectedSavedCardId) {
    const saved = (input.savedPaymentMethods || []).find(
      (m) => m.savedPaymentMethodId === state.selectedSavedCardId && m.status === 'active'
    );
    if (saved) {
      const brand = saved.cardBrand === 'amex' ? 'Amex'
        : saved.cardBrand.charAt(0).toUpperCase() + saved.cardBrand.slice(1);
      return `Charge ${brand}\u00A0\u2022\u2022\u2022\u2022\u00A0${saved.lastFour}`;
    }
    return 'Charge Card on File & Complete';
  }
  if (state.selectedPaymentMethod === 'card') return 'Charge Card & Complete';
  if (state.selectedPaymentMethod === 'gift-or-other') return 'Complete Other Payment';
  return 'Complete Cash Sale';
}

function primaryActionDisabled(input: PaymentPaneInput, state: PaymentPaneState): boolean {
  if (state.isSubmitting) return true;
  if (state.selectedPaymentMethod === 'split') {
    if (!state.splitWorkspace) return true;
    if (state.splitWorkspace.remainingCents === 0) return false;
    const selected = state.splitWorkspace.portions.find((portion) => portion.id === state.splitWorkspace?.selectedPortionId);
    if (!selected) return true;
    return !(selected.status === 'PENDING' || selected.status === 'DECLINED');
  }
  if (state.selectedPaymentMethod === 'card' && state.removingCardId) return true;
  if (state.selectedPaymentMethod !== 'text-payment-link') return false;
  return state.textPaymentLinkStatus === 'sending'
    || state.textPaymentLinkStatus === 'sent'
    || state.textPaymentLinkStatus === 'pending';
}

function displayOrderMeta(input: PaymentPaneInput): string {
  return `Order ${displayOrderNumber(input.displayOrderNumber)} • ${input.orderTypeLabel} • ${input.stationName}`;
}

function exactChangeActionLabel(state: PaymentPaneState): string {
  const dueCents = state.splitProcessingAmountCents > 0
    ? Math.max(0, Number(state.splitProcessingAmountCents || 0))
    : Math.max(0, Number(state.remainingBalanceCents || 0));
  return `Exact Change ${formatCents(dueCents)}`;
}

function renderPane(input: PaymentPaneInput, state: PaymentPaneState): string {
  const splitHasBalance = state.selectedPaymentMethod === 'split' && !!state.splitWorkspace && state.splitWorkspace.remainingCents > 0;
  const showExactChangeAction = state.selectedPaymentMethod === 'cash' && !splitHasBalance;
  return `
    <div class="lilpay-pane" data-lilpay-open="1">
      <div class="lilpay-main">
        <header class="lilpay-header">
          <button type="button" class="lilpay-back-btn" data-lilpay-back="1" aria-label="Back">←</button>
          <div>
            <h2>Take Payment</h2>
            <p>${displayOrderMeta(input)}</p>
          </div>
        </header>

        <section class="lilpay-balance-card">
          <div class="lilpay-balance-label">Balance Due</div>
          <div class="lilpay-balance-value">${formatCents(state.remainingBalanceCents)}</div>
        </section>

        ${methodTabsHtml(state.selectedPaymentMethod)}

        ${centerPaneHtml(input, state)}

        <footer class="lilpay-actions-row">
          <button type="button" class="lilpay-action-btn" data-lilpay-back="1">Back</button>
          ${splitHasBalance ? '' : '<button type="button" class="lilpay-action-btn" data-lilpay-send-unpaid="1">Send Unpaid</button>'}
          ${splitHasBalance ? '' : '<button type="button" class="lilpay-action-btn" data-lilpay-pay-send="1">Pay & Send</button>'}
          ${showExactChangeAction ? `<button type="button" class="lilpay-action-btn lilpay-quick-exact" data-lilpay-quick="exact">${exactChangeActionLabel(state)}</button>` : ''}
          <button
            type="button"
            class="lilpay-action-btn lilpay-action-primary"
            data-lilpay-primary-action="1"
            ${primaryActionDisabled(input, state) ? 'disabled' : ''}
          >
            ${contextualPrimaryActionLabel(input, state)}
          </button>
        </footer>
      </div>
      ${state.errorMessage ? `<div class="lilpay-error-banner" role="alert">${state.errorMessage}</div>` : ''}
    </div>
  `;
}

window.LilposPaymentPane = {
  createStateFromInput,
  renderPane,
  reducer,
  parseMoneyInputToCents,
  formatCents
};
