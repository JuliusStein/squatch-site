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

  // A column: [header, value(row), {x: hide on phones, title, cls, row, sort: raw value(row), asc: sort low-to-high first}]
  // Sortable tables re-sort when a column header is clicked; the sorted column is highlighted.
  const tables = [];
  const cellCls = (o, i, t) => [o.cls, o.x && "col-x", t.sortable && t.key === i && "is-sorted"].filter(Boolean).join(" ");
  const body = (t) => t.rows.map((r) => `<tr>${t.cols.map(([, v, o = {}], i) =>
    o.row ? `<th scope="row" class="${cellCls(o, i, t)}">${v(r)}</th>`
          : `<td class="${cellCls(o, i, t)}">${v(r)}</td>`).join("")}</tr>`).join("");
  const head = (t) => t.cols.map(([h, , o = {}], i) => {
    const title = o.title ? ` title="${o.title}"` : "";
    if (!t.sortable) return `<th scope="col" class="${cellCls(o, i, t)}"${title}>${h}</th>`;
    const sort = t.key === i ? ` aria-sort="${t.dir > 0 ? "ascending" : "descending"}"` : "";
    return `<th scope="col" class="${cellCls(o, i, t)}"${title}${sort}><button type="button" class="sort-btn" data-col="${i}">${h}</button></th>`;
  }).join("");
  const table = (cols, rows, opts = {}) => {
    const t = { cols, rows, base: rows, sortable: !!opts.sortBy || opts.sortBy === 0, key: opts.sortBy, dir: -1 };
    if (t.sortable) t.cols = cols.map(([h, v, o = {}]) => [h, v, { ...o, cls: (o.cls || "").replace("col-pts", "").trim() }]);
    tables.push(t);
    return `
    <div class="standings-scroll">
      <table class="standings-table stats-table${t.sortable ? " is-sortable" : ""}" data-t="${tables.length - 1}">
        <thead><tr>${head(t)}</tr></thead>
        <tbody>${body(t)}</tbody>
      </table>
    </div>`;
  };

  function sortTable(el, col) {
    const t = tables[el.dataset.t];
    const [, v, o = {}] = t.cols[col];
    t.dir = t.key === col ? -t.dir : (o.asc ? 1 : -1);
    t.key = col;
    const val = (r) => (o.sort ? o.sort(r) : v(r));
    const blank = (x) => x === "" || x === null || x === undefined;
    // Stable sort on the default order, so ties keep it; blanks always go last.
    t.rows = [...t.base].sort((a, b) => {
      const x = val(a), y = val(b);
      if (blank(x) || blank(y)) return blank(x) - blank(y);
      const nx = Number(x), ny = Number(y);
      const c = !isNaN(nx) && !isNaN(ny) ? nx - ny : String(x).localeCompare(String(y));
      return c * t.dir;
    });
    el.querySelector("thead tr").innerHTML = head(t);
    el.querySelector("tbody").innerHTML = body(t);
    el.querySelector(`.sort-btn[data-col="${col}"]`).focus();
  }

  out.addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-btn");
    if (btn) sortTable(btn.closest("table"), Number(btn.dataset.col));
  });

  const num = { cls: "col-rank", asc: true };
  const name = { cls: "col-team", row: true, asc: true };

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
      ${card("Penalty min / game", us.skaters.gp ? Math.round(us.skaters.pim / us.skaters.gp) : 0, `${n(us.skaters.pim, "minute")} in ${n(us.skaters.gp, "game")}`)}
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
    <p class="sort-hint">Tap a column heading to sort.</p>
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
    ], skaters, { sortBy: 5 })}`;

  // ---- Goalies who played, most minutes first ----
  const goalies = data.goalies.filter((g) => minutes(g.min) > 0).sort((a, b) => minutes(b.min) - minutes(a.min));
  const goalieHtml = goalies.length ? `
    <h2 class="division-title">Goalies</h2>
    ${table([
      ["#", (r) => r.number ?? "", num],
      ["Goalie", (r) => esc(r.name), name],
      ["GP", (r) => r.gp, { x: true }], ["MIN", (r) => esc(r.min), { x: true, sort: (r) => minutes(r.min) }],
      ["W", (r) => r.w], ["L", (r) => r.l], ["SOL", (r) => r.sol, { x: true, title: "Shootout losses" }],
      ["GA", (r) => r.ga, { x: true }], ["SV", (r) => r.sv, { x: true }],
      ["GAA", (r) => Number(r.gaa).toFixed(2), { title: "Goals against average", asc: true }],
      ["SV%", (r) => pct3(r.svPct), { cls: "col-pts", title: "Save percentage", sort: (r) => r.svPct }],
    ], goalies, { sortBy: 3 })}` : "";

  out.innerHTML = teamHtml + skaterHtml + goalieHtml;
})();
