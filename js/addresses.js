// Page addresses use a station's name, not its stable ID. A station given an ID before it had an English name (st-171) would otherwise keep an address like /station/st-171/ for good.
// The data files keep the IDs: the build and the checks rename them in memory as they read, so every page, link, find.json and journeys/data.json uses the address names. Build-time only.
const OPAQUE=/^st-\d+$/;
export const slugOf=name=>String(name||'').normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Old ID to address name, for every station. A readable ID is its own name; an st-N ID takes its English name. Two stations that would share an address stop the build.
export function stationAddresses(list){
 const map=new Map(),taken=new Map();
 for(const s of list)if(!OPAQUE.test(s.id)){map.set(s.id,s.id);taken.set(s.id,s.id);}
 for(const s of list)if(OPAQUE.test(s.id)){
  const slug=slugOf(s.name);
  if(!slug)throw Error(`Station ${s.id} has no English name to build an address from`);
  if(taken.has(slug))throw Error(`Stations ${taken.get(slug)} and ${s.id} would share the address ${slug}`);
  map.set(s.id,slug);taken.set(slug,s.id);
 }
 return map;
}
// One data file as the build reads it: the station index keeps each old ID as legacyId (the old address, which the build leaves a pointer at), and each train stop names its station by address name.
export function addressed(file,data,map){
 if(file==='stations/index.json')for(const s of data.stations){s.legacyId=s.id;s.id=map.get(s.id)||s.id;}
 else if(file.startsWith('trains/'))for(const t of data.timetables)for(const s of t.stops)s.station_id=map.get(s.station_id)||s.station_id;
 return data;
}
