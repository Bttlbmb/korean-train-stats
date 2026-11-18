import {esc,num,pct,date,getJSON,stationSearchKey,trainNumberKey} from './utils.js';
import {bindTrainDots} from './dots.js';
import {renderFront} from './front.js';
import {localeUtils,configureKoreanStations} from './locale.js';
// The front page arrives with a dated built snapshot. Refresh the figures and date wording, then bind the interactive charts.
const main=document.querySelector('#main'),locale=document.documentElement.lang==='ko'?'ko':'en',ko=locale==='ko',localized=localeUtils(locale);
if(ko)configureKoreanStations(JSON.parse(document.querySelector('#korean-stations')?.textContent||'{}'));
const lateOf=s=>s.late??s.stops-s.punctual;
// refreshed distinguishes bound charts from the built HTML's still-empty train canvas on the first failed request.
let barItems=[],loading=false,refreshed=false;
function bindBars(){
 const bars=document.querySelector('.bars'),read=document.querySelector('#bar-read');if(!bars)return;let active=-1,picked=-1;
 const hint=ko?'막대 하나가 하루입니다. 막대를 선택하면 해당 날짜의 페이지가 열립니다.':'One bar per day. Select to open.';
 const show=()=>{if(active<0){read.textContent=hint;return;}const {iso,d}=barItems[active],day=d?.weekday??new Date(iso+'T12:00:00+09:00').toLocaleDateString('en-GB',{weekday:'short',timeZone:'Asia/Seoul'});
  if(ko){read.innerHTML=d?`<b>${localized.date(iso)}</b> · 5분 이내 도착 비율 ${pct(d.share_punctual)} · 도착 기록 ${num(d.stops)}건 중 ${num(lateOf(d))}건이 5분 초과 지연`:`<b>${localized.date(iso)}</b> · 자료 미수집`;return;}
  read.innerHTML=d?`<b>${esc(day)} ${date(iso)}</b> · ${pct(d.share_punctual)} within 5 min · ${num(lateOf(d))} of ${num(d.stops)} stops late`:`<b>${esc(day)} ${date(iso)}</b> · not collected`;};
 const set=i=>{if(i===active)return;active=i;bars.querySelectorAll('.col').forEach((c,k)=>c.classList.toggle('on',k===i));show();};
 bars.addEventListener('pointerover',e=>{const c=e.target.closest('.col');if(c)set(+c.dataset.i);});
 // A bar with data is a link, so a mouse click follows it; on touch the first tap selects the bar and a second tap on it follows the link.
 const open=i=>{if(barItems[i]?.d)location.href=`${ko?'ko/':''}day/${barItems[i].iso}/`;};
 bars.addEventListener('click',e=>{const c=e.target.closest('.col');if(!c)return;const i=+c.dataset.i;if(!barItems[i].d)return;if(e.pointerType==='touch'&&i!==picked){e.preventDefault();picked=i;set(i);}});
 bars.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')picked=-1;});
 bars.addEventListener('pointerleave',()=>{if(picked<0)set(-1);});
 bars.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();set(Math.max(0,Math.min(barItems.length-1,(active<0?(e.key==='ArrowRight'?-1:barItems.length):active)+(e.key==='ArrowRight'?1:-1))));}else if(e.key==='Enter'&&active>=0)open(active);else if(e.key==='Escape'){picked=-1;set(-1);}});
 bars.addEventListener('blur',()=>{if(picked<0)set(-1);});
 show();
}
async function render(){
 // A retry reuses this path; prevent overlapping requests and duplicate chart bindings.
 if(loading)return;
 loading=true;
 const retrying=document.activeElement?.id==='retry';
 const retry=document.querySelector('#retry');if(retry)retry.disabled=true;
 main.setAttribute('aria-busy','true');
 try{
  // A failure in any file must retain the built figures and footer as one dated snapshot, not show partial new data.
  const [meta,{days},y,m]=await Promise.all([getJSON('meta.json'),getJSON('days.json'),getJSON('windows/yesterday.json'),getJSON('windows/month.json')]);
  const front=renderFront(meta,days,y,m,locale);
  main.innerHTML=front.html;barItems=front.barItems;
  {const footer=document.querySelector('#footer'),archive=footer.querySelector('.archive');footer.innerHTML=localized.footer(meta);if(archive)footer.prepend(archive);}
  if(y.trains?.length)bindTrainDots(y.trains,{height:130,locale});
  bindBars();
  refreshed=true;
  if(retrying)main.focus({preventScroll:true});
 }catch(err){
  // The fallback is the built DOM, not localStorage. Relative labels such as "yesterday" may now be stale.
  const periods=[...main.querySelectorAll('.period')];
  periods.forEach((section,i)=>{
   const {from,to}=section.dataset;
   const eyebrow=section.querySelector('.eyebrow');if(ko||i===0)eyebrow.textContent=i===0?localized.date(to,true):localized.range(from,to);else eyebrow.innerHTML=localized.span(from,to);
   if(!ko)section.querySelector('h2').textContent=i===0?'of Korail train stops were within 5 minutes of schedule.':'of stops were within 5 minutes of schedule.';
  });
  if(!refreshed){
   // The built canvas has no pixels until its train data loads; keep the accessible data table instead.
   const dots=main.querySelector('.dot-field');if(dots)dots.hidden=true;
   const bars=main.querySelector('.bars');
   // The bars are already real links. Without the fetched chart data, expose those links to native keyboard navigation.
   if(bars){bars.removeAttribute('tabindex');bars.setAttribute('role','group');bars.setAttribute('aria-label',ko?'날짜별 도착 비율. 막대를 선택하면 해당 날짜의 페이지가 열립니다.':'Daily punctuality. Select a bar to open its day page.');
    bars.querySelectorAll('a').forEach(link=>{link.tabIndex=0;link.setAttribute('aria-label',localized.date(link.getAttribute('href').split('/').at(-2),true));});}
  }
  main.querySelector('.skeleton')?.remove();
  let notice=main.querySelector('#front-load-error');
  if(!notice){notice=document.createElement('div');notice.id='front-load-error';notice.className='load-notice';notice.innerHTML=`<p role="status"></p><button type="button" id="retry">${ko?'다시 시도':'Try again'}</button>`;main.prepend(notice);}
  const latest=periods[0]?.dataset.to;
  notice.querySelector('p').textContent=latest?(ko?`자료를 새로 불러오지 못했습니다. ${localized.date(latest,true)}까지의 통계를 표시합니다.`:`Couldn’t refresh. Showing figures through ${localized.date(latest,true)}.`):(ko?'자료를 불러오지 못했습니다. 다시 시도해 주세요.':'Couldn’t load the data. Please try again.');
  console.error(err);
 }
 finally{loading=false;main.setAttribute('aria-busy','false');const retry=document.querySelector('#retry');if(retry)retry.disabled=false;}
}
document.addEventListener('click',e=>{if(e.target.closest('#retry'))render();});
// The lookup row. A number opens that train's page; a name opens the station's page when one station matches, and the all-stations page with the name filled in when several do.
// find.json lists the trains and stations that have a page. The listener is on the document because a refresh replaces the form.
let findData;
const loadFind=()=>findData??=fetch(new URL('../find.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('find.json');return r.json();}).catch(()=>{findData=null;return null;});
const home=ko?'ko/':'';
document.addEventListener('focusin',e=>{if(e.target.id==='find-q')loadFind();});
document.addEventListener('input',e=>{if(e.target.id==='find-q')document.querySelector('#find-note').textContent='';});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='find')return;
 e.preventDefault();
 const input=e.target.querySelector('#find-q'),note=document.querySelector('#find-note'),text=input.value.normalize('NFKC').trim();
 if(!text){input.focus();return;}
 const digits=text.match(/\d+/)?.[0],number=digits?trainNumberKey(digits):'',word=stationSearchKey(text),data=await loadFind();
 const miss=message=>{note.textContent=message;input.focus();};
 if(number){
  // Without find.json the all-trains page still answers a number.
  const ids=data?data.trains[number]||[]:null;
  if(ids?.length===1)location.href=`${home}train/${ids[0]}/`;
  else if(!ids||ids.length>1)location.href=`${home}trains/?number=${number}`;
  else miss(ko?`최근 30일 동안 ${number}번 열차의 운행 기록이 없습니다.`:`No train ${number} ran in the past 30 days.`);
  return;
 }
 if(!word){miss(ko?'열차 번호나 역 이름을 입력해 주세요.':'Enter a train number or a station name.');return;}
 const all=`${home}stations/?q=${encodeURIComponent(text)}`;
 if(!data){location.href=all;return;}
 const keys=s=>[stationSearchKey(s[1]),stationSearchKey(s[2])],exact=data.stations.filter(s=>keys(s).includes(word)),found=exact.length?exact:data.stations.filter(s=>keys(s).some(k=>k.includes(word)));
 if(found.length===1)location.href=`${home}station/${found[0][0]}/`;
 else if(found.length)location.href=all;
 else miss(ko?`‘${text}’에 맞는 역이 없습니다.`:`No station matches “${text}”.`);
});
render();
