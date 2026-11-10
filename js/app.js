(async function () {
  // Read from thecohl.com by scripts/update_league_data.py (every Monday).
  // Home games are the only ones with ticket sales.
  const SCHEDULE_URL = "data/schedule.json";

  const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const listEl = document.getElementById("game-list");
  let games;
  try {
    const res = await fetch(SCHEDULE_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    games = (await res.json()).games.map((g) => {
      const [y, m, d] = g.date.split("-").map(Number);
      return {
        ...g,
        // Calendar day at the rink, for display; `startsAt` is the real instant.
        start: new Date(y, m - 1, d),
        startsAt: new Date(g.start),
        isHome: g.home,
        // A game stays "upcoming" (and on sale) until ~3h after puck drop.
        isPast: new Date(g.start).getTime() + 3 * 3600e3 < Date.now(),
      };
    }).sort((a, b) => a.startsAt - b.startsAt);
  } catch (err) {
    console.error("Could not load schedule:", err);
    listEl.innerHTML = '<p class="empty">The schedule couldn\'t be loaded right now. Please try again shortly.</p>';
    return;
  }

  const fmt = {
    dow: (d) => d.toLocaleDateString("en-US", { weekday: "short" }),
    mon: (d) => d.toLocaleDateString("en-US", { month: "short" }),
    month: (d) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    long: (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- Schedule list ----
  let filter = "all";

  function renderList() {
    const shown = games.filter((g) => filter === "all" || (filter === "home") === g.isHome);
    if (!shown.length) {
      listEl.innerHTML = '<p class="empty">No games to show.</p>';
      return;
    }
    const byMonth = new Map();
    for (const g of shown) {
      const key = fmt.month(g.start);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(g);
    }
    listEl.innerHTML = [...byMonth].map(([month, list]) => `
      <h3 class="month">${month}</h3>
      <ul class="games">${list.map(gameRow).join("")}</ul>
    `).join("");
  }

  function gameRow(g) {
    let action;
    if (g.score) {
      const s = g.score;
      action = `<span class="score score-${s.result.toLowerCase()}" aria-label="Final: ${s.result === "W" ? "win" : s.result === "L" ? "loss" : "tie"}, ${s.salem} to ${s.opponent}">
        <span class="score-result">${s.result}</span> ${s.salem}–${s.opponent}${s.note ? ` <small>${esc(s.note)}</small>` : ""}
      </span>`;
    }
    else if (g.status) action = `<span class="status-text">${esc(g.status)}</span>`;
    else if (g.isPast) action = '<span class="status-text">Final</span>';
    else if (g.isHome) action = `<button class="btn btn-primary" data-buy="${esc(g.id)}">Buy tickets</button>`;
    else action = '<span class="status-text">Away game</span>';

    return `
      <li class="game ${g.isHome ? "is-home" : "is-away"} ${g.isPast ? "is-past" : ""}">
        <div class="date-block" aria-hidden="true">
          <div class="dow">${fmt.dow(g.start)}</div>
          <div class="day">${g.start.getDate()}</div>
          <div class="mon">${fmt.mon(g.start)}</div>
        </div>
        <div class="game-main">
          <p class="matchup">
            <span class="vs">${g.isHome ? "vs" : "@"}</span>${esc(g.opponent)}
            <span class="tag ${g.isHome ? "tag-home" : "tag-away"}">${g.isHome ? "Home" : "Away"}</span>
          </p>
          <p class="details">
            ${g.time ? `<span>${ICON_CLOCK}${esc(g.time)}</span>` : ""}
            <span>${ICON_PIN}${esc(g.location)}</span>
          </p>
        </div>
        <div class="game-action">${action}</div>
      </li>`;
  }

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  function setFilter(f) {
    filter = f;
    document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.filter === f)));
    renderList();
  }

  showRecord(games);

  // ---- Next home game callout ----
  const nextHome = games.find((g) => g.isHome && !g.isPast);
  if (nextHome) {
    const el = document.getElementById("next-home");
    el.innerHTML = `
      <div>
        <div class="label">Next home game</div>
        <div class="what">vs ${esc(nextHome.opponent)}</div>
        <div>${fmt.long(nextHome.start)} · ${esc(nextHome.time)}</div>
      </div>
      <button class="btn btn-primary" data-buy="${esc(nextHome.id)}">Get tickets</button>`;
    el.hidden = false;
  }

  // ---- Ticket dialog ----
  const dialog = document.getElementById("ticket-dialog");
  const form = document.getElementById("ticket-form");
  const qtyInput = form.elements.quantity;
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("checkout-btn");
  let currentGame = null;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-buy]");
    if (btn) openDialog(games.find((g) => g.id === btn.dataset.buy));
  });

  function openDialog(g) {
    currentGame = g;
    document.getElementById("ticket-title").textContent = `Sasquatch vs ${g.opponent}`;
    document.getElementById("ticket-meta").textContent = `${fmt.long(g.start)} · ${g.time} · ${g.location}`;
    document.getElementById("unit-price").textContent = usd.format(TICKET_PRICE);
    qtyInput.max = MAX_TICKETS_PER_ORDER;
    clearErrors();
    setStatus("");
    updateTotal();
    dialog.showModal();
  }

  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  form.querySelectorAll("[data-step]").forEach((b) => {
    b.addEventListener("click", () => {
      qtyInput.value = clampQty(Number(qtyInput.value || 0) + Number(b.dataset.step));
      updateTotal();
    });
  });
  qtyInput.addEventListener("input", updateTotal);
  qtyInput.addEventListener("blur", () => { qtyInput.value = clampQty(qtyInput.value); updateTotal(); });

  function clampQty(n) {
    n = Math.floor(Number(n)) || 1;
    return Math.min(MAX_TICKETS_PER_ORDER, Math.max(1, n));
  }
  function updateTotal() {
    const q = Math.max(0, Math.floor(Number(qtyInput.value)) || 0);
    document.getElementById("total").textContent = usd.format(q * TICKET_PRICE);
  }

  function validate() {
    const d = Object.fromEntries(new FormData(form));
    const errs = {};
    if (!d.name.trim()) errs.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errs.email = "Please enter a valid email.";
    if (d.phone.replace(/\D/g, "").length < 10) errs.phone = "Please enter a valid phone number.";
    const q = Number(d.quantity);
    if (!Number.isInteger(q) || q < 1 || q > MAX_TICKETS_PER_ORDER) errs.quantity = `Choose between 1 and ${MAX_TICKETS_PER_ORDER} tickets.`;
    return { d, errs };
  }

  function clearErrors() {
    form.querySelectorAll(".error").forEach((p) => (p.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
  }
  function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.hidden = !msg;
    statusEl.classList.toggle("ok", !!ok);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setStatus("");
    const { d, errs } = validate();
    const keys = Object.keys(errs);
    if (keys.length) {
      for (const k of keys) {
        form.querySelector(`.error[data-for="${k}"]`).textContent = errs[k];
        form.elements[k].setAttribute("aria-invalid", "true");
      }
      form.elements[keys[0]].focus();
      return;
    }

    const quantity = Number(d.quantity);
    const order = {
      gameId: currentGame.id,
      game: `vs ${currentGame.opponent} — ${fmt.long(currentGame.start)} · ${currentGame.time}`,
      name: d.name.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      quantity,
      unitPrice: TICKET_PRICE,
      total: quantity * TICKET_PRICE,
    };

    const provider = Payments[d.method];
    submitBtn.disabled = true;
    submitBtn.textContent = `Connecting to ${provider.label}…`;
    try {
      const result = await provider.checkout(order);
      if (result.ok) setStatus("Payment complete! Check your email for your tickets.", true);
      else setStatus(result.message || "Checkout was not completed.");
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong starting checkout. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue to checkout";
    }
  });

  document.getElementById("year").textContent = new Date().getFullYear();
  renderList();
})();
