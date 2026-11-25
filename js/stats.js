import {esc,num,pct0,metaLine,stat,tipText,hiddenTable,fitting,TITLE_MAX,BRAND,isYesterdayInKorea} from './utils.js';
import {localeUtils,localizeTrain} from './locale.js';
import {KOREA} from './korea.js';
import {heatBody} from './stats-heat.js';
import {delayDistribution} from './day.js';
import {trackPoints,trackCredit} from './track.js';
// The Stats page (stats/): the figures of one time frame, from data/stats.json. Every frame is built into the page and the selector (stats-page.js) shows one,
// so the page needs no browser here. The newest 30 complete dates show first.
const FRAMES=[['yesterday','Yesterday','어제'],['week','Last 7 days','최근 7일'],['month','Last 30 days','최근 30일'],['all','All time','전체 기간']];
const BUCKETS=[['ontime','Within 5 min','5분 이내'],['d2','6–10 min','6–10분'],['d3','11–20 min','11–20분'],['d4','21–30 min','21–30분'],['d5','Over 30 min','30분 초과']];
const defaultFrame=windows=>['month','all','week','yesterday'].find(key=>windows?.[key]?.stops);
// What a search result shows for this page.
export function pageInfo(stats,locale='en'){
 const windows=stats?.windows,key=defaultFrame(windows);if(!key)return null;
 const w=windows[key];
 const ko=locale==='ko',L=localeUtils(locale),window=L.windowPhrase(w.from,w.to,w.days);
 if(ko)return {title:'열차 종류·요일·출발 시각별 도착 지연 통계'+BRAND,description:`코레일 열차의 ${window} 도착 기록 ${num(w.stops)}건 중 ${pct0(w.share_punctual)}가 5분 이내에 도착했습니다. 열차 종류, 요일, 출발 시각별로 지연이 언제 생기는지 확인하세요.`,crumbs:[{name:'통계'}]};
 return {title:fitting(TITLE_MAX,`Train delay statistics by type, weekday and hour${BRAND}`,`Train delay statistics${BRAND}`,'Train delay statistics'),
  description:`${pct0(w.share_punctual)} of ${num(w.stops)} Korail stops in ${window} arrived within 5 min. See delays by train type, weekday and departure hour.`,crumbs:[{name:'Stats'}]};
}
const label=(b,ko)=>ko?b[2]:b[1];
const share=(n,total)=>total?n/total:null;
const part=(n,ko)=>n>=.1?`${Math.round(n*100)}%`:n>=.01?`${(n*100).toFixed(1)}%`:ko?'1% 미만':'<1%';
// The bar of the day page, for any set of five bucket counts; a segment of no stops is left out.
function typeBar(buckets,ko){
 const total=buckets.reduce((a,b)=>a+b,0),shown=BUCKETS.map((b,i)=>({key:b[0],label:label(b,ko),n:buckets[i]})).filter(b=>b.n);
 return `<div class="day-bar type-bar" role="img" aria-label="${esc((ko?'역별 도착 기록의 지연 시간 분포: ':'Share of stops by delay: ')+shown.map(b=>`${part(b.n/total,ko)} ${ko?b.label:b.label.toLowerCase()}`).join(', '))}.">${shown.map(b=>`<i class="seg" style="flex:${b.n};background:var(--${b.key})" ${tipText(b.label,ko?`도착 기록 ${num(b.n)}건`:`${num(b.n)} stops`)}></i>`).join('')}</div>`;
}
// One bar per train type, each drawn like the one above so the types compare by eye. The ITX lines are one type, as on every other page.
function byType(w,ko){
 if(!w.types.length)return '';
 const rows=[{type:'',trains:w.trains,stops:w.stops,buckets:w.buckets},...w.types],name=r=>r.type?ko?localizeTrain({type:r.type}).type:r.type:ko?'전체 열차':'All trains';
 const body=rows.map((r,i)=>`<div class="type-row${i?'':' all'}"><span class="type-name">${esc(name(r))}<span class="meta">${ko?`열차 ${num(r.trains)}편`:`${num(r.trains)} trains`}</span></span>${typeBar(r.buckets,ko)}<span class="type-share">${pct0(share(r.buckets[0],r.stops))}</span></div>`).join('');
 const legend=BUCKETS.map(b=>`<span><i class="swatch" style="background:var(--${b[0]})"></i>${label(b,ko)}</span>`).join('');
 return `<div class="chart-card"><div class="block-title"><h2>${ko?'열차 종류별':'By train type'}</h2><span class="meta">${ko?'오른쪽 수치는 5분 이내 도착 비율':'% = share of stops within 5 min'}</span></div><div class="type-rows">${body}</div><div class="day-bar-legend" aria-hidden="true">${legend}</div>`
  +hiddenTable(ko?'열차 종류별 도착 기록':'Stops by train type',ko?['열차 종류','열차','도착 기록','5분 이내 도착 비율']:['Train type','Trains','Stops','Within 5 min'],rows.map(r=>[name(r),num(r.trains),num(r.stops),pct0(share(r.buckets[0],r.stops))]))+'</div>';
}
// The picker for one train type's grid. It stays hidden until stats-page.js loads, because the other grids come from data/stats.json.
function heat(w,ko){
 if(!w.hours.some(row=>row.some(Boolean)))return '';
 const pick=w.types.length>1?`<div class="type-switch heat-types" role="group" aria-label="${ko?'열차 종류':'Train type'}" hidden><button type="button" data-type="" aria-pressed="true">${ko?'전체 열차':'All trains'}</button>${w.types.map(t=>`<button type="button" data-type="${esc(t.type)}" aria-pressed="false">${esc(ko?localizeTrain({type:t.type}).type:t.type)}</button>`).join('')}</div>`:'';
 return `<div class="chart-card heat-card"><div class="block-title"><h2>${ko?'요일과 출발 시각별 지연':'When delays happen'}</h2><span class="meta">${ko?'열차가 출발한 시각 기준':'By the hour the train departs'}</span></div>${pick}<div class="heat-body">${heatBody(w.hours,w.share_punctual,ko)}</div></div>`;
}
// Where trains lose time: each stretch of track between two consecutive stops, drawn on a map and coloured by how much the delay changed along it, per train, both directions together.
// Keep one copy of the geometry. Changing the selected range picks that range's color and stroke width.
const MAP_HEIGHT=560,LON_SCALE=Math.cos(36.3*Math.PI/180);
const [WEST,EAST,SOUTH,NORTH]=[Math.min(...KOREA.map(p=>p[0])),Math.max(...KOREA.map(p=>p[0])),Math.min(...KOREA.map(p=>p[1])),Math.max(...KOREA.map(p=>p[1]))];
const MAP_SCALE=MAP_HEIGHT/(NORTH-SOUTH),MAP_WIDTH=Math.round((EAST-WEST)*LON_SCALE*MAP_SCALE);
const project=(lon,lat)=>`${((lon-WEST)*LON_SCALE*MAP_SCALE).toFixed(1)} ${((NORTH-lat)*MAP_SCALE).toFixed(1)}`,outline=points=>points.map(p=>project(...p)).join('L');
// A stretch needs this many trains to count: three a day, between 5 and 30, so one train's bad day does not make a stretch look slow.
const minTrains=days=>Math.min(30,Math.max(5,3*days));
const signed=(v,ko)=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(1)}${ko?'분':' min'}`;
function renderRoute(windows,stations,locale,first){
 const ko=locale==='ko',known=new Map(stations.map(s=>[s.id,s])),frames=FRAMES.map(([key])=>key).filter(key=>windows[key]?.stops&&windows[key].segments?.length);
 if(!frames.length)return '';
 const name=id=>known.get(id)?(ko&&known.get(id).name_ko||known.get(id).name):id;
 const located=id=>known.get(id)?.latitude!=null&&known.get(id).longitude!=null;
 const stretches=new Map(),perFrame={};
 for(const key of frames){
  const {days,segments}=windows[key];
  const need=minTrains(days),items=[];
  for(const [x,y,runs,change] of segments){
   if(!runs)continue;
   const [a,b]=x<y?[x,y]:[y,x];
   const id=`${a}|${b}`,item={a,b,runs,mean:change/runs,ok:runs>=need};items.push(item);
   if(!located(a)||!located(b))continue;
   if(!stretches.has(id))stretches.set(id,{a,b,by:{}});stretches.get(id).by[key]=item;
  }
  const spread=items.filter(i=>i.ok).map(i=>Math.abs(i.mean)).sort((p,q)=>p-q);
  perFrame[key]={items,need,scale:Math.max(.5,spread[Math.floor(spread.length*.95)]||0)};
 }
 const colour=(item,scale)=>{if(!item?.ok)return 'var(--line)';if(!item.mean)return 'var(--faint)';const t=Math.min(1,Math.abs(item.mean)/scale),strength=Math.round(20+80*t);
  return `color-mix(in srgb,var(--${item.mean>0?'d3':'ontime'}) ${strength}%,var(--faint))`;};
 const paths=[...stretches.values()].sort((p,q)=>Math.abs(p.by[first]?.mean||0)-Math.abs(q.by[first]?.mean||0)).map(({a,b,by})=>{
  const from=known.get(a),to=known.get(b);
  const line=[[from.longitude,from.latitude],...trackPoints(from,to),[to.longitude,to.latitude]];
  const styles=frames.map(key=>`--${key}:${colour(by[key],perFrame[key].scale)};--${key}-width:${by[key]?.ok?2.6:1.4}`).join(';');
  return `<path class="seg" style="${styles}" d="M${outline(line)}"/>`;
 }).join('');
 const row=item=>`<li><span class="route-name">${esc(name(item.a))} – ${esc(name(item.b))}</span><span class="route-val ${item.mean>0?'loss':'gain'}">${signed(item.mean,ko)}</span><span class="meta route-n">${ko?`열차 ${num(item.runs)}편`:`${num(item.runs)} trains`}</span></li>`;
 const lists=frames.map(key=>{
  const {items,need,scale}=perFrame[key],ok=items.filter(i=>i.ok),lose=ok.filter(i=>i.mean>0).sort((p,q)=>q.mean-p.mean).slice(0,8),gain=ok.filter(i=>i.mean<0).sort((p,q)=>p.mean-q.mean).slice(0,5);
  return `<div class="route-frame" data-frame="${key}"${key===first?'':' hidden'}><h3>${ko?'지연이 가장 많이 늘어나는 구간':'Most delay added'}</h3>${lose.length?`<ol class="route-list">${lose.map(row).join('')}</ol>`:`<p class="meta">${ko?'해당하는 구간이 없습니다.':'No stretch qualifies.'}</p>`}`
   +`<h3>${ko?'지연이 가장 많이 줄어드는 구간':'Most delay made up'}</h3>${gain.length?`<ol class="route-list">${gain.map(row).join('')}</ol>`:`<p class="meta">${ko?'해당하는 구간이 없습니다.':'No stretch qualifies.'}</p>`}`
   +`<p class="meta route-note">${ko?`두 역 사이에서 열차 한 편당 지연이 평균 몇 분 늘거나 줄었는지, 양방향을 합쳐 보여 줍니다. 가장 진한 색은 ${signed(scale,ko).replace('+','±')}입니다. 열차가 ${num(need)}편 미만인 구간은 회색입니다.`:`Average change in delay per train between two stops, both directions together. The strongest color is ${signed(scale,ko).replace('+','±')}. Stretches with fewer than ${num(need)} trains are grey.`}</p></div>`;
 }).join('');
 const map=paths?`<div class="route-map"><svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="${ko?'구간별 지연 변화를 색으로 나타낸 한국 지도':'Map of South Korea with each stretch of track coloured by how much the delay changed along it'}"><path class="map-land" d="M${outline(KOREA)}Z"/>${paths}</svg><p class="map-source">${trackCredit(locale)}</p><div class="heat-key" aria-hidden="true"><span>${ko?'지연 줄어듦':'Makes up time'}</span><i class="heat-ramp"></i><span>${ko?'지연 늘어남':'Loses time'}</span></div></div>`:'';
 const content=map?`<div class="route-grid">${map}<div>${lists}</div></div>`:lists;
 return `<div class="chart-card route-card" data-view="${first}"${frames.includes(first)?'':' hidden'}><div class="block-title"><h2>${ko?'열차는 어디에서 지연이 늘어날까':'Where trains lose time'}</h2><span class="meta">${ko?'정차역 사이의 지연 변화':'Change in delay between stops'}</span></div>${content}</div>`;
}
function frame(key,w,ko,hidden){
 const L=localeUtils(ko?'ko':'en');
 const named=L.span(w.from,w.to,w.days,key==='week'?7:key==='month'?30:0);
 const lead=`<div class="train-intro stats-lead"><p class="meta">${metaLine(named,ko?`열차 ${num(w.trains)}편 · 도착 기록 ${num(w.stops)}건`:`${num(w.trains)} trains with ${num(w.stops)} stops`)}</p>`
  +`<p class="meta train-stats">${stat(pct0(w.share_punctual),ko?'5분 이내 도착 비율':'stops within 5 min')}${stat(w.typical_late_delay==null?'—':L.delay(w.typical_late_delay),ko?'5분 넘게 늦은 도착의 지연 시간 중앙값':'typical delay when late')}</p></div>`;
 return `<section class="stats-frame" data-frame="${key}"${hidden?' hidden':''}>${lead}<div class="day-cards">${delayDistribution(w.buckets,ko?'ko':'en')}${byType(w,ko)}${heat(w,ko)}</div></section>`;
}
export function renderStats(stats,locale='en',stations=[]){
 const ko=locale==='ko',L=localeUtils(locale),windows=stats?.windows||{},frames=FRAMES.filter(([key])=>windows[key]?.stops),first=defaultFrame(windows);
 if(!frames.length)return `<div class="empty"><h2>${ko?'집계할 수 있는 도착 기록이 없습니다.':'No reported delays to show.'}</h2></div>`;
 const label=([key,en,kr])=>key==='yesterday'&&!isYesterdayInKorea(windows[key].to)?(ko?'가장 최근 날짜':'Latest day'):(ko?kr:en);
 const switcher=`<div class="range-switch" id="stats-range" role="group" aria-label="${ko?'기간':'Time frame'}" hidden>${frames.map(f=>`<button type="button" data-frame="${f[0]}" aria-pressed="${f[0]===first}">${label(f)}</button>`).join('')}</div>`;
 const head=`<div class="train-intro train-head stats-head"><div class="train-lead">${L.backBtn}<div><h1>${ko?'통계':'Stats'}</h1></div></div>${switcher}</div>`;
 return head+frames.map(([key])=>frame(key,windows[key],ko,key!==first)).join('')+renderRoute(windows,stations,locale,first);
}
