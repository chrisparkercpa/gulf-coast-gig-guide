"use strict";

/* ============================================================
   Gulf Coast Gig Guide
   Data source: Google Sheet (edit it from your phone; the site
   updates on the next page load — no GitHub upload needed).

   Sheet columns (first row, any order, case-insensitive):
   Date | Start Time | Artist | Venue | City | State | Genre |
   Cover | Source Link | Notes | Status

   Rows with a date in the past are hidden automatically.
   Rows whose Status contains "cancel" or "hide" are hidden.
   ============================================================ */

const SHEET_ID = "1TsdhW7CM3Xc-32GfzkUrQqn0K6TYrbAySX9z4kJrWRE";

// The sheet must be shared: Share -> Anyone with the link -> Viewer.
const SHEET_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&cacheBust=${Date.now()}`;

// For local testing you can load any CSV with ?csv=sample.csv
const DATA_URL = new URLSearchParams(location.search).get("csv") || SHEET_CSV_URL;

const el = {
  grid: document.getElementById("eventGrid"),
  summary: document.getElementById("summaryText"),
  empty: document.getElementById("emptyState"),
  errorBox: document.getElementById("errorState"),
  updated: document.getElementById("lastUpdated"),
  state: document.getElementById("stateFilter"),
  city: document.getElementById("cityFilter"),
  venue: document.getElementById("venueFilter"),
  genre: document.getElementById("genreFilter"),
  free: document.getElementById("freeFilter"),
  sort: document.getElementById("sortFilter")
};

let events = [];
let activeRange = "all";

/* ---------- CSV parsing (handles quoted fields and commas) ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

/* ---------- Date handling ---------- */
function parseDate(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // 2026-07-24
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);            // 7/24/2026
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return new Date(y, +m[1] - 1, +m[2], 12, 0, 0);
  }
  const d = new Date(v);                                       // July 24, 2026
  if (!isNaN(d)) { d.setHours(12, 0, 0, 0); return d; }
  return null;
}
function startToday() { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }
function daysFromToday(d) { return Math.round((d - startToday()) / 86400000); }
function formatDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/* ---------- Load the sheet ---------- */
function normalizeHeader(h) { return String(h || "").toLowerCase().replace(/[^a-z]/g, ""); }
const COLUMN_ALIASES = {
  date: "date", showdate: "date",
  starttime: "time", time: "time",
  artist: "artist", band: "artist",
  venue: "venue",
  city: "city", cityarea: "city",
  state: "state",
  genre: "genre",
  cover: "cover", covertickets: "cover", price: "cover",
  sourcelink: "source", source: "source", link: "source",
  notes: "notes",
  status: "status"
};

function rowsToEvents(rows) {
  if (!rows.length) return [];
  const map = {};
  rows[0].forEach((h, i) => {
    const key = COLUMN_ALIASES[normalizeHeader(h)];
    if (key && !(key in map)) map[key] = i;
  });
  if (!("date" in map) || !("artist" in map)) return [];
  const get = (row, key) => (key in map ? String(row[map[key]] || "").trim() : "");
  const list = [];
  rows.slice(1).forEach((row, i) => {
    const date = parseDate(get(row, "date"));
    if (!date) return;
    const status = get(row, "status").toLowerCase();
    if (status.includes("cancel") || status.includes("hide")) return;
    if (daysFromToday(date) < 0) return; // expired shows disappear automatically
    const cover = get(row, "cover");
    const venue = get(row, "venue"), city = get(row, "city"), state = get(row, "state");
    list.push({
      id: i,
      date, time: get(row, "time"),
      artist: get(row, "artist") || "TBA",
      venue, city, state,
      genre: get(row, "genre"),
      cover,
      free: /free|^\$?0(\.0+)?$|no cover/i.test(cover),
      source: get(row, "source"),
      notes: get(row, "notes"),
      directions: "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent([venue, city, state].filter(Boolean).join(", "))
    });
  });
  return list;
}

async function loadShows() {
  el.summary.textContent = "Loading shows…";
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error("Sheet is not shared publicly yet");
    events = rowsToEvents(parseCsv(text));
    buildFilterOptions();
    el.errorBox.hidden = true;
    el.updated.textContent = "Updated " +
      new Date().toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
    render();
  } catch (err) {
    el.summary.textContent = "Couldn't load the show list.";
    el.errorBox.hidden = false;
    console.error(err);
  }
}

/* ---------- Filters ---------- */
function addOptions(select, values) {
  while (select.options.length > 1) select.remove(1);
  [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach(value => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value;
    select.appendChild(option);
  });
}
function buildFilterOptions() {
  addOptions(el.state, events.map(x => x.state));
  addOptions(el.city, events.map(x => x.city));
  addOptions(el.venue, events.map(x => x.venue));
  addOptions(el.genre, events.map(x => x.genre));
}

function dateMatches(date) {
  if (activeRange === "all") return true;
  const diff = daysFromToday(date);
  if (activeRange === "today") return diff === 0;
  if (activeRange === "tomorrow") return diff === 1;
  if (activeRange === "7days") return diff >= 0 && diff <= 6;
  if (activeRange === "weekend") {
    const today = startToday();
    const day = today.getDay();
    const daysToFriday = (5 - day + 7) % 7;
    const friday = new Date(today); friday.setDate(today.getDate() + daysToFriday);
    const monday = new Date(friday); monday.setDate(friday.getDate() + 3);
    return date >= friday && date < monday;
  }
  return true;
}
function selected(select) { return select.value === "all" ? null : select.value; }
function getFiltered() {
  const f = { state: selected(el.state), city: selected(el.city), venue: selected(el.venue), genre: selected(el.genre) };
  const list = events.filter(x =>
    dateMatches(x.date) &&
    (!f.state || x.state === f.state) &&
    (!f.city || x.city === f.city) &&
    (!f.venue || x.venue === f.venue) &&
    (!f.genre || x.genre === f.genre) &&
    (!el.free.checked || x.free));
  const byDate = (a, b) => a.date - b.date || String(a.time).localeCompare(String(b.time));
  list.sort((a, b) =>
    el.sort.value === "city" ? a.city.localeCompare(b.city) || byDate(a, b) :
    el.sort.value === "venue" ? a.venue.localeCompare(b.venue) || byDate(a, b) :
    byDate(a, b));
  return list;
}

/* ---------- Rendering ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(u) {
  try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : ""; }
  catch { return ""; }
}
function card(x) {
  const article = document.createElement("article");
  article.className = "event-card";
  const source = safeUrl(x.source);
  article.innerHTML =
    `<div class="event-top"><div class="date">${escapeHtml(formatDate(x.date))}${x.time ? " • " + escapeHtml(x.time) : ""}</div>` +
    `<h3>${escapeHtml(x.artist)}</h3></div>` +
    `<div class="event-body">` +
    `<p class="venue">${escapeHtml(x.venue)}</p>` +
    `<p class="meta">${escapeHtml([x.city, x.state].filter(Boolean).join(", "))}</p>` +
    `<div class="badges">` +
    (x.genre ? `<span class="badge">${escapeHtml(x.genre)}</span>` : "") +
    (x.free ? `<span class="badge">Free</span>` : (x.cover ? `<span class="badge">${escapeHtml(x.cover)}</span>` : "")) +
    `</div>` +
    (x.notes ? `<p class="meta">${escapeHtml(x.notes)}</p>` : "") +
    `<div class="card-actions">` +
    (source ? `<a class="details" href="${source}" target="_blank" rel="noopener">Source</a>` : "") +
    `<a class="directions" href="${x.directions}" target="_blank" rel="noopener">Directions</a>` +
    `</div></div>`;
  return article;
}
function render() {
  const list = getFiltered();
  el.grid.replaceChildren(...list.map(card));
  el.summary.textContent = `Showing ${list.length} of ${events.length} upcoming shows`;
  el.empty.hidden = list.length !== 0 || events.length === 0;
}

/* ---------- Events ---------- */
document.getElementById("dateButtons").addEventListener("click", e => {
  const b = e.target.closest("button[data-range]");
  if (!b) return;
  activeRange = b.dataset.range;
  document.querySelectorAll("button[data-range]").forEach(x => x.classList.toggle("active", x === b));
  render();
});
[el.state, el.city, el.venue, el.genre, el.free, el.sort].forEach(c => c.addEventListener("change", render));
document.getElementById("resetButton").addEventListener("click", () => {
  activeRange = "all";
  document.querySelectorAll("button[data-range]").forEach(x => x.classList.toggle("active", x.dataset.range === "all"));
  [el.state, el.city, el.venue, el.genre].forEach(x => x.value = "all");
  el.free.checked = false;
  el.sort.value = "date";
  render();
});
document.getElementById("refreshButton").addEventListener("click", loadShows);

loadShows();
