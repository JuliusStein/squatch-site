(async function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const minutes = (m) => { const [a, b] = String(m).split(":").map(Number); return (a || 0) + (b || 0) / 60; };
  const n = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const pct3 = (v) => (v >= 1 ? "1.000" : Number(v).toFixed(3).replace(/^0/, ""));

  document.getElementById("year").textContent = new Date().getFullYear();
  loadRecord();

  const out = document.getElementById("stats-out");
  let data;
  try {
    const res = await fetch("data/stats.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("Could not load stats:", err);
    out.innerHTML = '<p class="empty">The stats couldn\'t be loaded right now. Please try again shortly.</p>';
    return;
  }

  document.getElementById("stats-season").textContent = `${data.season} Season`;
  const updated = new Date(data.updated);
  if (!isNaN(updated)) {
    document.getElementById("stats-updated").textContent =
      `Updated ${updated.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
  }

  // A column: [header, value(row), {x: hide on phones, title, cls}]
  const table = (cols, rows) => `
    <div class="standings-scroll">
      <table class="standings-table stats-table">
        <thead><tr>${cols.map(([h, , o = {}]) =>
          `<th scope="col" class="${o.cls || ""} ${o.x ? "col-x" : ""}"${o.title ? ` title="${o.title}"` : ""}>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${cols.map(([, v, o = {}]) =>
          o.row ? `<th scope="row" class="${o.cls || ""}">${v(r)}</th>`
                : `<td class="${o.cls || ""} ${o.x ? "col-x" : ""}">${v(r)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  const num = { cls: "col-rank" };
  const name = { cls: "col-team", row: true };

  // ---- Team ----
  const us = data.team.us, them = data.team.opponents;
  const card = (label, value, sub) => `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>`;
  const teamHtml = `
    <h2 class="division-title">Team</h2>
    <div class="stat-cards">
      ${card("Goals / game", us.special.gpg.toFixed(2), `${n(us.skaters.g, "goal")} in ${n(us.skaters.gp, "game")}`)}
      ${card("Against / game", us.special.gapg.toFixed(2), `${n(them.skaters.g, "goal")} allowed`)}
      ${card("Power play", `${us.special.ppPct}%`, `${n(us.skaters.ppg, "goal")} on ${n(us.special.pp, "chance")}`)}
      ${card("Penalty kill", `${us.special.pkPct}%`, `${us.special.pk - us.special.ppga} of ${us.special.pk} killed`)}
      ${card("Save %", pct3(us.goalies.svPct), `${n(us.goalies.sv, "save")} on ${n(us.goalies.sog, "shot")}`)}
      ${card("Penalty minutes", us.skaters.pim, `${us.skaters.pen} ${us.skaters.pen === 1 ? "penalty" : "penalties"}`)}
    </div>
    <h3 class="stats-subtitle">Goals by period</h3>
    ${table([
      ["Team", (r) => esc(r.label), name],
      ["1st", (r) => r.s.p1], ["2nd", (r) => r.s.p2], ["3rd", (r) => r.s.p3], ["OT", (r) => r.s.ot],
      ["Total", (r) => r.s.total, { cls: "col-pts" }],
      ["Shots", (r) => r.shots, { x: true }],
    ], [
      { label: "Sasquatch", s: us.scoring, shots: us.skaters.sog },
      { label: "Opponents", s: them.scoring, shots: them.skaters.sog },
    ])}`;

  // ---- Skaters: points, then goals ----
  const skaters = [...data.skaters].sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name));
  const skaterHtml = `
    <h2 class="division-title">Skaters</h2>
    ${table([
      ["#", (r) => r.number ?? "", num],
      ["Player", (r) => esc(r.name), name],
      ["GP", (r) => r.gp], ["G", (r) => r.g], ["A", (r) => r.a],
      ["PTS", (r) => r.pts, { cls: "col-pts" }],
      ["SOG", (r) => r.sog, { x: true, title: "Shots on goal" }],
      ["PPG", (r) => r.ppg, { x: true, title: "Power-play goals" }],
      ["SHG", (r) => r.sh, { x: true, title: "Short-handed goals" }],
      ["GWG", (r) => r.gw, { x: true, title: "Game-winning goals" }],
      ["PIM", (r) => r.pim, { title: "Penalty minutes" }],
    ], skaters)}`;

  // ---- Goalies who played, most minutes first ----
  const goalies = data.goalies.filter((g) => minutes(g.min) > 0).sort((a, b) => minutes(b.min) - minutes(a.min));
  const goalieHtml = goalies.length ? `
    <h2 class="division-title">Goalies</h2>
    ${table([
      ["#", (r) => r.number ?? "", num],
      ["Goalie", (r) => esc(r.name), name],
      ["GP", (r) => r.gp, { x: true }], ["MIN", (r) => esc(r.min), { x: true }],
      ["W", (r) => r.w], ["L", (r) => r.l], ["SOL", (r) => r.sol, { x: true, title: "Shootout losses" }],
      ["GA", (r) => r.ga, { x: true }], ["SV", (r) => r.sv, { x: true }],
      ["GAA", (r) => Number(r.gaa).toFixed(2), { title: "Goals against average" }],
      ["SV%", (r) => pct3(r.svPct), { cls: "col-pts", title: "Save percentage" }],
    ], goalies)}` : "";

  out.innerHTML = teamHtml + skaterHtml + goalieHtml;
})();
