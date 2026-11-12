// Ticket checkout with PayPal and Venmo (through PayPal's JavaScript SDK).
//
// The client ID below is PayPal's PUBLIC app ID; it's meant to be in web pages.
// The secret key never goes in the site: it lives only in GitHub repo secrets,
// where scripts/sync_tickets.py uses it to read sales into the admin page.
//
// Each order carries "gameId|quantity|full name" in PayPal's custom_id field,
// which is how a sale is matched to its game and buyer later.

const PAYPAL_CLIENT_ID = "BAAW3w1DfUtzLYrnNViPmNtUJ8HPyFYHVu1FKs6wxxWI1fOpkNLGz3adomktf6OqBme4QwOMHYCaBdVm9U"; // paste the app's Client ID here; empty = ticket sales show "coming soon"
const TICKET_PRICE = 10;     // USD per ticket
const MAX_TICKETS_PER_ORDER = 10;

const Payments = (() => {
  let sdk = null;

  function loadSdk() {
    if (sdk) return sdk;
    const params = new URLSearchParams({
      "client-id": PAYPAL_CLIENT_ID,
      currency: "USD",
      intent: "capture",
      components: "buttons",
      "enable-funding": "venmo",
      "disable-funding": "card,credit,paylater",
    });
    sdk = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?${params}`;
      s.dataset.namespace = "paypal";
      s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load")));
      s.onerror = () => { sdk = null; reject(new Error("PayPal didn't load")); };
      document.head.appendChild(s);
    });
    return sdk;
  }

  // Keeps PayPal's custom_id field readable and under its 127-character limit.
  const safe = (s) => String(s).replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();

  // Renders the PayPal and Venmo buttons into `container`.
  //   getOrder()      -> { gameId, gameLabel, name, quantity } or null if the form isn't valid yet
  //   onPaid(details) -> called after the payment is captured
  //   onProblem(msg)  -> called on cancel or error
  async function render(container, { getOrder, onPaid, onProblem }) {
    container.innerHTML = "";
    if (!PAYPAL_CLIENT_ID) {
      container.innerHTML = '<p class="pay-soon">Online ticket sales are coming soon.</p>';
      return;
    }
    let paypal;
    try {
      paypal = await loadSdk();
    } catch {
      container.innerHTML = '<p class="pay-soon">PayPal couldn\'t load. Check your connection and try again.</p>';
      return;
    }
    let order = null;
    const style = { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 45 };
    await paypal.Buttons({
      style,
      onClick: (_data, actions) => {
        order = getOrder();
        return order ? actions.resolve() : actions.reject();
      },
      createOrder: (_data, actions) => {
        const q = order.quantity;
        const total = (q * TICKET_PRICE).toFixed(2);
        return actions.order.create({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: order.gameId,
            custom_id: `${order.gameId}|${q}|${safe(order.name).slice(0, 100)}`,
            invoice_id: `SQ-${order.gameId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            description: safe(`${q} ticket${q === 1 ? "" : "s"}: ${order.gameLabel}`).slice(0, 127),
            amount: {
              currency_code: "USD",
              value: total,
              breakdown: { item_total: { currency_code: "USD", value: total } },
            },
            items: [{
              name: "Sasquatch game ticket",
              quantity: String(q),
              unit_amount: { currency_code: "USD", value: TICKET_PRICE.toFixed(2) },
              category: "DIGITAL_GOODS",
            }],
          }],
          application_context: { brand_name: "Salem Sasquatch Hockey", shipping_preference: "NO_SHIPPING" },
        });
      },
      onApprove: async (_data, actions) => {
        const details = await actions.order.capture();
        onPaid(details, order);
      },
      onCancel: () => onProblem("Checkout was cancelled. No payment was made."),
      onError: (err) => {
        console.error("PayPal error:", err);
        onProblem("Something went wrong with PayPal. No payment was made. Please try again.");
      },
    }).render(container);
  }

  return { render };
})();
