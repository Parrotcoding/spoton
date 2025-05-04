// script.js
/* ----- category filters (amenity / leisure / shop / tourism) ----- */
const filters = {
  all:      '',
  restaurant:'["amenity"="restaurant"]',
  cafe:     '["amenity"="cafe"]',
  bar:      '["amenity"="bar"]',
  park:     '["leisure"="park"]',
  shopping_mall:'["shop"="mall"]',
  lodging:  '["tourism"="hotel"]',
  gym:      '["leisure"="fitness_centre"]'
};

/* ----- Leaflet setup ----- */
const map = L.map('map').setView([0,0], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap' }
).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

/* ----- DOM helpers ----- */
const listEl     = document.getElementById('places-list');
const categoryEl = document.getElementById('category-select');
categoryEl.addEventListener('change', fetchPlaces);

function showMsg(msg){
  listEl.innerHTML = `<p class="p-4 text-gray-500">${msg}</p>`;
}

/* ----- fetch named places from Overpass ----- */
function fetchPlaces(){
  if(!window.userLoc){ showMsg('Locating you…'); return; }

  const {latitude:lat, longitude:lon} = window.userLoc;
  const radius = 1000;          // m
  const dDeg   = radius/111000; // ≈deg
  const box    = [lat-dDeg, lon-dDeg, lat+dDeg, lon+dDeg]; // S,W,N,E
  const f      = filters[categoryEl.value]??'';

  /* only features WITH a name or brand/operator */
  const nameFilter = '["name"~"."]';
  const altName    = '["brand"~"."]';
  const query = `
    [out:json][timeout:25];
    (
      node${f}${nameFilter}(${box});
      way${f}${nameFilter}(${box});
      rel${f}${nameFilter}(${box});
      node${f}${altName}(${box});
      way${f}${altName}(${box});
      rel${f}${altName}(${box});
    );
    out center 50;
  `;

  showMsg('Loading nearby places…');
  fetch('https://overpass-api.de/api/interpreter',
        {method:'POST', body:new URLSearchParams({data:query})})
    .then(r=>r.json())
    .then(json=>renderPlaces(json.elements||[]))
    .catch(()=>showMsg('Could not load data 😕'));
}

function renderPlaces(elems){
  markerLayer.clearLayers();
  listEl.innerHTML='';

  /* normalise + discard entries still lacking a recognisable label */
  const places = elems.map(el=>{
    const lat = el.lat??el.center?.lat;
    const lon = el.lon??el.center?.lon;
    const tags = el.tags||{};
    const name = tags.name||tags.brand||tags.operator;
    return (lat&&lon&&name)? {lat,lon,name,raw:tags}:null;
  }).filter(Boolean);

  if(!places.length){ showMsg('No named places here.'); return; }

  places.forEach(({lat,lon,name,raw})=>{
    const m=L.marker([lat,lon]).addTo(markerLayer)
            .bindPopup(`<strong>${name}</strong><br>${raw.amenity||raw.shop||raw.leisure||''}`);

    const div=document.createElement('div');
    div.className='px-4 py-2 border-b hover:bg-gray-100 cursor-pointer';
    div.textContent=name;
    div.onclick=()=>{ map.setView([lat,lon],17); m.openPopup(); };
    listEl.appendChild(div);
  });
}

/* ----- get user location, then go ----- */
if('geolocation' in navigator){
  navigator.geolocation.getCurrentPosition(
    pos=>{
      window.userLoc=pos.coords;
      map.setView([pos.coords.latitude,pos.coords.longitude],15);
      L.circle([pos.coords.latitude,pos.coords.longitude],
               {radius:5,color:'blue'}).addTo(map);
      fetchPlaces();
    },
    ()=>{
      showMsg('Location denied, centering on NYC.');    // fallback
      map.setView([40.7128,-74.0060],12);
    }
  );
}else{
  showMsg('Geolocation not supported; centering on NYC.');
  map.setView([40.7128,-74.0060],12);
}
