/// <reference path="./payment-types.ts" />

function textPaymentLinkStatusCopy(status: TextPaymentLinkStatus): { title: string; detail: string; toneClass: string } {
  if (status === 'sending') return { title: 'Sending', detail: 'Sending the payment link by SMS.', toneClass: 'sending' };
  if (status === 'sent') return { title: 'Link sent', detail: 'The customer has the link. Await payment activity.', toneClass: 'sent' };
  if (status === 'pending') return { title: 'Payment pending', detail: 'The link was sent. The order remains unpaid until payment is confirmed.', toneClass: 'pending' };
  if (status === 'paid') return { title: 'Paid', detail: 'Payment was confirmed. You can complete the order now.', toneClass: 'paid' };
  if (status === 'failed') return { title: 'Failed to send', detail: 'The SMS link did not send. Verify the phone and try again.', toneClass: 'failed' };
  if (status === 'expired') return { title: 'Link expired', detail: 'Send a fresh payment link when the customer is ready.', toneClass: 'expired' };
  return { title: 'Ready to send', detail: 'Send a secure payment link by text. This does not mark the order as paid.', toneClass: 'ready' };
}

function textPaymentLinkPaneHtml(state: PaymentPaneState): string {
  const copy = textPaymentLinkStatusCopy(state.textPaymentLinkStatus);
  const phoneDisplay = formatPhoneDigits(state.textPaymentLinkPhoneDigits);
  const showStatusControls = state.textPaymentLinkStatus === 'sent' || state.textPaymentLinkStatus === 'pending' || state.textPaymentLinkStatus === 'paid' || state.textPaymentLinkStatus === 'failed' || state.textPaymentLinkStatus === 'expired';

  return `
    <section class="lilpay-center-card lilpay-text-link-pane" aria-label="Text payment link controls">
      <div class="lilpay-text-link-status ${copy.toneClass}">
        <div class="lilpay-text-link-status-title">${copy.title}</div>
        <div class="lilpay-text-link-status-detail">${copy.detail}</div>
      </div>

      <div class="lilpay-text-link-form">
        <label class="lilpay-text-link-label" for="lilpay-text-link-phone">Mobile Number</label>
        <input
          id="lilpay-text-link-phone"
          class="lilpay-text-link-input"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          data-kbd-context="customer-profile-phone"
          data-lilpay-text-phone="1"
          value="${phoneDisplay}"
          placeholder="(555) 123-4567"
        />
      </div>

      <p class="lilpay-muted-note">The order stays unpaid until LilPOS confirms the remote payment result.</p>

      ${showStatusControls ? `
        <div class="lilpay-text-link-actions">
          <button type="button" class="lilpay-sub-action" data-lilpay-text-status="pending">Payment Pending</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-text-status="paid">Mark Paid</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-text-status="failed">Mark Failed</button>
          <button type="button" class="lilpay-sub-action" data-lilpay-text-status="expired">Expire Link</button>
        </div>
      ` : ''}
    </section>
  `;
}