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
    const [schedule, standings, stats] = await Promise.all([get("schedule.json"), get("standings.json"), get("stats.json")]);

    // Upcoming home games first, then past ones.
    const now = Date.now();
    const home = (schedule?.games || []).filter((g) => g.home);
    const upcoming = home.filter((g) => new Date(g.start).getTime() + 3 * 3600e3 >= now);
    const past = home.filter((g) => !upcoming.includes(g)).reverse();
    const row = (g, isPast) => {
      const [y, m, d] = g.date.split("-").map(Number);
      const date = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return `<tr${isPast ? ' class="is-past-row"' : ""}>
        <th scope="row" class="col-team">vs ${esc(g.opponent)}${isPast ? ' <small>(played)</small>' : ""}</th>
        <td>${date}${g.time ? ` · ${esc(g.time)}` : ""}</td>
        <td class="col-x">${esc(g.location)}</td>
        <td><code>${esc(g.id)}</code></td>
      </tr>`;
    };
    document.getElementById("admin-games").innerHTML =
      upcoming.map((g) => row(g, false)).join("") + past.map((g) => row(g, true)).join("")
      || '<tr><td colspan="4">No home games found.</td></tr>';

    document.getElementById("admin-updated").innerHTML = [
      ["Schedule & scores", schedule], ["Standings", standings], ["Stats", stats],
    ].map(([label, d]) => `<li><b>${label}:</b> ${d?.updated ? `last changed ${when(d.updated)}` : "couldn't load"}</li>`).join("");
  }
})();
