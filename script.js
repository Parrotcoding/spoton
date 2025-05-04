// script.js
/* ----- category chips ----- */
const FILTERS = {
  all:          { label:'All',    overpass:'' },
  food:         { label:'Food',   overpass:'["amenity"~"restaurant|cafe|fast_food|bar|pub"]' },
  shop:         { label:'Shops',  overpass:'["shop"]' },
  lodging:      { label:'Hotels', overpass:'["tourism"="hotel"]' },
  leisure:      { label:'Leisure',overpass:'["leisure"]' },
  culture:      { label:'Culture',overpass:'["tourism"~"museum|gallery|attraction"]' },
  sport:        { label:'Sports', overpass:'["sport"]' }
};
let currentFilter='all';

/* ----- DOM ----- */
const chipsEl=document.getElementById('chips');
const listEl =document.getElementById('places-list');
const searchEl=document.getElementById('search-input');

/* build chips */
for(const [k,{label}] of Object.entries(FILTERS)){
  const b=document.createElement('button');
  b.textContent=label; b.dataset.f=k; b.className='chip';
  b.onclick=()=>{currentFilter=k;highlight();fetchPlaces();};
  chipsEl.appendChild(b);
}
const highlight=()=>chipsEl.querySelectorAll('.chip')
  .forEach(btn=>btn.classList.toggle('chip--active',btn.dataset.f===currentFilter));
highlight();

/* ----- Leaflet map ----- */
const map=L.map('map').setView([40.7128,-74.006],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {attribution:'© OpenStreetMap'}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

/* ----- helpers ----- */
const msg=t=>listEl.innerHTML=`<p class="p-4 text-gray-500 italic">${t}</p>`;
searchEl.addEventListener('input',()=>{
  const q=searchEl.value.toLowerCase();
  listEl.querySelectorAll('[data-name]')
        .forEach(c=>c.classList.toggle('hidden',!c.dataset.name.includes(q)));
});

/* review score (same formula) */
const scoreOf=t=>{
  const rating=parseFloat(t.rating||0);
  const count =parseInt(t.review_count||0,10);
  if(rating) return rating*20+count/10;
  if(t.stars   ) return parseInt(t.stars,10)*30;
  if(t.michelin||t.gault_millau) return 85;
  if(t.tourism==='attraction'  ) return 80;
  return 0;
};

/* ----- Overpass query builder ----- */
const POI_TAGS=['amenity','shop','leisure','tourism','sport','craft','office','historic','attraction'];
const named='["name"~"."]';
const buildQuery=bbox=>{
  const b=bbox.join(',');
  if(currentFilter!=='all'){
    const f=FILTERS[currentFilter].overpass;
    return `[out:json][timeout:25];
      (node${f}${named}(${b});
       way${f}${named}(${b});
       rel${f}${named}(${b}););
      out center 300;`;
  }
  const parts=POI_TAGS.flatMap(tag=>[
    `node["${tag}"]${named}(${b});`,
    `way["${tag}"]${named}(${b});`,
    `rel["${tag}"]${named}(${b});`
  ]).join('\n');
  return `[out:json][timeout:25];(${parts});out center 300;`;
};

/* ----- throttle Overpass ----- */
let lastCtr=map.getCenter(), lastZoom=map.getZoom(), timer;
map.on('moveend',()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>{
    const ctr=map.getCenter();
    const dist=map.distance(ctr,lastCtr);
    const z=map.getZoom();
    if(dist>250||Math.abs(z-lastZoom)>=1){
      lastCtr=ctr; lastZoom=z; fetchPlaces();
    }
  },2000);
});

/* ----- fetch + render ----- */
function fetchPlaces(){
  const b=map.getBounds();
  const bbox=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()];
  msg('Loading places…');
  fetch('https://overpass-api.de/api/interpreter',{
    method:'POST',body:new URLSearchParams({data:buildQuery(bbox)})
  })
  .then(r=>r.json())
  .then(d=>render(d.elements||[]))
  .catch(()=>msg('Overpass did not respond (rate‑limited).'));
}

function render(elems){
  markerLayer.clearLayers(); listEl.innerHTML='';
  const seen=new Set();
  const places=elems.map(el=>{
    const lat=el.lat??el.center?.lat, lon=el.lon??el.center?.lon;
    const tags=el.tags||{}, name=(tags.name||'').trim();
    if(!lat||!lon||!name) return null;
    const id=`${lat.toFixed(5)}|${lon.toFixed(5)}`;
    if(seen.has(id)) return null; seen.add(id);
    return {lat,lon,name,tags,score:scoreOf(tags)};
  }).filter(Boolean)
    .sort((a,b)=>b.score-a.score);   // higher score first

  if(!places.length){msg('No named POIs here.');return;}
  searchEl.value='';

  places.forEach(({lat,lon,name,tags,score})=>{
    const m=L.marker([lat,lon]).addTo(markerLayer)
            .bindPopup(`<strong>${name}</strong><br>${tags.amenity||tags.shop||
                       tags.leisure||tags.tourism||''}`);

    /* card */
    const c=document.createElement('div');
    c.dataset.name=name.toLowerCase(); c.className='card';
    const badge=tags.rating ? `⭐ ${tags.rating}`
         : tags.stars       ? `★ ${tags.stars}`
         : tags.michelin    ? 'Michelin‑listed'
         : tags.tourism==='attraction' ? 'Attraction' : '';
    c.innerHTML=`
      <div class="flex justify-between items-center mb-1">
        <span class="font-semibold">${name}</span>
        <span class="text-xs bg-gray-200 px-2 py-0.5 rounded">
          ${tags.amenity||tags.shop||tags.leisure||tags.tourism||'POI'}
        </span>
      </div>
      ${badge?`<div class="text-sm text-gray-600 mb-2">${badge}</div>`:''}
      <button class="info-btn">View</button>`;
    c.querySelector('.info-btn').onclick=()=>{
      map.setView([lat,lon],17);m.openPopup();
    };
    listEl.appendChild(c);
  });
}

/* ----- initial load ----- */
navigator.geolocation.getCurrentPosition(
  pos=>{map.setView([pos.coords.latitude,pos.coords.longitude],15);fetchPlaces();},
  ()=>fetchPlaces()
);
