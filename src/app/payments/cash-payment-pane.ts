/// <reference path="./payment-types.ts" />

function cashPaymentPaneHtml(state: PaymentPaneState): string {
  const dueCents = state.splitProcessingAmountCents > 0
    ? Math.max(0, Number(state.splitProcessingAmountCents || 0))
    : state.remainingBalanceCents;
  const insufficient = state.cashReceivedCents < dueCents;
  const quickAmounts = buildCashQuickAmounts(dueCents);
  return `
    <section class="lilpay-center-card lilpay-cash-pane" aria-label="Cash payment controls">
      <div class="lilpay-cash-grid">
        <div class="lilpay-cash-col">
          <h3>Cash Received</h3>
          <div class="lilpay-amount-display">${formatCents(state.cashReceivedCents)}</div>
          <div class="lilpay-keypad" role="group" aria-label="Cash keypad">
            <button type="button" data-lilpay-key="1">1</button>
            <button type="button" data-lilpay-key="2">2</button>
            <button type="button" data-lilpay-key="3">3</button>
            <button type="button" data-lilpay-key="4">4</button>
            <button type="button" data-lilpay-key="5">5</button>
            <button type="button" data-lilpay-key="6">6</button>
            <button type="button" data-lilpay-key="7">7</button>
            <button type="button" data-lilpay-key="8">8</button>
            <button type="button" data-lilpay-key="9">9</button>
            <button type="button" data-lilpay-key="0">0</button>
            <button type="button" data-lilpay-key="00">00</button>
            <div class="lilpay-keypad-split" role="group" aria-label="Cash edit controls">
              <button type="button" data-lilpay-key="backspace" aria-label="Backspace">⌫</button>
              <button type="button" class="lilpay-keypad-clear" data-lilpay-key="clear" aria-label="Clear amount">C</button>
            </div>
          </div>
        </div>
        <div class="lilpay-cash-col">
          <h3>Quick Amounts</h3>
          <div class="lilpay-quick-row" role="group" aria-label="Quick cash amounts">
            ${quickAmounts.map((cents) => `<button type="button" data-lilpay-quick="${cents}">${formatWholeDollarCents(cents)}</button>`).join('')}
          </div>
          <div class="lilpay-divider"></div>
          <h3>Change Due</h3>
          <div class="lilpay-change-due">${formatCents(state.changeDueCents)}</div>
          <p class="lilpay-muted-note">Cash drawer will open when you complete the sale.</p>
          ${insufficient ? `<p class="lilpay-error-note">Cash received must cover the selected payment amount.</p>` : ''}
        </div>
      </div>
    </section>
  `;
}
