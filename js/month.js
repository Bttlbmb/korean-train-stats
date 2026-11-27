import {esc,pct,pct0,colorDelay,hiddenTable,empty} from './utils.js';
import {localeUtils,localizeTrain,stationName} from './locale.js';
import {delayDistribution} from './day.js';

const lexical=(a,b)=>a<b?-1:a>b?1:0;
export function monthFigures(key,documents){
 const [year,month]=key.split('-').map(Number),length=new Date(Date.UTC(year,month,0)).getUTCDate();
 const days=[],buckets=[0,0,0,0,0];
 let best=null,worst=null;
 // A missing date makes the month incomplete. A completed day with no arrivals counts toward coverage.
 for(let n=1;n<=length;n++){
  const day=documents.get(`${key}-${String(n).padStart(2,'0')}`);if(!day)return null;
  days.push(day);day.buckets.forEach((count,i)=>buckets[i]+=count);
  if(day.stops&&day.share_punctual!=null){
   if(!best||day.share_punctual>best.share_punctual)best=day;
   if(!worst||day.share_punctual<worst.share_punctual)worst=day;
  }
 }
 const stops=buckets.reduce((a,b)=>a+b,0);
 // Ten entries per date suffice for the monthly top ten. Ties follow the day export's order.
 const most_delayed=days.flatMap(day=>day.most_delayed.map(t=>({...t,date:day.date})))
  .sort((a,b)=>b.delay-a.delay||lexical(a.date,b.date)||lexical(a.departure??'',b.departure??'')||a.number-b.number||lexical(a.type,b.type)).slice(0,10);
 return {days,buckets,stops,share_punctual:stops?buckets[0]/stops:null,most_delayed,best,worst};
}
const monthNames=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const englishDays=new Intl.DateTimeFormat('en-GB',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const englishDay=iso=>englishDays.format(new Date(iso+'T12:00:00Z')).replace(',','').replace('Sept','Sep');
const monthName=(key,ko)=>ko?`${+key.slice(0,4)}년 ${+key.slice(5)}월`:monthNames.format(new Date(key+'-01T12:00:00Z'));
const noReports=ko=>ko?'집계할 수 있는 도착 기록이 없습니다.':'No reported arrivals for this month.';
export function pageInfo(key,figures,locale='en'){
 if(!figures)return null;
 const ko=locale==='ko',name=monthName(key,ko),{date,num}=localeUtils(locale),{share_punctual:share,stops,best,worst}=figures;
 const title=ko?`${name} 열차 ${stops?'도착 지연 통계':'도착 기록'} · Korean Train Stats`:`${name}: Korail train punctuality · Korean Train Stats`;
 let description=noReports(ko);
 if(stops){
  const short=ko?date:englishDay;
  const extreme=day=>`${short(day.date)} (${pct0(day.share_punctual)})`;
  description=ko?`${name}: 도착 기록 ${num(stops)}건 중 ${pct0(share)}가 5분 이내에 도착했습니다.`:`${name}: ${pct0(share)} of train stops were within 5 min of schedule.`;
  if(best&&worst&&best!==worst)description+=ko?` 가장 높았던 날 ${extreme(best)}, 가장 낮았던 날 ${extreme(worst)}.`:` Best day ${extreme(best)}, worst ${extreme(worst)}.`;
  if(!ko)description+=' See the biggest delays.';
 }else description=ko?`${name}의 수집은 완료되었으나 집계 가능한 도착 기록이 없습니다.`:`${name}: no reported arrivals in the completed archive.`;
 return {title,description,crumbs:[{name}]};
}
export function renderMonth(key,f,hasTrain=()=>true,locale='en',hasDay=()=>true){
 const ko=locale==='ko',L=localeUtils(locale),{date,delay,num,backBtn,shareLegend}=L,t=(en,kr)=>ko?kr:en;
 if(!f)return empty(noReports(ko));
 const prefix=ko?'ko/':'',short=ko?date:englishDay,name=monthName(key,ko);
 const dateLabel=(day)=>`<b>${short(day.date)}</b> (${pct0(day.share_punctual)})`;
 const extremes=f.best?` · ${t('best day','가장 높은 날')} ${dateLabel(f.best)} · ${t('worst day','가장 낮은 날')} ${dateLabel(f.worst)}`:'';
 const share=`<b>${pct0(f.share_punctual)}</b>`,headline=ko?`5분 이내 도착 비율 ${share}`:`${share} of stops within 5 min`;
 const coverage=ko?`수집 완료 ${f.days.length}일 · 역별 도착 기록 ${num(f.stops)}건`:`${f.days.length} days with ${num(f.stops)} stops`;
 const head=`<div class="train-intro train-head"><div class="train-lead">${backBtn}<div><h1>${name}</h1><p class="meta">${coverage}</p><p class="meta train-stats">${headline}${extremes}</p></div></div></div>`;
 const bars=f.days.map(day=>{
  const iso=day.date,part=day.share_punctual;
  const noReports=!day.stops||part==null;
  const tip=esc(noReports?`${date(iso)} · ${t('No reported arrivals','집계할 수 있는 도착 기록 없음')}`:ko?`${date(iso)} · 5분 이내 도착 비율 ${pct(part)}`:`${short(iso)}: ${pct(part)} within 5 min`);
  const bar=noReports?'<i class="uncollected" style="height:6px"></i>':`<i style="height:${Math.max(.5,part*100).toFixed(1)}%"></i>`;
  return hasDay(iso)?`<a class="col link" href="${prefix}day/${iso}/" aria-label="${tip}" title="${tip}">${bar}</a>`:`<span class="col" title="${tip}">${bar}</span>`;
 }).join('');
 const dailyTitle=t('Day by day','날짜별 5분 이내 도착 비율'),measure=t('Share of stops within 5 min','날짜별 5분 이내 도착 비율');
 const daily=`<div class="chart-card"><div class="block-title"><h2>${dailyTitle}</h2></div><div class="bars-wrap"><span class="axis-label" style="bottom:100%">100%</span><span class="axis-label" style="bottom:50%">50%</span><span class="axis-label" style="bottom:0">0%</span><div class="bars fill" role="group" aria-label="${measure}">${bars}</div></div><div class="bar-dates"><span class="meta">${date(f.days[0].date)}</span><span class="meta">${date(f.days.at(-1).date)}</span></div>${shareLegend('bar-legend',ko)}${hiddenTable(t('Daily punctuality',measure),[t('Date','날짜'),t('Within 5 min','5분 이내 도착 비율')],f.days.map(d=>[ko?date(d.date,true):d.date,pct(d.share_punctual)]))}</div>`;
 const rows=f.most_delayed.map(raw=>{
  const train=ko?localizeTrain(raw):raw,label=`${esc(train.type)} ${train.number}`,route=`${esc(train.origin)} → ${esc(train.destination)}`,where=esc(ko?train.station_ko||stationName(train.station):train.station);
  const service=hasTrain(train.id)?`<a href="${prefix}train/${encodeURIComponent(train.id)}/">${label}</a>`:label;
  const when=hasDay(train.date)?`<a href="${prefix}day/${train.date}/">${short(train.date)}</a>`:short(train.date);
  return `<tr><td>${service}<span class="row-sub"><span><span>${route}</span> <span class="at">${ko?where:'at '+where}</span></span></span></td><td class="narrow-hide">${route}</td><td class="nw">${when}</td><td class="narrow-hide">${where}</td><td class="r"><span class="delay-chip"><i style="background:${colorDelay(train.delay)}"></i>${delay(train.delay)}</span></td></tr>`;
 }).join('');
 const biggest=`<div class="chart-card"><div class="block-title"><h2>${t('Biggest delays','지연 기록 상위 10건')}</h2><span class="meta">${t('Longest delay at any stop','각 운행일의 열차별 최대 도착 지연')}</span></div>${rows?`<table class="day-table day-rows"><thead><tr><th>${t('Train','열차')}</th><th class="narrow-hide">${t('Route','운행 구간')}</th><th>${t('Date','날짜')}</th><th class="narrow-hide">${t('Where','정차역')}</th><th class="r">${t('Delay','지연')}</th></tr></thead><tbody>${rows}</tbody></table>`:`<p class="muted">${t('No stop was more than 5 minutes late.','5분을 초과해 지연된 도착 기록이 없습니다.')}</p>`}</div>`;
 return head+`<div class="day-cards">${daily}${f.stops?delayDistribution(f.buckets,locale)+biggest:empty(noReports(ko))}</div>`;
}
