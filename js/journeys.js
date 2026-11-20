import {esc,num,pct0,delaysTitle,fitting,shareLegend,bar,empty,hiddenTable,ROW_CAP,MIN_DAYS,trainNumberSearch,tableHeading as th,stat as fig} from './utils.js';
import {localeUtils,localizeTrain,stationName} from './locale.js';
import {card} from './station.js';
// The all-journeys page (journeys/): top lists, From and To dropdowns, and a table of every journey that at least 40 trains make, built from the train files.
// A journey is two distinct stations with one eligible forward segment per train. Its share uses reported arrivals at the destination visit.
// scripts/build.mjs builds the whole page and writes journeys/data.json, which js/journeys-page.js loads to answer a search for any two stations.
// Each journey with a page (MIN_TRAINS trains) also gets journey/<from>-to-<to>/, rendered by renderJourney below from the same train files; its figures are computed at build time, so visitors download no extra data.
// Both pages share pairStats, so the panel on the all-journeys page and a journey page cannot disagree.
const GROUPS=['KTX','ITX','Saemaeul','Mugunghwa','Other'];
const group=type=>type.startsWith('ITX')?'ITX':type;
const minutes=t=>+t.slice(0,2)*60+ +t.slice(3);
// Match station ID + zero-based visit across timetable versions; inserting a stop can change ordinals.
// Hongseong's departure is visit 0 and its return arrival is visit 1, so matching only the station would lose the arrival.
const visits=stops=>{const seen=new Map();return stops.map(s=>{const n=seen.get(s.station_id)||0;seen.set(s.station_id,n+1);return `${s.station_id}#${n}`;});};
// A journey is listed from 40 trains; a share is shown from 10 trains, so a search for a rare pair still gets its trains, but no overall share.
export const MIN_TRAINS=40,SHOW_TRAINS=10;
// Build/browser contract: stations = [[English name, Korean name, public station ID], ...]; trains = [[id, number, type, calls], ...].
// A call is [station index, arrival minute|null, departure minute|null, reported arrivals, arrivals within 5 minutes].
// With detail (build time only, for journey pages) a call also ends with [arrivals per delay band, arrivals within 15 minutes]; the bands are the site's delay scale: 0-5, 6-10, 11-20, 21-30, over 30 minutes.
// Indexes belong to this payload, not public station IDs. Minutes include day offsets from the train's starting midnight.
// The latest timetable supplies the route and times; each run supplies delay values through its own timetable and ordinal.
export function journeyData(trains,stations,detail=false){
 const byId=new Map(stations.map(s=>[s.id,s])),index=new Map(),names=[],rows=[];
 const at=id=>{let i=index.get(id);if(i==null){i=names.length;index.set(id,i);const s=byId.get(id);names.push([s?.name??id,s?.name_ko||s?.name||id,id]);}return i;};
 for(const train of trains){
  const w=train.windows?.month;if(!w?.runs)continue;
  const stops=train.timetables.at(-1).stops;
  const keys=visits(stops),tmap=new Map(train.timetables.map(t=>{const own=visits(t.stops);return [t.id,new Map(t.stops.map((s,i)=>[own[i],s]))];})),runs=train.runs.filter(r=>r.status==='ok'&&r.date>=w.from&&r.date<=w.to);
  const calls=stops.map((s,i)=>{
   let reported=0,within=0,within15=0;const bands=[0,0,0,0,0];
   if(s.arrival!=null)for(const r of runs){
    const stop=tmap.get(r.timetable)?.get(keys[i]),d=stop?.arrival!=null?r.delays?.[stop.ordinal]??null:null;
    // Zero is a valid report; null and starting departures never enter either arrival count.
    if(d!=null){reported++;if(d<=5)within++;if(detail){bands[d<=5?0:d<=10?1:d<=20?2:d<=30?3:4]++;if(d<=15)within15++;}}
   }
   return [at(s.station_id),s.arrival==null?null:minutes(s.arrival)+(s.arrival_day_offset||0)*1440,s.departure==null?null:minutes(s.departure)+(s.departure_day_offset||0)*1440,reported,within,...(detail?[bands,within15]:[])];
  });
  rows.push([train.id,train.number,train.type,calls]);
 }
 return {stations:names,trains:rows};
}
// The payload the browser loads: the same data without the build-time delay bands.
export const compactJourneyData=data=>({stations:data.stations,trains:data.trains.map(([id,number,type,calls])=>[id,number,type,calls.map(c=>c.slice(0,5))])});
// One forward segment per train and pair of distinct stations. If several visit combinations fit,
// omit only that ambiguous pair; keep the train's other journeys. Search options use this same rule.
// Traverse the explicit stop order, never wrap from the final call to the first. A → B → A → C makes A → C ambiguous, but B → A valid.
export function* journeySegments(calls){
 const pairs=new Map();
 for(let i=0;i<calls.length-1;i++){
  if(calls[i][2]==null)continue;
  for(let j=i+1;j<calls.length;j++){
   if(calls[j][1]==null||calls[i][0]===calls[j][0]||calls[j][1]<calls[i][2])continue;
   const key=`${calls[i][0]}:${calls[j][0]}`;
   // null is a permanent ambiguity marker, including when a third candidate appears; test presence, not truthiness.
   pairs.set(key,pairs.has(key)?null:[i,j]);
  }
 }
 for(const pair of pairs.values())if(pair)yield pair;
}
// The trains that call at station a and later at station b (indexes into data.stations), by departure from a, with the arrivals reported at b and the typical (median) time between the stations.
export function pairStats(data,a,b){
 const trains=[],bands=[0,0,0,0,0];let reported=0,within=0,within15=0;
 for(const [id,number,type,calls] of data.trains){
  for(const [i,j] of journeySegments(calls)){
   if(calls[i][0]!==a||calls[j][0]!==b)continue;
   reported+=calls[j][3];within+=calls[j][4];
   // Delay bands exist only in build-time data (journey pages); the browser's panel has just the within-5 counts.
   if(calls[j][5]){calls[j][5].forEach((c,k)=>bands[k]+=c);within15+=calls[j][6];}
   trains.push({id,number,type,dep:calls[i][2],arr:calls[j][1],reported:calls[j][3],within:calls[j][4],...(calls[j][5]?{bands:calls[j][5],within15:calls[j][6]}:{})});
   break;
  }
 }
 trains.sort((x,y)=>x.dep-y.dep||x.id.localeCompare(y.id));
 // Keep the same middle-service duration as toRow (upper middle for an even count), so panel and catalogue agree.
 const times=trains.map(t=>t.arr-t.dep).sort((x,y)=>x-y);
 // The band totals appear only with build-time data, so the browser's result keeps its smaller shape.
 return {trains,reported,within,...(trains.some(t=>t.bands)?{bands,within15}:{}),typical:times.length?times[times.length>>1]:null};
}
// Every pair of stations in order that some train calls at, keyed by station indexes: the trains, their types, the scheduled times between the stations, and the arrivals reported at the second one.
// from and to (indexes) narrow it to the journeys that start or end at one station.
function collect(data,from=null,to=null){
 const by=new Map(),n=data.stations.length;
 for(const [id,,type,calls] of data.trains)for(const [i,j] of journeySegments(calls)){
   if((from!=null&&calls[i][0]!==from)||(to!=null&&calls[j][0]!==to))continue;
   const k=calls[i][0]*n+calls[j][0];let p=by.get(k);
   if(!p)by.set(k,p={a:calls[i][0],b:calls[j][0],ids:new Set(),types:new Set(),times:[],reported:0,within:0});
   p.ids.add(id);p.types.add(group(type));p.times.push(calls[j][1]-calls[i][2]);p.reported+=calls[j][3];p.within+=calls[j][4];
 }
 return by;
}
// A journey's row: how many trains, the types, the scheduled time (the median), and the share of reported arrivals at the second station, which needs SHOW_TRAINS trains (otherwise null).
function toRow(p,data){
 p.times.sort((x,y)=>x-y);
 const name=i=>data.stations[i];
 return {from:name(p.a)[0],fromKo:name(p.a)[1],fromId:name(p.a)[2],to:name(p.b)[0],toKo:name(p.b)[1],toId:name(p.b)[2],trains:p.ids.size,types:GROUPS.filter(g=>p.types.has(g)),mins:p.times[p.times.length>>1],arrivals:p.reported,share:p.ids.size>=SHOW_TRAINS&&p.reported?p.within/p.reported:null};
}
const byTrains=(x,y)=>y.trains-x.trains||x.from.localeCompare(y.from)||x.to.localeCompare(y.to);
// The table as built: the journeys that MIN_TRAINS or more trains make.
export const journeyList=data=>[...collect(data).values()].filter(p=>p.ids.size>=MIN_TRAINS&&p.reported).map(p=>toRow(p,data)).sort(byTrains);
// All journeys that start at station from and/or end at station to, whatever the number of trains; the page builds these rows when one station is chosen.
export const journeysAt=(data,from,to)=>[...collect(data,from,to).values()].map(p=>toRow(p,data)).sort(byTrains);
export const journeyCount=data=>collect(data).size;
// What a search result shows for this page.
export function pageInfo(rows,month,locale='en',all=rows.length){
 if(!rows?.length||!month?.from)return null;
 const window=localeUtils(locale).windowPhrase(month.from,month.to);
 if(locale==='ko')return {title:'전체 구간의 열차 도착 지연과 5분 이내 도착 비율 · Korean Train Stats',description:`서울에서 부산까지 등 구간 ${num(all)}개의 ${window} 도착 기록을 비교합니다. 구간별 열차 수와 5분 이내 도착 비율을 확인하세요.`,crumbs:[{name:'전체 구간'}]};
 return {title:'All Korail journeys and their punctuality · Korean Train Stats',description:`How punctual is your route? Compare delays on ${num(all)} journeys, from Seoul to Busan and more, by arrivals within 5 min over ${window}.`,crumbs:[{name:'All journeys'}]};
}
const stationNames=(r,locale)=>locale==='ko'?[r.fromKo,r.toKo]:[r.from,r.to];
// A journey with MIN_TRAINS trains and a reported arrival has its own page at journey/<from ID>-to-<to ID>/; the address is public, so it uses the stable station IDs.
export const journeyPath=(fromId,toId)=>`journey/${fromId}-to-${toId}/`;
export const pageable=r=>r.trains>=MIN_TRAINS&&r.arrivals>0&&!!r.fromId&&!!r.toId;
// Other journeys open their panel on the all-journeys page, which keeps the choice in the address.
const href=(r,locale)=>`${locale==='ko'?'ko/':''}${pageable(r)?journeyPath(r.fromId,r.toId):`journeys/?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`}`;
const types=(r,locale)=>r.types.map(g=>locale==='ko'?localizeTrain({type:g}).type:g).join(', ');
const trainsText=(n,locale)=>locale==='ko'?`열차 ${num(n)}편`:`${num(n)} ${n===1?'train':'trains'}`;
// A journey time of 60 minutes or more reads as hours and minutes; a delay does the same (minutes in js/utils.js).
const duration=(m,ko)=>{const h=Math.floor(m/60),r=m%60;return m<60?(ko?`${m}분`:`${m} min`):ko?`${h}시간${r?` ${r}분`:''}`:`${h} h${r?` ${r} min`:''}`;};
const clock=m=>`${String(Math.floor(m%1440/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const rank=(r,locale)=>{const [a,b]=stationNames(r,locale);return `<a class="rank-row" href="${href(r,locale)}"><span class="rank-name">${esc(a)} → ${esc(b)}</span><span class="rank-route">${trainsText(r.trains,locale)}</span><span class="rank-share">${bar(r.share)}</span></a>`;};
// The journey pages that start at a station, by the name of the station they end at; a station page's Going to filter links to them.
export const journeysFrom=(station,rows,locale='en')=>new Map(rows.filter(r=>r.fromId===station.id&&pageable(r)).map(r=>[r.to,href(r,locale)]));
// The card at the end of a station page: its busiest journeys by number of trains, however few, so every station that has a journey gets one. It makes no claim about how many there are; the two links under the rows lead
// to the full lists. A journey without a page opens the all-journeys search for that pair. Null when the station is in no journey. rows is every journey (journeysAt), not only the catalogue.
export const SHOWN_AT_STATION=6;
export const journeysOfStation=(station,rows)=>rows.filter(r=>r.fromId===station.id||r.toId===station.id).sort((a,b)=>b.trains-a.trains||a.fromId.localeCompare(b.fromId)||a.toId.localeCompare(b.toId));
export function journeysCard(station,rows,locale='en'){
 const mine=journeysOfStation(station,rows);if(!mine.length)return '';
 const ko=locale==='ko',name=ko?stationName(station.name):station.name,base=`${ko?'ko/':''}journeys/?`,q=encodeURIComponent(station.name);
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
 if(!rows?.length||!month?.from)return empty(t(`No journeys with at least ${MIN_TRAINS} trains in the past month.`,`이 기간에 열차가 ${MIN_TRAINS}편 이상인 구간이 없습니다.`));
 const total=num(all);
 const head=`<div class="train-intro train-head"><div class="train-lead">${backBtn}<div><h1>${t('All journeys','전체 구간')}</h1><p class="meta">${metaLine(ko?`구간 ${total}개`:`${total} journeys`,period(month.from,month.to),t('% = share of arrivals at the second station within 5&nbsp;min','%는 도착역 도착 기록 중 5분 이내에 도착한&nbsp;비율'))}</p></div></div></div>`;
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
 const table=`<table class="trains-table" role="table" id="journeys-table"><thead><tr>${th('route',t('Journey','구간'))}${th('',t('Served by','정차 열차 종류'))}${th('time',t('Scheduled time','예정 소요 시간'))}${th('num',t('Trains','열차'),'','descending')}${th('share',t('Within 5 min','5분 이내 도착 비율'),'s')}</tr></thead><tbody id="journeys-rows" data-cap="${ROW_CAP}" data-more="${t('Show {n} more journeys','구간 {n}개 더 보기')}">${rows.map(r=>tableRow(r,locale)).join('')}</tbody></table>`
  +`<p class="trains-empty" id="journeys-empty" hidden>${t('No journeys match these filters.','선택한 조건에 맞는 구간이 없습니다. 조건을 바꾸거나 초기화해 주세요.')}</p>`
  +`<p class="rank-note" id="journeys-note">${t('Choose a station to list all of its journeys, or two stations to see their trains.','역을 하나 선택하면 그 역의 모든 구간을, 두 역을 선택하면 두 역 사이의 열차를 확인할 수 있습니다.')}</p>`;
 return head+lists+card(t('Find a journey','구간 찾기'),'',controls+table,'find');
}

// ---- A journey page: journey/<from ID>-to-<to ID>/ ----
// The delay bands are the site's delay scale (utils.js DELAY_SCALE, shown by scaleLegend): 0-5, 6-10, 11-20, 21-30 and over 30 minutes.
const BANDS=[['Within 5 min','5분 이내'],['6–10 min','6–10분'],['11–20 min','11–20분'],['21–30 min','21–30분'],['Over 30 min','30분 초과']];
// An hour's bar needs this many reported arrivals; fewer would draw noise as a pattern.
export const HOUR_MIN_ARRIVALS=20;
// Trains grouped by the hour they leave the first station: the trains, their reported arrivals at the second station, and those arrivals per delay band.
export function hourBuckets(stats){
 const by=new Map();
 for(const t of stats.trains){
  const hour=Math.floor(t.dep%1440/60),o=by.get(hour)||by.set(hour,{hour,trains:0,reported:0,bands:[0,0,0,0,0]}).get(hour);
  o.trains++;o.reported+=t.reported;t.bands.forEach((c,i)=>o.bands[i]+=c);
 }
 return [...by.values()].sort((x,y)=>x.hour-y.hour);
}
// What a search result shows for a journey page.
export function journeyPageInfo(r,month,locale='en'){
 if(!r||!month?.from||!r.arrivals||r.share==null)return null;
 const [a,b]=stationNames(r,locale),window=localeUtils(locale).windowPhrase(month.from,month.to);
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
export function renderJourney({row:r,stats},month,locale='en',stationId=()=>null){
 const ko=locale==='ko',{span:period,metaLine,backBtn,shareLegend:legendOf,scaleLegend}=localeUtils(locale),t=(en,kr)=>ko?kr:en,[a,b]=stationNames(r,locale),A=esc(a),B=esc(b),n=stats.trains.length;
 if(!n||!stats.reported||!month?.from)return empty(t('No reported arrivals for this journey in the past month.','이 기간에 이 구간의 도착 기록이 없습니다.'));
 const place=(name,text)=>stationId(name)?`<a class="plain-link" href="${ko?'ko/':''}station/${encodeURIComponent(stationId(name))}/">${text}</a>`:text;
 const share=stats.within/stats.reported,within10=(stats.bands[0]+stats.bands[1])/stats.reported,within15=stats.within15/stats.reported;
 const stat=fig(pct0(share),t('within 5 min','5분 이내'))+fig(pct0(within10),t('within 10 min','10분 이내'))+fig(pct0(within15),t('within 15 min','15분 이내'))+fig(esc(duration(stats.typical,ko)),t('typical scheduled time','예정 소요 시간'));
 const head=`<div class="train-intro train-head"><div class="train-lead">${backBtn}<div><h1>${place(r.from,A)} → ${place(r.to,B)}</h1><p class="meta">${metaLine(ko?`두 역에 모두 정차하는 열차 ${num(n)}편`:`${num(n)} trains stop at both stations`,period(month.from,month.to),t(`% = share of arrivals at ${B} within 5&nbsp;min`,`%는 ${B} 도착 기록 중 5분 이내에 도착한&nbsp;비율`))}</p><p class="meta train-stats">${stat}</p></div></div></div>`;
 // The chart: a stacked bar per departure hour in the delay scale, the within-5 share above it, the hour below (the tooltip and the hidden table give the trains). A bar needs HOUR_MIN_ARRIVALS arrivals.
 const hours=hourBuckets(stats),label=i=>BANDS[i][ko?1:0],hh=h=>String(h).padStart(2,'0');
 const cols=hours.map(o=>{
  const ok=o.reported>=HOUR_MIN_ARRIVALS,pc=i=>Math.round(100*o.bands[i]/o.reported);
  const tip=`${hh(o.hour)}:00–${hh(o.hour)}:59 · ${trainsText(o.trains,locale)} · ${ok?o.bands.map((c,i)=>`${label(i).toLowerCase()} ${pc(i)}%`).join(', '):t(`fewer than ${HOUR_MIN_ARRIVALS} arrivals`,`도착 기록 ${HOUR_MIN_ARRIVALS}건 미만`)}`;
  return `<button type="button" class="hour-col" data-hour="${o.hour}" aria-pressed="false" aria-label="${esc(t(`Show trains departing ${hh(o.hour)}:00–${hh(o.hour)}:59`,`${hh(o.hour)}:00–${hh(o.hour)}:59 출발 열차만 보기`))}" title="${esc(tip)}"><span class="hour-pct">${ok?`${pc(0)}<i>%</i>`:'—'}</span><span class="hour-bar${ok?'':' na'}">${ok?o.bands.map((c,i)=>`<i class="k${i}" style="height:${(100*c/o.reported).toFixed(1)}%"></i>`).join(''):''}</span><span class="hour-label">${o.hour}</span></button>`;
 }).join('');
 // The figures need room: the chart hides them when this many columns are too narrow for them (see .hours-wrap in styles.css).
 const fit=[12,16,20,24].find(m=>hours.length<=m);
 const hourTable=hiddenTable(t(`Delay on arrival at ${b} by departure hour`,`${a} 출발 시간대별 ${b} 도착 지연`),[t('Departure hour','출발 시간대'),t('Trains','열차'),t('Reported arrivals','도착 기록'),...BANDS.map((_,i)=>label(i))],hours.map(o=>[`${hh(o.hour)}:00`,trainsText(o.trains,locale),ko?`${num(o.reported)}건`:`${num(o.reported)} ${o.reported===1?'arrival':'arrivals'}`,...o.bands.map(c=>o.reported?`${Math.round(100*c/o.reported)}%`:'—')]));
 const hourCard=card(t('By departure hour','출발 시간대별'),t(`Delay on arrival at ${b}`,`${b} 도착 지연`),
  `<div class="trains-key">${scaleLegend()}</div><div class="hours-wrap"><div class="hours f${fit}" role="group" aria-label="${t('Departure hour','출발 시간대')}">${cols}</div></div><p class="meta chart-hint">${t('Select a bar to list only the trains that leave in that hour.','막대를 선택하면 해당 시간대에 출발하는 열차만 표시합니다.')}</p>${hourTable}`);
 // The train table works like the all-trains page's: the same ids and data attributes as js/trains-page.js expects.
 const total=num(n);
 const hourOptions=list=>list.map(h=>`<option value="${h}">${hh(h)}:00–${hh(h)}:59</option>`).join(''),
  hourField=(id,en,kr,list)=>`<div class="trains-field hour-field"><label for="${id}">${t(en,kr)}</label><select id="${id}"><option value="">${t('Any hour','전체 시간대')}</option>${hourOptions(list)}</select></div>`,
  arrivalHours=[...new Set(stats.trains.map(x=>Math.floor(x.arr%1440/60)))].sort((x,y)=>x-y);
 const controls=`<form class="trains-filters station-filters" id="trains-filters" hidden>${trainNumberSearch(locale)}${hourField('trains-dep','Departure hour','출발 시간대',hours.map(o=>o.hour))}${hourField('trains-arr','Arrival hour','도착 시간대',arrivalHours)}<div class="trains-field sort-field"><label for="trains-sort">${t('Sort by','정렬 기준')}</label><select id="trains-sort">${JOURNEY_SORTS.map(([v,[e,kr]])=>`<option value="${v}">${t(e,kr)}</option>`).join('')}</select></div></form>`
  +`<div class="trains-status" id="trains-status" hidden><p class="meta" id="trains-count" aria-live="polite">${t(`${total} of ${total} trains`,`전체 ${total}편 중 ${total}편`)}</p><button type="button" id="trains-reset" hidden>${t('Reset','초기화')}</button></div>`;
 const legend=`<div class="trains-key">${legendOf('',null)}</div>`;
 const table=`<table class="trains-table journey-table" role="table"><thead><tr>${th('num',t('Train','열차'))}${th('',t(`Departs ${a}`,`${a} 출발`))}${th('arr',t(`Arrives ${b}`,`${b} 도착`))}${th('share',t('Within 5 min','5분 이내 도착 비율'),'s')}</tr></thead><tbody id="trains-rows" data-cap="${ROW_CAP}">${stats.trains.map(x=>journeyTrainRow(x,locale)).join('')}</tbody></table>`
  +`<p class="trains-empty" id="trains-empty" hidden>${t('No trains match these filters.','선택한 조건에 맞는 열차가 없습니다. 조건을 바꾸거나 초기화해 주세요.')}</p>`;
 const trainCard=card(t(`Find a train from ${a} to ${b}`,`${a}에서 ${b}까지 열차 찾기`),'',controls+legend+table,'find');
 // day-cards is the grid with 16 px between cards that day and month pages use.
 return head+`<div class="day-cards">${hourCard}${trainCard}</div>`;
}
