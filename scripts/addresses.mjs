import fs from 'node:fs';

// Build-time only. Reserve the readable addresses already published for stations with numeric IDs.
const retained=new Map(Object.entries(JSON.parse(fs.readFileSync(new URL('./station-addresses.json',import.meta.url),'utf8'))));
export function stationAddresses(list){
 const map=new Map(),reserved=new Set(retained.values()),taken=new Set([...reserved,...list.map(s=>s.id)]);
 for(const s of list){
  if(retained.has(s.name_ko)){map.set(s.id,retained.get(s.name_ko));continue;}
  if(!reserved.has(s.id)){map.set(s.id,s.id);continue;}
  // A new source ID can match an old readable address. Leave that address with its original station.
  let fallback=`station-${s.id}`;
  for(let suffix=2;taken.has(fallback);suffix++)fallback=`station-${s.id}-${suffix}`;
  map.set(s.id,fallback);taken.add(fallback);
 }
 return map;
}
// One data file as the build reads it: the station index keeps each old ID as legacyId (the old address, which the build leaves a pointer at), each train stop names its station by address name, and each stretch of the Stats page's route map names its two stations by address name.
export function addressed(file,data,map){
 if(file==='stations/index.json')for(const s of data.stations){s.legacyId=s.id;s.id=map.get(s.id)||s.id;}
 else if(file==='stats.json')for(const w of Object.values(data.windows))for(const x of w.segments||[]){x[0]=map.get(x[0])||x[0];x[1]=map.get(x[1])||x[1];}
 else if(file.startsWith('trains/'))for(const t of data.timetables)for(const s of t.stops)s.station_id=map.get(s.station_id)||s.station_id;
 return data;
}
