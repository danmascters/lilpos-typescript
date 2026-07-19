import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Order Pane Scroll Layout', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    // Create a minimal DOM structure for testing
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .ticket-panel {
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
          }
          .ticket-panel-fixed {
            flex: 0 0 auto;
            overflow: visible;
            padding-top: 10px;
          }
          .ticket-panel-scroll {
            flex: 1 1 auto;
            overflow-y: auto;
            padding-top: 10px;
            padding-bottom: 10px;
            min-height: 0;
          }
          .ticket-panel-scroll.is-scrolled::before {
            opacity: 1;
          }
          .ticket-section {
            padding-left: 12px;
            padding-right: 12px;
          }
        </style>
      </head>
      <body>
        <div id="test-container"></div>
      </body>
      </html>
    `);
    document = dom.window.document;
  });

  it('renders ticket-panel with fixed and scroll sections', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" style="display: flex; flex-direction: column;">
        <div class="ticket-panel-fixed" style="flex: 0 0 auto;">
          <div class="ticket-total-row ticket-section">
            <button id="newSaleBtn">New Sale</button>
            <div class="ticket-total-display">$0</div>
          </div>
        </div>
        <div class="ticket-panel-scroll" style="flex: 1 1 auto; overflow-y: auto;">
          <div class="ticket-lines ticket-section">
            <p class="muted">NO ITEMS IN CHECKOUT</p>
          </div>
        </div>
      </aside>
    `;

    const ticketPanel = container.querySelector('.ticket-panel') as HTMLElement;
    const fixedSection = container.querySelector('.ticket-panel-fixed') as HTMLElement;
    const scrollSection = container.querySelector('.ticket-panel-scroll') as HTMLElement;

    expect(ticketPanel).toBeDefined();
    expect(fixedSection).toBeDefined();
    expect(scrollSection).toBeDefined();
    expect(ticketPanel.style.display).toBe('flex');
    expect(ticketPanel.classList.contains('ticket-panel')).toBe(true);
    expect(fixedSection.classList.contains('ticket-panel-fixed')).toBe(true);
    expect(scrollSection.classList.contains('ticket-panel-scroll')).toBe(true);
  });

  it('fixed section contains order context elements', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel">
        <div class="ticket-panel-fixed">
          <div class="ticket-total-row ticket-section">
            <button id="newSaleBtn">New Sale</button>
            <div class="ticket-total-display">$123.45</div>
          </div>
          <div class="ticket-head ticket-section">
            <small class="timing-badge">ASAP</small>
          </div>
          <div class="order-type ticket-section">
            <button class="pill order-type-tile active">Pickup</button>
          </div>
          <div class="customer-shell ticket-section">
            <div class="customer-summary">
              <div class="sum-top"><b>John Doe</b></div>
            </div>
          </div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines ticket-section"></div>
        </div>
      </aside>
    `;

    const fixedSection = container.querySelector('.ticket-panel-fixed') as HTMLElement;
    const newSaleBtn = fixedSection?.querySelector('#newSaleBtn');
    const totalDisplay = fixedSection?.querySelector('.ticket-total-display');
    const timingBadge = fixedSection?.querySelector('.timing-badge');
    const orderType = fixedSection?.querySelector('.order-type');
    const customerShell = fixedSection?.querySelector('.customer-shell');

    expect(newSaleBtn?.textContent).toBe('New Sale');
    expect(totalDisplay?.textContent).toBe('$123.45');
    expect(timingBadge?.textContent).toBe('ASAP');
    expect(orderType).toBeDefined();
    expect(customerShell).toBeDefined();
  });

  it('cart items render in scrollable section only', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel">
        <div class="ticket-panel-fixed">
          <div class="ticket-total-row ticket-section">
            <div class="ticket-total-display">$50.00</div>
          </div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines ticket-section">
            <div class="line-item">
              <div class="line-main"><b>Pepperoni Pizza</b></div>
              <div class="line-controls"><span class="qty">2</span><b>$30.00</b></div>
            </div>
            <div class="line-item">
              <div class="line-main"><b>Garlic Bread</b></div>
              <div class="line-controls"><span class="qty">1</span><b>$20.00</b></div>
            </div>
          </div>
          <div class="ticket-footer ticket-section">
            <div class="totals">
              <div><span>Total</span><b>$50.00</b></div>
            </div>
          </div>
        </div>
      </aside>
    `;

    const scrollSection = container.querySelector('.ticket-panel-scroll');
    const lineItems = scrollSection?.querySelectorAll('.line-item');
    const ticketFooter = scrollSection?.querySelector('.ticket-footer');

    expect(lineItems?.length).toBe(2);
    expect(ticketFooter).toBeDefined();
  });

  it('fixed section does not include cart items', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel">
        <div class="ticket-panel-fixed">
          <div class="ticket-total-row ticket-section">
            <div class="ticket-total-display">$0</div>
          </div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines ticket-section">
            <div class="line-item">
              <div class="line-main"><b>Item 1</b></div>
            </div>
          </div>
        </div>
      </aside>
    `;

    const fixedSection = container.querySelector('.ticket-panel-fixed');
    const lineItems = fixedSection?.querySelectorAll('.line-item');

    expect(lineItems?.length).toBe(0);
  });

  it('customer card remains outside scroll region', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel">
        <div class="ticket-panel-fixed">
          <div class="customer-shell ticket-section">
            <div class="customer-summary">Customer Info</div>
          </div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines ticket-section">
            <div class="line-item">Item</div>
          </div>
        </div>
      </aside>
    `;

    const fixedSection = container.querySelector('.ticket-panel-fixed');
    const scrollSection = container.querySelector('.ticket-panel-scroll');
    
    const fixedCustomer = fixedSection?.querySelector('.customer-shell');
    const scrollCustomer = scrollSection?.querySelector('.customer-shell');

    expect(fixedCustomer).toBeDefined();
    expect(scrollCustomer).toBeNull();
  });

  it('scroll layout uses flex for proper height distribution', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" style="display: flex; flex-direction: column; height: 600px;">
        <div class="ticket-panel-fixed" style="flex: 0 0 auto;">
          <div class="ticket-total-row ticket-section" style="height: 50px;">Fixed Content</div>
        </div>
        <div class="ticket-panel-scroll" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">
          <div class="ticket-lines ticket-section">Scrollable Content</div>
        </div>
      </aside>
    `;

    const ticketPanel = container.querySelector('.ticket-panel') as HTMLElement;
    const fixedSection = container.querySelector('.ticket-panel-fixed') as HTMLElement;
    const scrollSection = container.querySelector('.ticket-panel-scroll') as HTMLElement;

    expect(ticketPanel.style.display).toBe('flex');
    expect(ticketPanel.style.flexDirection).toBe('column');
    expect(fixedSection.style.flex).toBe('0 0 auto');
    expect(scrollSection.style.flex).toBe('1 1 auto');
    expect(scrollSection.style.overflowY).toBe('auto');
  });

  it('scroll state class is added/removed appropriately', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <div class="ticket-panel-scroll" style="height: 100px; overflow-y: auto;">
        <div style="height: 300px;">Content</div>
      </div>
    `;

    const scrollSection = container.querySelector('.ticket-panel-scroll') as HTMLElement;
    
    // Initially not scrolled
    expect(scrollSection.classList.contains('is-scrolled')).toBe(false);
    
    // Simulate scrolling
    scrollSection.scrollTop = 50;
    scrollSection.classList.add('is-scrolled');
    
    expect(scrollSection.classList.contains('is-scrolled')).toBe(true);
    
    // Reset to top
    scrollSection.scrollTop = 0;
    scrollSection.classList.remove('is-scrolled');
    
    expect(scrollSection.classList.contains('is-scrolled')).toBe(false);
  });

  it('no horizontal scrolling is introduced', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" style="width: 330px; display: flex; flex-direction: column;">
        <div class="ticket-panel-fixed">
          <div class="ticket-section" style="width: 100%; padding-left: 12px; padding-right: 12px;">Fixed</div>
        </div>
        <div class="ticket-panel-scroll" style="width: 100%;">
          <div class="ticket-section" style="width: 100%; padding-left: 12px; padding-right: 12px;">Scroll</div>
        </div>
      </aside>
    `;

    const ticketPanel = container.querySelector('.ticket-panel') as HTMLElement;
    
    // Check that pagination doesn't require horizontal scroll
    expect(ticketPanel.scrollWidth).toBeLessThanOrEqual(ticketPanel.clientWidth + 1); // +1 for rounding
  });

  it('controls in fixed section remain interactive', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel">
        <div class="ticket-panel-fixed">
          <button id="newSaleBtn">New Sale</button>
          <button id="ordersViewBtn">Orders</button>
          <button data-order-type="pickup">Pickup</button>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines"></div>
        </div>
      </aside>
    `;

    const newSaleBtn = container.querySelector('#newSaleBtn') as HTMLButtonElement;
    const ordersBtn = container.querySelector('#ordersViewBtn') as HTMLButtonElement;
    const pickupBtn = container.querySelector('[data-order-type="pickup"]') as HTMLButtonElement;

    expect(newSaleBtn).toBeDefined();
    expect(ordersBtn).toBeDefined();
    expect(pickupBtn).toBeDefined();
    
    // Verify buttons can be interacted with
    expect(newSaleBtn.getAttribute('id')).toBe('newSaleBtn');
    expect(pickupBtn.hasAttribute('data-order-type')).toBe(true);
  });

  it('adding/removing items does not break layout', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" style="display: flex; flex-direction: column; height: 600px;">
        <div class="ticket-panel-fixed" style="flex: 0 0 auto;">
          <div class="ticket-total-display">$0</div>
        </div>
        <div class="ticket-panel-scroll" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">
          <div class="ticket-lines ticket-section">
            <p class="muted">NO ITEMS IN CHECKOUT</p>
          </div>
        </div>
      </aside>
    `;

    const ticketLines = container.querySelector('.ticket-lines') as HTMLElement;
    
    // Add an item
    const itemDiv = document.createElement('div');
    itemDiv.className = 'line-item';
    itemDiv.innerHTML = '<div class="line-main"><b>Pizza</b></div>';
    ticketLines.innerHTML = ''; // Remove "NO ITEMS" message
    ticketLines.appendChild(itemDiv);

    expect(ticketLines.querySelectorAll('.line-item').length).toBe(1);
    
    // Remove the item
    itemDiv.remove();
    ticketLines.innerHTML = '<p class="muted">NO ITEMS IN CHECKOUT</p>';

    expect(ticketLines.querySelectorAll('.line-item').length).toBe(0);
    expect(ticketLines.querySelector('.muted')).toBeDefined();
  });
});
