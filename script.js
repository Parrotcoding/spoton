// script.js
/* ---------- category config ---------- */
const FILTERS = {
  all:          { label: 'All',         overpass: '' },
  restaurant:   { label: 'Restaurants', overpass: '["amenity"="restaurant"]' },
  cafe:         { label: 'Cafes',       overpass: '["amenity"="cafe"]' },
  bar:          { label: 'Bars',        overpass: '["amenity"="bar"]' },
  park:         { label: 'Parks',       overpass: '["leisure"="park"]' },
  shopping_mall:{ label: 'Shopping',    overpass: '["shop"="mall"]' },
  lodging:      { label: 'Hotels',      overpass: '["tourism"="hotel"]' },
  gym:          { label: 'Gyms',        overpass: '["leisure"="fitness_centre"]' }
};
let currentFilter = 'all';

/* ---------- DOM refs ---------- */
const mapEl    = document.getElementById('map');
const listEl   = document.getElementById('places-list');
const chipsEl  = document.getElementById('chips');
const searchEl = document.getElementById('search-input');

/* ---------- build category chips ---------- */
Object.entries(FILTERS).forEach(([k, { label }]) => {
  const btn = document.createElement('button');
  btn.textContent   = label;
  btn.dataset.filter = k;
  btn.className     = 'chip';
  btn.onclick       = () => {
    currentFilter = k;
    highlightChip();
    fetchPlaces();
  };
  chipsEl.appendChild(btn);
});
function highlightChip() {
  chipsEl.querySelectorAll('.chip').forEach(btn =>
    btn.classList.toggle('chip--active', btn.dataset.filter === currentFilter));
}
highlightChip();

/* ---------- Leaflet map ---------- */
const map = L.map('map').setView([40.7128, -74.0060], 13);          // NYC fallback
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenStreetMap' }).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

/* ---------- UI helper ---------- */
const MSG = txt => { listEl.innerHTML = `<p class="p-4 text-gray-500">${txt}</p>`; };

/* text filter in sidebar list */
searchEl.addEventListener('input', () => {
  const q = searchEl.value.toLowerCase();
  listEl.querySelectorAll('[data-name]').forEach(div =>
    div.classList.toggle('hidden', !div.dataset.name.includes(q)));
});

/* ---------- Overpass query builder ---------- */
const CORE_TAGS = ['amenity', 'shop', 'leisure', 'tourism', 'craft', 'sport'];
function buildQuery(bbox) {
  const named = '["name"~"."]';
  const b = bbox.join(',');

  if (currentFilter !== 'all') {
    const f = FILTERS[currentFilter].overpass;
    return `
      [out:json][timeout:25];
      (
        node${f}${named}(${b});
        way${f}${named}(${b});
        rel${f}${named}(${b});
        node${f}["brand"~"."](${b});
        way${f}["brand"~"."](${b});
        rel${f}["brand"~"."](${b});
      );
      out center 300;
    `;
  }

  /* 'all' – any POI in CORE_TAGS that has a label */
  const parts = CORE_TAGS.flatMap(tag => [
    `node["${tag}"]${named}(${b});`,
    `way["${tag}"]${named}(${b});`,
    `rel["${tag}"]${named}(${b});`
  ]);
  return `[out:json][timeout:25];(${parts.join('\n')});out center 300;`;
}

/* ---------- fetch + render logic ---------- */
let fetchDebounce;
function scheduleFetch() {
  clearTimeout(fetchDebounce);
  fetchDebounce = setTimeout(fetchPlaces, 400);   // 0.4 s debounce
}
map.on('moveend', scheduleFetch);                 // load on pan/zoom

function fetchPlaces() {
  const bounds = map.getBounds();
  const bbox   = [bounds.getSouth(), bounds.getWest(),
                  bounds.getNorth(), bounds.getEast()];

  MSG('Loading…');
  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: buildQuery(bbox) })
  })
    .then(r => r.json())
    .then(j => render(j.elements || []))
    .catch(() => MSG('Error contacting Overpass 😕'));
}

function render(elems) {
  markerLayer.clearLayers();
  listEl.innerHTML = '';

  /* normalise + dedupe */
  const seen = new Set();
  const places = elems.map(el => {
    const lat  = el.lat  ?? el.center?.lat;
    const lon  = el.lon  ?? el.center?.lon;
    const tags = el.tags || {};
    const name = (tags.name || tags.brand || tags.operator || '').trim();
    if (!lat || !lon || !name) return null;
    const id = `${lat.toFixed(5)}|${lon.toFixed(5)}|${name}`;
    if (seen.has(id)) return null;
    seen.add(id);
    return { lat, lon, name, cat: tags.amenity || tags.shop ||
                                tags.leisure || tags.tourism || '' };
  }).filter(Boolean);

  if (!places.length) { MSG('No places here. Zoom out or move the map.'); return; }

  /* reset search filter */
  searchEl.value = '';

  places.forEach(({ lat, lon, name, cat }) => {
    const m = L.marker([lat, lon]).addTo(markerLayer)
              .bindPopup(`<strong>${name}</strong><br>${cat}`);

    const row = document.createElement('div');
    row.dataset.name = name.toLowerCase();
    row.className    = 'list-row';
    row.textContent  = name;
    row.onclick      = () => { map.setView([lat, lon], 17); m.openPopup(); };
    listEl.appendChild(row);
  });
}

/* ---------- geolocate then kick off first fetch ---------- */
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      L.circle([pos.coords.latitude, pos.coords.longitude],
               { radius: 5, color: 'blue' }).addTo(map);
      fetchPlaces();   // first load
    },
    () => fetchPlaces()   // use NYC fallback
  );
} else {
  fetchPlaces();
}
