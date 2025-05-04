// script.js
/* ---------- categories shown as chips ---------- */
const FILTERS = {
  all:          { label: 'All',         overpass: '' },
  food:         { label: 'Food',        overpass: '["amenity"~"restaurant|cafe|fast_food|bar|pub"]' },
  shop:         { label: 'Shops',       overpass: '["shop"]' },
  lodging:      { label: 'Hotels',      overpass: '["tourism"="hotel"]' },
  leisure:      { label: 'Leisure',     overpass: '["leisure"]' },
  culture:      { label: 'Culture',     overpass: '["tourism"~"museum|gallery|attraction"]' },
  sport:        { label: 'Sports',      overpass: '["sport"]' }
};
let currentFilter = 'all';

/* ---------- DOM refs ---------- */
const chipsEl  = document.getElementById('chips');
const listEl   = document.getElementById('places-list');
const searchEl = document.getElementById('search-input');

/* ---------- category chips ---------- */
Object.entries(FILTERS).forEach(([key, { label }]) => {
  const b      = document.createElement('button');
  b.textContent = label;
  b.dataset.f   = key;
  b.className   = 'chip';
  b.onclick     = () => { currentFilter = key; highlight(); fetchPlaces(); };
  chipsEl.appendChild(b);
});
function highlight() {
  chipsEl.querySelectorAll('.chip')
         .forEach(btn => btn.classList.toggle('chip--active',
                           btn.dataset.f === currentFilter));
}
highlight();

/* ---------- Leaflet ---------- */
const map = L.map('map').setView([40.7128, -74.006], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenStreetMap' }).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

/* ---------- UI helpers ---------- */
const msg = t => listEl.innerHTML =
  `<p class="p-4 text-gray-500 italic">${t}</p>`;
searchEl.addEventListener('input', () => {
  const q = searchEl.value.toLowerCase();
  listEl.querySelectorAll('[data-name]')
        .forEach(c => c.classList.toggle('hidden',
                   !c.dataset.name.includes(q)));
});

/* ---------- “review score” util (from your original) ---------- */
const scoreOf = t => {
  const rating = parseFloat(t.rating || 0);          // 0‑5
  const count  = parseInt(t.review_count || 0, 10);  // absolute #
  if (rating) return (rating * 20) + (count / 10);
  if (t.stars) return parseInt(t.stars, 10) * 30;    // hotels
  if (t.michelin || t.gault_millau) return 85;       // guide listed
  if (t.tourism === 'attraction') return 90;         // major sight
  return 0;
};

/* ---------- Overpass query builder ---------- */
const POI_TAGS = [
  'amenity', 'shop', 'leisure', 'tourism', 'sport',
  'craft', 'office', 'historic', 'attraction'
];
function buildQuery(bbox) {
  const named = '["name"~"."]';
  const b     = bbox.join(',');
  const filter = currentFilter === 'all'
      ? POI_TAGS.map(tag =>
          [`node["${tag}"]${named}(${b});`,
           `way["${tag}"]${named}(${b});`,
           `rel["${tag}"]${named}(${b});`].join('\n')).join('\n')
      : (() => {
          const f = FILTERS[currentFilter].overpass;
          return [`node${f}${named}(${b});`,
                  `way${f}${named}(${b});`,
                  `rel${f}${named}(${b});`].join('\n');
        })();
  return `[out:json][timeout:25];(${filter});out center 300;`;
}

/* ---------- throttled fetch ---------- */
let lastCall = 0, lastZoom = map.getZoom(), lastCenter = map.getCenter();
const THRESH_METERS = 250,  DEBOUNCE_MS = 2000;
let timer;

map.on('moveend', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const center = map.getCenter();
    const dist   = map.distance(center, lastCenter);
    const zoom   = map.getZoom();
    if (dist > THRESH_METERS || Math.abs(zoom - lastZoom) >= 1) {
      lastCenter = center; lastZoom = zoom;
      fetchPlaces();
    }
  }, DEBOUNCE_MS);
});

/* ---------- fetch + render ---------- */
function fetchPlaces() {
  const b = map.getBounds();
  const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  msg('Loading POIs…');

  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: buildQuery(bbox) })
  })
    .then(r => r.json())
    .then(({ elements }) => render(elements || []))
    .catch(() => msg('Overpass did not respond (rate‑limited).'));
}

function render(elems) {
  markerLayer.clearLayers();
  listEl.innerHTML = '';

  const seen = new Set();
  const places = elems.map(el => {
    const lat  = el.lat ?? el.center?.lat;
    const lon  = el.lon ?? el.center?.lon;
    const tags = el.tags || {};
    const name = (tags.name || '').trim();
    if (!lat || !lon || !name) return null;

    const quality = scoreOf(tags);
    if (quality < 80) return null;                // quality gate

    const id = `${lat.toFixed(5)}|${lon.toFixed(5)}`;
    if (seen.has(id)) return null;
    seen.add(id);

    return { lat, lon, name, tags, quality };
  }).filter(Boolean);

  if (!places.length) { msg('No high‑quality places here.'); return; }
  searchEl.value = '';

  places.forEach(({ lat, lon, name, tags, quality }) => {
    /* marker */
    const m = L.marker([lat, lon]).addTo(markerLayer)
              .bindPopup(`<strong>${name}</strong><br>${tags.amenity || tags.shop ||
                         tags.leisure || tags.tourism || ''}`);

    /* sidebar card */
    const card = document.createElement('div');
    card.dataset.name = name.toLowerCase();
    card.className    = 'card';

    card.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <span class="font-semibold">${name}</span>
        <span class="text-xs bg-gray-200 px-2 py-0.5 rounded">
          ${tags.amenity || tags.shop || tags.leisure || tags.tourism || 'POI'}
        </span>
      </div>
      <div class="text-sm text-gray-600 mb-2">
        ${tags.rating ? `⭐ ${tags.rating}` :
          tags.stars ? `★ ${tags.stars}` :
          tags.michelin ? 'Michelin‑listed' :
          tags.tourism === 'attraction' ? 'Major attraction' : ''}
      </div>
      <button class="info-btn">View</button>`;
    card.querySelector('.info-btn').onclick =
      () => { map.setView([lat, lon], 17); m.openPopup(); };
    listEl.appendChild(card);
  });
}

/* ---------- first load ---------- */
navigator.geolocation.getCurrentPosition(
  pos => { map.setView([pos.coords.latitude, pos.coords.longitude], 15); fetchPlaces(); },
  ()  => fetchPlaces()
);
