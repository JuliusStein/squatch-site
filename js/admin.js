(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  document.getElementById("year").textContent = new Date().getFullYear();
  loadRecord();

  const locked = document.getElementById("admin-locked");
  const tools = document.getElementById("admin-tools");
  const signOutBtn = document.getElementById("admin-signout");
  let loaded = false;

  function show() {
    const on = AdminLogin.isSignedIn();
    locked.hidden = on;
    tools.hidden = !on;
    signOutBtn.hidden = !on;
    if (on && !loaded) { loaded = true; load(); }
  }

  document.getElementById("admin-signin").addEventListener("click", () => AdminLogin.prompt(show));
  signOutBtn.addEventListener("click", () => { AdminLogin.signOut(); show(); });
  show();
  if (!AdminLogin.isSignedIn()) AdminLogin.prompt(show);

  async function load() {
    const get = (f) => fetch(`data/${f}`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [schedule, standings, stats, tickets] = await Promise.all(
      [get("schedule.json"), get("standings.json"), get("stats.json"), get("tickets.json")]);

    // Ticket buyers by home game: upcoming games first, then past games that had sales.
    const sales = tickets?.games || {};
    const now = Date.now();
    const home = (schedule?.games || []).filter((g) => g.home);
    const upcoming = home.filter((g) => new Date(g.start).getTime() + 3 * 3600e3 >= now);
    const past = home.filter((g) => !upcoming.includes(g) && sales[g.id]?.length).reverse();
    const last = (name) => name.replace(/^\S+\.\s+/, ""); // "J. Smith" -> "Smith", for sorting
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const gameBlock = (g, isPast) => {
      const [y, m, d] = g.date.split("-").map(Number);
      const date = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const rows = sales[g.id] || [];
      const total = rows.reduce((n, r) => n + r.qty, 0);
      return `
        <div class="ticket-game${isPast ? " is-past-game" : ""}">
          <h3 class="ticket-game-head">
            <span>vs ${esc(g.opponent)} <small>${date}${g.time ? ` · ${esc(g.time)}` : ""}${isPast ? " · played" : ""}</small></span>
            <span class="ticket-count">${plural(total, "ticket")}</span>
          </h3>
          ${rows.length ? `
          <div class="standings-scroll">
            <table class="standings-table ticket-table">
              <thead><tr><th scope="col" class="col-team">Name</th><th scope="col">Tickets</th></tr></thead>
              <tbody>${[...rows].sort((a, b) => last(a.name).localeCompare(last(b.name)) || a.name.localeCompare(b.name))
                .map((r) => `<tr><th scope="row" class="col-team">${esc(r.name)}${r.note ? ` <span class="ticket-note">${esc(r.note)}</span>` : ""}</th><td>${r.qty}</td></tr>`).join("")}</tbody>
            </table>
          </div>` : '<p class="ticket-none">No online sales yet.</p>'}
        </div>`;
    };
    document.getElementById("admin-tickets").innerHTML =
      (upcoming.map((g) => gameBlock(g, false)).join("") + past.map((g) => gameBlock(g, true)).join(""))
      || '<p class="empty">No home games on the schedule.</p>';

    document.getElementById("admin-updated").innerHTML = [
      ["Schedule & scores", schedule], ["Standings", standings], ["Stats", stats], ["Ticket sales", tickets],
    ].map(([label, d]) => `<li><b>${label}:</b> ${d?.updated ? `last changed ${when(d.updated)}` : label === "Ticket sales" ? "no sales yet" : "couldn't load"}</li>`).join("");
  }
})();
