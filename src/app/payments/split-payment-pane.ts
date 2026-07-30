/// <reference path="./payment-types.ts" />
/// <reference path="./split-payment-math.ts" />

function splitStatusClass(status: SplitPaymentPortionStatus): string {
  return String(status || 'PENDING').toLowerCase();
}

function splitMethodIcon(method: SplitPortionPaymentMethod): string {
  if (method === 'cash') {
    return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M15 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1 1.8 3 2.2 3 1 3 2.3-1.3 2.4-3 2.4c-1.3 0-2.5-.4-3.4-1.2M12 5.5v13"></path></svg>';
  }
  if (method === 'card') {
    return '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"></rect><path d="M3 10h18M7 15h4"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24"><path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5z"></path><path d="M8.5 12h7M12 8.5v7"></path></svg>';
}

function splitNextPaymentMethod(method: SplitPortionPaymentMethod): SplitPortionPaymentMethod {
  if (method === 'cash') return 'card';
  if (method === 'card') return 'other';
  return 'cash';
}

function splitPortionLineHtml(
  portion: SplitPaymentPortionRuntime,
  selectedPortionId: string | null,
  editableCount: number,
  approvedCount: number
): string {
  const selected = portion.id === selectedPortionId;
  const methodLabel = portion.status === 'APPROVED' && portion.finalPaymentMethodLabel
    ? portion.finalPaymentMethodLabel
    : window.LilposSplitPaymentMath.splitDisplayMethodLabel(portion.paymentMethod);
  const amount = formatCents(portion.plannedAmountCents);
  const approvedAmount = formatCents(portion.approvedAmountCents || 0);
  const tipAmount = formatCents(portion.tipAmountCents || 0);
  const canEdit = portion.status === 'PENDING' || portion.status === 'DECLINED';
  const canProcess = canEdit;
  const canRemove = canEdit && !(approvedCount === 0 && editableCount <= 2);
  const statusLabel = portion.status === 'APPROVED' ? 'PAID' : portion.status.replace(/_/g, ' ');
  const nextMethodLabel = window.LilposSplitPaymentMath.splitDisplayMethodLabel(splitNextPaymentMethod(portion.paymentMethod));
  const methodControl = canEdit
    ? `<button type="button" class="lilpay-split-method-choice" data-lilpay-split-cycle-method="${portion.id}" aria-label="Payment type ${methodLabel}. Tap to change to ${nextMethodLabel}">
        <span class="lilpay-split-portion-method" aria-hidden="true">${splitMethodIcon(portion.paymentMethod)}</span>
        <span class="lilpay-split-portion-label">${methodLabel}</span>
      </button>`
    : `<span class="lilpay-split-method-choice is-locked">
        <span class="lilpay-split-portion-method" aria-hidden="true">${splitMethodIcon(portion.paymentMethod)}</span>
        <span class="lilpay-split-portion-label">${methodLabel}</span>
      </span>`;

  return `
    <div class="lilpay-split-portion ${selected ? 'selected' : ''} status-${splitStatusClass(portion.status)}" data-lilpay-split-portion-id="${portion.id}">
      <div class="lilpay-split-portion-main">
        <div class="lilpay-split-portion-left">
          <span class="lilpay-split-portion-seq">${portion.sequence}</span>
          ${methodControl}
        </div>
        <div class="lilpay-split-portion-right">
          <b class="lilpay-split-portion-amount">${amount}</b>
          <span class="lilpay-split-status-pill ${splitStatusClass(portion.status)}">${statusLabel}</span>
        </div>
      </div>
      ${portion.status === 'APPROVED' ? `
        <div class="lilpay-split-approved-details">
          <small>Approved ${approvedAmount}</small>
          ${portion.tipAmountCents > 0 ? `<small>Tip ${tipAmount}</small>` : ''}
          ${portion.cardBrand && portion.cardLast4 ? `<small>${portion.cardBrand} •••• ${portion.cardLast4}</small>` : ''}
        </div>
      ` : ''}
      ${portion.failureMessage ? `<div class="lilpay-split-failure">${portion.failureMessage}</div>` : ''}
      ${canEdit ? `
        <div class="lilpay-split-portion-actions">
          <button type="button" class="lilpay-action-btn lilpay-split-process-btn" data-lilpay-split-process="${portion.id}" ${canProcess ? '' : 'disabled'}>Process</button>
          <button type="button" class="lilpay-split-remove-btn" data-lilpay-split-remove="${portion.id}" aria-label="Remove payment portion ${portion.sequence}" title="Remove payment portion" ${canRemove ? '' : 'disabled'}>×</button>
        </div>
      ` : ''}
      ${portion.status === 'DECLINED' ? `
        <div class="lilpay-split-decline-actions">
          <button type="button" class="lilpay-sub-action" data-lilpay-split-retry="${portion.id}">Try Again</button>
        </div>
      ` : ''}
    </div>
  `;
}

function splitEvenCountJoggerHtml(current: number): string {
  const value = Math.max(2, Math.min(50, Math.round(Number(current || 2))));
  return `
    <div class="lilpay-split-even-jogger" role="group" aria-label="Number of equal payments">
      <button type="button" class="lilpay-split-even-adjust" data-lilpay-split-even-adjust="-1" aria-label="Remove one split payment row" ${value <= 2 ? 'disabled' : ''}>−</button>
      <output class="lilpay-split-even-value" data-lilpay-split-even-value="${value}" aria-live="polite" aria-label="${value} equal payments">${value}</output>
      <button type="button" class="lilpay-split-even-adjust" data-lilpay-split-even-adjust="1" aria-label="Add one split payment row" ${value >= 50 ? 'disabled' : ''}>+</button>
    </div>
  `;
}

function splitPaymentPaneHtml(input: PaymentPaneInput, state: PaymentPaneState): string {
  const workspace = state.splitWorkspace || window.LilposSplitPaymentState.createSplitWorkspace(input);
  const editableCount = workspace.portions.filter((portion) => portion.status === 'PENDING' || portion.status === 'DECLINED').length;
  const approvedCount = workspace.portions.filter((portion) => portion.status === 'APPROVED').length;

  return `
    <section class="lilpay-center-card lilpay-split-pane" aria-label="Split payment workspace">
      <div class="lilpay-split-header">
        <div><span>Order Total</span><b>${formatCents(workspace.originalBalanceCents)}</b></div>
        <div><span>Paid So Far</span><b>${formatCents(workspace.paidCents)}</b></div>
        <div class="lilpay-split-remaining"><span>Remaining Balance</span><b>${formatCents(workspace.remainingCents)}</b></div>
      </div>

      <div class="lilpay-split-even-row" role="group" aria-label="Split balance evenly">
        ${splitEvenCountJoggerHtml(workspace.requestedPaymentCount)}
        <button type="button" class="lilpay-sub-action ${workspace.mode === 'EVEN' ? 'active' : ''}" data-lilpay-split-mode="EVEN">Split Balance Evenly</button>
      </div>

      <div class="lilpay-split-plan-list">
        ${workspace.portions.map((portion) => splitPortionLineHtml(portion, workspace.selectedPortionId, editableCount, approvedCount)).join('')}
      </div>

      <div class="lilpay-split-footnote">Each approved portion is recorded as its own payment record. Tips on cards are tracked per transaction.</div>
    </section>
  `;
}
