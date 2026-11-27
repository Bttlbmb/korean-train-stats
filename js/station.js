import {esc,num,pct0,delaysTitle,fitting,bar,empty,ROW_CAP,MIN_DAYS,trainNumberSearch,tableHeading,stat,card,scheduledMinute} from './utils.js';
import {localeUtils,localizeTrain,stationName} from './locale.js';
import {pinHTML} from './train.js';
// A station page (station/<id>/): the station on the map and a table of every train.
// It needs no browser, so scripts/build.mjs builds the whole page and trains-page.js only adds the controls.
const group=type=>type.startsWith('ITX')?'ITX':type;
const GROUPS=['KTX','ITX','Saemaeul','Mugunghwa','Other'];
// A table this short or shorter has no controls.
const FEW=10;
// A train can call at one station twice (Hongseong, on the ITX-Maum loop), so a stop is matched across timetable versions by its station and which visit it is.
const visits=stops=>{const seen=new Map();return stops.map(s=>{const n=seen.get(s.station_id)||0;seen.set(s.station_id,n+1);return `${s.station_id}#${n}`;});};
// One row for every call of every train that ran in the past month, grouped by station ID: its scheduled time, and how many reported arrivals there were and how many were within 5 minutes.
// A train that starts at the station has no arrival, so no delay. Trains with no run in the past month have no page and no row.
export function stationRows(trains){
 const by=new Map();
 for(const train of trains){
  const w=train.windows?.month;if(!w?.runs)continue;
  const tmap=new Map(train.timetables.map(t=>[t.id,t])),keys=new Map(train.timetables.map(t=>[t.id,visits(t.stops)])),stops=train.timetables.at(-1).stops,own=visits(stops);
  const runs=train.runs.filter(r=>r.status==='ok'&&r.date>=w.from&&r.date<=w.to);
  stops.forEach((s,i)=>{
   let reported=0,within=0;
   if(s.arrival!=null)for(const r of runs){
    const k=keys.get(r.timetable)?.indexOf(own[i]),stop=k>=0?tmap.get(r.timetable).stops[k]:null,d=stop?.arrival!=null?r.delays?.[stop.ordinal]??null:null;
    if(d!=null){reported++;if(d<=5)within++;}
   }
   const starts=s.arrival==null;
   // after: the other stations the train calls at later, which the Going to filter matches.
   (by.get(s.station_id)||by.set(s.station_id,[]).get(s.station_id)).push({id:train.id,number:train.number,type:train.type,origin:train.origin,destination:train.destination,destination_ko:stops.at(-1).station_ko,
    time:starts?s.departure:s.arrival,off:(starts?s.departure_day_offset:s.arrival_day_offset)||0,starts,ends:i===stops.length-1,after:[...new Set(stops.slice(i+1).filter(x=>x.station_id!==s.station_id).map(x=>x.station))],reported,within});
  });
 }
 for(const rows of by.values())rows.sort((a,b)=>(scheduledMinute(a.time,a.off)??Infinity)-(scheduledMinute(b.time,b.off)??Infinity)||a.id.localeCompare(b.id));
 return by;
}
const share=rows=>{const n=rows.reduce((a,r)=>a+r.reported,0);return n?rows.reduce((a,r)=>a+r.within,0)/n:null;};
const own=r=>r.reported>=MIN_DAYS?r.within/r.reported:null;
const figures=rows=>({arrivals:rows.reduce((a,r)=>a+r.reported,0),share:share(rows)});
// A train that starts and ends at the station (the ITX-Maum loop at Hongseong) has a row for each visit, so rows can outnumber trains.
export const trainCount=rows=>new Set(rows.map(r=>r.id)).size;
// What a search result shows for this page. A station with no reported arrival in the past month has nothing to show, so it gets null.
// The train types that get their own figure, as the header's stats and the search result show them: two or more, never Other.
const typesOf=rows=>GROUPS.map(g=>({g,rows:rows.filter(r=>group(r.type)===g)})).filter(x=>x.rows.length);
const typedOf=types=>types.filter(x=>x.g!=='Other'&&figures(x.rows).arrivals);
export function pageInfo(station,rows,month,locale='en'){
 const {arrivals,share:all}=figures(rows||[]);if(!station||!month?.from||!arrivals)return null;
 const ko=locale==='ko',window=localeUtils(locale).windowPhrase(month.from,month.to,month.days),typed=typedOf(typesOf(rows)),
  byType=typed.length>1?` ${typed.map(x=>`${ko?localizeTrain({type:x.g}).type:x.g} ${pct0(share(x.rows))}`).join(', ')}.`:'';
 if(ko){
  const name=station.name_ko||stationName(station.name);
  return {title:`${name}역 열차 도착 지연 · Korean Train Stats`,description:`${name}역 정차 열차 ${num(trainCount(rows))}편: ${window} 도착 기록 ${num(arrivals)}건 중 ${pct0(all)}가 5분 이내에 도착했습니다.${byType}`,crumbs:[{name:'전체 역',to:'stations/'},{name:`${name}역`}]};
 }
 return {title:delaysTitle(`${station.name} station`),description:fitting(140,`${station.name} station: ${pct0(all)} of train stops were within 5 min of schedule over ${window} (${num(trainCount(rows))} trains).${byType}`,`${station.name} station: ${pct0(all)} of train stops were within 5 min of schedule over ${window} (${num(trainCount(rows))} trains).`),crumbs:[{name:'All stations',to:'stations/'},{name:station.name}]};
}
const href=(id,locale)=>`${locale==='ko'?'ko/':''}train/${encodeURIComponent(id)}/`,trainName=(r,locale)=>`${esc(locale==='ko'?localizeTrain(r).type:r.type)} ${esc(r.number)}`;
const place=(name,locale)=>esc(locale==='ko'?stationName(name):name);
const SORTS=[['',['Time','시각 빠른 순']],['num:ascending',['Train number','열차 번호 순']],['share:descending',['Within 5 min, highest','5분 이내 도착 비율 높은 순']],['share:ascending',['Within 5 min, lowest','5분 이내 도착 비율 낮은 순']],['route:ascending',['Final destination','종착역 순']]];
function tableRow(r,locale){
 const ko=locale==='ko',s=own(r),toward=r.ends?(ko?'이 역이 종착역':'Ends here'):esc(ko?r.destination_ko||stationName(r.destination):r.destination);
 const time=r.time==null?'—':`${esc(r.time)}${r.off?`<sup>+${r.off}</sup>`:''}${r.starts?`<small>${ko?'출발':'departs'}</small>`:''}`;
 return `<tr data-type="${esc(group(r.type))}" data-to="${esc(r.ends?r.destination:r.after.join('|'))}" data-num="${r.number}" data-route="${toward}" data-arr="${scheduledMinute(r.time,r.off)??''}" data-share="${s==null?'':s}">`
  +`<td class="arr">${time}</td><td class="t"><a href="${href(r.id,locale)}">${trainName(r,locale)}</a></td><td class="r">${toward}</td><td class="s">${bar(s)}</td></tr>`;
}
// journeys maps the name of a station to the address of the journey page from this station to it (journeysFrom in js/journeys.js); the Going to filter offers it for the station it picks.
export function renderStation(station,rows,month,locale='en',journeys=new Map()){
 const ko=locale==='ko',L=localeUtils(locale),{backBtn,range,span,shareLegend,metaLine}=L,t=(en,kr)=>ko?kr:en;
 const {arrivals,share:all}=figures(rows||[]);
 if(!station||!arrivals)return empty(t('No reported stops at this station in the past month.','이 기간에 이 역의 도착 기록이 없습니다.'));
 const name=esc(ko?station.name_ko||stationName(station.name):station.name),starts=rows.filter(r=>r.starts).length,trains=trainCount(rows),calls=rows.length!==trains;
 const types=typesOf(rows),typed=typedOf(types);
 const label=g=>ko?localizeTrain({type:g}).type:g;
 const stats=stat(pct0(all),t('stops within 5 min','5분 이내 도착 비율'))+(typed.length>1?typed.map(x=>stat(pct0(share(x.rows)),esc(label(x.g)))).join(''):'');
 const meta=metaLine(...(ko?[`열차 ${num(trains)}편 정차${starts?` · 그중 ${num(starts)}편은 이 역에서 출발`:''}`,`${span(month.from,month.to,month.days)} · 도착 기록 ${num(arrivals)}건`,'%는 도착 기록 중 5분 이내에 도착한&nbsp;비율']:[`${num(trains)} ${trains===1?'train stops':'trains stop'} here${starts?` · ${num(starts)} ${starts===1?'starts':'start'} here`:''}`,`${span(month.from,month.to,month.days)} · ${num(arrivals)} stops`,'% = share of stops within 5&nbsp;min']));
 const head=`<div class="train-intro train-head"><div class="train-lead">${backBtn}<div><h1>${ko?`${name}역`:`${name} station`}</h1><p class="meta">${meta}</p><p class="meta train-stats">${stats}</p></div></div>${pinHTML(station)}</div>`;
 // Going to offers every station a train calls at after this one, the final stop included; a train that ends here gets its own entry, valued with the station's own name.
 const towards=new Map();for(const r of rows)if(r.ends)towards.set(r.destination,ko?'이 역이 종착역':'Ends here');else for(const n of r.after)towards.set(n,place(n,locale));
 const options=[...towards].sort((a,b)=>ko?a[1].localeCompare(b[1],'ko'):a[1].localeCompare(b[1])).map(([v,l])=>`<option value="${esc(v)}"${journeys.has(v)?` data-journey="${esc(journeys.get(v))}"`:''}>${l}</option>`).join('');
 const boxes=types.map(x=>`<label><input type="checkbox" name="type" value="${esc(x.g)}" checked>${esc(label(x.g))} <span>${num(trainCount(x.rows))}</span></label>`).join('');
 const total=num(rows.length);

 const few=rows.length<=FEW;
 const controls=few?'':`<form class="trains-filters station-filters" id="trains-filters" hidden>${types.length>1?`<fieldset><legend>${t('Train types','열차 종류')}</legend><div class="type-chips">${boxes}</div></fieldset>`:''}`
  +trainNumberSearch(locale)+`<div class="trains-field"><label for="trains-to">${t('Going to','도착역')}</label><select id="trains-to"><option value="">${t('Any station','전체 역')}</option>${options}</select></div>`
  +`<div class="trains-field sort-field"><label for="trains-sort">${t('Sort by','정렬 기준')}</label><select id="trains-sort">${SORTS.map(([v,[e,kr]])=>`<option value="${v}">${t(e,kr)}</option>`).join('')}</select></div></form>`
  +`<div class="trains-status" id="trains-status" hidden><p class="meta" id="trains-count" aria-live="polite"${calls?` data-text="${t('{n} of {total} stops','전체 정차 {total}회 중 {n}회')}"`:''}>${calls?t(`${total} of ${total} stops`,`전체 정차 ${total}회 중 ${total}회`):t(`${total} of ${total} trains`,`전체 ${total}편 중 ${total}편`)}</p><button type="button" id="trains-reset" hidden>${t('Reset','초기화')}</button>${journeys.size?`<a id="trains-journey" href="" data-text="${ko?`${name}역 → {to} 구간 페이지`:`${name} → {to} journey page`}" hidden></a>`:''}</div>`;
 const legend=`<div class="trains-key">${shareLegend('',null)}<span class="meta">${t(`A dash means fewer than ${MIN_DAYS} recorded days, or a train that starts here`,`도착 기록이 ${MIN_DAYS}일 미만이거나 이 역에서 출발하는 열차는 ‘—’로 표시합니다.`)}</span></div>`;
 const th=(name,text,cls='')=>tableHeading(few?'':name,text,cls);
 const table=`<table class="trains-table station-table" role="table"><thead><tr>${th('arr',t('Time','시각'))}${th('num',t('Train','열차'))}${th('route',t('Final destination','종착역'))}${th('share',t('Within 5 min','5분 이내 도착 비율'),'s')}</tr></thead><tbody id="trains-rows"${rows.length>ROW_CAP?` data-cap="${ROW_CAP}"`:''}${calls?` data-more="${t('Show all {n} stops','전체 정차 {n}회 보기')}"`:''}>${rows.map(r=>tableRow(r,locale)).join('')}</tbody></table>`
  +`<p class="trains-empty" id="trains-empty" hidden>${t('No trains match these filters.','선택한 조건에 맞는 열차가 없습니다. 조건을 바꾸거나 초기화해 주세요.')}</p>`;
 return head+card(ko?`${name}역의 열차 찾기`:`Find a train at ${name}`,'',controls+legend+table,'find');
}
