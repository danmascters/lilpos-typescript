/// <reference path="./payment-types.ts" />
/// <reference path="./split-payment-math.ts" />

function splitStatusClass(status: SplitPaymentPortionStatus): string {
  return String(status || 'PENDING').toLowerCase();
}

function splitMethodIcon(method: SplitPortionPaymentMethod): string {
  if (method === 'cash') return '$';
  if (method === 'card') return '\u25A3';
  return '\u25C7';
}

function splitPortionLineHtml(portion: SplitPaymentPortionRuntime, selectedPortionId: string | null): string {
  const selected = portion.id === selectedPortionId;
  const methodLabel = window.LilposSplitPaymentMath.splitDisplayMethodLabel(portion.paymentMethod);
  const amount = formatCents(portion.plannedAmountCents);
  const approvedAmount = formatCents(portion.approvedAmountCents || 0);
  const tipAmount = formatCents(portion.tipAmountCents || 0);
  const canEdit = portion.status === 'PENDING' || portion.status === 'DECLINED';
  const canProcess = canEdit;

  return `
    <div class="lilpay-split-portion ${selected ? 'selected' : ''} status-${splitStatusClass(portion.status)}" data-lilpay-split-portion-id="${portion.id}">
      <div class="lilpay-split-portion-main">
        <div class="lilpay-split-portion-left">
          <span class="lilpay-split-portion-seq">${portion.sequence}</span>
          <span class="lilpay-split-portion-method" aria-hidden="true">${splitMethodIcon(portion.paymentMethod)}</span>
          <span class="lilpay-split-portion-label">${methodLabel}</span>
        </div>
        <div class="lilpay-split-portion-right">
          <b>${amount}</b>
          <span class="lilpay-split-status-pill ${splitStatusClass(portion.status)}">${portion.status.replace(/_/g, ' ')}</span>
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
          <button type="button" class="lilpay-sub-action" data-lilpay-split-select="${portion.id}">Select</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-split-remove="${portion.id}">Remove</button>
          <button type="button" class="lilpay-action-btn lilpay-split-process-btn" data-lilpay-split-process="${portion.id}" ${canProcess ? '' : 'disabled'}>Process</button>
        </div>
      ` : ''}
      ${portion.status === 'DECLINED' ? `
        <div class="lilpay-split-decline-actions">
          <button type="button" class="lilpay-sub-action" data-lilpay-split-retry="${portion.id}">Try Again</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-split-method="${portion.id}:card">Use Another Card</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-split-method="${portion.id}:cash">Change to Cash</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-split-select="${portion.id}">Change Amount</button>
        </div>
      ` : ''}
    </div>
  `;
}

function splitEvenCountButtonsHtml(current: number): string {
  const options = [2, 3, 4, 5, 6];
  return options.map((value) => `
    <button type="button" class="lilpay-sub-action ${current === value ? 'active' : ''}" data-lilpay-split-even-count="${value}">${value}</button>
  `).join('');
}

function splitPaymentPaneHtml(input: PaymentPaneInput, state: PaymentPaneState): string {
  const workspace = state.splitWorkspace || window.LilposSplitPaymentState.createSplitWorkspace(input);
  const selectedPortion = workspace.portions.find((portion) => portion.id === workspace.selectedPortionId) || null;
  const selectedAmount = selectedPortion ? selectedPortion.plannedAmountCents : workspace.remainingCents;

  return `
    <section class="lilpay-center-card lilpay-split-pane" aria-label="Split payment workspace">
      <div class="lilpay-split-header">
        <div><span>Order Total</span><b>${formatCents(workspace.originalBalanceCents)}</b></div>
        <div><span>Paid So Far</span><b>${formatCents(workspace.paidCents)}</b></div>
        <div class="lilpay-split-remaining"><span>Remaining Balance</span><b>${formatCents(workspace.remainingCents)}</b></div>
      </div>

      <div class="lilpay-split-mode-row" role="group" aria-label="Split mode">
        <button type="button" class="lilpay-sub-action ${workspace.mode === 'CUSTOM' ? 'active' : ''}" data-lilpay-split-mode="CUSTOM">Split by Amount</button>
        <button type="button" class="lilpay-sub-action ${workspace.mode === 'EVEN' ? 'active' : ''}" data-lilpay-split-mode="EVEN">Split Evenly</button>
      </div>

      ${workspace.mode === 'EVEN' ? `
        <div class="lilpay-split-even-row">
          ${splitEvenCountButtonsHtml(workspace.requestedPaymentCount)}
          <button type="button" class="lilpay-action-btn" data-lilpay-split-generate-even="1">Generate Even Split</button>
        </div>
      ` : `
        <div class="lilpay-split-custom-row">
          <label for="lilpaySplitAmount">Next Amount</label>
          <input id="lilpaySplitAmount" type="text" inputmode="decimal" data-keyboard-kind="decimal" value="${formatCents(workspace.amountEditorCents)}" data-lilpay-split-amount="1" />
          <div class="lilpay-split-method-select">
            <button type="button" class="lilpay-sub-action" data-lilpay-split-add="cash">Cash</button>
            <button type="button" class="lilpay-sub-action" data-lilpay-split-add="card">Credit</button>
            <button type="button" class="lilpay-sub-action" data-lilpay-split-add="other">Other</button>
          </div>
        </div>
      `}

      <div class="lilpay-split-plan-list">
        ${workspace.portions.map((portion) => splitPortionLineHtml(portion, workspace.selectedPortionId)).join('')}
      </div>

      ${selectedPortion ? `
        <div class="lilpay-split-next-methods">
          <span>Pay ${formatCents(selectedAmount)} with:</span>
          <button type="button" class="lilpay-sub-action ${selectedPortion.paymentMethod === 'cash' ? 'active' : ''}" data-lilpay-split-method="${selectedPortion.id}:cash">Cash</button>
          <button type="button" class="lilpay-sub-action ${selectedPortion.paymentMethod === 'card' ? 'active' : ''}" data-lilpay-split-method="${selectedPortion.id}:card">Credit</button>
          <button type="button" class="lilpay-sub-action ${selectedPortion.paymentMethod === 'other' ? 'active' : ''}" data-lilpay-split-method="${selectedPortion.id}:other">Other</button>
        </div>
      ` : ''}

      <div class="lilpay-split-footnote">Each approved portion is recorded as its own payment record. Tips on cards are tracked per transaction.</div>
    </section>
  `;
}
