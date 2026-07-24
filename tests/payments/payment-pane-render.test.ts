import { describe, it, expect } from 'vitest';

declare const createStateFromInput: (input: any) => any;
declare const renderPane: (input: any, state: any) => string;

describe('payment pane render', () => {
  const input = {
    displayOrderNumber: '1-00042',
    orderTypeLabel: 'To-Go',
    stationName: 'Main Station',
    subtotalCents: 2499,
    taxCents: 206,
    totalCents: 2705,
    paymentsAppliedCents: 0,
    remainingBalanceCents: 2705,
    customer: { name: 'Jane Smith', phone: '(555) 123-4567' },
    items: [{ name: 'Large Pepperoni Pizza', qty: 1, priceCents: 1899 }],
    orderType: 'togo',
    selectedMethod: 'cash'
  };

  it('renders payment pane shell and order details', () => {
    const state = createStateFromInput(input);
    const html = renderPane(input, state);
    expect(html).toContain('Take Payment');
    expect(html).toContain('Order 1-42');
    expect(html).toContain('Balance Due');
    expect(html).toContain('$28');
    expect(html).toContain('$30');
    expect(html).toContain('Complete Cash Sale');
  });

  it('renders card status when method switched', () => {
    const state = { ...createStateFromInput(input), selectedPaymentMethod: 'card' };
    const html = renderPane(input, state);
    expect(html).toContain('Ready for card');
    expect(html).toContain('Tap / Insert / Swipe');
    expect(html).toContain('Charge Card & Complete');
    expect(html).toContain('Tip $0.00');
    expect(html).toContain('No Tip');
    expect(html).toContain('Custom Amount');
  });

  it('renders soft terminal manual card entry when manual mode is active', () => {
    const state = {
      ...createStateFromInput(input),
      selectedPaymentMethod: 'card',
      cardEntryMode: 'manual',
      manualCardEntryField: 'pan'
    };
    const html = renderPane(input, state);
    expect(html).toContain('Soft card terminal for manual entry');
    expect(html).toContain('data-lilpay-manual-key="1"');
    expect(html).toContain('data-lilpay-manual-field="pan"');
    expect(html).toContain('Use Physical Terminal');
  });

  it('renders card tip value in consolidated controls and top balance summary', () => {
    const state = {
      ...createStateFromInput(input),
      selectedPaymentMethod: 'card',
      cardTipFixedCents: 500,
      cardTipPercentBasisPoints: 0,
      cardTipAmountCents: 500,
      cardTipSelection: 'fixed-5'
    };
    const html = renderPane(input, state);
    expect(html).toContain('Tip $5.00');
    expect(html).toContain('Tip Amount');
    expect(html).toContain('lilpay-balance-tip-value">$5.00');
  });

  it('card mode balance due reflects selected tip amount dynamically', () => {
    const state = {
      ...createStateFromInput(input),
      selectedPaymentMethod: 'card',
      cardTipFixedCents: 500,
      cardTipPercentBasisPoints: 0,
      cardTipAmountCents: 500,
      cardTipSelection: 'fixed-5'
    };
    const html = renderPane(input, state);
    expect(html).toContain('<div class="lilpay-balance-value">$32.05</div>');
  });

  it('renders text payment link workflow and status copy', () => {
    const state = {
      ...createStateFromInput(input),
      selectedPaymentMethod: 'text-payment-link',
      textPaymentLinkStatus: 'ready'
    };
    const html = renderPane(input, state);
    expect(html).toContain('Text a Payment Link');
    expect(html).toContain('Ready to send');
    expect(html).toContain('(555) 123-4567');
    expect(html).toContain('Text Payment Link');
  });

  it('renders Card on File section when customer has saved cards', () => {
    const inputWithCards = {
      ...input,
      savedPaymentMethods: [
        { savedPaymentMethodId: 'pm_001', customerId: 'cust_001', cardBrand: 'visa', lastFour: '4242', expirationMonth: 8, expirationYear: 2028, status: 'active', lastUsedAt: '2026-07-10T14:23:00Z' }
      ],
      canRemoveSavedCards: true
    };
    const state = { ...createStateFromInput(inputWithCards), selectedPaymentMethod: 'card' };
    const html = renderPane(inputWithCards, state);
    expect(html).toContain('Card on File');
    expect(html).toContain('4242');
    expect(html).toContain('Expires 08/28');
    expect(html).toContain('VISA');
  });

  it('shows COF primary action label when a saved card is selected', () => {
    const inputWithCards = {
      ...input,
      savedPaymentMethods: [
        { savedPaymentMethodId: 'pm_001', customerId: 'cust_001', cardBrand: 'visa', lastFour: '4242', expirationMonth: 8, expirationYear: 2028, status: 'active' }
      ]
    };
    const state = {
      ...createStateFromInput(inputWithCards),
      selectedPaymentMethod: 'card',
      selectedSavedCardId: 'pm_001'
    };
    const html = renderPane(inputWithCards, state);
    expect(html).toContain('Charge Visa');
    expect(html).toContain('4242');
    expect(html).not.toContain('Charge Card & Complete');
  });

  it('does not show Card on File section when customer has no saved cards', () => {
    const state = { ...createStateFromInput(input), selectedPaymentMethod: 'card' };
    const html = renderPane(input, state);
    expect(html).not.toContain('Card on File');
    expect(html).toContain('Ready for card');
  });

  it('renders remove confirmation overlay when removingCardId is set', () => {
    const inputWithCards = {
      ...input,
      savedPaymentMethods: [
        { savedPaymentMethodId: 'pm_001', customerId: 'cust_001', cardBrand: 'mastercard', lastFour: '5187', expirationMonth: 11, expirationYear: 2027, status: 'active' }
      ],
      canRemoveSavedCards: true
    };
    const state = {
      ...createStateFromInput(inputWithCards),
      selectedPaymentMethod: 'card',
      removingCardId: 'pm_001'
    };
    const html = renderPane(inputWithCards, state);
    expect(html).toContain('Remove saved card?');
    expect(html).toContain('5187');
    expect(html).toContain('Mastercard');
  });

  it('cash mode renders footer Exact Change button with lilpay-quick-exact class', () => {
    const state = createStateFromInput(input);
    const html = renderPane(input, state);
    expect(html).toContain('lilpay-quick-exact');
    expect(html).toContain('data-lilpay-quick="exact"');
    expect(html).toContain('Exact Change $27.05');
    expect(html).toContain('Complete Cash Sale');
  });
});
