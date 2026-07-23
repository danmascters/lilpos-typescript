/// <reference path="./payment-types.ts" />

function cardStatusCopy(status: CardStatus): { title: string; subtitle: string; toneClass: string; showRetry: boolean } {
  if (status === 'processing') return { title: 'Processing payment', subtitle: 'Please wait', toneClass: 'processing', showRetry: false };
  if (status === 'approved') return { title: 'Payment approved', subtitle: 'Ready to complete', toneClass: 'approved', showRetry: false };
  if (status === 'declined') return { title: 'Payment declined', subtitle: 'Please retry', toneClass: 'declined', showRetry: true };
  if (status === 'error') return { title: 'Terminal unavailable', subtitle: 'Please retry', toneClass: 'error', showRetry: true };
  return { title: 'Ready for card', subtitle: 'Tap / Insert / Swipe', toneClass: 'ready', showRetry: false };
}

function cardTerminalIcon(): string {
  return `<svg class="lilpay-terminal-icon" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="18" y="8" width="28" height="48" rx="6"></rect>
    <rect x="22" y="14" width="20" height="12" rx="2"></rect>
    <circle cx="27" cy="34" r="2"></circle>
    <circle cx="32" cy="34" r="2"></circle>
    <circle cx="37" cy="34" r="2"></circle>
    <circle cx="27" cy="40" r="2"></circle>
    <circle cx="32" cy="40" r="2"></circle>
    <circle cx="37" cy="40" r="2"></circle>
    <circle cx="27" cy="46" r="2"></circle>
    <circle cx="32" cy="46" r="2"></circle>
    <circle cx="37" cy="46" r="2"></circle>
    <path d="M50 24c4 2 6 6 6 10"></path>
    <path d="M48 30c2 1 3 3 3 4"></path>
  </svg>`;
}

function cardBrandLabel(brand: CardBrand): string {
  if (brand === 'visa') return 'Visa';
  if (brand === 'mastercard') return 'Mastercard';
  if (brand === 'amex') return 'American Express';
  if (brand === 'discover') return 'Discover';
  return 'Card';
}

function cardBrandIcon(brand: CardBrand): string {
  if (brand === 'visa') {
    return `<svg class="lilpay-brand-icon" viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="5" fill="#1434cb"/><text x="5" y="24" fill="#fff" font-size="17" font-weight="900" font-family="Arial,sans-serif" letter-spacing="2">VISA</text></svg>`;
  }
  if (brand === 'mastercard') {
    return `<svg class="lilpay-brand-icon" viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="5" fill="#191919"/><circle cx="18" cy="16" r="10" fill="#eb001b"/><circle cx="30" cy="16" r="10" fill="#f79e1b"/><path d="M24 7a10 10 0 0 1 0 18 10 10 0 0 1 0-18z" fill="#ff5f00"/></svg>`;
  }
  if (brand === 'amex') {
    return `<svg class="lilpay-brand-icon" viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="5" fill="#016fd0"/><text x="4" y="23" fill="#fff" font-size="14" font-weight="900" font-family="Arial,sans-serif" letter-spacing="1">AMEX</text></svg>`;
  }
  if (brand === 'discover') {
    return `<svg class="lilpay-brand-icon" viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="5" fill="#fff" stroke="#e2e8f0" stroke-width="1"/><circle cx="35" cy="16" r="9" fill="#f76f20"/><text x="4" y="14" fill="#231f20" font-size="8" font-weight="900" font-family="Arial,sans-serif">DISC</text><text x="4" y="23" fill="#231f20" font-size="8" font-weight="900" font-family="Arial,sans-serif">OVER</text></svg>`;
  }
  return `<svg class="lilpay-brand-icon" viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="5" fill="#e2e8f0"/><rect x="6" y="8" width="36" height="16" rx="3" fill="#94a3b8"/><rect x="6" y="13" width="36" height="5" fill="#64748b"/><circle cx="14" cy="22" r="2.5" fill="#94a3b8"/><circle cx="22" cy="22" r="2.5" fill="#94a3b8"/><circle cx="30" cy="22" r="2.5" fill="#94a3b8"/><circle cx="38" cy="22" r="2.5" fill="#94a3b8"/></svg>`;
}

function cofSectionHtml(cards: SavedPaymentMethodDisplay[], state: PaymentPaneState, canRemove: boolean): string {
  const onlyOne = cards.length === 1;
  return `
    <div class="lilpay-cof-section">
      <h3 class="lilpay-cof-title">Card on File</h3>
      <div class="lilpay-cof-list" role="radiogroup" aria-label="Saved payment cards">
        ${cards.map((card) => {
          const isSelected = state.selectedSavedCardId === card.savedPaymentMethodId;
          const brand = cardBrandLabel(card.cardBrand);
          const expMonth = card.expirationMonth ? String(card.expirationMonth).padStart(2, '0') : '';
          const expYear = card.expirationYear ? String(card.expirationYear).slice(-2) : '';
          const expiryText = expMonth && expYear ? `Expires ${expMonth}/${expYear}` : '';
          return `
            <div
              class="lilpay-cof-row${isSelected ? ' selected' : ''}${onlyOne && !state.selectedSavedCardId ? ' only-card' : ''}"
              data-lilpay-cof-select="${card.savedPaymentMethodId}"
              role="radio"
              aria-checked="${isSelected ? 'true' : 'false'}"
              tabindex="0"
              aria-label="${isSelected ? 'Selected: ' : ''}${brand} ending in ${card.lastFour}${expiryText ? ', ' + expiryText : ''}"
            >
              <span class="lilpay-cof-check" aria-hidden="true">${isSelected ? '✓' : ''}</span>
              ${cardBrandIcon(card.cardBrand)}
              <span class="lilpay-cof-last4">•••• ${card.lastFour}</span>
              <span class="lilpay-cof-expiry">${expiryText}</span>
              ${canRemove ? `<button
                type="button"
                class="lilpay-cof-remove-btn"
                data-lilpay-cof-initiate-remove="${card.savedPaymentMethodId}"
                aria-label="Remove ${brand} ending in ${card.lastFour}"
                title="Remove this saved card"
              >×</button>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function cofRemoveConfirmHtml(card: SavedPaymentMethodDisplay, state: PaymentPaneState): string {
  const brand = cardBrandLabel(card.cardBrand);
  return `
    <div class="lilpay-cof-confirm-overlay" role="dialog" aria-modal="true" aria-label="Remove saved card confirmation">
      <div class="lilpay-cof-confirm-box">
        <h4 class="lilpay-cof-confirm-title">Remove saved card?</h4>
        <p class="lilpay-cof-confirm-desc">${brand} ending in ${card.lastFour} will no longer be available for future payments.</p>
        ${state.removingCardError ? `<p class="lilpay-error-note">${state.removingCardError}</p>` : ''}
        <div class="lilpay-cof-confirm-actions">
          <button type="button" class="lilpay-sub-action" data-lilpay-cof-cancel-remove="1" ${state.isSubmitting ? 'disabled' : ''}>Cancel</button>
          <button type="button" class="lilpay-action-btn lilpay-cof-remove-confirm-btn" data-lilpay-cof-confirm-remove="1" ${state.isSubmitting ? 'disabled' : ''}>${state.isSubmitting ? 'Removing…' : 'Remove Card'}</button>
        </div>
      </div>
    </div>
  `;
}

function cofSelectedCardStatusHtml(card: SavedPaymentMethodDisplay, state: PaymentPaneState): string {
  const isReady = state.cardStatus === 'ready';
  const copy = isReady
    ? { title: 'Ready to charge', subtitle: `${cardBrandLabel(card.cardBrand)} •••• ${card.lastFour}`, toneClass: 'ready', showRetry: false }
    : cardStatusCopy(state.cardStatus);
  return `
    <div class="lilpay-cof-charge-status ${copy.toneClass}">
      <div class="lilpay-cof-charge-icon">${cardBrandIcon(card.cardBrand)}</div>
      <div>
        <div class="lilpay-card-title">${copy.title}</div>
        <div class="lilpay-card-subtitle">${copy.subtitle}</div>
        ${copy.showRetry ? '<button type="button" class="lilpay-sub-action" data-lilpay-card-retry="1">Retry</button>' : ''}
      </div>
    </div>
  `;
}

function cardTipBaseAmountCents(state: PaymentPaneState): number {
  if (Number(state.splitProcessingAmountCents || 0) > 0) {
    return Math.max(0, Number(state.splitProcessingAmountCents || 0));
  }
  return Math.max(0, Number(state.remainingBalanceCents || 0));
}

function cardTipSelectionClass(state: PaymentPaneState, value: CardTipSelection): string {
  return state.cardTipSelection === value ? 'active' : '';
}

function cardTipControlsHtml(state: PaymentPaneState): string {
  const tipAmountCents = Math.max(0, Number(state.cardTipAmountCents || 0));

  return `
    <section class="lilpay-card-tip-panel lilpay-card-tip-panel-compact" aria-label="Card tip controls">
      <div class="lilpay-card-tip-amount-inline" aria-live="polite">Tip ${formatCents(tipAmountCents)}</div>
      <div class="lilpay-card-tip-grid" role="group" aria-label="Tip percentage presets">
        <button type="button" class="lilpay-sub-action" data-lilpay-card-tip-inc-percent="1">+1%</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'percent-10')}" data-lilpay-card-tip-percent="10">10%</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'percent-15')}" data-lilpay-card-tip-percent="15">15%</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'percent-20')}" data-lilpay-card-tip-percent="20">20%</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'custom')}" data-lilpay-card-tip-custom="1">Custom Amount</button>
      </div>

      <div class="lilpay-card-tip-grid" role="group" aria-label="Tip fixed amount presets">
        <button type="button" class="lilpay-sub-action" data-lilpay-card-tip-inc-fixed="100">+$1</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'fixed-5')}" data-lilpay-card-tip-fixed="500">$5</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'fixed-10')}" data-lilpay-card-tip-fixed="1000">$10</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'fixed-20')}" data-lilpay-card-tip-fixed="2000">$20</button>
        <button type="button" class="lilpay-sub-action ${cardTipSelectionClass(state, 'no-tip')}" data-lilpay-card-tip-none="1">No Tip</button>
      </div>

      ${state.cardTipCustomEditorOpen ? `
        <div class="lilpay-card-tip-editor" role="dialog" aria-modal="true" aria-label="Enter custom tip amount">
          <h4>Custom Tip Amount</h4>
          <div class="lilpay-amount-display">${formatCents(state.cardTipCustomEditorCents)}</div>
          <div class="lilpay-keypad" role="group" aria-label="Custom tip keypad">
            <button type="button" data-lilpay-card-tip-key="1">1</button>
            <button type="button" data-lilpay-card-tip-key="2">2</button>
            <button type="button" data-lilpay-card-tip-key="3">3</button>
            <button type="button" data-lilpay-card-tip-key="4">4</button>
            <button type="button" data-lilpay-card-tip-key="5">5</button>
            <button type="button" data-lilpay-card-tip-key="6">6</button>
            <button type="button" data-lilpay-card-tip-key="7">7</button>
            <button type="button" data-lilpay-card-tip-key="8">8</button>
            <button type="button" data-lilpay-card-tip-key="9">9</button>
            <button type="button" data-lilpay-card-tip-clear="1">Clear</button>
            <button type="button" data-lilpay-card-tip-key="0">0</button>
            <button type="button" data-lilpay-card-tip-backspace="1" aria-label="Backspace">⌫</button>
          </div>
          <div class="lilpay-card-tip-editor-actions">
            <button type="button" class="lilpay-sub-action" data-lilpay-card-tip-cancel="1">Cancel</button>
            <button type="button" class="lilpay-action-btn" data-lilpay-card-tip-confirm="1">Confirm</button>
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function cardPaymentPaneHtml(input: PaymentPaneInput, state: PaymentPaneState): string {
  const activeCards = (input.savedPaymentMethods || []).filter((c) => c.status === 'active');
  const selectedCard = activeCards.find((c) => c.savedPaymentMethodId === state.selectedSavedCardId) || null;
  const removingCard = activeCards.find((c) => c.savedPaymentMethodId === state.removingCardId) || null;
  const canRemove = input.canRemoveSavedCards !== false;
  const terminalCopy = cardStatusCopy(state.cardStatus);

  return `
    <section class="lilpay-center-card lilpay-card-pane" aria-label="Card payment controls">
      ${removingCard ? cofRemoveConfirmHtml(removingCard, state) : ''}
      ${activeCards.length > 0 ? cofSectionHtml(activeCards, state, canRemove) : ''}
      <div class="lilpay-card-consolidated-row">
        <div class="lilpay-card-consolidated-status">
          ${selectedCard
            ? cofSelectedCardStatusHtml(selectedCard, state)
            : `<div class="lilpay-cof-new-card-section${activeCards.length > 0 ? ' with-cof' : ''}">
                ${activeCards.length > 0 ? '<h3 class="lilpay-cof-new-card-title">Use New Card</h3>' : ''}
                <div class="lilpay-card-status ${terminalCopy.toneClass}">
                  <div class="lilpay-terminal-wrap">${cardTerminalIcon()}</div>
                  <div>
                    <div class="lilpay-card-title">${terminalCopy.title}</div>
                    <div class="lilpay-card-subtitle">${terminalCopy.subtitle}</div>
                    ${terminalCopy.showRetry ? '<button type="button" class="lilpay-sub-action" data-lilpay-card-retry="1">Retry</button>' : ''}
                  </div>
                </div>
              </div>`
          }
        </div>
        <div class="lilpay-card-consolidated-tip">
          ${cardTipControlsHtml(state)}
        </div>
      </div>
      <div class="lilpay-card-secondary-actions lilpay-card-secondary-actions-consolidated">
        ${selectedCard
          ? '<button type="button" class="lilpay-sub-action" data-lilpay-cof-select="" title="Use the physical card terminal instead">Use New Card Instead</button>'
          : '<button type="button" class="lilpay-sub-action" data-lilpay-manual-entry="1">Manual Entry</button>'
        }
      </div>
    </section>
  `;
}
