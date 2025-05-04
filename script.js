// script.js
// --- very small vanilla‑JS port of your original React logic ---

/* amenity filters for the Overpass API */
const categories = {
  all: '',
  restaurant: '["amenity"="restaurant"]',
  cafe: '["amenity"="cafe"]',
  bar: '["amenity"="bar"]',
  park: '["leisure"="park"]',
  shopping_mall: '["shop"="mall"]',
  lodging: '["tourism"="hotel"]',
  gym: '["leisure"="fitness_centre"]'
};

/* set‑up Leaflet */
const map = L.map('map').setView([0, 0], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
let markers = L.layerGroup().addTo(map);

/* UI helpers */
const listEl     = document.getElementById('places-list');
const categoryEl = document.getElementById('category-select');
categoryEl.addEventListener('change', fetchPlaces);

function status(msg) {
  listEl.innerHTML = `<p class="p-4 text-gray-500">${msg}</p>`;
}

/* main data fetcher */
function fetchPlaces () {
  if (!window.userLoc) { status('Locating…'); return; }

  const { latitude: lat, longitude: lon } = window.userLoc;
  const radius = 1000;                              // meters
  const rDeg   = radius / 111000;                   // ≈deg
  const box    = [lat - rDeg, lon - rDeg, lat + rDeg, lon + rDeg]; // S,W,N,E

  const filt = categories[categoryEl.value] ?? '';
  const query = `
    [out:json][timeout:25];
    (
      node${filt}(${box.join(',')});
      way${filt}(${box.join(',')});
      rel${filt}(${box.join(',')});
    );
    out center 20;
  `;

  status('Loading places…');

  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: query })
  })
    .then(r => r.json())
    .then(d => renderPlaces(d.elements ?? []))
    .catch(() => status('Error fetching places'));
}

/* paint list + pins */
function renderPlaces (els) {
  markers.clearLayers();
  listEl.innerHTML = '';

  if (!els.length) { status('No places found.'); return; }

  els.forEach(el => {
    const lat  = el.lat   ?? el.center?.lat;
    const lon  = el.lon   ?? el.center?.lon;
    const name = el.tags?.name ?? 'Unnamed place';
    const cat  = el.tags?.amenity || el.tags?.leisure ||
                 el.tags?.shop   || '';

    /* marker */
    const m = L.marker([lat, lon]).addTo(markers)
               .bindPopup(`<strong>${name}</strong><br>${cat}`);

    /* list item */
    const div = document.createElement('div');
    div.className = 'px-4 py-2 border-b hover:bg-gray-100 cursor-pointer';
    div.textContent = name;
    div.onclick = () => { map.setView([lat, lon], 17); m.openPopup(); };
    listEl.appendChild(div);
  });
}

/* get user’s position then kick off first search */
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      window.userLoc = pos.coords;
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      L.circle([pos.coords.latitude, pos.coords.longitude],
               { radius: 5, color: 'blue' }).addTo(map);
      fetchPlaces();
    },
    () => {
      status('Location permission denied.');
      map.setView([40.7128, -74.0060], 12);       // fallback: NYC
    }
  );
} else {
  status('Geolocation not supported.');
  map.setView([40.7128, -74.0060], 12);
}
