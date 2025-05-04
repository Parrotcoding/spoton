// script.js
/* ---------- config ---------- */
const FILTERS = {
  all:      {label:'All',         overpass:''},
  restaurant:{label:'Restaurants',overpass:'["amenity"="restaurant"]'},
  cafe:     {label:'Cafes',       overpass:'["amenity"="cafe"]'},
  bar:      {label:'Bars',        overpass:'["amenity"="bar"]'},
  park:     {label:'Parks',       overpass:'["leisure"="park"]'},
  shopping_mall:{label:'Shopping',overpass:'["shop"="mall"]'},
  lodging:  {label:'Hotels',      overpass:'["tourism"="hotel"]'},
  gym:      {label:'Gyms',        overpass:'["leisure"="fitness_centre"]'}
};
let currentFilter = 'all';

/* ---------- UI refs ---------- */
const mapEl      = document.getElementById('map');
const listEl     = document.getElementById('places-list');
const chipsEl    = document.getElementById('chips');
const searchEl   = document.getElementById('search-input');

/* ---------- build chips ---------- */
Object.entries(FILTERS).forEach(([key,{label}])=>{
  const btn=document.createElement('button');
  btn.textContent=label;
  btn.dataset.filter=key;
  btn.className='chip';
  btn.onclick=()=>{currentFilter=key;highlightChip();fetchPlaces();};
  chipsEl.appendChild(btn);
});
function highlightChip(){
  chipsEl.querySelectorAll('.chip').forEach(btn=>{
    btn.classList.toggle('chip--active',btn.dataset.filter===currentFilter);
  });
}
highlightChip();

/* ---------- Leaflet ---------- */
const map = L.map('map').setView([0,0],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {attribution:'© OpenStreetMap'})
  .addTo(map);
const markerLayer=L.layerGroup().addTo(map);

/* ---------- helpers ---------- */
const MSG=(txt)=>{listEl.innerHTML=`<p class="p-4 text-gray-500">${txt}</p>`;};
const radius = 1000;                        // m
const dDeg   = radius/111000;               // ≈ deg

/* free‑text list filter */
searchEl.addEventListener('input',()=>{
  const q=searchEl.value.toLowerCase();
  listEl.querySelectorAll('[data-name]').forEach(div=>{
    div.classList.toggle('hidden',!div.dataset.name.includes(q));
  });
});

/* ---------- fetch & render ---------- */
function fetchPlaces(){
  if(!window.userLoc){MSG('Locating…');return;}

  const {latitude:lat,longitude:lon}=window.userLoc;
  const box=[lat-dDeg,lon-dDeg,lat+dDeg,lon+dDeg]; // S,W,N,E
  const f=FILTERS[currentFilter].overpass;
  /* only named features */
  const q=`
    [out:json][timeout:25];
    ( node${f}["name"~"."](${box});
      way${f}["name"~"."](${box});
      rel${f}["name"~"."](${box});
      node${f}["brand"~"."](${box});
      way${f}["brand"~"."](${box});
      rel${f}["brand"~"."](${box});
    ); out center 50;`;
  MSG('Loading…');

  fetch('https://overpass-api.de/api/interpreter',
        {method:'POST',body:new URLSearchParams({data:q})})
    .then(r=>r.json())
    .then(json=>render(json.elements||[]))
    .catch(()=>MSG('Error loading data.'));
}
function render(elems){
  markerLayer.clearLayers();
  listEl.innerHTML='';

  const places=elems.map(el=>{
    const lat=el.lat??el.center?.lat, lon=el.lon??el.center?.lon;
    const tags=el.tags||{}, name=(tags.name||tags.brand||tags.operator||'').trim();
    return (lat&&lon&&name)?{lat,lon,name,tags}:null;
  }).filter(Boolean);

  if(!places.length){MSG('Nothing found 😕');return;}

  searchEl.value=''; // reset search each refresh
  places.forEach(({lat,lon,name,tags})=>{
    /* marker */
    const m=L.marker([lat,lon]).addTo(markerLayer)
      .bindPopup(`<strong>${name}</strong><br>${tags.amenity||tags.shop||tags.leisure||''}`);

    /* list item */
    const row=document.createElement('div');
    row.dataset.name=name.toLowerCase();
    row.className='list-row';
    row.innerHTML=`<span>${name}</span>`;
    row.onclick=()=>{map.setView([lat,lon],17);m.openPopup();};
    listEl.appendChild(row);
  });
}

/* ---------- geolocate then start ---------- */
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
      MSG('Location blocked – showing NYC.');
      map.setView([40.7128,-74.0060],12);
    }
  );
}else{
  MSG('Geolocation unsupported – showing NYC.');
  map.setView([40.7128,-74.0060],12);
}
