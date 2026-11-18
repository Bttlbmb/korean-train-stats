#!/usr/bin/env node
// Render every train and day page from the data folder and check each one: no error; no "undefined", "NaN", or "null" in the text;
// the final stop's dots match the heading's count; each row's share matches its dots; and a title and description for search
// engines (an empty page has none, so it is not indexed). A day page's delay buckets add up to its stops, and its stops and share match days.json.
// The all-trains page has one row for each train page, each linking to it, with the share its train file gives.
// A train page with fewer than 10 runs says why the lists show no share for it, and no other does.
// A station page has a row for each call of each train (and counts each train once, though a loop train calls twice), each linking to its train page and showing the share its figures give, and every reported arrival
// in the train files lands on exactly one station page. The all-stations page has one row for each station page, each linking to it, with the share its figures give.
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
const {ROW_CAP,pct0,stationSearchKey}=await import(pathToFileURL(path.join(root,'js/utils.js')));
const {journeyData,journeyList,journeysAt,journeyCount:pairCount,pairStats,resultHTML,renderJourneys,renderJourney,journeyPageInfo,journeyPath,journeysCard,journeysOfStation,SHOWN_AT_STATION,hourBuckets,pageInfo:journeysInfo,MIN_TRAINS}=await import(pathToFileURL(path.join(root,'js/journeys.js')));
const {stationAddresses,addressed}=await import(pathToFileURL(path.join(root,'js/addresses.js')));
// Station pages are addressed by name, as the build reads the files (js/addresses.js).
const rawRead=file=>JSON.parse(fs.readFileSync(data+file,'utf8')),slugs=stationAddresses(rawRead('stations/index.json').stations),read=file=>addressed(file,rawRead(file),slugs),stations=read('stations/index.json'),days=read('days.json').days;
const problems=[];let pages=0,empty=0;
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
  {date:'2026-10-16',status:'ok',timetable:'old',delays:[null,7,3,0]},
  {date:'2026-10-17',status:'ok',timetable:'current',delays:[null,5,2,9,12]},
  {date:'2026-10-18',status:'unavailable',timetable:'current',delays:[null,0,0,0,0]}]};
 try{
  const data=journeyData([train],['A','B','X','C'].map(id=>({id,name:id}))),idx=new Map(data.stations.map(([name],i)=>[name,i]));
  const find=(a,b)=>pairStats(data,idx.get(a),idx.get(b));
  assert.deepEqual(find('B','A'),{trains:[{id:'loop',number:1,type:'ITX-Maum',dep:1391,arr:1430,reported:3,within:1}],reported:3,within:1,typical:39});
  assert.deepEqual(find('B','C'),{trains:[{id:'loop',number:1,type:'ITX-Maum',dep:1391,arr:1460,reported:2,within:1}],reported:2,within:1,typical:69});
  assert.equal(find('A','B').reported,3);assert.equal(find('A','B').within,2);
  assert.equal(find('B','X').reported,1);assert.equal(find('B','X').within,1);
  assert.equal(find('A','C').trains.length,0);assert.equal(find('C','B').trains.length,0);assert.equal(find('A','A').trains.length,0);
  assert.equal(pairCount(data),7);
  data.trains.push(['direct',2,'KTX',[[idx.get('A'),null,1320,0,0],[idx.get('C'),1340,null,2,2]]]);
  assert.deepEqual(find('A','C'),{trains:[{id:'direct',number:2,type:'KTX',dep:1320,arr:1340,reported:2,within:2}],reported:2,within:2,typical:20});
  assert.equal(journeysAt(data,idx.get('A'),idx.get('C'))[0].trains,1);
 }catch(error){problems.push(`loop journey regression: ${error.message}`);}
}
for(const file of fs.readdirSync(data+'trains')){
 const id=file.replace('.json',''),fail=why=>problems.push(`${id}: ${why}`);
 let train,html;try{train=read('trains/'+file);html=renderTrain(train,days,stations);}catch(error){fail(`error ${error.message}`);continue;}
 pages++;
 const text=html.replace(/<[^>]*>/g,' '),bad=text.match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
 const rows=html.split('<div class="rail-row"').slice(1);
 const info=pageInfo(train);
 if(!rows.length){empty++;if(info)fail('an empty page has a title and description, so it would be indexed');continue;}
 if(!info)fail('no title and description');
 else if(info.title.length>80||info.description.length>160||/undefined|NaN|null/.test(info.title+info.description))fail(`title or description is too long or has bad text: ${info.title} / ${info.description}`);
 const runCount=html.match(/· (\d+) runs?</),noted=html.includes('too few to show a share in the train and station lists');
 if(runCount&&(+runCount[1]<10)!==noted)fail(`${runCount[1]} runs but the short-record note is ${noted?'shown':'missing'}`);
 const finals=html.match(/<b>\d+ of (\d+)<\/b><span>days on time at/);
 const dotsIn=row=>[(row.match(/class="rail-dot"/g)||[]).length,(row.match(/class="rail-dot late( out)?"/g)||[]).length];
 const lastDots=dotsIn(rows.at(-1)).reduce((a,b)=>a+b);
 if(finals&&+finals[1]!==lastDots)fail(`the heading counts ${finals[1]} final-stop days but the last row has ${lastDots} dots`);
 for(const row of rows){
  const [onTime,late]=dotsIn(row),shown=row.match(/rail-share">([^<]*)</)[1],expected=row.includes('rail-origin')?'':onTime+late===0?'—':late===0?'100%':`${Math.min(99,Math.round(onTime/(onTime+late)*100))}%`;
  if(shown!==expected)fail(`a row shows ${shown} but its dots give ${expected}`);
 }
}
let dayPages=0;
if(fs.existsSync(data+'days'))for(const file of fs.readdirSync(data+'days')){
 const iso=file.replace('.json',''),fail=why=>problems.push(`${iso}: ${why}`),day=read('days/'+file),html=renderDay(day,iso),info=dayInfo(day,iso),listed=days.find(d=>d.date===iso);
 dayPages++;
 const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
 if(day.buckets.reduce((a,b)=>a+b,0)!==day.stops)fail('the delay buckets do not add up to the stops');
 if(!listed)fail('the date is not in days.json');else if(listed.stops!==day.stops||listed.share_punctual!==day.share_punctual)fail('the stops or share differ from days.json');
 if(day.late_trains!==day.most_delayed.length&&day.most_delayed.length!==10)fail('the list of biggest delays is shorter than the late trains and not full');
 if(day.trains&&(!info||info.title.length>80||info.description.length>200))fail('no title and description, or they are too long');
 if(!day.trains&&info)fail('an empty page has a title and description, so it would be indexed');
}
{
 const fail=why=>problems.push(`all-trains page: ${why}`),month=read('windows/month.json');
 const trainRows=fs.readdirSync(data+'trains').map(file=>[file,trainRow(read('trains/'+file))]).filter(([,row])=>row),html=renderTrains(trainRows.map(([,row])=>row),month),info=trainsInfo(trainRows.map(([,row])=>row),month);
 const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`text contains "${bad[0]}"`);
 const links=[...html.matchAll(/<tr data-[^>]*data-share="([^"]*)"><td class="t"><a href="train\/([^"]+)\/"/g)].map(m=>[decodeURIComponent(m[2]),m[1]]);
 if(links.length!==trainRows.length||new Set(links.map(l=>l[0])).size!==links.length)fail(`${links.length} rows for ${trainRows.length} train pages, or a train twice`);
 const share=new Map(links);
 for(const [file,row] of trainRows){const expected=row.runs>=10&&row.share!=null?String(row.share):'';if(share.get(row.id)!==expected)fail(`${row.id} shows share "${share.get(row.id)}" but its file gives "${expected}"`);}
 if(!info||info.title.length>80||info.description.length>200)fail('no title and description, or they are too long');
}
let stationPages=0;
{
 const month=read('windows/month.json'),trains=fs.readdirSync(data+'trains').map(file=>read('trains/'+file)),calls=stationRows(trains);
 // Count every reported arrival straight from the train files, matching each stop in its own run's timetable, to compare with the station pages. A stop the current timetable no longer has is left out, as on the train page.
 let expected=0,found=0;
 for(const train of trains){const w=train.windows?.month;if(!w?.runs)continue;const tmap=new Map(train.timetables.map(t=>[t.id,t])),current=new Set(train.timetables.at(-1).stops.map(s=>s.station_id));
  for(const r of train.runs)if(r.status==='ok'&&r.date>=w.from&&r.date<=w.to)for(const s of tmap.get(r.timetable).stops)if(s.arrival!=null&&r.delays?.[s.ordinal]!=null&&current.has(s.station_id))expected++;}
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
 }
 if(found!==expected)problems.push(`the station pages count ${found} reported arrivals but the train files have ${expected}`);
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
  if(!info||info.title.length>80||info.description.length>200)fail('no title and description, or they are too long');
 }
}

let journeyCount=0,journeyPages=0;
{
 const fail=why=>problems.push(`all-journeys page: ${why}`),month=read('windows/month.json'),trains=fs.readdirSync(data+'trains').map(file=>read('trains/'+file));
 const stops=journeyData(trains,stations.stations),list=journeyList(stops);journeyCount=list.length;
 // Independent source-file recount: do not use the packed journeyData or journeySegments output as the expected result.
 // Match destination visits by filtering source stops, then count only unique eligible source/destination combinations per train.
 const pairs=new Map(),loopIds=new Set(),minute=(time,offset)=>Number(time.slice(0,2))*60+Number(time.slice(3))+(offset||0)*1440;
 for(const train of trains){
  const w=train.windows?.month;if(!w?.runs)continue;
  const current=train.timetables.at(-1).stops,ids=current.map(s=>s.station_id),segments=new Map();
  if(new Set(ids).size!==ids.length)loopIds.add(train.id);
  const tmap=new Map(train.timetables.map(t=>[t.id,t])),runs=train.runs.filter(r=>r.status==='ok'&&r.date>=w.from&&r.date<=w.to);
  for(let j=1;j<current.length;j++){
   if(current[j].arrival==null)continue;
   let reported=0,within=0,w10=0,w15=0;
   const visit=ids.slice(0,j).filter(id=>id===ids[j]).length;
   for(const r of runs){const stop=tmap.get(r.timetable).stops.filter(x=>x.station_id===ids[j])[visit],d=stop?.arrival!=null?r.delays?.[stop.ordinal]??null:null;if(d!=null){reported++;if(d<=5)within++;if(d<=10)w10++;if(d<=15)w15++;}}
   for(let i=0;i<j;i++){
    if(current[i].departure==null||ids[i]===ids[j])continue;
    const dep=minute(current[i].departure,current[i].departure_day_offset),arr=minute(current[j].arrival,current[j].arrival_day_offset);
    if(arr<dep)continue;
    const k=ids[i]+'|'+ids[j];segments.set(k,segments.has(k)?null:{dep,arr,reported,within,w10,w15});
   }
  }
  for(const [k,s] of segments)if(s){const p=pairs.get(k)||pairs.set(k,{ids:new Set(),reported:0,within:0,w10:0,w15:0,details:new Map()}).get(k);p.ids.add(train.id);p.reported+=s.reported;p.within+=s.within;p.w10+=s.w10;p.w15+=s.w15;p.details.set(train.id,s);}
 }
 const byName=new Map(stations.stations.map(s=>[s.name,s.id]));
 // Every journey the page can build for a chosen station: the same pairs, trains, and arrivals as the direct count, a share only from 10 trains, and the same rows when narrowed to one station.
 const every=journeysAt(stops,null,null);
 if(every.length!==pairs.size||pairCount(stops)!==pairs.size)fail(`${every.length} journeys built for all stations but the train files have ${pairs.size} pairs`);
 let wrong=0;
 for(const r of every){const p=pairs.get(byName.get(r.from)+'|'+byName.get(r.to));if(!p||p.ids.size!==r.trains||p.reported!==r.arrivals||(r.share==null)!==(r.trains<10||!p.reported)||(r.share!=null&&Math.abs(p.within/p.reported-r.share)>1e-9))wrong++;}
 if(wrong)fail(`${wrong} of the ${every.length} journeys built for all stations differ from the train files`);
 // Check every affected pair's individual trains, times, and destination reports, including pairs below the table threshold.
 const indexes=new Map(stops.stations.map(([name],i)=>[name,i]));
 for(const row of every){
  const expected=pairs.get(byName.get(row.from)+'|'+byName.get(row.to));
  if(!expected||![...expected.ids].some(id=>loopIds.has(id)))continue;
  const actual=pairStats(stops,indexes.get(row.from),indexes.get(row.to));
  try{
   assert.equal(actual.trains.length,expected.ids.size);assert.equal(new Set(actual.trains.map(t=>t.id)).size,actual.trains.length);
   assert.equal(actual.reported,expected.reported);assert.equal(actual.within,expected.within);
   for(const {id,dep,arr,reported,within} of actual.trains){const {w10,w15,...own}=expected.details.get(id);assert.deepEqual({dep,arr,reported,within},own);}
   assert.equal(actual.typical,row.mins);
  }catch(error){fail(`${row.from} → ${row.to}: loop pair differs from source: ${error.message}`);}
 }
 {const idx=new Map(stops.stations.map((s,i)=>[s[0],i]));
  for(const name of ['Seoul','Gangneung']){const i=idx.get(name);
   if(journeysAt(stops,i,null).length!==every.filter(r=>r.from===name).length||journeysAt(stops,null,i).length!==every.filter(r=>r.to===name).length)fail(`${name}: the journeys built for one station differ from those among all`);}}
 const wanted=[...pairs.entries()].filter(([,p])=>p.ids.size>=MIN_TRAINS&&p.reported);
 if(wanted.length!==list.length)fail(`${list.length} journeys listed but the train files give ${wanted.length} with ${MIN_TRAINS} or more trains`);
 for(const r of list){
  const p=pairs.get(byName.get(r.from)+'|'+byName.get(r.to));
  if(!p){fail(`${r.from} → ${r.to} is not in the train files`);continue;}
  if(p.ids.size!==r.trains||p.reported!==r.arrivals||Math.abs(p.within/p.reported-r.share)>1e-9)fail(`${r.from} → ${r.to}: ${r.trains} trains, ${r.arrivals} arrivals, share ${r.share} but the train files give ${p.ids.size}, ${p.reported}, ${p.within/p.reported}`);
  const index=new Map(stops.stations.map((s,i)=>[s[0],i])),stats=pairStats(stops,index.get(r.from),index.get(r.to));
  if(stats.trains.length!==r.trains||stats.reported!==r.arrivals)fail(`${r.from} → ${r.to}: the search panel counts ${stats.trains.length} trains and ${stats.reported} arrivals`);
  const panel=resultHTML(stats,stops.stations[index.get(r.from)],stops.stations[index.get(r.to)],'en'),shown=(panel.match(/class="rank-row[ "]/g)||[]).length;
  if(shown!==r.trains||(r.trains>ROW_CAP)!==panel.includes('trains-more'))fail(`${r.from} → ${r.to}: the panel has ${shown} train rows for ${r.trains} trains, or the Show all button is wrong`);
  if(stats.typical!==r.mins)fail(`${r.from} → ${r.to}: the search panel gives a typical time of ${stats.typical} minutes, the table ${r.mins}`);
 }
 for(const locale of ['en','ko']){
  const html=renderJourneys(list,month,locale,pairs.size),info=journeysInfo(list,month,locale);
  if(!html.includes(pairs.size.toLocaleString('en')))fail(`${locale}: the all-journeys page does not state its ${pairs.size} journeys`);
  const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`${locale} text contains "${bad[0]}"`);
  const links=[...html.matchAll(/<tr data-from="([^"]*)" data-to="([^"]*)"[^>]*data-share="([^"]*)"/g)];
  if(links.length!==list.length)fail(`${locale}: ${links.length} rows for ${list.length} journeys`);
  list.forEach((r,i)=>{if(links[i]&&(links[i][1]!==r.from||links[i][2]!==r.to||Number(links[i][3])!==r.share))fail(`${locale}: row ${i} does not match ${r.from} → ${r.to}`);});
  if(!info||info.title.length>90||info.description.length>220)fail(`${locale}: no title and description, or they are too long`);
  const panel=resultHTML(pairStats(stops,0,1),stops.stations[0],stops.stations[1],locale).replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(panel)fail(`${locale} panel contains "${panel[0]}"`);
 }

 // The card at the end of a station page: the busiest journeys that start or end there, as many as SHOWN_AT_STATION, busiest first, each linking to its journey page; none for a station in no journey.
 for(const station of stations.stations){
  const mine=journeysOfStation(station,list);
  for(const locale of ['en','ko']){
   const html=journeysCard(station,list,locale),rows=[...html.matchAll(/<a class="rank-row" href="([^"]*)"/g)].map(m=>m[1]);
   if(!mine.length){if(html)fail(`${station.id} (${locale}): a card for a station in no journey`);continue;}
   const want=mine.slice(0,SHOWN_AT_STATION).map(r=>(locale==='ko'?'ko/':'')+journeyPath(r.fromId,r.toId));
   if(JSON.stringify(rows)!==JSON.stringify(want))fail(`${station.id} (${locale}): the card links ${rows.join(', ')}, not ${want.join(', ')}`);
   if(rows.some((_,i)=>i&&mine[i].trains>mine[i-1].trains))fail(`${station.id}: the card is not busiest first`);
   const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`${station.id} (${locale}): the card contains "${bad[0]}"`);
  }
 }
 // A page for each listed journey, built from the detailed data: its headline within 5, 10 and 15 minutes must match the direct recount, its table must have a row per train, its hidden hour table must add up to
 // the journey's trains and arrivals, every address must be unique, and every link to a journey page on the all-journeys page must reach one of them.
 {
  const detail=journeyData(trains,stations.stations,true),at=new Map(detail.stations.map((s,i)=>[s[2],i])),addresses=new Set();
  for(const r of list){
   const address=journeyPath(r.fromId,r.toId);if(addresses.has(address))fail(`two journeys share the address ${address}`);addresses.add(address);
   const p=pairs.get(r.fromId+'|'+r.toId),stats=pairStats(detail,at.get(r.fromId),at.get(r.toId));
   if(!p){fail(`${address}: not in the train files`);continue;}
   const buckets=hourBuckets(stats);
   if(buckets.reduce((a,o)=>a+o.trains,0)!==r.trains||buckets.reduce((a,o)=>a+o.reported,0)!==r.arrivals)fail(`${address}: the hours add up to ${buckets.reduce((a,o)=>a+o.trains,0)} trains and ${buckets.reduce((a,o)=>a+o.reported,0)} arrivals, not ${r.trains} and ${r.arrivals}`);
   if(stats.within15!==p.w15||stats.bands[0]+stats.bands[1]!==p.w10)fail(`${address}: within 10 or 15 minutes differs from the train files`);
   for(const locale of ['en','ko']){
    const html=renderJourney({row:r,stats},month,locale),info=journeyPageInfo(r,month,locale);
    const bad=html.replace(/<[^>]*>/g,' ').match(/undefined|NaN|\bnull\b/);if(bad)fail(`${address} (${locale}): text contains "${bad[0]}"`);
    if((html.match(/<tr data-type=/g)||[]).length!==r.trains)fail(`${address} (${locale}): the table does not have a row for each of ${r.trains} trains`);
    const heads=locale==='ko'?[`<b>${pct0(p.w10/p.reported)}</b><span>10분 이내</span>`,`<b>${pct0(p.w15/p.reported)}</b><span>15분 이내</span>`,`<b>${pct0(p.within/p.reported)}</b>`]:[`<b>${pct0(p.w10/p.reported)}</b><span>within 10 min</span>`,`<b>${pct0(p.w15/p.reported)}</b><span>within 15 min</span>`,`<b>${pct0(p.within/p.reported)}</b>`];
    for(const text of heads)if(!html.includes(text))fail(`${address} (${locale}): the headline lacks "${text}"`);
    // The cells read "5 trains" and "98 arrivals" (Korean 열차 5편 and 98건), so take the number out of the text.
    const sums=[...html.matchAll(/<tr><td>\d\d:00<\/td><td>\D*([\d,]+)[^<]*<\/td><td>\D*([\d,]+)[^<]*<\/td>/g)].map(m=>[+m[1].replace(/,/g,''),+m[2].replace(/,/g,'')]);
    if(sums.reduce((a,m)=>a+m[0],0)!==r.trains||sums.reduce((a,m)=>a+m[1],0)!==r.arrivals)fail(`${address} (${locale}): the hidden hour table does not add up`);
    // Each hour of the chart is a button, and the departure-hour select offers exactly those hours.
    if((html.match(/class="hour-col"/g)||[]).length!==buckets.length||(html.match(/<option value="\d+">/g)||[]).length<buckets.length||!html.includes('id="trains-arr"'))fail(`${address} (${locale}): the hour chart or the hour selects are incomplete`);
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
