import {esc,pct,date,range,hiddenTable,empty,shareLegend,minutes} from './utils.js';
import {trainDotsHTML} from './dots.js';
import {localeUtils} from './locale.js';
// The front page's markup, from its four data files. It needs no browser, so scripts/build.mjs uses it to build the page and start.js to refresh it.
// The date attributes let start.js name the retained figures after a failed refresh, without fetched metadata or parsing translated text.
const period=(eyebrow,big,sentence,sub,vis,w)=>`<section class="period" data-from="${w.from}" data-to="${w.to}"><div class="p-num"><p class="eyebrow">${eyebrow}</p><div class="hero">${big}</div></div><div class="p-text"><h2>${sentence}</h2><p class="sub">${sub}</p></div><div class="p-vis">${vis}</div></section>`;
// Yesterday in Korea time. "Yesterday" and "past 30 days" are only true when the newest complete day is this date.
const isFresh=to=>to===new Date(Date.now()-864e5).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
function yesterdayRow(w,s,locale){
 const ko=locale==='ko';
 const trains=w.trains||[];
 const sub=s.typical_late_delay!=null?(ko?`5분 넘게 늦은 도착의 지연 시간 중앙값: ${localeUtils('ko').minutes(s.typical_late_delay)}`:`Typical delay when late: ${minutes(s.typical_late_delay)}`):'';
 const day=(opts)=>new Date(w.to+'T12:00:00+09:00').toLocaleDateString(ko?'ko-KR':'en-GB',{...opts,timeZone:'Asia/Seoul'}),short=day({weekday:'short',day:'numeric',month:'short'}),fresh=isFresh(w.to);
 if(ko)return period(fresh?`어제 · ${short}`:short,pct(s.share_punctual),'열차의 역별 도착 기록 중 5분 이내에 도착한 비율입니다.',sub,trains.length?trainDotsHTML(trains,locale):'<p class="muted">이 날짜의 열차 자료가 없습니다.</p>',w);
 return period(fresh?`Yesterday · ${short}`:short,pct(s.share_punctual),'of Korail train stops were within 5 minutes of schedule.',sub,trains.length?trainDotsHTML(trains):'<p class="muted">Train data is not available for this date.</p>',w);
}
function monthRow(w,s,days,locale){
 const ko=locale==='ko',localized=localeUtils(locale);
 const inWindow=days.filter(d=>d.date>=w.from&&d.date<=w.to&&d.share_punctual!=null),byDate=new Map(inWindow.map(d=>[d.date,d])),worst=inWindow.length>1?inWindow.reduce((a,b)=>b.share_punctual<a.share_punctual?b:a):null,best=inWindow.length>1?inWindow.reduce((a,b)=>b.share_punctual>a.share_punctual?b:a):null;
 const dates=[];for(let t=new Date(w.from+'T12:00:00Z');t<=new Date(w.to+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+1))dates.push(t.toISOString().slice(0,10));
 const barItems=dates.map(iso=>({iso,d:byDate.get(iso)}));
 // A day with data is a real link, so crawlers and middle-click reach its page; tabindex -1 keeps the chart one keyboard stop, stepped with the arrow keys.
 const bars=barItems.map(({iso,d},i)=>d?`<a class="col link" href="${ko?'ko/':''}day/${iso}/" tabindex="-1" data-i="${i}"><i style="height:${Math.max(.5,d.share_punctual*100)}%"></i></a>`:`<span class="col" data-i="${i}"><i class="uncollected" style="height:6px"></i></span>`).join('');
 const sub=ko?[s.typical_late_delay!=null?`5분 넘게 늦은 도착의 지연 시간 중앙값: ${localeUtils('ko').minutes(s.typical_late_delay)}`:'',best?`5분 이내 도착 비율이 가장 높은 날: ${localized.date(best.date)} (${pct(best.share_punctual)})`:'',worst?`5분 이내 도착 비율이 가장 낮은 날: ${localized.date(worst.date)} (${pct(worst.share_punctual)})`:''].filter(Boolean).join('<br>'):[s.typical_late_delay!=null?`Typical delay when late: ${minutes(s.typical_late_delay)}`:'',best?`Best day: ${esc(best.weekday)} ${date(best.date)} (${pct(best.share_punctual)})`:'',worst?`Worst day: ${esc(worst.weekday)} ${date(worst.date)} (${pct(worst.share_punctual)})`:''].filter(Boolean).join('<br>');
 if(ko){
  const label=`${localized.range(w.from,w.to)}의 날짜별 5분 이내 도착 비율입니다. 세로축은 0~100%입니다. 방향키로 날짜를 선택하고 Enter 키로 해당 날짜의 페이지를 엽니다.`;
  const vis=`<div class="bars-wrap"><span class="axis-label" style="bottom:100%">100%</span><span class="axis-label" style="bottom:50%">50%</span><span class="axis-label" style="bottom:0">0%</span><div class="bars" tabindex="0" role="img" aria-label="${esc(label)}">${bars}</div></div><div class="bar-dates"><span class="meta">${localized.date(w.from)}</span><span class="meta">${localized.date(w.to)}</span></div>${localized.shareLegend('bar-legend')}<p class="meta dot-read" id="bar-read" aria-live="polite"></p>${hiddenTable('날짜별 5분 이내 도착 비율',['날짜','5분 이내 도착 비율'],inWindow.map(d=>[d.date,pct(d.share_punctual)]))}`;
  const eyebrow=`수집 완료 ${w.days}일 · ${localized.range(w.from,w.to,false)}`;
  return {html:period(eyebrow,pct(s.share_punctual),'열차의 역별 도착 기록 중 5분 이내에 도착한 비율입니다.',sub,vis,w),barItems};
 }
 const vis=`<div class="bars-wrap"><span class="axis-label" style="bottom:100%">100%</span><span class="axis-label" style="bottom:50%">50%</span><span class="axis-label" style="bottom:0">0%</span><div class="bars" tabindex="0" role="img" aria-label="Share of stops within 5 minutes for each day, on a 0 to 100 percent axis, ${esc(range(w.from,w.to))}. Arrow keys step through the days, and Enter opens the selected day’s page.">${bars}</div></div><div class="bar-dates"><span class="meta">${date(w.from)}</span><span class="meta">${date(w.to)}</span></div>${shareLegend('bar-legend')}<p class="meta dot-read" id="bar-read" aria-live="polite"></p>${hiddenTable('Daily punctuality',['Date','Within 5 min'],inWindow.map(d=>[d.date,pct(d.share_punctual)]))}`;
 return {html:period(`${w.days===30?'Last 30 days':`${w.days} days`} from ${date(w.from)} to ${date(w.to)}`,pct(s.share_punctual),'of stops were within 5 minutes of schedule.',sub,vis,w),barItems};
}
// The lookup row under the two periods: one field for a train number or a station name. js/start.js answers it from find.json, which scripts/build.mjs writes.
// A div, not a section, so the last .period stays the last section (styles.css removes its bottom padding).
const findRow=ko=>`<div class="find"><div><h2>${ko?'내 열차는 보통 제시간에 도착할까요?':'Is your train usually on time?'}</h2><p class="sub">${ko?'열차 번호나 역 이름으로 찾아보세요.':'Look up a train by its number or a station by its name.'}</p></div><div><form class="find-form" id="find" role="search" action="${ko?'ko/':''}trains/"><label class="sr-only" for="find-q">${ko?'열차 번호 또는 역 이름':'Train number or station name'}</label><input type="search" id="find-q" name="number" autocomplete="off" spellcheck="false" placeholder="${ko?'열차 번호 또는 역 이름 (예: 237, 대전)':'Train number or station, e.g. 237 or Daejeon'}"><button type="submit">${ko?'검색':'Search'}</button></form><p class="meta find-note" id="find-note" role="status"></p></div></div>`;
// The front page's footer line that links the complete months with a page, newest first (js/start.js keeps it when it refreshes the footer).
export const archiveLine=(keys,locale='en')=>{const ko=locale==='ko',name=k=>new Date(k+'-15T12:00:00Z').toLocaleDateString(ko?'ko-KR':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 return keys.length?`<p class="archive">${ko?'기록 보관':'Archive'}: ${[...keys].sort().reverse().map(k=>`<a href="${ko?'ko/':''}${k}/">${name(k)}</a>`).join(' · ')}</p>`:'';};
// What a search result shows for the front page: the newest day's share and the 30-day share, from the same two windows the page reads. Null without both.
export function frontInfo(y,m,locale='en'){
 const ys=y?.summary?.all,ms=m?.summary?.all;if(!ys?.stops||!ms?.stops)return null;
 const ko=locale==='ko',window=localeUtils(locale).windowPhrase(m.from,m.to);
 const day=new Date(y.to+'T12:00:00+09:00').toLocaleDateString(ko?'ko-KR':'en-GB',ko?{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}:{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Seoul'}).replace(' (','(').replace('Sept','Sep');
 if(ko)return {title:'코레일 KTX 열차 연착·지연 통계 · Korean Train Stats',description:`${day} 코레일 열차 도착 기록의 ${pct(ys.share_punctual)}가 5분 이내에 도착했습니다(${window} ${pct(ms.share_punctual)}). KTX·ITX·무궁화호 연착·지연을 열차, 역, 구간별로 확인하세요.`};
 return {title:'Korean Train Stats: how punctual are KTX and Korail trains?',description:`On ${day}, ${pct(ys.share_punctual)} of train stops were within 5 min of schedule (${pct(ms.share_punctual)} over ${window}). See delays by train, station or route.`};
}
// The page's main content, and one item per bar of the past 30 days for start.js to make interactive.
export function renderFront(meta,days,y,m,locale='en'){
 const ko=locale==='ko',localized=localeUtils(locale);
 const ys=y.summary?.all,ms=m.summary?.all;
 if(ko&&(!ys?.stops||!ms?.stops))return {html:empty('집계할 수 있는 도착 기록이 없습니다.',`<p class="muted">${meta.collecting_date?localized.date(meta.collecting_date,true)+' 자료를 수집하고 있습니다. ':''}집계 가능한 도착 기록이 모이면 통계를 표시합니다.</p>`),barItems:[]};
 if(!ys?.stops||!ms?.stops)return {html:empty('No complete days yet.',`<p class="muted">${meta.collecting_date?date(meta.collecting_date,true)+' is still collecting. ':''}Punctuality figures appear after a day is complete.</p>`),barItems:[]};
 const month=monthRow(m,ms,days,locale);
 if(ko)return {html:'<h1 class="sr-only">한국의 열차는 얼마나 제시간에 도착할까요?</h1>'+yesterdayRow(y,ys,locale)+month.html+findRow(true),barItems:month.barItems};
 return {html:`<h1 class="sr-only">How punctual are South Korea’s trains?</h1>`+yesterdayRow(y,ys)+month.html+findRow(false),barItems:month.barItems};
}
