#!/usr/bin/env node
// Render every train and day page from the data folder and check each one: no error; no "undefined", "NaN", or "null" in the text;
// the final stop's dots match the heading's count; each row's share matches its dots; and a title and description for search
// engines (an empty page has none, so it is not indexed). A day page's delay buckets add up to its stops, and its stops and share match days.json.
// The all-trains page has one row for each train page, each linking to it, with the share its train file gives.
// A train page with fewer than 10 runs says why the lists show no share for it, and no other does.
// Station tables show each call from the most recent timetable. Their figures use reports at matching visits.
// Raw train reports also check the rolling windows, archive days, and Stats data independent of the renderers.
// The all-journeys page has one row for each journey that at least 40 trains make, with the trains, arrivals, and share that the train files give when counted again directly,
// and the panel for a pair of stations gives the same figures. Synthetic loop cases exercise failures the current export may not contain.
// Usage: node scripts/check_trains.mjs [data-folder]   (default: data)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.resolve(process.argv[2]||path.join(root,'data'))+'/';
const {renderTrain,pageInfo}=await import(pathToFileURL(path.join(root,'js/train.js')));
const {renderDay,pageInfo:dayInfo}=await import(pathToFileURL(path.join(root,'js/day.js')));
const {trainRow,renderTrains,pageInfo:trainsInfo}=await import(pathToFileURL(path.join(root,'js/trains.js')));
const {stationRows,renderStation,pageInfo:stationInfo}=await import(pathToFileURL(path.join(root,'js/station.js')));
const {stationList,renderStations,pageInfo:stationsInfo}=await import(pathToFileURL(path.join(root,'js/stations.js')));
const {ROW_CAP,pct0,stationSearchKey,conflictingArrivals}=await import(pathToFileURL(path.join(root,'js/utils.js')));
const {journeyData,compactJourneyData,indexJourneys,pageable,journeysAt,journeyOptions,pairStats,resultHTML,renderJourneys,renderJourney,journeyPageInfo,journeyPath,journeysCard,journeysFrom,journeysOfStation,SHOWN_AT_STATION,hourBuckets,HOUR_MIN_ARRIVALS,pageInfo:journeysInfo,MIN_TRAINS}=await import(pathToFileURL(path.join(root,'js/journeys.js')));
const {stationAddresses,addressed}=await import(pathToFileURL(path.join(root,'scripts/addresses.mjs')));
const {localeUtils}=await import(pathToFileURL(path.join(root,'js/locale.js')));
const {renderStats,pageInfo:statsInfo}=await import(pathToFileURL(path.join(root,'js/stats.js')));
// Use the same frozen public station addresses as the build.
const rawRead=file=>JSON.parse(fs.readFileSync(data+file,'utf8')),slugs=stationAddresses(rawRead('stations/index.json').stations),read=file=>addressed(file,rawRead(file),slugs),stations=read('stations/index.json'),days=read('days.json').days;
const jsonFiles=folder=>fs.existsSync(data+folder)?fs.readdirSync(data+folder).filter(file=>file.endsWith('.json')).sort():[];
const trainFiles=jsonFiles('trains'),trains=trainFiles.map(file=>read('trains/'+file));
const archiveFiles=jsonFiles('days'),dayDocuments=new Map(archiveFiles.map(file=>[file.slice(0,-5),read('days/'+file)]));
const problems=[];let pages=0,empty=0;
assert.equal(new Set(slugs.values()).size,slugs.size,'station addresses must be unique');
// A published numeric ID used a readable English address. A later translation must not change it,
// and a newly assigned source ID must not take that address.
const addressCheck=stationAddresses([{id:'st-99',name:'Changed transliteration',name_ko:'아화'},
 {id:'ahwa',name:'New station',name_ko:'새 역'},{id:'station-ahwa',name:'Another station',name_ko:'다른 역'}]);
assert.equal(addressCheck.get('st-99'),'ahwa');
assert.equal(addressCheck.get('ahwa'),'station-ahwa-2');
assert.equal(addressCheck.get('station-ahwa'),'station-ahwa');
// A station table still uses human-readable filter labels. Do not point a shared label at the wrong journey.
{
 const routes=[{fromId:'a',toId:'b',to:'Shared',toKey:'station:b',trains:40,arrivals:1},
  {fromId:'a',toId:'c',to:'Shared',toKey:'station:c',trains:40,arrivals:1},
  {fromId:'a',toId:'d',to:'Distinct',toKey:'Distinct',trains:40,arrivals:1}];
 assert.deepEqual([...journeysFrom({id:'a'},routes)],[['Distinct','journey/a-to-d/']]);
}
// Thirty completed dates can occupy a calendar span longer than thirty days.
for(const locale of ['en','ko']){
 const {span,windowPhrase}=localeUtils(locale),expected=locale==='ko'?'수집 완료 30일':'30 completed days';
 assert(span('2026-09-06','2026-10-06',30).startsWith(expected));
 assert.equal(windowPhrase('2026-09-06','2026-10-06',30),expected);
 assert(!span('2026-09-06','2026-10-05',30).startsWith(expected));
}
// An empty newest window must not hide a usable all-time view.
{
 const w={from:'2026-10-01',to:'2026-10-01',days:1,stops:1,punctual:1,late:0,share_punctual:1,typical_late_delay:null,trains:1,buckets:[1,0,0,0,0],types:[],hours:Array.from({length:7},()=>Array(24).fill(null)),segments:[]};
 const stats={windows:{month:{...w,stops:0},all:w}};
 for(const locale of ['en','ko']){
  assert(statsInfo(stats,locale));const html=renderStats(stats,locale);
  assert(html.includes('data-frame="all" aria-pressed="true"'));
  assert(html.includes('<section class="stats-frame" data-frame="all">'));
  assert(!html.includes('data-frame="month"'));
 }
}
const sum=values=>values.reduce((a,b)=>a+b,0);
const roundedShare=(value,count,total)=>total?Number.isFinite(value)&&Math.abs(value-count/total)<=0.000050000001:value===null;
const countBands=delays=>[
 delays.filter(d=>d<=5).length,delays.filter(d=>d>5&&d<=10).length,delays.filter(d=>d>10&&d<=20).length,
 delays.filter(d=>d>20&&d<=30).length,delays.filter(d=>d>30).length];
const typicalLate=delays=>{
 const late=delays.filter(d=>d>5).sort((a,b)=>a-b),n=late.length;
 return n?Math.round((late[Math.floor((n-1)/2)]+late[Math.floor(n/2)])/2):null;
};
const meta=rawRead('meta.json'),rolling=days.slice(-30),rollingDates=new Set(rolling.map(d=>d.date));
if(days.some(({date},i)=>date!==archiveFiles[i]?.slice(0,-5))||archiveFiles.length!==days.length)
 problems.push('archive: days.json and individual day files differ or are out of date order');
if(meta.first_complete_date!==(days[0]?.date??null)||meta.last_complete_date!==(days.at(-1)?.date??null))
 problems.push('archive: the completed date range in meta.json differs from days.json');
const rawByDate=new Map(rolling.map(d=>[d.date,[]])),trainReports=new Map(),seenRuns=new Set();
for(const [i,train] of trains.entries()){
 const file=trainFiles[i],schedule=new Map(train.timetables.map(t=>[t.id,t.stops])),dates=new Set(),w=train.windows.month;
 const fail=why=>problems.push(`${file}: ${why}`),all=[],finals=[];
 if(train.id!==file.slice(0,-5))fail('train ID differs from the filename');
 if(w.days!==rolling.length||w.from!==(rolling[0]?.date??null)||w.to!==(rolling.at(-1)?.date??null))fail('train window differs from the completed dates');
 let ok=0;
 for(const {date,status,timetable,delays} of train.runs){
  if(dates.has(date))fail(`two public outcomes on ${date}`);
  dates.add(date);
  if(!rollingDates.has(date)){fail(`run on ${date} is outside the completed dates`);continue;}
  if(status==='unavailable'){
   if(timetable!==null||delays!==null)fail(`unavailable run on ${date} contains a timetable or delay`);
   continue;
  }
  const stops=schedule.get(timetable);
  if(status!=='ok'||!stops||!Array.isArray(delays)||delays.length!==stops.length){fail(`run on ${date} has no matching delay array and timetable`);continue;}
  const key=`${date}/${train.number}`;
  if(seenRuns.has(key))fail(`train number ${train.number} has more than one saved run on ${date}`);
  seenRuns.add(key);ok++;
  const timed=stops.filter(s=>s.arrival!=null),values=[];
  for(const [ordinal,stop] of stops.entries()){
   const value=delays[ordinal];
   if(stop.ordinal!==ordinal||value!==null&&(!Number.isInteger(value)||stop.arrival==null))fail(`invalid delay at stop ${ordinal} on ${date}`);
   if(Number.isInteger(value)&&stop.arrival!=null)values.push(value);
  }
  all.push(...values);
  const final=delays[timed.at(-1)?.ordinal];if(Number.isInteger(final))finals.push(final);
  rawByDate.get(date).push({id:train.id,number:train.number,type:train.type,values,stops,delays});
 }
 if(w.runs!==ok||w.final_reported!==finals.length||w.final_on_time!==finals.filter(d=>d<=5).length||
    !roundedShare(w.share_punctual,all.filter(d=>d<=5).length,all.length)||w.typical_late_delay!==typicalLate(all))
  fail('rolling figures do not match the train’s reports');
 trainReports.set(train.id,{finalReported:finals.length,finalWithin:finals.filter(d=>d<=5).length,longest:Math.max(0,...all)});
}
const rawRolling=selected=>selected.flatMap(d=>rawByDate.get(d.date));
for(const name of ['yesterday','month']){
 const selected=name==='yesterday'?days.slice(-1):rolling,window=rawRead(`windows/${name}.json`),s=window.summary.all;
 const recent=rawRolling(selected),values=recent.flatMap(r=>r.values),punctual=values.filter(d=>d<=5).length;
 if(window.days!==selected.length||window.from!==(selected[0]?.date??null)||window.to!==(selected.at(-1)?.date??null)||
    s.stops!==values.length||s.punctual!==punctual||s.late!==values.length-punctual||
    !roundedShare(s.share_punctual,punctual,values.length)||s.typical_late_delay!==typicalLate(values))
  problems.push(`${name}: rolling figures do not match the completed dates and train reports`);
 if(name==='yesterday'){
  const dots=new Map(window.trains.map(train=>[train.id,train]));
  if(recent.length!==window.trains.length||dots.size!==recent.length||recent.some(run=>{
   const dot=dots.get(run.id),first=run.stops[0],last=run.stops.at(-1);
   return !dot||dot.number!==run.number||dot.type!==run.type||dot.origin!==first?.station||dot.destination!==last?.station||
    dot.departure!==first?.departure||!roundedShare(dot.share_punctual,run.values.filter(d=>d<=5).length,run.values.length);
  }))problems.push('yesterday: the front-page train records do not match the saved runs');
 }
}
// Old train files have rotated out. Check the archive-wide window against the retained day documents,
// and use the full dated trains to check rolling Stats breakdowns, even when the public view groups train types.
if(fs.existsSync(data+'stats.json')){
 const {windows}=rawRead('stats.json');
 const periods=days.length?[['yesterday',days.slice(-1)],['week',days.slice(-7)],['month',rolling],['all',days]]:[];
 try{assert.deepEqual(Object.keys(windows).sort(),periods.map(([name])=>name).sort());}
 catch(error){problems.push(`stats: missing or unexpected windows: ${error.message}`);}
 const zone=()=>Array.from({length:7},()=>Array(24).fill(null));
 const heatTotals=(cells)=>{
  assert(cells.length===7&&cells.every(row=>row.length===24),'a heatmap must have seven rows of 24 hours');
  const counts=cells.flat().filter(cell=>cell!==null);
  assert(counts.every(cell=>cell.length===2&&cell.every(Number.isInteger)&&cell[0]>0&&cell[1]>=0&&cell[1]<=cell[0]),'invalid heatmap cell');
  return [sum(counts.map(cell=>cell[0])),sum(counts.map(cell=>cell[1]))];
 };
 for(const [name,selected] of periods){
  try{
   const w=windows[name];assert(w,'missing window');
   assert.deepEqual([w.from,w.to,w.days],[selected[0].date,selected.at(-1).date,selected.length]);
   const buckets=Array.from({length:5},(_,i)=>sum(selected.map(d=>dayDocuments.get(d.date).buckets[i])));
   const stops=sum(buckets),punctual=buckets[0];
   assert.deepEqual(w.buckets,buckets);assert.deepEqual([w.stops,w.punctual,w.late],[stops,punctual,stops-punctual]);
   assert(roundedShare(w.share_punctual,punctual,stops),'wrong pooled punctuality');
   const heat=heatTotals(w.hours);
   assert(heat[1]<=punctual&&heat[0]-heat[1]<=stops-punctual,'heatmap counts exceed reported stops');
   assert.deepEqual(buckets,Array.from({length:5},(_,i)=>sum(w.types.map(t=>t.buckets[i]))),'train types must sum to all buckets');
   assert.equal(new Set(w.types.map(t=>t.type)).size,w.types.length,'duplicate train type');
   const typesHeat=w.types.map(type=>{
    const counts=heatTotals(type.hours);
    assert(counts[1]<=type.buckets[0]&&counts[0]-counts[1]<=type.stops-type.buckets[0],`heatmap counts exceed stops for ${type.type}`);
    return counts;
   });
   assert.deepEqual([sum(typesHeat.map(t=>t[0])),sum(typesHeat.map(t=>t[1]))],heat,'train-type heatmaps must sum to the total heatmap');
   const publishedSegments=new Map();
   for(const [a,b,count,delayChange] of w.segments){
    assert(slugs.has(a)&&slugs.has(b)&&Number.isInteger(count)&&count>0&&Number.isInteger(delayChange),'invalid route-segment record');
    const key=[slugs.get(a),slugs.get(b)].sort().join('|');
    assert(!publishedSegments.has(key),'duplicate route-segment record');publishedSegments.set(key,[count,delayChange]);
   }
   if(selected.some(d=>!rawByDate.has(d.date)))continue;
   const values=rawRolling(selected).flatMap(r=>r.values),types=new Map(),hours=zone(),segments=new Map();
   for(const {date} of selected){
    const weekday=(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;
    for(const run of rawByDate.get(date)){
     if(!run.values.length)continue;
     const kind=run.type.startsWith('ITX-')?'ITX':run.type,stat=types.get(kind)||{ids:new Set(),values:[],hours:zone()};
     types.set(kind,stat);stat.ids.add(run.id);stat.values.push(...run.values);
     for(let i=1;i<run.delays.length;i++){
      const start=run.delays[i-1],end=run.delays[i];if(start==null||end==null)continue;
      const key=[run.stops[i-1].station_id,run.stops[i].station_id].sort().join('|'),cell=segments.get(key)||[0,0];
      cell[0]++;cell[1]+=end-start;segments.set(key,cell);
     }
     if(!run.stops[0].departure)continue;
     const hour=Number(run.stops[0].departure.split(':')[0]);
     for(const cells of [hours,stat.hours]){
      const cell=cells[weekday][hour]??=[0,0];
      cell[0]+=run.values.length;cell[1]+=run.values.filter(d=>d<=5).length;
     }
    }
   }
   assert.equal(w.typical_late_delay,typicalLate(values));assert.deepEqual(w.hours,hours);
   assert.deepEqual(publishedSegments,segments,'route-segment figures differ from dated consecutive arrivals');
   assert.equal(w.trains,sum([...types.values()].map(t=>t.ids.size)));assert.equal(w.types.length,types.size);
   for(const type of w.types){
    const expected=types.get(type.type);assert(expected,`unexpected train type ${type.type}`);
    assert.equal(type.trains,expected.ids.size);assert.equal(type.stops,expected.values.length);
    assert.deepEqual(type.buckets,countBands(expected.values));assert.deepEqual(type.hours,expected.hours);
   }
  }catch(error){problems.push(`stats ${name}: ${error.message}`);}
 }
}
// Reconstruct clock readings independently for the affected-page checks.
function reversedReports(stops=[],delays){
 const dated=stops.slice(1).map(({ordinal,arrival,arrival_day_offset})=>{
  if(arrival==null||delays?.[ordinal]==null)return null;
  return {ordinal,time:Date.parse(`2000-01-01T${arrival}:00Z`)/60000+(arrival_day_offset||0)*1440+delays[ordinal]};
 });
 return new Set(dated.flatMap((after,i)=>{
  const before=dated[i-1];
  return before&&after&&before.time>after.time?[before.ordinal,after.ordinal]:[];
 }));
}
const hasArrivalNote=html=>html.includes('class="meta arrival-data-note"');
// Equal minute readings, overnight schedules, missing reports, and departure-only origins do not flag arrivals.
{
 const stops=['22:00','23:50','00:00','00:10'].map((arrival,ordinal)=>({ordinal,arrival,arrival_day_offset:ordinal>=2?1:0}));
 const readings=(...delays)=>({delays});
 const clear=[readings(150,2,-8,0),readings(null,30,null,0),readings(null,0,0,0)];
 assert.deepEqual(conflictingArrivals(stops,clear),new Set());
 assert.deepEqual(conflictingArrivals(stops,[...clear,readings(null,0,-11,0)]),new Set([1,2]));
}
const {trackPoints}=await import(pathToFileURL(path.join(root,'js/track.js')));
const {RAIL}=await import(pathToFileURL(path.join(root,'js/rail.js')));
// The public slugs reverse the stable IDs' sort order. Geometry follows the direction of travel.
const busan={id:'zz-busan',legacyId:'busan'},ulsan={id:'aa-ulsan',legacyId:'st-6'};
assert.deepEqual(trackPoints(busan,ulsan),RAIL['busan|st-6']);
assert.deepEqual(trackPoints(ulsan,busan),[...RAIL['busan|st-6']].reverse());
assert.deepEqual(trackPoints(busan,{id:'an-unmapped-station'}),[]);
// Station lookups accept common spelling and suffix variants in either language.
for(const [query,name] of [['Haengshin','Haengsin'],['Cheonan Asan','Cheonan-Asan'],['Gwangju-Songjeong','Gwangju Songjeong'],['Gimcheon Gumi','Gimcheon (Gumi)'],['SEOUL Station','Seoul'],['SeoulStation','Seoul'],['서울역','서울'],['천안 아산역','천안아산'],['Jinbu (Odaesan) Station','Jinbu (Odaesan)']]){
 if(stationSearchKey(query)!==stationSearchKey(name))problems.push(`station search: ${query} does not match ${name}`);
}
if(stationSearchKey('역곡')!=='역곡')problems.push('station search: removed 역 inside a station name');
if(stationSearchKey('Seoul')===stationSearchKey('Busan'))problems.push('station search: collapsed different station names');
// These expectations are handwritten, not derived from journeySegments: they protect against a shared mistake in lists and panels.
// The current A → B → X → A → C inserts X into the older timetable, shifting return-arrival ordinals.
// It also tests missing/out-of-window/unavailable reports, midnight offsets, and an ambiguous pair alongside a valid direct train.
{
 const stop=(station,ordinal,arrival,departure,offset=0)=>({station_id:station,station,ordinal,arrival,departure,arrival_day_offset:offset,departure_day_offset:offset});
 const old=[stop('A',0,null,'23:00'),stop('B',1,'23:10','23:11'),stop('A',2,'23:50','23:51'),stop('C',3,'00:20',null,1)];
 const current=[old[0],old[1],stop('X',2,'23:30','23:31'),{...old[2],ordinal:3},{...old[3],ordinal:4}];
 const train={id:'loop',number:1,type:'ITX-Maum',windows:{month:{from:'2026-10-15',to:'2026-10-18',runs:3}},timetables:[{id:'old',stops:old},{id:'current',stops:current}],runs:[
  {date:'2026-10-14',status:'ok',timetable:'old',delays:[null,0,0,0]},
  {date:'2026-10-15',status:'ok',timetable:'old',delays:[null,1,17,null]},
  {date:'2026-10-16',status:'ok',timetable:'old',delays:[null,50,3,0]},
  {date:'2026-10-17',status:'ok',timetable:'current',delays:[null,5,2,9,12]},
  {date:'2026-10-18',status:'unavailable',timetable:'current',delays:[null,0,0,0,0]}]};
 try{
  const full=journeyData([train],['A','B','X','C'].map(id=>({id,name:id}))),data=compactJourneyData(full),idx=new Map(data.stations.map(([name],i)=>[name,i]));
  const detailed=indexJourneys(full);
  assert.equal(pairStats(detailed,idx.get('B'),idx.get('A')).hasConflictingArrivals,true);
  assert.equal(pairStats(detailed,idx.get('X'),idx.get('A')).hasConflictingArrivals,false);
  let indexed=indexJourneys(data);
  const find=(a,b)=>pairStats(indexed,idx.get(a),idx.get(b));
  assert.deepEqual(find('B','A'),{trains:[{id:'loop',number:1,type:'ITX-Maum',dep:1391,arr:1430,reported:3,within:1}],reported:3,within:1,typical:39});
  assert.deepEqual(find('B','C'),{trains:[{id:'loop',number:1,type:'ITX-Maum',dep:1391,arr:1460,reported:2,within:1}],reported:2,within:1,typical:69});
  assert.equal(find('A','B').reported,3);assert.equal(find('A','B').within,2);
  assert.equal(find('B','X').reported,1);assert.equal(find('B','X').within,1);
  assert.equal(find('X','A').reported,1);assert.equal(find('X','A').within,0);
  assert.equal(find('X','C').reported,1);assert.equal(find('X','C').within,0);
  assert.equal(find('A','C').trains.length,0);assert.equal(find('C','B').trains.length,0);assert.equal(find('A','A').trains.length,0);
  assert.equal(journeyOptions(indexed).total,7);
  data.trains.push(['direct',2,'KTX',[[idx.get('A'),null,1320,[0,0]],[idx.get('C'),1340,null,[2,2]]]]);
  indexed=indexJourneys(data);
  assert.deepEqual(find('A','C'),{trains:[{id:'direct',number:2,type:'KTX',dep:1320,arr:1340,reported:2,within:2}],reported:2,within:2,typical:20});
  assert.equal(journeysAt(indexed,idx.get('A'),idx.get('C'))[0].trains,1);
 }catch(error){problems.push(`loop journey regression: ${error.message}`);}
}
// A past timetable must allow boarding before the destination and offer only one possible segment.
{
 const patterns=[['A','C','B'],['A','B','A','B','C'],['A','B','C'],['A','B','C']];
 const timetables=patterns.map((pattern,id)=>({id,stops:pattern.map((station_id,ordinal)=>{
  const time=`1${ordinal}:00`;
  return {station_id,ordinal,arrival:ordinal?time:null,departure:ordinal===pattern.length-1||id===2&&station_id==='B'?null:time};
 })}));
 const runs=timetables.map(({id,stops})=>({timetable:id,date:`2026-10-1${id}`,status:'ok',delays:stops.map(()=>id===3?12:0)}));
 runs.push({timetable:3,date:'2026-10-09',status:'ok',delays:[null,65,0]},
  {timetable:3,date:'2026-10-13',status:'unavailable',delays:[null,65,0]});
 const train={id:'changed',number:1,type:'KTX',timetables,runs,windows:{month:{from:'2026-10-10',to:'2026-10-13',runs:4}}};
 const data=journeyData([train],['A','B','C'].map(id=>({id,name:id}))),idx=new Map(data.stations.map(([name],i)=>[name,i]));
 const detail=indexJourneys(data),compact=indexJourneys(compactJourneyData(data));
 const stats=pairStats(detail,idx.get('B'),idx.get('C')),browser=pairStats(compact,idx.get('B'),idx.get('C'));
 assert.deepEqual([stats.reported,stats.within,stats.within15,stats.bands],[1,0,1,[0,0,1,0,0]]);
 assert.equal(stats.hasConflictingArrivals,false);
 assert.deepEqual([browser.reported,browser.within,browser.typical],[1,0,60]);
 assert.equal(pairStats(detail,idx.get('A'),idx.get('C')).reported,3);
 assert.equal(pairStats(detail,idx.get('C'),idx.get('B')).trains.length,0);
}
// Reports belong to the departure hour in their dated timetable, even if no current train uses it.
{
 const makeStops=hour=>[
  {station_id:'A',ordinal:0,arrival:null,departure:`${hour}:50`},
  {station_id:'B',ordinal:1,arrival:`${hour}:59`,departure:null}];
 const month={from:'2026-10-01',to:'2026-10-02',days:2,runs:2};
 const train={id:'changed-hour',number:1,type:'KTX',timetables:[{id:'before',stops:makeStops(10)},{id:'after',stops:makeStops(11)}],runs:[
  {date:month.from,status:'ok',timetable:'before',delays:[null,0]},
  {date:month.to,status:'ok',timetable:'after',delays:[null,12]}],windows:{month}};
 const index=indexJourneys(journeyData([train],[{id:'A',name:'A'},{id:'B',name:'B'}]));
 const stats=pairStats(index,0,1),row=journeysAt(index)[0];
 assert.deepEqual(hourBuckets(stats),[{hour:10,trains:0,reported:1,bands:[1,0,0,0,0]},{hour:11,trains:1,reported:1,bands:[0,0,1,0,0]}]);
 for(const locale of ['en','ko']){
  const html=renderJourney({row,stats},month,locale);
  assert(html.includes('class="hour-col history"')&&html.includes('class="hour-label">10*</span>'));
  assert(!html.includes('data-hour="10"')&&html.includes('data-hour="11"'));
  assert(!html.match(/<select id="trains-dep">(.*?)<\/select>/)[1].includes('value="10"'));
 }
}
for(const [i,file] of trainFiles.entries()){
 const id=file.replace('.json',''),fail=why=>problems.push(`${id}: ${why}`);
 const train=trains[i];
 let html;try{html=renderTrain(train,days,stations);}catch(error){fail(`error ${error.message}`);continue;}
 pages++;
 const w=train.windows.month,byTimetable=new Map(train.timetables.map(t=>[t.id,t.stops]));
 const hasConflict=train.runs.some(r=>r.status==='ok'&&r.date>=w.from&&r.date<=w.to&&reversedReports(byTimetable.get(r.timetable),r.delays).size>0);
 if(hasArrivalNote(html)!==hasConflict)fail('the arrival data note disagrees with the reported clocks');
 if(html.includes('class="glyph-route"')&&!html.includes('href="https://www.openstreetmap.org/copyright"'))fail('route map has no OpenStreetMap credit');
 const text=html.replace(/<[^>]*>/g,' '),bad=text.match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
 const rows=html.split('<div class="rail-row"').slice(1);
 const info=pageInfo(train);
 if(!rows.length){empty++;if(info)fail('an empty page has a title and description, so it would be indexed');continue;}
 if(!info)fail('no title and description');
 else if(info.title.length>80||info.description.length>160||/undefined|NaN|null/.test(info.title+info.description))fail(`title or description is too long or has bad text: ${info.title} / ${info.description}`);
 const runCount=html.match(/· (\d+) runs?</),noted=html.includes('too few to show a share in the train and station lists');
 if(runCount&&(+runCount[1]<10)!==noted)fail(`${runCount[1]} runs but the short-record note is ${noted?'shown':'missing'}`);
 const {finalReported,finalWithin,longest}=trainReports.get(train.id);
 const finals=html.match(/<b>(\d+) of (\d+)<\/b><span>/);
 if(finalReported&&(!finals||+finals[1]!==finalWithin||+finals[2]!==finalReported))
  fail('the final-stop headline does not match the dated timetables');
 const longestText=html.match(/<b>\+([^<]+)<\/b><span>longest delay/);
 const duration=longestText?.[1].match(/^(?:(\d+) h(?: (\d+) min)?|(\d+) min)$/);
 const displayedLongest=duration?Number(duration[3]??(60*Number(duration[1])+Number(duration[2]||0))):null;
 if(displayedLongest!==(longest>5?longest:null))fail('the longest-delay headline does not match the dated timetables');
 const dotsIn=row=>[(row.match(/class="rail-dot"/g)||[]).length,(row.match(/class="rail-dot late( out)?"/g)||[]).length];
 for(const row of rows){
  const [onTime,late]=dotsIn(row),shown=row.match(/rail-share">([^<]*)</)[1],expected=row.includes('rail-origin')?'':onTime+late===0?'—':late===0?'100%':`${Math.min(99,Math.round(onTime/(onTime+late)*100))}%`;
  if(shown!==expected)fail(`a row shows ${shown} but its dots give ${expected}`);
 }
}
let dayPages=0;
const dayIndex=new Map(days.map(day=>[day.date,day]));
for(const [iso,day] of dayDocuments){
 const fail=why=>problems.push(`${iso}: ${why}`),html=renderDay(day,iso),info=dayInfo(day,iso),listed=dayIndex.get(iso);
 dayPages++;
 const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
 if(day.date!==iso||day.buckets.length!==5||day.buckets.some(n=>!Number.isInteger(n)||n<0)||sum(day.buckets)!==day.stops)
  fail('the date or delay buckets do not match the archive');
 if(!listed)fail('the date is not in days.json');
 else if(listed.stops!==day.stops||listed.punctual!==day.buckets[0]||listed.late!==listed.stops-listed.punctual||
         listed.share_punctual!==day.share_punctual||!roundedShare(day.share_punctual,listed.punctual,listed.stops))
  fail('the stop counts or share do not match days.json and the delay buckets');
 if(day.late_trains>day.trains||day.most_delayed.length!==Math.min(10,day.late_trains))fail('the list of biggest delays does not match the number of late trains');
 const reports=rawByDate.get(iso);
 if(reports){
  const values=reports.flatMap(r=>r.values),counted=reports.filter(r=>r.values.length);
  const ranking=counted.map(run=>{
   const delay=Math.max(...run.values),stop=run.stops.find(s=>s.arrival!=null&&run.delays[s.ordinal]===delay);
   return {id:run.id,number:run.number,type:run.type,delay,station:stop.station,departure:run.stops[0].departure};
  }).filter(r=>r.delay>5).sort((a,b)=>b.delay-a.delay||a.departure?.localeCompare(b.departure)||a.number-b.number||a.type.localeCompare(b.type));
  const giveFields=({id,number,type,delay,station,departure})=>({id,number,type,delay,station,departure});
  try{
   assert.deepEqual(day.buckets,countBands(values));
   assert.equal(day.typical_late_delay,typicalLate(values));
   assert.equal(day.trains,counted.length);assert.equal(day.late_trains,ranking.length);
   assert.deepEqual(day.most_delayed.map(giveFields),ranking.slice(0,10));
  }catch(error){fail(`daily figures differ from the saved runs: ${error.message}`);}
 }
 if(day.trains&&(!info||info.title.length>80||info.description.length>200))fail('no title and description, or they are too long');
 if(!day.trains&&info)fail('an empty page has a title and description, so it would be indexed');
}
{
 const fail=why=>problems.push(`all-trains page: ${why}`),month=read('windows/month.json');
 const trainRows=trains.map((train,i)=>[trainFiles[i],trainRow(train)]).filter(([,row])=>row),html=renderTrains(trainRows.map(([,row])=>row),month),info=trainsInfo(trainRows.map(([,row])=>row),month);
 const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
 const links=[...html.matchAll(/<tr data-[^>]*data-share="([^"]*)"><td class="t"><a href="train\/([^"]+)\/"/g)].map(m=>[decodeURIComponent(m[2]),m[1]]);
 if(links.length!==trainRows.length||new Set(links.map(l=>l[0])).size!==links.length)fail(`${links.length} rows for ${trainRows.length} train pages, or a train twice`);
 const share=new Map(links);
 // The Stops at filter reads each row's stops: they must include the train's first and last station, and as many stations as the train has.
 const calledAt=new Map([...html.matchAll(/data-calls="([^"]*)"[^>]*>\s*<td class="t"><a href="train\/([^"]+)\/"/g)].map(m=>[decodeURIComponent(m[2]),m[1].split('|')]));
 if(calledAt.size!==trainRows.length)fail(`${calledAt.size} rows with Stops at stations for ${trainRows.length} trains`);
 for(const [file,row] of trainRows){const c=calledAt.get(row.id)||[];if(!c.includes(row.origin)||!c.includes(row.destination)||c.length!==row.calls.length)fail(`${row.id} has Stops at stations ${c.length}, its file gives ${row.calls.length}`);}
 for(const [file,row] of trainRows){const expected=row.runs>=10&&row.share!=null?String(row.share):'';if(share.get(row.id)!==expected)fail(`${row.id} shows share "${share.get(row.id)}" but its file gives "${expected}"`);}
 if(trainRows.length&&(!info||info.title.length>80||info.description.length>200))fail('no title and description, or they are too long');
}
let stationPages=0;
{
 const month=read('windows/month.json'),calls=stationRows(trains),expected=new Map(),byTrain=new Map(trains.map(t=>[t.id,t]));
 // The station tables describe current calls. Count only each dated counterpart of a current arrival, including return visits.
 for(const run of rawRolling(rolling)){
  const latest=byTrain.get(run.id).timetables.at(-1).stops;
  for(const stop of run.stops){
   const value=run.delays[stop.ordinal];if(stop.arrival==null||value==null)continue;
   const visits=run.stops.slice(0,stop.ordinal).filter(s=>s.station_id===stop.station_id).length;
   const current=latest.filter(s=>s.station_id===stop.station_id)[visits];if(current?.arrival==null)continue;
   const pair=`${stop.station_id}/${run.id}`,counts=expected.get(pair)||[0,0];
   counts[0]++;counts[1]+=value<=5;expected.set(pair,counts);
  }
 }
 let found=0;
 for(const station of stations.stations){
  const rows=calls.get(station.id),fail=why=>problems.push(`station ${station.id}: ${why}`),info=stationInfo(station,rows,month);
  const html=renderStation(station,rows,month);
  const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
  found+=(rows||[]).reduce((a,r)=>a+r.reported,0);
  if(!info){if(rows?.some(r=>r.reported))fail('has arrivals but no title and description');continue;}
  stationPages++;
  if(info.title.length>80||info.description.length>200)fail('title or description is too long');
  const shown=[...html.matchAll(/<tr data-[^>]*data-share="([^"]*)"><td class="arr">[\s\S]*?<a href="train\/([^"]+)\/"/g)];
  if(shown.length!==rows.length)fail(`${shown.length} table rows for ${rows.length} calls`);
  const trainsHere=new Set(rows.map(r=>r.id)).size;
  if(!new RegExp(`>${trainsHere.toLocaleString('en')} trains? stops? here`).test(html))fail(`the header does not count ${trainsHere} trains`);
  shown.forEach(([,share],i)=>{const r=rows[i],want=r.reported>=10?String(r.within/r.reported):'';if(share!==want||decodeURIComponent(shown[i][2])!==r.id)fail(`row ${i} (${r.id}) shows share "${share}" but its figures give "${want}"`);});
  const counts=new Map();
  for(const row of rows){const total=counts.get(row.id)||[0,0];total[0]+=row.reported;total[1]+=row.within;counts.set(row.id,total);}
  for(const [id,total] of counts){
   const key=`${station.id}/${id}`,want=expected.get(key)||[0,0];
   if(total[0]!==want[0]||total[1]!==want[1])fail(`${id} counts ${total}, but its reported stops give ${want}`);
   expected.delete(key);
  }
 }
 if(expected.size)problems.push(`station pages are missing ${expected.size} station and train pairs with reported arrivals`);
 {
  const fail=why=>problems.push(`all-stations page: ${why}`),list=stationList(stations.stations,calls),html=renderStations(list,month),info=stationsInfo(list,month);
  const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
  const links=[...html.matchAll(/<tr data-[^>]*data-share="([^"]*)"><td class="t"><a href="station\/([^"]+)\/"/g)].map(m=>[decodeURIComponent(m[2]),m[1]]);
  if(links.length!==list.length||new Set(links.map(l=>l[0])).size!==links.length)fail(`${links.length} rows for ${list.length} stations, or a station twice`);
  if(list.length!==stationPages)fail(`${list.length} rows for ${stationPages} station pages`);
  const share=new Map(links);
  for(const r of list){const want=r.arrivals>=10?String(r.share):'';if(share.get(r.id)!==want)fail(`${r.id} shows share "${share.get(r.id)}" but its figures give "${want}"`);}
  if(list.reduce((a,r)=>a+r.arrivals,0)!==found)fail('its arrivals differ from the station pages');
  for(const r of list)if(r.trains!==new Set(calls.get(r.id).map(c=>c.id)).size)fail(`${r.id} counts ${r.trains} trains, not its distinct trains`);
  if(list.length&&(!info||info.title.length>80||info.description.length>200))fail('no title and description, or they are too long');
 }
}

let journeyCount=0,journeyPages=0;
{
 const fail=why=>problems.push(`all-journeys page: ${why}`),month=read('windows/month.json');
 const journeySource=journeyData(trains,stations.stations),stops=indexJourneys(compactJourneyData(journeySource)),list=journeysAt(stops).filter(pageable);journeyCount=list.length;
 // Independent source-file recount: do not use the packed journeyData or journeySegments output as the expected result.
 // Enumerate candidate stop pairs in each source timetable. For a run, only a single possible pair contributes.
 const pairs=new Map(),minute=(time,offset)=>Number(time.slice(0,2))*60+Number(time.slice(3))+(offset||0)*1440;
 function candidates(stops){
  const result=new Map();
  stops.forEach((from,i)=>{
   if(from.departure==null)return;
   const dep=minute(from.departure,from.departure_day_offset);
   for(const to of stops.slice(i+1)){
    if(to.arrival==null||from.station_id===to.station_id)continue;
    const arr=minute(to.arrival,to.arrival_day_offset);
    if(arr<dep)continue;
    const key=from.station_id+'|'+to.station_id;
    if(!result.has(key))result.set(key,[]);
    result.get(key).push({dep,arr,ordinal:to.ordinal});
   }
  });
  return result;
 }
 for(const train of trains){
  const w=train.windows?.month;if(!w?.runs)continue;
  const tmap=new Map(train.timetables.map(t=>[t.id,candidates(t.stops)]));
  const schedule=new Map(train.timetables.map(t=>[t.id,t.stops]));
  const current=tmap.get(train.timetables.at(-1).id),runs=train.runs.filter(r=>r.status==='ok'&&r.date>=w.from&&r.date<=w.to);
  const flags=new Map(runs.map(r=>[r,reversedReports(schedule.get(r.timetable),r.delays)]));
  for(const [key,options] of current){
   if(options.length!==1)continue;
   const [{dep,arr}]=options;
   if(!pairs.has(key))pairs.set(key,{reported:0,within:0,w10:0,w15:0,hasConflict:false,details:new Map(),hours:new Map()});
   const p=pairs.get(key);
   const bucketAt=hour=>{
    if(!p.hours.has(hour))p.hours.set(hour,{hour,trains:0,reported:0,bands:[0,0,0,0,0]});
    return p.hours.get(hour);
   };
   bucketAt(Math.floor(dep/60)%24).trains++;
   let reported=0,within=0,w10=0,w15=0,hasConflict=false;
   for(const r of runs){
    const stops=tmap.get(r.timetable)?.get(key);
    if(stops?.length!==1)continue;
    const delay=r.delays?.[stops[0].ordinal];
    if(delay==null)continue;
    reported++;if(delay<=5)within++;if(delay<=10)w10++;if(delay<=15)w15++;
    const hour=bucketAt(Math.floor(stops[0].dep/60)%24);
    const band=[5,10,20,30].filter(limit=>delay>limit).length;
    hour.reported++;hour.bands[band]++;
    hasConflict||=flags.get(r).has(stops[0].ordinal);
   }
   p.reported+=reported;p.within+=within;p.w10+=w10;p.w15+=w15;p.details.set(train.id,{dep,arr,reported,within});
   p.hasConflict||=hasConflict;
  }
 }
 // Every journey the page can build for a chosen station: the same pairs, trains, and arrivals as the direct count, a share only from 10 trains, and the same rows when narrowed to one station.
 const every=journeysAt(stops,null,null);
 if(every.length!==pairs.size||journeyOptions(stops).total!==pairs.size)fail(`${every.length} journeys built for all stations but the train files have ${pairs.size} pairs`);
 let wrong=0;
 for(const r of every){const p=pairs.get(r.fromId+'|'+r.toId);if(!p||p.details.size!==r.trains||p.reported!==r.arrivals||(r.share==null)!==(r.trains<10||!p.reported)||(r.share!=null&&Math.abs(p.within/p.reported-r.share)>1e-9))wrong++;}
 if(wrong)fail(`${wrong} of the ${every.length} journeys built for all stations differ from the train files`);
 // Check each train's scheduled times and reports for every pair, including pairs below the table threshold.
 const indexes=new Map(stops.stations.map((s,i)=>[s[2],i]));
 for(const row of every){
  const expected=pairs.get(row.fromId+'|'+row.toId);
  if(!expected)continue;
  const actual=pairStats(stops,indexes.get(row.fromId),indexes.get(row.toId));
  try{
   assert.equal(actual.trains.length,expected.details.size);assert.equal(new Set(actual.trains.map(t=>t.id)).size,actual.trains.length);
   assert.equal(actual.reported,expected.reported);assert.equal(actual.within,expected.within);
   for(const {id,dep,arr,reported,within} of actual.trains)assert.deepEqual({dep,arr,reported,within},expected.details.get(id));
   assert.equal(actual.typical,row.mins);
  }catch(error){fail(`${row.from} → ${row.to}: pair differs from source: ${error.message}`);}
 }
 for(const [id,i] of indexes){
  if(journeysAt(stops,i,null).length!==every.filter(r=>r.fromId===id).length||journeysAt(stops,null,i).length!==every.filter(r=>r.toId===id).length)fail(`${id}: the journeys built for one station differ from those among all`);
 }
 const wanted=[...pairs.entries()].filter(([,p])=>p.details.size>=MIN_TRAINS&&p.reported);
 if(wanted.length!==list.length)fail(`${list.length} journeys listed but the train files give ${wanted.length} with ${MIN_TRAINS} or more trains`);
 for(const r of list){
  const p=pairs.get(r.fromId+'|'+r.toId);
  if(!p){fail(`${r.from} → ${r.to} is not in the train files`);continue;}
  if(p.details.size!==r.trains||p.reported!==r.arrivals||Math.abs(p.within/p.reported-r.share)>1e-9)fail(`${r.from} → ${r.to}: ${r.trains} trains, ${r.arrivals} arrivals, share ${r.share} but the train files give ${p.details.size}, ${p.reported}, ${p.within/p.reported}`);
  const stats=pairStats(stops,indexes.get(r.fromId),indexes.get(r.toId));
  if(stats.trains.length!==r.trains||stats.reported!==r.arrivals)fail(`${r.from} → ${r.to}: the search panel counts ${stats.trains.length} trains and ${stats.reported} arrivals`);
  const panel=resultHTML(stats,stops.stations[indexes.get(r.fromId)],stops.stations[indexes.get(r.toId)],'en'),shown=(panel.match(/class="rank-row[ "]/g)||[]).length;
  if(shown!==r.trains||(r.trains>ROW_CAP)!==panel.includes('trains-more'))fail(`${r.from} → ${r.to}: the panel has ${shown} train rows for ${r.trains} trains, or the Show all button is wrong`);
  if(stats.typical!==r.mins)fail(`${r.from} → ${r.to}: the search panel gives a typical time of ${stats.typical} minutes, the table ${r.mins}`);
 }
 for(const locale of ['en','ko']){
  const html=renderJourneys(list,month,locale,pairs.size),info=journeysInfo(list,month,locale,pairs.size);
  if(pairs.size&&!html.includes(pairs.size.toLocaleString('en')))fail(`${locale}: the all-journeys page does not state its ${pairs.size} journeys`);
  if((pairs.size>0)!==html.includes('id="journeys-filters"'))fail(`${locale}: the journey search does not match the available journeys`);
  const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`${locale} text contains "${bad[0]}"`);
  const links=[...html.matchAll(/<tr data-from="([^"]*)" data-to="([^"]*)"[^>]*data-share="([^"]*)"/g)];
  if(links.length!==list.length)fail(`${locale}: ${links.length} rows for ${list.length} journeys`);
  list.forEach((r,i)=>{if(links[i]&&(links[i][1]!==r.from||links[i][2]!==r.to||Number(links[i][3])!==r.share))fail(`${locale}: row ${i} does not match ${r.from} → ${r.to}`);});
  if(pairs.size&&(!info||info.title.length>90||info.description.length>220))fail(`${locale}: no title and description, or they are too long`);
  if(pairs.size){const panel=resultHTML(pairStats(stops,0,1),stops.stations[0],stops.stations[1],locale).replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(panel)fail(`${locale} panel contains "${panel[0]}"`);}
 }

 // The card at the end of a station page: the SHOWN_AT_STATION busiest journeys that start or end there, however few trains, busiest first; each links to its journey page, or to the search for the pair when it has none.
 // None for a station in no journey, and two links to the full lists under the rows.
 {
  const everyJourney=journeysAt(stops,null,null);
  for(const station of stations.stations){
   const mine=journeysOfStation(station,everyJourney);
   for(const locale of ['en','ko']){
    const html=journeysCard(station,everyJourney,locale),rows=[...html.matchAll(/<a class="rank-row" href="([^"]*)"/g)].map(m=>m[1]);
    if(!mine.length){if(html)fail(`${station.id} (${locale}): a card for a station in no journey`);continue;}
    const prefix=locale==='ko'?'ko/':'',want=mine.slice(0,SHOWN_AT_STATION).map(r=>prefix+(r.trains>=MIN_TRAINS&&r.arrivals>0&&r.fromId&&r.toId?journeyPath(r.fromId,r.toId):`journeys/?from=${encodeURIComponent(r.fromKey)}&to=${encodeURIComponent(r.toKey)}`));
    if(JSON.stringify(rows)!==JSON.stringify(want))fail(`${station.id} (${locale}): the card links ${rows.join(', ')}, not ${want.join(', ')}`);
    if(mine.slice(0,SHOWN_AT_STATION).some((r,i)=>i&&r.trains>mine[i-1].trains))fail(`${station.id}: the card is not busiest first`);
    const q=encodeURIComponent(stops.keys[indexes.get(station.id)]);
    if(!html.includes(`href="${prefix}journeys/?from=${q}"`)||!html.includes(`href="${prefix}journeys/?to=${q}"`))fail(`${station.id} (${locale}): the card lacks its two links to all journeys`);
    const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`${station.id} (${locale}): the card contains "${bad[0]}"`);
   }
  }
 }
 // A page for each listed journey, built from the detailed data: its headline within 5, 10 and 15 minutes must match the direct recount, its table must have a row per train, its hidden hour table must add up to
 // the journey's trains and arrivals, every address must be unique, and every link to a journey page on the all-journeys page must reach one of them.
 {
  const detail=indexJourneys(journeySource),at=new Map(detail.stations.map((s,i)=>[s[2],i])),addresses=new Set();
  for(const r of list){
   const address=journeyPath(r.fromId,r.toId);if(addresses.has(address))fail(`two journeys share the address ${address}`);addresses.add(address);
   const p=pairs.get(r.fromId+'|'+r.toId),stats=pairStats(detail,at.get(r.fromId),at.get(r.toId));
   if(!p){fail(`${address}: not in the train files`);continue;}
   const buckets=hourBuckets(stats);
   const expectedHours=[...p.hours.values()].sort((a,b)=>a.hour-b.hour);
   try{assert.deepEqual(buckets,expectedHours);}catch(error){fail(`${address}: departure hours differ from the dated timetable: ${error.message}`);}
   if(stats.within15!==p.w15||stats.bands[0]+stats.bands[1]!==p.w10)fail(`${address}: within 10 or 15 minutes differs from the train files`);
   for(const locale of ['en','ko']){
    const html=renderJourney({row:r,stats},month,locale),info=journeyPageInfo(r,month,locale);
    if(hasArrivalNote(html)!==p.hasConflict)fail(`${address} (${locale}): the arrival data note disagrees with the reported clocks`);
    const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`${address} (${locale}): text contains "${bad[0]}"`);
    if((html.match(/<tr data-type=/g)||[]).length!==r.trains)fail(`${address} (${locale}): the table does not have a row for each of ${r.trains} trains`);
    const heads=locale==='ko'?[`<b>${pct0(p.w10/p.reported)}</b><span>10분 이내</span>`,`<b>${pct0(p.w15/p.reported)}</b><span>15분 이내</span>`,`<b>${pct0(p.within/p.reported)}</b>`]:[`<b>${pct0(p.w10/p.reported)}</b><span>within 10 min</span>`,`<b>${pct0(p.w15/p.reported)}</b><span>within 15 min</span>`,`<b>${pct0(p.within/p.reported)}</b>`];
    for(const text of heads)if(!html.includes(text))fail(`${address} (${locale}): the headline lacks "${text}"`);
    // The cells read "5 trains" and "98 arrivals" (Korean 열차 5편 and 98건), so take the number out of the text.
    const hourRows=[...html.matchAll(/<tr><td>(\d\d):00<\/td><td>\D*([\d,]+)[^<]*<\/td><td>\D*([\d,]+)[^<]*<\/td>(.*?)<\/tr>/g)],sums=hourRows.map(([,hour,trains,arrivals])=>[+trains.replace(/,/g,''),+arrivals.replace(/,/g,'')]);
    if(sums.reduce((a,m)=>a+m[0],0)!==r.trains||sums.reduce((a,m)=>a+m[1],0)!==r.arrivals)fail(`${address} (${locale}): the hidden hour table does not add up`);
    const columns=new Map([...html.matchAll(/<(button|div)[^>]* class="hour-col(?: history)?"[^>]* title="([^"]+)"[^>]*><span class="hour-pct">.*?<\/span><span class="hour-bar( na)?">.*?<\/span><span class="hour-label">(\d+)\*?<\/span>/g)].map(m=>[+m[4],m]));
    const tableHours=new Map(hourRows.map(row=>[+row[1],row]));
    for(const o of expectedHours){
     const row=tableHours.get(o.hour),column=columns.get(o.hour),show=o.reported>=HOUR_MIN_ARRIVALS;
     if(!row||!column){fail(`${address} (${locale}): missing hour ${o.hour}:00`);continue;}
     const actualBands=[...row[4].matchAll(/<td>([^<]+)<\/td>/g)].map(m=>m[1]),wantBands=o.bands.map(n=>show?`${Math.round(100*n/o.reported)}%`:'—');
     if(+row[2].replace(/,/g,'')!==o.trains||+row[3].replace(/,/g,'')!==o.reported||actualBands.join()!==wantBands.join()||
        show===!!column[3]||(column[1]==='button')!==!!o.trains||!column[2].includes(locale==='ko'?`도착 기록 ${row[3]}건`:` · ${row[3]} arrival`))
      fail(`${address} (${locale}): ${o.hour}:00 disagrees between the chart, table, and dated timetable`);
    }
    // Historical-only hours have no matching current departure to filter.
    const departures=html.match(/<select id="trains-dep">(.*?)<\/select>/)?.[1]||'';
    const options=[...departures.matchAll(/<option value="(\d+)">/g)].map(m=>+m[1]);
    const currentHours=expectedHours.filter(o=>o.trains).map(o=>o.hour);
    if(tableHours.size!==expectedHours.length||columns.size!==expectedHours.length||options.join()!==currentHours.join()||!html.includes('id="trains-arr"'))
     fail(`${address} (${locale}): the hour chart or departure and arrival selects are incomplete`);
    // A dash in the table explains itself in a tooltip.
    if((html.match(/data-share=""/g)||[]).length!==(html.match(/<td class="s" title=/g)||[]).length)fail(`${address} (${locale}): a dash in the table has no tooltip`);
    if(!info||info.title.length>80||info.description.length>220)fail(`${address} (${locale}): no title and description, or they are too long`);
    journeyPages++;
   }
  }
  for(const locale of ['en','ko'])for(const m of renderJourneys(list,month,locale,pairs.size).matchAll(/href="(?:ko\/)?(journey\/[^"]+)"/g))if(!addresses.has(m[1]))fail(`${locale}: the all-journeys page links to ${m[1]}, which has no page`);
 }
}
console.log(`${pages} train pages rendered, ${empty} without a run in the past month, ${dayPages} day pages rendered, ${stationPages} station pages rendered, ${journeyCount} journeys listed, ${journeyPages} journey pages rendered, ${problems.length} problems.`);
for(const line of problems.slice(0,20))console.log('  '+line);
if(problems.length>20)console.log(`  and ${problems.length-20} more`);
process.exit(problems.length?1:0);
