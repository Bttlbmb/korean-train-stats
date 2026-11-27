import {esc,num,pct0,delaysTitle,fitting,shareLegend,bar,empty,hiddenTable,ROW_CAP,MIN_DAYS,trainNumberSearch,tableHeading as th,stat as fig,card,scheduledMinute,conflictingArrivals} from './utils.js';
import {localeUtils,localizeTrain,arrivalDataNote} from './locale.js';
// The all-journeys page (journeys/): top lists, From and To dropdowns, and a table of every journey that at least 40 trains make, built from the train files.
// A journey is two distinct stations with one eligible forward segment per train. Its share uses reported arrivals at the destination visit.
// scripts/build.mjs builds the whole page and writes journeys/pairs.json, which js/journeys-page.js loads to answer a search for any two stations.
// Each journey with a page (MIN_TRAINS trains) also gets journey/<from>-to-<to>/, rendered by renderJourney below from the same train files; its figures are computed at build time, so visitors download no extra data.
// The station-pair index serves the catalogue, journey pages, and interactive search.
const GROUPS=['KTX','ITX','Saemaeul','Mugunghwa','Other'];
const group=type=>type.startsWith('ITX')?'ITX':type;
const scheduledCalls=stops=>stops.map(s=>[s.station_id,scheduledMinute(s.arrival,s.arrival_day_offset),scheduledMinute(s.departure,s.departure_day_offset)]);
const pairKey=(from,to)=>`${from}:${to}`;
const departureHour=minute=>Math.floor(minute%1440/60);
// A journey is listed from 40 trains; a share is shown from 10 trains, so a search for a rare pair still gets its trains, but no overall share.
export const MIN_TRAINS=40,SHOW_TRAINS=10;
function arrivalCounts(stops,runs){
 const flagged=conflictingArrivals(stops,runs);
 return stops.map(s=>{
  let reported=0,within=0,within15=0;const bands=[0,0,0,0,0];
  if(s.arrival!=null)for(const r of runs){
   const d=r.delays?.[s.ordinal];
   if(d==null)continue;
   reported++;if(d<=5)within++;
   bands[d<=5?0:d<=10?1:d<=20?2:d<=30?3:4]++;if(d<=15)within15++;
  }
  return [reported,within,bands,within15,flagged.has(s.ordinal)];
 });
}
// Stations are [English name, Korean name, public ID]. Trains are [id, number, type, calls, overrides?].
// Each current call is [station index, arrival minute, departure minute, counts]. Minutes include day offsets.
// Counts are [reported, within 5 min] plus [delay bands, within 15 min, has a conflicting arrival] at build time. The optional overrides
// are keyed by the two current call positions and include eligible arrivals from older timetables.
// When departure hours differ, the overrides also keep delay bands by recorded timetable hour.
export function journeyData(trains,stations){
 const byId=new Map(stations.map(s=>[s.id,s])),index=new Map(),names=[],rows=[];
 const at=id=>{let i=index.get(id);if(i==null){i=names.length;index.set(id,i);const s=byId.get(id);names.push([s?.name??id,s?.name_ko||s?.name||id,id]);}return i;};
 for(const train of trains){
  const w=train.windows?.month;if(!w?.runs)continue;
  const runsByTimetable=new Map(train.timetables.map(t=>[t.id,[]]));
  for(const r of train.runs)if(r.status==='ok'&&r.date>=w.from&&r.date<=w.to)runsByTimetable.get(r.timetable)?.push(r);
  const current=train.timetables.at(-1),currentCounts=arrivalCounts(current.stops,runsByTimetable.get(current.id));
  const calls=scheduledCalls(current.stops).map(([id,arr,dep],i)=>[at(id),arr,dep,currentCounts[i]]);
  const row=[train.id,train.number,train.type,calls];
  rows.push(row);

  // The current timetable supplies the offered journeys. Each earlier timetable contributes only to
  // journeys it offered itself, using the destination call of that timetable's unique forward segment.
  const earlier=[];
  for(const t of train.timetables.slice(0,-1)){
   const runs=runsByTimetable.get(t.id);
   if(!runs.length)continue;
   const schedule=scheduledCalls(t.stops),counts=arrivalCounts(t.stops,runs),pairs=new Map();
   for(const [i,j] of journeySegments(schedule))if(counts[j][0])pairs.set(pairKey(schedule[i][0],schedule[j][0]),[departureHour(schedule[i][2]),counts[j]]);
   earlier.push(pairs);
  }
  if(!earlier.length)continue;
  const overrides={};
  for(const [i,j] of journeySegments(calls)){
   const key=pairKey(current.stops[i].station_id,current.stops[j].station_id);
   const past=earlier.map(pairs=>pairs.get(key)).filter(Boolean);
   if(!past.length)continue;
   const sum=field=>past.reduce((total,[,counts])=>total+field(counts),0);
   const [reported,within,bands,within15,flagged]=currentCounts[j];
   const currentHour=departureHour(calls[i][2]);
   const byHour=past.some(([hour])=>hour!==currentHour)?[[currentHour,bands],...past.map(([hour,counts])=>[hour,counts[2]])]:null;
   overrides[pairKey(i,j)]=[reported+sum(c=>c[0]),within+sum(c=>c[1]),bands.map((n,b)=>n+sum(c=>c[2][b])),within15+sum(c=>c[3]),flagged||past.some(([,counts])=>counts[4]),byHour];
  }
  if(Object.keys(overrides).length)row.push(overrides);
 }
 return {stations:names,trains:rows};
}
// The payload the browser loads keeps the two counts it needs for search.
export const compactJourneyData=data=>({stations:data.stations,trains:data.trains.map(([id,number,type,calls,overrides])=>[
 id,number,type,calls.map(([station,arr,dep,counts])=>[station,arr,dep,counts.slice(0,2)]),
 ...(overrides?[Object.fromEntries(Object.entries(overrides).map(([key,counts])=>[key,counts.slice(0,2)]))]:[])
])});
// One forward segment per train and pair of distinct stations. If several visit combinations fit,
// omit only that ambiguous pair; keep the train's other journeys. Search options use this same rule.
// Traverse the explicit stop order, never wrap from the final call to the first. A → B → A → C makes A → C ambiguous, but B → A valid.
export function* journeySegments(calls){
 const pairs=new Map();
 for(let i=0;i<calls.length-1;i++){
  if(calls[i][2]==null)continue;
  for(let j=i+1;j<calls.length;j++){
   if(calls[j][1]==null||calls[i][0]===calls[j][0]||calls[j][1]<calls[i][2])continue;
   const key=pairKey(calls[i][0],calls[j][0]);
   // null is a permanent ambiguity marker, including when a third candidate appears; test presence, not truthiness.
   pairs.set(key,pairs.has(key)?null:[i,j]);
  }
 }
 for(const pair of pairs.values())if(pair)yield pair;
}
// Index each eligible segment once. Each entry refers to its train and timetable calls.
export function indexJourneys(data){
 const byFrom=data.stations.map(()=>new Map());
 const nameCounts=new Map();
 for(const [name] of data.stations)nameCounts.set(name,(nameCounts.get(name)||0)+1);
 const keys=data.stations.map(([name,,id])=>nameCounts.get(name)===1&&!name.startsWith('station:')?name:`station:${id}`);
 for(const train of data.trains){
  const [,,,calls,overrides]=train;
  for(const [i,j] of journeySegments(calls)){
   const from=calls[i][0],to=calls[j][0],destinations=byFrom[from];
   if(!destinations.has(to))destinations.set(to,{segments:[],reported:0,within:0});
   const pair=destinations.get(to);
   const counts=overrides?.[pairKey(i,j)]??calls[j][3];
   pair.segments.push([train,i,j,counts]);pair.reported+=counts[0];pair.within+=counts[1];
  }
 }
 return {stations:data.stations,byFrom,keys};
}
const middleTime=segments=>{
 const times=segments.map(([[,,,calls],i,j])=>calls[j][1]-calls[i][2]).sort((a,b)=>a-b);
 return times[times.length>>1]??null;
};
// The upper middle scheduled duration is shared by the catalogue and the selected journey.
export function pairStats(index,a,b){
 const {segments=[],reported=0,within=0}=index.byFrom[a]?.get(b)??{};
 const bands=[0,0,0,0,0];let within15=0,detail=false,hasConflictingArrivals=false;
 const trains=segments.map(([[id,number,type,calls],i,j,[reported,within,counts,near,flagged,byHour]])=>{
  if(counts){detail=true;counts.forEach((n,k)=>bands[k]+=n);within15+=near;hasConflictingArrivals||=flagged;}
  return {id,number,type,dep:calls[i][2],arr:calls[j][1],reported,within,...(counts?{bands:counts,within15:near}:{}),...(byHour?{byHour}:{})};
 }).sort((x,y)=>x.dep-y.dep||x.id.localeCompare(y.id));
 return {trains,reported,within,...(detail?{bands,within15,hasConflictingArrivals}:{}),typical:middleTime(segments)};
}
function toRow(data,a,b,{segments,reported,within}){
 const [from,fromKo,fromId]=data.stations[a],[to,toKo,toId]=data.stations[b];
 const trains=new Set(segments.map(([[id]])=>id)).size,types=new Set(segments.map(([[,,type]])=>group(type)));
 return {from,fromKo,fromId,fromKey:data.keys[a],to,toKo,toId,toKey:data.keys[b],trains,types:GROUPS.filter(g=>types.has(g)),mins:middleTime(segments),arrivals:reported,share:trains>=SHOW_TRAINS&&reported?within/reported:null};
}
// A selected station uses the same eligible pairs as the full catalogue and station menus.
export function journeysAt(index,from=null,to=null){
 const {byFrom:all}=index,rows=[];
 for(const [a,destinations] of from==null?all.entries():[[from,all[from]]]){
  if(!destinations)continue;
  if(to==null)for(const [b,pair] of destinations)rows.push(toRow(index,a,b,pair));
  else if(destinations.has(to))rows.push(toRow(index,a,to,destinations.get(to)));
 }
 return rows.sort((x,y)=>y.trains-x.trains||x.from.localeCompare(y.from)||x.to.localeCompare(y.to));
}
export function journeyOptions(index){
 const before=index.stations.map(()=>new Set());
 let total=0;
 const next=index.byFrom.map((destinations,a)=>{
  const ends=new Set(destinations.keys());
  for(const b of ends)before[b].add(a);
  total+=ends.size;
  return ends;
 });
 return {next,before,total};
}
// What a search result shows for this page.
export function pageInfo(rows,month,locale='en',all=rows.length){
 if(!all||!month?.from)return null;
 const window=localeUtils(locale).windowPhrase(month.from,month.to,month.days);
 if(locale==='ko')return {title:'전체 구간의 열차 도착 지연과 5분 이내 도착 비율 · Korean Train Stats',description:`구간 ${num(all)}개의 ${window} 도착 기록을 비교합니다. 구간별 열차 수와 5분 이내 도착 비율을 확인하세요.`,crumbs:[{name:'전체 구간'}]};
 return {title:'All Korail journeys and their punctuality · Korean Train Stats',description:`Compare ${num(all)} direct journeys by the share of arrivals within 5 minutes over ${window}.`,crumbs:[{name:'All journeys'}]};
}
const stationNames=(r,locale)=>locale==='ko'?[r.fromKo,r.toKo]:[r.from,r.to];
// A journey with MIN_TRAINS trains and a reported arrival has its own page at journey/<from ID>-to-<to ID>/; the address is public, so it uses the stable station IDs.
export const journeyPath=(fromId,toId)=>`journey/${fromId}-to-${toId}/`;
export const pageable=r=>r.trains>=MIN_TRAINS&&r.arrivals>0&&!!r.fromId&&!!r.toId;
// Other journeys open their panel on the all-journeys page, which keeps the choice in the address.
const href=(r,locale)=>`${locale==='ko'?'ko/':''}${pageable(r)?journeyPath(r.fromId,r.toId):`journeys/?from=${encodeURIComponent(r.fromKey)}&to=${encodeURIComponent(r.toKey)}`}`;
const types=(r,locale)=>r.types.map(g=>locale==='ko'?localizeTrain({type:g}).type:g).join(', ');
const trainsText=(n,locale)=>locale==='ko'?`열차 ${num(n)}편`:`${num(n)} ${n===1?'train':'trains'}`;
// A journey time of 60 minutes or more reads as hours and minutes; a delay does the same (minutes in js/utils.js).
const duration=(m,ko)=>{const h=Math.floor(m/60),r=m%60;return m<60?(ko?`${m}분`:`${m} min`):ko?`${h}시간${r?` ${r}분`:''}`:`${h} h${r?` ${r} min`:''}`;};
const clock=m=>`${String(Math.floor(m%1440/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const rank=(r,locale)=>{const [a,b]=stationNames(r,locale);return `<a class="rank-row" href="${href(r,locale)}"><span class="rank-name">${esc(a)} → ${esc(b)}</span><span class="rank-route">${trainsText(r.trains,locale)}</span><span class="rank-share">${bar(r.share)}</span></a>`;};
// The journey pages that start at a station, by the name of the station they end at; a station page's Going to filter links to them.
export const journeysFrom=(station,rows,locale='en')=>new Map(rows.filter(r=>r.fromId===station.id&&r.toKey===r.to&&pageable(r)).map(r=>[r.to,href(r,locale)]));
// The card at the end of a station page: its busiest journeys by number of trains, however few, so every station that has a journey gets one. It makes no claim about how many there are; the two links under the rows lead
// to the full lists. A journey without a page opens the all-journeys search for that pair. Null when the station is in no journey. rows is every journey (journeysAt), not only the catalogue.
export const SHOWN_AT_STATION=6;
export const journeysOfStation=(station,rows)=>rows.filter(r=>r.fromId===station.id||r.toId===station.id).sort((a,b)=>b.trains-a.trains||a.fromId.localeCompare(b.fromId)||a.toId.localeCompare(b.toId));
export function journeysCard(station,rows,locale='en'){
 const mine=journeysOfStation(station,rows);if(!mine.length)return '';
 const ko=locale==='ko',name=ko?station.name_ko||station.name:station.name,base=`${ko?'ko/':''}journeys/?`,first=mine[0],q=encodeURIComponent(first.fromId===station.id?first.fromKey:first.toKey);
 const links=`<p class="rank-note rank-links"><a href="${base}from=${q}">${ko?`${name}역에서 출발하는 전체 구간`:`All journeys from ${name}`}</a> · <a href="${base}to=${q}">${ko?`${name}역으로 도착하는 전체 구간`:`All journeys to ${name}`}</a></p>`;
 return card(ko?`${name}역의 열차가 많은 구간`:`Busiest journeys at ${name}`,'',`<div class="rank-rows">${mine.slice(0,SHOWN_AT_STATION).map(r=>rank(r,locale)).join('')}</div>${links}`);
}
export function tableRow(r,locale){
 const [a,b]=stationNames(r,locale),took=duration(r.mins,locale==='ko'),count=trainsText(r.trains,locale);
 return `<tr data-from="${esc(r.from)}" data-to="${esc(r.to)}" data-num="${r.trains}" data-route="${esc(a+' → '+b)}" data-time="${r.mins}" data-share="${r.share==null?'':r.share}">`
  +`<td class="t"><a href="${href(r,locale)}">${esc(a)} → ${esc(b)}</a></td><td class="r">${esc(types(r,locale))}<span class="mob" aria-hidden="true"> · ${esc(took)} · ${esc(count)}</span></td><td class="tm">${esc(took)}</td><td class="tn">${locale==='ko'?`${num(r.trains)}편`:esc(count)}</td><td class="s">${bar(r.share)}</td></tr>`;
}
const ARROW='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// The panel under the dropdowns for a pair of stations: the share at the second station in one line, then every train by departure from the first station as rank rows (the first 40 until a button shows the rest).
// A journey that has its own page gets an outlined button to it at the top right; others show none. from and to are [English name, Korean name, station ID].
export function resultHTML(stats,from,to,locale='en'){
 // The overall share needs SHOW_TRAINS services; each train row separately needs MIN_DAYS reports at this destination visit.
 const ko=locale==='ko',t=(en,kr)=>ko?kr:en,a=esc(ko?from[1]:from[0]),b=esc(ko?to[1]:to[0]),n=stats.trains.length;
 if(!n)return `<p class="meta">${t(`No train stops at ${a} and then at ${b}.`,`${a}에 정차한 뒤 ${b}에 정차하는 열차가 없습니다.`)}</p>`;
 const enough=n>=SHOW_TRAINS&&stats.reported>0,share=enough?stats.within/stats.reported:null;
 const rows=stats.trains.map((r,i)=>{
  const own=r.reported>=MIN_DAYS?r.within/r.reported:null,name=esc(`${ko?localizeTrain(r).type:r.type} ${r.number}`),plus=Math.floor(r.arr/1440)-Math.floor(r.dep/1440);
  return `<a class="rank-row${i>=ROW_CAP?' over':''}" data-num="${r.number}" href="${ko?'ko/':''}train/${encodeURIComponent(r.id)}/"><span class="rank-name">${name}</span><span class="rank-route">${clock(r.dep)} → ${clock(r.arr)}${plus>0?`<sup>+${plus}</sup>`:''}</span><span class="rank-share">${bar(own)}</span></a>`;
 }).join('');
 const took=stats.typical==null?'':` · <span class="nb">${t('typical scheduled time','예정 소요 시간')} ${esc(duration(stats.typical,ko))}</span>`;
 const page=n>=MIN_TRAINS&&stats.reported>0&&from[2]&&to[2]?`<a class="nav-btn" href="${ko?'ko/':''}${journeyPath(from[2],to[2])}" aria-label="${t('Journey page','구간 페이지')}"><span class="lg" aria-hidden="true">${t('Journey page','구간 페이지')}</span><span class="sm" aria-hidden="true">${t('Page','페이지')}</span>${ARROW}</a>`:'';
 const more=n>ROW_CAP?`<button type="button" class="trains-more">${t(`Show all ${num(n)} trains`,`전체 ${num(n)}편 보기`)}</button>`:'';
 // Without a share the figure says why, in place: too few trains, or no reported arrival.
 const lead=share!=null?`${ko?`${b} 도착 기록 중 5분 이내 <b>${pct0(share)}</b>`:`<b>${pct0(share)}</b> within 5 min at ${b}`} · ${trainsText(n,locale)}`
  :n<SHOW_TRAINS?`<b>${trainsText(n,locale)}</b> · ${t(`too few for a share (${SHOW_TRAINS} needed)`,`비율 표시에는 열차 ${SHOW_TRAINS}편 이상이 필요합니다`)}`
  :`${ko?`${b} 도착 기록 중 5분 이내 <b>—</b>`:`<b>—</b> within 5 min at ${b}`} · ${trainsText(n,locale)} · ${t('no arrival reported','도착 기록 없음')}`;
 return `<div class="jr-top"><p class="jr-fig">${lead}${took}</p>${page}</div>`
  +trainNumberSearch(locale,'journeys-number')+`<p class="meta jr-count" id="journeys-trains-count" aria-live="polite"></p><div class="rank-rows">${rows}</div>${more}<p class="trains-empty" id="journeys-trains-empty" hidden>${t('No trains match this number.','이 번호와 일치하는 열차가 없습니다.')}</p>`;
}
const SORTS=[['num:descending',['Most trains','열차 많은 순']],['route:ascending',['Name','이름 순']],['share:descending',['Within 5 min, highest','5분 이내 도착 비율 높은 순']],['share:ascending',['Within 5 min, lowest','5분 이내 도착 비율 낮은 순']],['time:ascending',['Scheduled time, shortest','예정 소요 시간 짧은 순']]];
// rows are the journeys of the table; all is how many journeys the search can answer (every pair of stations that some train links), which the header and the count state.
export function renderJourneys(rows,month,locale='en',all=rows.length){
 const ko=locale==='ko',{span:period,metaLine,backBtn}=localeUtils(locale),t=(en,kr)=>ko?kr:en;
 if(!all||!month?.from)return empty(t('No direct journeys in the past month.','이 기간에 두 역을 직접 잇는 열차가 없습니다.'));
 const total=num(all);
 const head=`<div class="train-intro train-head"><div class="train-lead">${backBtn}<div><h1>${t('All journeys','전체 구간')}</h1><p class="meta">${metaLine(ko?`구간 ${total}개`:`${total} journeys`,period(month.from,month.to,month.days),t('% = share of arrivals at the second station within 5&nbsp;min','%는 도착역 도착 기록 중 5분 이내에 도착한&nbsp;비율'))}</p></div></div></div>`;
 const busiest=[...rows].slice(0,5),least=[...rows].sort((a,b)=>a.share-b.share||b.arrivals-a.arrivals||a.from.localeCompare(b.from)||a.to.localeCompare(b.to)).slice(0,5);
 const lists=`<div class="trains-lists">${card(t('Busiest','열차가 많은 구간'),'',`<div class="rank-rows">${busiest.map(r=>rank(r,locale)).join('')}</div><p class="rank-note">${t('Ranked by the number of trains that stop at both.','두 역에 모두 정차하는 열차 수가 많은 순서입니다.')}</p>`)}`
  +`${card(t('Least punctual','5분 이내 도착 비율 하위 구간'),'',`<div class="rank-rows">${least.map(r=>rank(r,locale)).join('')}</div><p class="rank-note">${t(`Journeys with at least ${MIN_TRAINS} trains.`,`열차가 ${MIN_TRAINS}편 이상인 구간을 비교합니다.`)}</p>`)}</div>`;
 const any=t('Any station','전체 역');
 const controls=`<form class="trains-filters" id="journeys-filters" hidden><div class="trains-field"><label for="journeys-from">${t('From','출발역')}</label><select id="journeys-from"><option value="">${any}</option></select></div>`
  +`<div class="trains-field"><label for="journeys-to">${t('To','도착역')}</label><select id="journeys-to"><option value="">${any}</option></select></div>`
  +`<div class="trains-field sort-field"><label for="journeys-sort">${t('Sort by','정렬 기준')}</label><select id="journeys-sort">${SORTS.map(([v,[e,kr]])=>`<option value="${v}">${t(e,kr)}</option>`).join('')}</select></div></form>`
  +`<div class="trains-status" id="journeys-status" hidden><p class="meta" id="journeys-count" aria-live="polite" data-text="${t('{n} of {total} journeys','전체 {total}개 중 {n}개')}" data-some="${t('{n} journeys','구간 {n}개')}">${ko?`전체 ${total}개 중 ${num(rows.length)}개`:`${num(rows.length)} of ${total} journeys`}</p><button type="button" id="journeys-reset" hidden>${t('Reset','초기화')}</button></div>`
  +`<div class="trains-key">${ko?localeUtils('ko').shareLegend('',null):shareLegend('',null)}<span class="meta">${t(`A dash means fewer than ${SHOW_TRAINS} trains stop at both stations, or fewer than ${MIN_DAYS} recorded days for a train`,`두 역에 모두 정차하는 열차가 ${SHOW_TRAINS}편 미만이거나 열차의 도착 기록이 ${MIN_DAYS}일 미만이면 ‘—’로 표시합니다.`)}</span></div>`
  +`<div class="jres" id="journeys-result" hidden></div>`;
 const table=`<table class="trains-table" role="table" id="journeys-table"${rows.length?'':' style="display:none"'}><thead><tr>${th('route',t('Journey','구간'))}${th('',t('Served by','정차 열차 종류'))}${th('time',t('Scheduled time','예정 소요 시간'))}${th('num',t('Trains','열차'),'','descending')}${th('share',t('Within 5 min','5분 이내 도착 비율'),'s')}</tr></thead><tbody id="journeys-rows" data-cap="${ROW_CAP}" data-more="${t('Show {n} more journeys','구간 {n}개 더 보기')}">${rows.map(r=>tableRow(r,locale)).join('')}</tbody></table>`
  +`<p class="trains-empty" id="journeys-empty" hidden>${t('No journeys match these filters.','선택한 조건에 맞는 구간이 없습니다. 조건을 바꾸거나 초기화해 주세요.')}</p>`
  +`<p class="rank-note" id="journeys-note">${rows.length?t('Choose a station to list all of its journeys, or two stations to see their trains.','역을 하나 선택하면 그 역의 모든 구간을, 두 역을 선택하면 두 역 사이의 열차를 확인할 수 있습니다.'):t('No journeys qualify for the catalogue. Choose two stations to find a direct journey.','목록에 표시할 구간이 없습니다. 두 역을 선택해 직통 구간을 찾아보세요.')}</p>`;
 return head+(rows.length?lists:'')+card(t('Find a journey','구간 찾기'),'',controls+table,'find');
}

// ---- A journey page: journey/<from ID>-to-<to ID>/ ----
// The delay bands are the site's delay scale (utils.js DELAY_SCALE, shown by scaleLegend): 0-5, 6-10, 11-20, 21-30 and over 30 minutes.
const BANDS=[['Within 5 min','5분 이내'],['6–10 min','6–10분'],['11–20 min','11–20분'],['21–30 min','21–30분'],['Over 30 min','30분 초과']];
// An hour's bar needs this many reported arrivals; fewer would draw noise as a pattern.
export const HOUR_MIN_ARRIVALS=20;
// Count currently scheduled trains separately from reports grouped by their own timetable's departure hour.
export function hourBuckets(stats){
 const by=new Map();
 const hourAt=hour=>by.get(hour)||by.set(hour,{hour,trains:0,reported:0,bands:[0,0,0,0,0]}).get(hour);
 for(const t of stats.trains){
  const hour=departureHour(t.dep);
  hourAt(hour).trains++;
  for(const [recordedHour,bands] of t.byHour??[[hour,t.bands]]){
   const row=hourAt(recordedHour);
   bands.forEach((count,index)=>{row.bands[index]+=count;row.reported+=count;});
  }
 }
 return [...by.values()].sort((x,y)=>x.hour-y.hour);
}
// What a search result shows for a journey page.
export function journeyPageInfo(r,month,locale='en'){
 if(!r||!month?.from||!r.arrivals||r.share==null)return null;
 const [a,b]=stationNames(r,locale),window=localeUtils(locale).windowPhrase(month.from,month.to,month.days);
 // Korean joins the two stations with 에서 … 까지, never 와/과, because that particle changes with the last sound of a station name.
 if(locale==='ko')return {title:`${a}에서 ${b}까지 열차 도착 지연 · Korean Train Stats`,
  description:`${a}에서 ${b}까지 열차 ${num(r.trains)}편: ${window} ${b} 도착 기록 ${num(r.arrivals)}건 중 ${pct0(r.share)}가 5분 이내에 도착했습니다. 출발 시간대별 지연을 확인하세요.`,crumbs:[{name:'전체 구간',to:'journeys/'},{name:`${a}에서 ${b}`}]};
 return {title:delaysTitle(`${a} → ${b} train`),description:fitting(140,`${a} to ${b} by train: ${pct0(r.share)} of arrivals were within 5 min of schedule over ${window} (${num(r.trains)} trains). See punctuality by departure hour.`,`${a} to ${b}: ${pct0(r.share)} of arrivals were within 5 min of schedule over ${window} (${num(r.trains)} trains). Punctuality by departure hour.`,`${a} to ${b}: ${pct0(r.share)} of arrivals were within 5 min of schedule over ${window} (${num(r.trains)} trains).`),crumbs:[{name:'All journeys',to:'journeys/'},{name:`${a} to ${b}`}]};
}
const JOURNEY_SORTS=[['',['Departs, earliest','출발 시각 빠른 순']],['arr:ascending',['Arrives, earliest','도착 시각 빠른 순']],['num:ascending',['Train number','열차 번호 순']],['share:descending',['Within 5 min, highest','5분 이내 도착 비율 높은 순']],['share:ascending',['Within 5 min, lowest','5분 이내 도착 비율 낮은 순']]];
// One train's row. The table has the all-trains page's controls (js/trains-page.js): number search, sorting, Reset, and the first ROW_CAP rows. The cell with class times repeats departure and arrival
// as one line for phones, where the table is a list of two-line rows; css hides it on wide screens and the separate cells on phones.
function journeyTrainRow(t,locale){
 const ko=locale==='ko',own=t.reported>=MIN_DAYS?t.within/t.reported:null,name=esc(`${ko?localizeTrain(t).type:t.type} ${t.number}`),plus=Math.floor(t.arr/1440)-Math.floor(t.dep/1440),next=plus>0?`<sup>+${plus}</sup>`:'';
 return `<tr data-type="${esc(group(t.type))}" data-num="${t.number}" data-dep="${t.dep}" data-arr="${t.arr}" data-share="${own==null?'':own}"><td class="t"><a href="${ko?'ko/':''}train/${encodeURIComponent(t.id)}/">${name}</a></td>`
  +`<td class="r times" aria-hidden="true">${clock(t.dep)} → ${clock(t.arr)}${next}</td><td class="dep">${clock(t.dep)}</td><td class="arr">${clock(t.arr)}${next}</td><td class="s"${own==null?` title="${ko?`도착 기록이 ${MIN_DAYS}일 미만입니다`:`Fewer than ${MIN_DAYS} recorded days`}"`:''}>${bar(own)}</td></tr>`;
}
// The page for one journey: figures for the whole journey, the delay on arrival by hour of departure, and a table of every train. r is its row of the all-journeys list, stats is pairStats from build-time
// data (with delay bands).
// stationId gives the address name of the station page for a station's English name, or null when it has none; the two names in the title lead there and look like plain text.
export function renderJourney({row:r,stats},month,locale='en',hasStation=()=>false){
 const ko=locale==='ko',{span:period,metaLine,backBtn,shareLegend:legendOf,scaleLegend}=localeUtils(locale),t=(en,kr)=>ko?kr:en,[a,b]=stationNames(r,locale),A=esc(a),B=esc(b),n=stats.trains.length;
 if(!n||!stats.reported||!month?.from)return empty(t('No reported arrivals for this journey in the past month.','이 기간에 이 구간의 도착 기록이 없습니다.'));
 const place=(id,text)=>hasStation(id)?`<a class="plain-link" href="${ko?'ko/':''}station/${encodeURIComponent(id)}/">${text}</a>`:text;
 const share=stats.within/stats.reported,within10=(stats.bands[0]+stats.bands[1])/stats.reported,within15=stats.within15/stats.reported;
 const stat=fig(pct0(share),t('within 5 min','5분 이내'))+fig(pct0(within10),t('within 10 min','10분 이내'))+fig(pct0(within15),t('within 15 min','15분 이내'))+fig(esc(duration(stats.typical,ko)),t('typical scheduled time','예정 소요 시간'));
 const head=`<div class="train-intro train-head"><div class="train-lead">${backBtn}<div><h1>${place(r.fromId,A)} → ${place(r.toId,B)}</h1><p class="meta">${metaLine(ko?`두 역에 모두 정차하는 열차 ${num(n)}편`:`${num(n)} trains stop at both stations`,period(month.from,month.to,month.days),t(`% = share of arrivals at ${B} within 5&nbsp;min`,`%는 ${B} 도착 기록 중 5분 이내에 도착한&nbsp;비율`))}</p><p class="meta train-stats">${stat}</p>${stats.hasConflictingArrivals?arrivalDataNote(locale):''}</div></div></div>`;
 // The chart: a stacked bar per departure hour in the delay scale, the within-5 share above it, the hour below (the tooltip and the hidden table give the trains). A bar needs HOUR_MIN_ARRIVALS arrivals.
 const hours=hourBuckets(stats),label=i=>BANDS[i][ko?1:0],hh=h=>String(h).padStart(2,'0'),
  showShare=o=>o.reported>=HOUR_MIN_ARRIVALS,
  arrivalCount=o=>t(`${num(o.reported)} ${o.reported===1?'arrival':'arrivals'}`,`도착 기록 ${num(o.reported)}건`);
 const cols=hours.map(o=>{
  const ok=showShare(o),pc=i=>Math.round(100*o.bands[i]/o.reported);
  const current=o.trains?trainsText(o.trains,locale):t('Past reports only','과거 도착 기록만 있음');
  const tip=`${hh(o.hour)}:00–${hh(o.hour)}:59 · ${current} · ${arrivalCount(o)} · ${ok?o.bands.map((c,i)=>`${label(i).toLowerCase()} ${pc(i)}%`).join(', '):t(`fewer than ${HOUR_MIN_ARRIVALS} arrivals`,`도착 기록 ${HOUR_MIN_ARRIVALS}건 미만`)}`;
  const column=`<span class="hour-pct">${ok?`${pc(0)}<i>%</i>`:'—'}</span><span class="hour-bar${ok?'':' na'}">${ok?o.bands.map((c,i)=>`<i class="k${i}" style="height:${(100*c/o.reported).toFixed(1)}%"></i>`).join(''):''}</span><span class="hour-label">${o.hour}${o.trains?'':'*'}</span>`;
  if(!o.trains)return `<div class="hour-col history" role="img" aria-label="${esc(tip)}" title="${esc(tip)}">${column}</div>`;
  return `<button type="button" class="hour-col" data-hour="${o.hour}" aria-pressed="false" aria-label="${esc(t(`Show trains departing ${hh(o.hour)}:00–${hh(o.hour)}:59`,`${hh(o.hour)}:00–${hh(o.hour)}:59 출발 열차만 보기`))}" title="${esc(tip)}">${column}</button>`;
 }).join('');
 // The figures need room: the chart hides them when this many columns are too narrow for them (see .hours-wrap in styles.css).
 const fit=[12,16,20,24].find(m=>hours.length<=m);
 const hourTable=hiddenTable(t(`Delay on arrival at ${b} by departure hour`,`${a} 출발 시간대별 ${b} 도착 지연`),[t('Departure hour','출발 시간대'),t('Currently scheduled trains','현재 시간표의 열차'),t('Reported arrivals','도착 기록'),...BANDS.map((_,i)=>label(i))],hours.map(o=>[`${hh(o.hour)}:00`,trainsText(o.trains,locale),ko?`${num(o.reported)}건`:arrivalCount(o),...o.bands.map(c=>showShare(o)?`${Math.round(100*c/o.reported)}%`:'—')]));
 const history=hours.some(o=>!o.trains)?t(' An asterisk marks hours with past reports only.',' 별표는 과거 도착 기록만 있는 시간대입니다.'):'';
 const hourCard=card(t('By departure hour','출발 시간대별'),t(`Delay on arrival at ${b}`,`${b} 도착 지연`),
  `<div class="trains-key">${scaleLegend()}</div><div class="hours-wrap"><div class="hours f${fit}" role="group" aria-label="${t('Departure hour','출발 시간대')}">${cols}</div></div><p class="meta chart-hint">${t('Reports are grouped by the scheduled departure hour on the day of travel. Select a bar to filter the current timetable.','운행일의 예정 출발 시각을 기준으로 집계합니다. 막대를 선택하면 현재 시간표를 출발 시간대별로 조회할 수 있습니다.')}${history}</p>${hourTable}`);
 // The train table works like the all-trains page's: the same ids and data attributes as js/trains-page.js expects.
 const total=num(n);
 const hourOptions=list=>list.map(h=>`<option value="${h}">${hh(h)}:00–${hh(h)}:59</option>`).join(''),
  hourField=(id,en,kr,list)=>`<div class="trains-field hour-field"><label for="${id}">${t(en,kr)}</label><select id="${id}"><option value="">${t('Any hour','전체 시간대')}</option>${hourOptions(list)}</select></div>`,
  arrivalHours=[...new Set(stats.trains.map(x=>Math.floor(x.arr%1440/60)))].sort((x,y)=>x-y);
 const controls=`<form class="trains-filters station-filters" id="trains-filters" hidden>${trainNumberSearch(locale)}${hourField('trains-dep','Departure hour','출발 시간대',hours.filter(o=>o.trains).map(o=>o.hour))}${hourField('trains-arr','Arrival hour','도착 시간대',arrivalHours)}<div class="trains-field sort-field"><label for="trains-sort">${t('Sort by','정렬 기준')}</label><select id="trains-sort">${JOURNEY_SORTS.map(([v,[e,kr]])=>`<option value="${v}">${t(e,kr)}</option>`).join('')}</select></div></form>`
  +`<div class="trains-status" id="trains-status" hidden><p class="meta" id="trains-count" aria-live="polite">${t(`${total} of ${total} trains`,`전체 ${total}편 중 ${total}편`)}</p><button type="button" id="trains-reset" hidden>${t('Reset','초기화')}</button></div>`;
 const legend=`<div class="trains-key">${legendOf('',null)}</div>`;
 const table=`<table class="trains-table journey-table" role="table"><thead><tr>${th('num',t('Train','열차'))}${th('',t(`Departs ${a}`,`${a} 출발`))}${th('arr',t(`Arrives ${b}`,`${b} 도착`))}${th('share',t('Within 5 min','5분 이내 도착 비율'),'s')}</tr></thead><tbody id="trains-rows" data-cap="${ROW_CAP}">${stats.trains.map(x=>journeyTrainRow(x,locale)).join('')}</tbody></table>`
  +`<p class="trains-empty" id="trains-empty" hidden>${t('No trains match these filters.','선택한 조건에 맞는 열차가 없습니다. 조건을 바꾸거나 초기화해 주세요.')}</p>`;
 const trainCard=card(t(`Find a train from ${a} to ${b}`,`${a}에서 ${b}까지 열차 찾기`),'',controls+legend+table,'find');
 // day-cards is the grid with 16 px between cards that day and month pages use.
 return head+`<div class="day-cards">${hourCard}${trainCard}</div>`;
}
