// Payment integrations — placeholders until the real Stripe / PayPal / Venmo
// credentials and endpoints are wired in.
//
// Every provider receives the same `order` object:
//   {
//     gameId:     "2026-11-21",            // ISO date of the game
//     game:       "vs Boston Gold Kings — Sat, Nov 21, 2026 · 7:20 PM",
//     name:       "Jane Fan",
//     email:      "jane@example.com",
//     phone:      "(555) 123-4567",
//     quantity:   2,
//     unitPrice:  15,                       // USD
//     total:      30                        // USD
//   }
//
// Each `checkout` returns a Promise that resolves to { ok: true } on success
// or { ok: false, message } on failure / cancellation.

const TICKET_PRICE = 15; // USD per ticket — change as needed
const MAX_TICKETS_PER_ORDER = 10;

const Payments = {
  stripe: {
    label: "Credit card",
    async checkout(order) {
      // TODO(Stripe): POST `order` to your server, create a Checkout Session
      // there (secret key stays server-side), then redirect:
      //   const res = await fetch("/api/stripe/checkout-session", { method: "POST", body: JSON.stringify(order) });
      //   const { url } = await res.json();
      //   window.location.href = url;
      return notConnected("Stripe", order);
    },
  },

  paypal: {
    label: "PayPal",
    async checkout(order) {
      // TODO(PayPal): load the PayPal JS SDK with your client-id and render
      // its buttons, or create an order server-side and redirect to approval.
      return notConnected("PayPal", order);
    },
  },

  venmo: {
    label: "Venmo",
    async checkout(order) {
      // TODO(Venmo): Venmo checkout runs through PayPal's SDK
      // (enable-funding=venmo) or Braintree.
      return notConnected("Venmo", order);
    },
  },
};

function notConnected(provider, order) {
  console.info(`[${provider}] checkout not connected yet. Order:`, order);
  return Promise.resolve({
    ok: false,
    message: `${provider} checkout isn't connected yet — this is a draft. Your order details were captured (see console).`,
  });
}
