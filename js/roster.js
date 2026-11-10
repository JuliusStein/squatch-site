(async function () {
  const POSITIONS = { F: "Forward", D: "Defense", G: "Goalie" };
  // List order: forwards, defense, goalies, players with no position, then staff.
  // A player listed as "F/D" sorts with their first position.
  const GROUP_ORDER = { F: 0, D: 1, G: 2, "": 3, staff: 4 };
  const GROUP_TITLES = { F: "Forwards", D: "Defense", G: "Goalies", "": "Players", staff: "Coaching Staff" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  document.getElementById("year").textContent = new Date().getFullYear();
  loadRecord();

  const listEl = document.getElementById("roster-list");
  let roster;
  try {
    const res = await fetch("roster.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    roster = await res.json();
  } catch (err) {
    console.error("Could not load roster:", err);
    listEl.closest("table").outerHTML = '<p class="empty">The roster couldn\'t be loaded right now. Please try again shortly.</p>';
    return;
  }

  document.getElementById("roster-season").textContent = `${roster.season} Season`;

  const rows = [
    ...roster.players.map((p) => {
      const positions = p.position ? p.position.split("/") : [];
      return {
        number: p.number,
        name: p.name,
        role: positions.map((x) => POSITIONS[x]).join(" / ") || "—",
        group: positions[0] || "",
      };
    }),
    // Staff keep the order they're listed in roster.json.
    ...roster.staff.map((s, i) => ({ number: null, name: s.name, role: s.title, group: "staff", order: i })),
  ].sort((a, b) =>
    GROUP_ORDER[a.group] - GROUP_ORDER[b.group]
    || (a.number ?? 1e9) - (b.number ?? 1e9)
    || (a.order ?? 0) - (b.order ?? 0)
    || a.name.localeCompare(b.name));

  // A title row starts each group.
  listEl.innerHTML = rows.map((r, i) => `
    ${!i || rows[i - 1].group !== r.group ? `<tr class="group-head"><th scope="colgroup" colspan="3">${GROUP_TITLES[r.group]}</th></tr>` : ""}
    <tr class="${r.group === "staff" ? "is-staff" : ""}">
      <td class="col-num">${r.number != null ? esc(r.number) : ""}</td>
      <td class="col-name">${esc(r.name)}</td>
      <td class="col-pos">${esc(r.role)}</td>
    </tr>`).join("");
})();
