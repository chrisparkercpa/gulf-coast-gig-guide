"use strict";

const venues = [
  ["AJ's Seafood & Oyster Bar","Destin","FL","Bar","Waterfront"],
  ["AJ's on the Bayou","Fort Walton Beach","FL","Bar","Waterfront"],
  ["The Village Door","Destin","FL","Club",""],
  ["Red Bar","Grayton Beach","FL","Bar",""],
  ["Shunk Gulley Oyster Bar","Santa Rosa Beach","FL","Bar","Waterfront"],
  ["Old Florida Fish House","Seagrove Beach","FL","Restaurant","Waterfront"],
  ["Tootsie's Orchid Lounge","Panama City Beach","FL","Bar",""],
  ["Pineapple Willy's","Panama City Beach","FL","Bar","Waterfront"],
  ["House of Henry","Panama City","FL","Pub",""],
  ["Flora-Bama","Perdido Key","FL","Bar","Waterfront"],
  ["Seville Quarter","Pensacola","FL","Club",""],
  ["Vinyl Music Hall","Pensacola","FL","Music Hall",""],
  ["The Wharf Amphitheater","Orange Beach","AL","Amphitheater","Waterfront"],
  ["Big Beach Brewing","Gulf Shores","AL","Brewery",""],
  ["LuLu's Gulf Shores","Gulf Shores","AL","Restaurant","Waterfront"],
  ["The Hangout","Gulf Shores","AL","Bar","Waterfront"],
  ["Callaghan's Irish Social Club","Mobile","AL","Pub",""],
  ["Soul Kitchen","Mobile","AL","Music Hall",""],
  ["The Peoples Room","Mobile","AL","Listening Room",""],
  ["Manci's Antique Club","Daphne","AL","Bar",""],
  ["Ground Zero Blues Club","Biloxi","MS","Club",""],
  ["Beau Rivage","Biloxi","MS","Casino","Waterfront"],
  ["Hard Rock Biloxi","Biloxi","MS","Casino","Waterfront"],
  ["The Shed BBQ & Blues Joint","Ocean Springs","MS","Bar",""],
  ["Government Street Grocery","Ocean Springs","MS","Bar",""],
  ["Murky Waters BBQ","Gulfport","MS","Bar",""],
  ["The Blind Tiger","Bay St. Louis","MS","Bar","Waterfront"],
  ["Hollywood Casino","Bay St. Louis","MS","Casino","Waterfront"],
  ["Island View Casino","Gulfport","MS","Casino","Waterfront"]
];

const bands = ["Coastal Drifters","Bayou Rhythm Band","Emerald Coast Highway","The Sandbar Saints","Bluewater Revival","Gulf Breeze Trio","Sunset Social Club","Pelican Pickers","Tidal Wave Band","The Oyster Shuckers","Magnolia Moon","Saltwater Cowboys","Neon Palms","Southern Current","Beach House Blues","The Dock Rockers","Moonlight Mile","Delta Groove","Mobile Bay All-Stars","Seaside Soul","Orange Beach Outlaws","The Biloxi Beat","Pine Island Jam","Harbor Lights","Coastline Country"];
const genres = ["Rock","Country","Blues","Acoustic","Soul","Pop","Americana","Dance"];

function localDate(offset){
  const d=new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()+offset);
  return d;
}
function ymd(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

const events = Array.from({length:122},(_,i)=>{
  const v=venues[i%venues.length];
  const offset=i%28;
  const date=localDate(offset);
  const free=i%4!==0;
  return {
    id:i+1,
    date:ymd(date),
    time:["5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM"][i%5],
    band:bands[i%bands.length],
    venue:v[0],city:v[1],state:v[2],type:v[3],
    waterfront:v[4]==="Waterfront",
    casino:v[3]==="Casino",
    genre:genres[i%genres.length],
    free,
    details:`https://www.google.com/search?q=${encodeURIComponent(v[0]+" live music schedule")}`,
    directions:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v[0]+", "+v[1]+", "+v[2])}`
  };
});

const el={
  grid:document.getElementById("eventGrid"),summary:document.getElementById("summaryText"),empty:document.getElementById("emptyState"),
  state:document.getElementById("stateFilter"),city:document.getElementById("cityFilter"),venue:document.getElementById("venueFilter"),
  type:document.getElementById("typeFilter"),genre:document.getElementById("genreFilter"),free:document.getElementById("freeFilter"),
  waterfront:document.getElementById("waterfrontFilter"),casino:document.getElementById("casinoFilter"),sort:document.getElementById("sortFilter")
};
let activeRange="all";

function addOptions(select,values){
  [...new Set(values)].sort((a,b)=>a.localeCompare(b)).forEach(value=>{
    const option=document.createElement("option"); option.value=value; option.textContent=value; select.appendChild(option);
  });
}
addOptions(el.state,events.map(x=>x.state)); addOptions(el.city,events.map(x=>x.city)); addOptions(el.venue,events.map(x=>x.venue)); addOptions(el.type,events.map(x=>x.type)); addOptions(el.genre,events.map(x=>x.genre));

function parseYmd(value){const [y,m,d]=value.split("-").map(Number); return new Date(y,m-1,d,12,0,0,0);}
function startToday(){const d=new Date(); d.setHours(12,0,0,0); return d;}
function dateMatches(dateString){
  if(activeRange==="all") return true;
  const eventDate=parseYmd(dateString); const today=startToday(); const diff=Math.round((eventDate-today)/86400000);
  if(activeRange==="today") return diff===0;
  if(activeRange==="tomorrow") return diff===1;
  if(activeRange==="7days") return diff>=0&&diff<=6;
  if(activeRange==="weekend"){
    const day=today.getDay();
    const daysToFriday=(5-day+7)%7;
    const friday=new Date(today); friday.setDate(today.getDate()+daysToFriday);
    const monday=new Date(friday); monday.setDate(friday.getDate()+3);
    return eventDate>=friday&&eventDate<monday;
  }
  return true;
}
function selected(select){return select.value==="all"?null:select.value;}
function getFiltered(){
  const filters={state:selected(el.state),city:selected(el.city),venue:selected(el.venue),type:selected(el.type),genre:selected(el.genre)};
  let list=events.filter(x=>dateMatches(x.date)&&(!filters.state||x.state===filters.state)&&(!filters.city||x.city===filters.city)&&(!filters.venue||x.venue===filters.venue)&&(!filters.type||x.type===filters.type)&&(!filters.genre||x.genre===filters.genre)&&(!el.free.checked||x.free)&&(!el.waterfront.checked||x.waterfront)&&(!el.casino.checked||x.casino));
  list.sort((a,b)=>el.sort.value==="city"?a.city.localeCompare(b.city)||a.date.localeCompare(b.date):el.sort.value==="venue"?a.venue.localeCompare(b.venue)||a.date.localeCompare(b.date):a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  return list;
}
function formatDate(value){return parseYmd(value).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});}
function card(x){
  const article=document.createElement("article"); article.className="event-card";
  article.innerHTML=`<div class="event-top"><div class="date">${formatDate(x.date)} • ${x.time}</div><h3>${x.band}</h3></div><div class="event-body"><p class="venue">${x.venue}</p><p class="meta">${x.city}, ${x.state}</p><div class="badges"><span class="badge">${x.genre}</span><span class="badge">${x.type}</span>${x.free?'<span class="badge">Free</span>':''}${x.waterfront?'<span class="badge">Waterfront</span>':''}${x.casino?'<span class="badge">Casino</span>':''}</div><div class="card-actions"><a class="details" href="${x.details}" target="_blank" rel="noopener">Check schedule</a><a class="directions" href="${x.directions}" target="_blank" rel="noopener">Directions</a></div></div>`;
  return article;
}
function render(){
  const list=getFiltered(); el.grid.replaceChildren(...list.map(card)); el.summary.textContent=`Showing ${list.length} of ${events.length} shows`; el.empty.hidden=list.length!==0;
}

document.getElementById("dateButtons").addEventListener("click",e=>{
  const b=e.target.closest("button[data-range]"); if(!b)return; activeRange=b.dataset.range;
  document.querySelectorAll("button[data-range]").forEach(x=>x.classList.toggle("active",x===b)); render();
});
[el.state,el.city,el.venue,el.type,el.genre,el.free,el.waterfront,el.casino,el.sort].forEach(control=>control.addEventListener("change",render));
document.getElementById("resetButton").addEventListener("click",()=>{
  activeRange="all"; document.querySelectorAll("button[data-range]").forEach(x=>x.classList.toggle("active",x.dataset.range==="all"));
  [el.state,el.city,el.venue,el.type,el.genre].forEach(x=>x.value="all"); [el.free,el.waterfront,el.casino].forEach(x=>x.checked=false); el.sort.value="date"; render();
});
render();
