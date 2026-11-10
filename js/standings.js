(async function () {
  const OUR_TEAM = "Salem Sasquatch";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  document.getElementById("year").textContent = new Date().getFullYear();
  loadRecord();

  const out = document.getElementById("standings-out");
  let data;
  try {
    const res = await fetch("data/standings.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("Could not load standings:", err);
    out.innerHTML = '<p class="empty">The standings couldn\'t be loaded right now. See them on <a href="https://www.thecohl.com/reg">thecohl.com</a>.</p>';
    return;
  }

  document.getElementById("standings-season").textContent = `Colonial Hockey League · ${data.season}`;
  const updated = new Date(data.updated);
  if (!isNaN(updated)) {
    document.getElementById("standings-updated").textContent =
      `Updated ${updated.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
  }

  // Divisions and team order are exactly as the league lists them.
  const showTies = data.divisions.some((d) => d.teams.some((t) => t.t));
  const table = (teams) => `
    <div class="standings-scroll">
      <table class="standings-table">
        <thead><tr>
          <th scope="col" class="col-rank">#</th><th scope="col" class="col-team">Team</th>
          <th scope="col">GP</th><th scope="col">W</th><th scope="col">L</th>${showTies ? '<th scope="col">T</th>' : ""}
          <th scope="col" title="Overtime losses">OTL</th><th scope="col" class="col-x" title="Shootout losses">SOL</th>
          <th scope="col" class="col-pts">PTS</th>
          <th scope="col" class="col-x">GF</th><th scope="col" class="col-x">GA</th><th scope="col">DIFF</th>
        </tr></thead>
        <tbody>${teams.map((t, i) => `
          <tr${t.name === OUR_TEAM ? ' class="is-us"' : ""}>
            <td class="col-rank">${i + 1}</td>
            <th scope="row" class="col-team">${esc(t.name)}</th>
            <td>${t.gp}</td><td>${t.w}</td><td>${t.l}</td>${showTies ? `<td>${t.t}</td>` : ""}
            <td>${t.otl}</td><td class="col-x">${t.sol}</td>
            <td class="col-pts">${t.pts}</td>
            <td class="col-x">${t.gf}</td><td class="col-x">${t.ga}</td>
            <td class="${t.diff > 0 ? "pos" : t.diff < 0 ? "neg" : ""}">${t.diff > 0 ? "+" : ""}${t.diff}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  out.innerHTML = data.divisions.map((d) => `
    <h2 class="division-title">${esc(d.name)} Division</h2>
    ${table(d.teams)}`).join("");
})();
