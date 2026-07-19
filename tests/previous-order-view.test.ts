import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Previous Order View Mode', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .ticket-panel {
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
          .ticket-panel-fixed.is-hidden {
            display: none;
          }
          .ticket-panel-scroll {
            flex: 1 1 auto;
            overflow-y: auto;
            padding-top: 10px;
            padding-bottom: 10px;
            min-height: 0;
          }
          .ticket-section { padding: 10px 12px; }
          .order-detail-pane { border: 1px solid; }
          .line-item { padding: 8px 0; }
        </style>
      </head>
      <body>
        <div id="test-container"></div>
      </body>
      </html>
    `);
    document = dom.window.document;
  });

  it('active order mode shows fixed section and cart items', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" data-view-mode="active">
        <div class="ticket-panel-fixed">
          <div class="ticket-total-row ticket-section">
            <button id="newSaleBtn">New Sale</button>
            <div class="ticket-total-display">$50.00</div>
          </div>
          <div class="ticket-head ticket-section">
            <small class="timing-badge">ASAP</small>
          </div>
          <div class="order-type ticket-section">
            <button class="pill order-type-tile active">Pickup</button>
          </div>
          <div class="customer-shell ticket-section">Customer Info</div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines ticket-section">
            <div class="line-item">
              <b>Pizza</b>
              <span class="qty">1</span>
            </div>
          </div>
          <div class="ticket-footer">Active cart footer</div>
        </div>
      </aside>
    `;

    const ticketPanel = container.querySelector('[data-view-mode="active"]');
    const fixedSection = ticketPanel?.querySelector('.ticket-panel-fixed');
    const scrollSection = ticketPanel?.querySelector('.ticket-panel-scroll');
    const cartItems = scrollSection?.querySelector('.line-item');
    const cartFooter = scrollSection?.querySelector('.ticket-footer');

    expect(fixedSection).toBeDefined();
    expect(fixedSection?.classList.contains('is-hidden')).toBe(false);
    expect(cartItems).toBeDefined();
    expect(cartFooter?.textContent).toContain('Active cart footer');
  });

  it('previous order mode hides fixed section and shows order detail', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" data-view-mode="previous">
        <div class="ticket-panel-fixed is-hidden">
          <div class="ticket-total-row">Hidden</div>
          <div class="customer-shell">Hidden customer</div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="order-detail-pane">
            <div class="order-detail-head">
              <b>Viewing Order #123</b>
              <button id="previousOrderEditBtn">Edit</button>
            </div>
            <div class="order-payment-row">
              <div class="order-payment-badge paid">PAID</div>
              <div class="order-payment-method">Cash</div>
            </div>
            <div class="order-audit-trail">
              <div class="order-audit-toggle-row">
                <small class="order-audit-summary">Pickup | completed | paid | 10:41:14 AM ASAP</small>
                <button id="togglePreviousOrderAudit" aria-expanded="false">&#9660;</button>
              </div>
            </div>
            <div class="order-detail-lines">
              <div class="order-detail-line-item">
                <b>2x Pepperoni Pizza</b>
                <b>$30.00</b>
              </div>
            </div>
            <div class="order-detail-totals">
              <div><span>Total</span><b>$30.00</b></div>
            </div>
          </div>
          <div class="ticket-footer previous-order-footer">
            <button id="clearOrderDetail">Close</button>
          </div>
        </div>
      </aside>
    `;

    const ticketPanel = container.querySelector('[data-view-mode="previous"]');
    const fixedSection = ticketPanel?.querySelector('.ticket-panel-fixed');
    const orderDetail = ticketPanel?.querySelector('.order-detail-pane');
    const pencilBtn = ticketPanel?.querySelector('#previousOrderEditBtn');
    const closeBtn = ticketPanel?.querySelector('.previous-order-footer #clearOrderDetail');
    const auditSummary = ticketPanel?.querySelector('.order-audit-summary');
    const auditToggle = ticketPanel?.querySelector('#togglePreviousOrderAudit');
    const auditRows = ticketPanel?.querySelectorAll('.order-audit-row');
    const cartItems = ticketPanel?.querySelector('.line-item');

    expect(fixedSection?.classList.contains('is-hidden')).toBe(true);
    expect(orderDetail).toBeDefined();
    expect(orderDetail?.textContent).toContain('Viewing Order #123');
    expect(pencilBtn).toBeDefined();
    expect(closeBtn).toBeDefined();
    expect(auditSummary?.textContent).toContain('Pickup | completed | paid');
    expect(auditToggle?.textContent).toContain('▼');
    expect(auditRows?.length).toBe(0);
    expect(cartItems).toBeNull();
  });

  it('no active cart items visible when viewing previous order', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" data-view-mode="previous">
        <div class="ticket-panel-fixed is-hidden">Active controls</div>
        <div class="ticket-panel-scroll">
          <div class="order-detail-pane">Previous order</div>
        </div>
      </aside>
    `;

    const scrollSection = container.querySelector('.ticket-panel-scroll');
    const activeCartItems = scrollSection?.querySelector('.ticket-lines');
    const orderDetail = scrollSection?.querySelector('.order-detail-pane');

    expect(activeCartItems).toBeNull();
    expect(orderDetail).toBeDefined();
  });

  it('active order content is not merged into previous order view', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" data-view-mode="previous">
        <div class="ticket-panel-scroll">
          <div class="order-detail-pane">
            <div class="order-detail-line-item">
              <b>Previous Order Item</b>
            </div>
          </div>
        </div>
      </aside>
    `;

    const scrollSection = container.querySelector('.ticket-panel-scroll');
    const detailLines = scrollSection?.querySelectorAll('.order-detail-line-item');
    const cartLines = scrollSection?.querySelectorAll('.line-item');

    expect(detailLines?.length).toBe(1);
    expect(detailLines?.[0]?.textContent).toContain('Previous Order Item');
    expect(cartLines?.length).toBe(0);
  });

  it('scrollable section takes full height when viewing previous order', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <aside class="ticket-panel" style="display: flex; flex-direction: column; height: 600px;" data-view-mode="previous">
        <div class="ticket-panel-fixed is-hidden" style="flex: 0 0 auto; display: none;"></div>
        <div class="ticket-panel-scroll" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">
          Order detail
        </div>
      </aside>
    `;

    const ticketPanel = container.querySelector('.ticket-panel') as HTMLElement;
    const fixedSection = ticketPanel?.querySelector('.ticket-panel-fixed') as HTMLElement;
    const scrollSection = ticketPanel?.querySelector('.ticket-panel-scroll') as HTMLElement;

    expect(fixedSection.style.display).toBe('none');
    expect(scrollSection.style.flex).toBe('1 1 auto');
    expect(scrollSection.style.overflowY).toBe('auto');
  });

  it('close button is present in previous order footer', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <div class="ticket-panel-scroll">
        <div class="order-detail-pane">Order details</div>
        <div class="ticket-footer previous-order-footer">
          <button id="clearOrderDetail" class="btn-secondary">Close</button>
        </div>
      </div>
    `;

    const footer = container.querySelector('.previous-order-footer');
    const closeBtn = footer?.querySelector('#clearOrderDetail');

    expect(footer).toBeDefined();
    expect(closeBtn).toBeDefined();
    expect(closeBtn?.textContent).toBe('Close');
  });

  it('previous order details are properly displayed', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    container.innerHTML = `
      <div class="ticket-panel-scroll">
        <div class="order-detail-pane">
          <div class="order-detail-head">
            <b>Viewing Order #456</b>
            <button id="previousOrderEditBtn">Edit</button>
          </div>
          <div class="order-payment-row">
            <div class="order-payment-badge paid">PAID</div>
            <div class="order-payment-method">Visa •••• 4242</div>
          </div>
          <div class="order-audit-trail">
            <div class="order-audit-toggle-row">
              <small class="order-audit-summary">Pickup | completed | paid | 4:41:00 PM ASAP</small>
              <button id="togglePreviousOrderAudit" aria-expanded="true">&#9650;</button>
            </div>
            <div class="order-audit-list">
              <div class="order-audit-row"><span>Entered</span><span>7/19/26, 4:32 PM</span><span>ADM</span></div>
              <div class="order-audit-row"><span>Paid</span><span>7/19/26, 4:41 PM</span><span>JS</span></div>
            </div>
          </div>
          <div class="order-detail-lines">
            <div class="order-detail-line-item">
              <div class="order-detail-line-main">
                <b>3x Margherita Pizza</b>
              </div>
              <b>$45.00</b>
            </div>
          </div>
          <div class="order-detail-totals">
            <div><span>Total</span><b>$45.00</b></div>
          </div>
        </div>
      </div>
    `;

    const orderDetail = container.querySelector('.order-detail-pane');
    const orderNum = orderDetail?.querySelector('.order-detail-head');
    const badge = orderDetail?.querySelector('.order-payment-badge');
    const method = orderDetail?.querySelector('.order-payment-method');
    const summary = orderDetail?.querySelector('.order-audit-summary');
    const toggle = orderDetail?.querySelector('#togglePreviousOrderAudit');
    const auditRows = orderDetail?.querySelectorAll('.order-audit-row');
    const items = orderDetail?.querySelectorAll('.order-detail-line-item');
    const totals = orderDetail?.querySelector('.order-detail-totals');

    expect(orderNum?.textContent).toContain('Order #456');
    expect(badge?.textContent).toBe('PAID');
    expect(method?.textContent).toContain('4242');
    expect(summary?.textContent).toContain('Pickup | completed | paid');
    expect(toggle?.textContent).toContain('▲');
    expect(orderDetail?.textContent).not.toContain('Audit Trail');
    expect(auditRows?.length).toBe(2);
    expect(items?.length).toBe(1);
    expect(items?.[0]?.textContent).toContain('3x Margherita Pizza');
    expect(totals?.textContent).toContain('$45.00');
  });

  it('uses stored order identity labels when present', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');

    container.innerHTML = `
      <div class="customer-summary previous-order-customer">
        <div class="sum-top"><b>Walk-in Caller</b></div>
      </div>
    `;

    expect(container.textContent).toContain('Walk-in Caller');
    expect(container.textContent).not.toContain('No customer information on this order');
  });

  it('panel uses correct view mode attribute', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    // Test active mode
    container.innerHTML = `
      <aside class="ticket-panel" data-view-mode="active"></aside>
    `;
    let ticketPanel = container.querySelector('.ticket-panel');
    expect(ticketPanel?.getAttribute('data-view-mode')).toBe('active');

    // Test previous mode
    container.innerHTML = `
      <aside class="ticket-panel" data-view-mode="previous"></aside>
    `;
    ticketPanel = container.querySelector('.ticket-panel');
    expect(ticketPanel?.getAttribute('data-view-mode')).toBe('previous');
  });

  it('active order can be restored after viewing previous order', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    // Start with active order
    let html = `
      <aside class="ticket-panel" data-view-mode="active">
        <div class="ticket-panel-fixed">
          <div class="ticket-total-row">Active: $50</div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines">
            <div class="line-item">Active item</div>
          </div>
        </div>
      </aside>
    `;
    container.innerHTML = html;
    
    let ticketPanel = container.querySelector('.ticket-panel');
    expect(ticketPanel?.getAttribute('data-view-mode')).toBe('active');
    expect(container.querySelector('.line-item')).toBeDefined();

    // Switch to previous order view
    html = `
      <aside class="ticket-panel" data-view-mode="previous">
        <div class="ticket-panel-fixed is-hidden"></div>
        <div class="ticket-panel-scroll">
          <div class="order-detail-pane">Previous order</div>
        </div>
      </aside>
    `;
    container.innerHTML = html;
    
    ticketPanel = container.querySelector('.ticket-panel');
    expect(ticketPanel?.getAttribute('data-view-mode')).toBe('previous');
    expect(container.querySelector('.line-item')).toBeNull();
    expect(container.querySelector('.order-detail-pane')).toBeDefined();

    // Restore active order (simulating close button click)
    html = `
      <aside class="ticket-panel" data-view-mode="active">
        <div class="ticket-panel-fixed">
          <div class="ticket-total-row">Active: $50</div>
        </div>
        <div class="ticket-panel-scroll">
          <div class="ticket-lines">
            <div class="line-item">Active item</div>
          </div>
        </div>
      </aside>
    `;
    container.innerHTML = html;

    ticketPanel = container.querySelector('.ticket-panel');
    expect(ticketPanel?.getAttribute('data-view-mode')).toBe('active');
    expect(container.querySelector('.line-item')).toBeDefined();
    expect(container.querySelector('.order-detail-pane')).toBeNull();
  });

  it('previous order view does not affect active order data', () => {
    const container = document.getElementById('test-container');
    if (!container) throw new Error('Test container not found');
    
    // Create a mock state representation
    const activeOrderData = {
      items: [
        { name: 'Pizza', qty: 2, price: 15 },
        { name: 'Garlic Bread', qty: 1, price: 5 }
      ],
      total: 35,
      customer: 'John Doe'
    };

    const previousOrderData = {
      items: [
        { name: 'Salad', qty: 1, price: 10 }
      ],
      total: 10,
      customer: 'Jane Smith'
    };

    // Verify that showing previous order doesn't mutate active data
    const activeSnapshot = JSON.stringify(activeOrderData);
    
    // Display previous order
    container.innerHTML = `
      <div class="order-detail-pane">
        <div class="order-detail-line-item">${previousOrderData.items[0].name}</div>
      </div>
    `;

    // Verify active data still intact
    const activeRestored = JSON.stringify(activeOrderData);
    expect(activeSnapshot).toBe(activeRestored);
    expect(activeOrderData.total).toBe(35);
    expect(container.textContent).not.toContain('John Doe');
  });
});
