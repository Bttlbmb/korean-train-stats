// The all-trains page (js/trains.js), a station page (js/station.js), and the all-stations page (js/stations.js) arrive built with every row in their table. This shows the controls and makes the table filterable and sortable.
// Station pages have a To select (labeled Final destination) and train-number search; all-stations pages have a station-name search; a journey page has departure-hour and arrival-hour selects, and the bars of its hour chart pick the departure hour. Each control allows it to be missing.
// A row's data-type can list several types (a station is served by more than one).
// URL keys: types/from/calls/to/sort plus number for train tables, dep/arr (a departure or arrival hour, 0-23) for a journey page, or q for the station directory. Controls may be absent on a shared consumer.
// replaceState avoids a history entry per edit; a shared URL or Back from a train restores the current choices, including language switches.
import {stationSearchKey,trainNumberKey} from './utils.js';
const ko=document.documentElement.lang==='ko';
const form=document.querySelector('#trains-filters');
if(form){
 const $=s=>document.querySelector(s),status=$('#trains-status'),count=$('#trains-count'),reset=$('#trains-reset'),none=$('#trains-empty'),body=$('#trains-rows'),
  from=$('#trains-from'),to=$('#trains-to'),calls=$('#trains-calls'),q=$('#stations-q'),number=$('#trains-number'),depHour=$('#trains-dep'),arrHour=$('#trains-arr'),bars=[...document.querySelectorAll('.hour-col[data-hour]')],sortSelect=$('#trains-sort'),heads=[...document.querySelectorAll('.trains-table th[data-key]')],boxes=[...form.querySelectorAll('input[type=checkbox]')],
  journey=$('#trains-journey'),journeys=new Map([...(to?.options||[])].map(o=>[o.value,o.dataset.journey])),rows=[...body.children],format=n=>n.toLocaleString(ko?'ko-KR':'en'),stationLabels=new Map([from,to,calls].flatMap(select=>[...(select?.options||[])]).map(o=>[o.value,o.textContent])),value=select=>select?.value||'',hourOf=minutes=>Math.floor(minutes%1440/60);
 rows.forEach((row,i)=>row._i=i);
 let key='',dir='ascending',all=false;
 // A table whose body sets data-cap shows that many trains until the reader asks for all of them. The other rows stay in the page, and filters and sorting work on every row.
 const cap=+body.dataset.cap||0,more=cap?document.createElement('button'):null;
 if(more){more.type='button';more.className='trains-more';more.hidden=true;more.setAttribute('aria-controls','trains-rows');body.closest('table').after(more);
  more.addEventListener('click',()=>{all=true;limit();rows.filter(r=>!r.hidden)[cap]?.querySelector('a')?.focus();});}
 function limit(){
  if(!cap)return;
  let seen=0;for(const row of rows)row.classList.toggle('over',!all&&!row.hidden&&++seen>cap);
  const n=rows.filter(r=>!r.hidden).length;more.hidden=all||n<=cap;more.textContent=(body.dataset.more||(ko?'전체 {n}편 보기':'Show all {n} trains')).replace('{n}',format(n));
 }
 // A station with one train type has no type boxes, and every row stays.
 const ticked=()=>boxes.length?new Set(boxes.filter(b=>b.checked).map(b=>b.value)):{has:()=>true};
 const typed=(on,row)=>row.dataset.type.split(' ').some(type=>on.has(type)),words=()=>q?stationSearchKey(q.value):'';
 // A row's data-from and data-to hold one station name, or several joined by | (a station page's Going to: every station the train calls at later).
 const names=(row,key)=>row.dataset[key].split('|');
 // Station options depend on the ticked types and the other station menus, not a partially entered train number.
 // Apply number matching afterward so typing a number does not silently clear the station choices.
 const menus={from,to,calls},stationKeys=['from','to','calls'];
 const matches=(row,skip='')=>stationKeys.every(k=>k===skip||!value(menus[k])||names(row,k).includes(value(menus[k])));
 function fill(own){
  const select=menus[own];if(!select)return;
  const on=ticked(),found=new Set();
  for(const row of rows)if(typed(on,row)&&matches(row,own))for(const name of names(row,own))found.add(name);
  const current=select.value;
  select.replaceChildren(new Option(select.options[0].textContent,''),...[...found].sort((a,b)=>ko?(stationLabels.get(a)||a).localeCompare(stationLabels.get(b)||b,'ko'):(stationLabels.get(a)||a).localeCompare(stationLabels.get(b)||b)).map(s=>new Option(stationLabels.get(s)||s,s)));
  select.value=found.has(current)?current:'';
 }
 // A menu that loses its choice can widen the others, so the pass runs twice.
 const options=()=>{for(let pass=0;pass<2;pass++)for(const k of stationKeys)fill(k);};
 function apply(){
  const on=ticked(),word=words(),train=number?trainNumberKey(number.value):'';let n=0;
  for(const row of rows){const ok=typed(on,row)&&matches(row)&&(!word||row.dataset.search.includes(word))&&(!train||trainNumberKey(row.dataset.num)===train)&&(!value(depHour)||hourOf(row.dataset.dep)===+value(depHour))&&(!value(arrHour)||hourOf(row.dataset.arr)===+value(arrHour));row.hidden=!ok;if(ok)n++;}
  count.textContent=(count.dataset.text||(ko?'전체 {total}편 중 {n}편':'{n} of {total} trains')).replace('{n}',format(n)).replace('{total}',format(rows.length));none.hidden=n>0;limit();
  // A station page links to the journey page from the station to the one chosen, when there is one.
  if(journey){const page=journeys.get(value(to));journey.hidden=!page;if(page){journey.href=page;journey.textContent=journey.dataset.text.replace('{to}',stationLabels.get(value(to)));}}
 }
 // Trains without a share (a dash) always come last.
 function sort(){
  const sign=dir==='ascending'?1:-1;
  rows.sort((x,y)=>{
   if(!key)return x._i-y._i;
   const a=x.dataset[key],b=y.dataset[key];
   if(key==='share'){if(a===''||b==='')return (a===''?1:0)-(b===''?1:0)||x._i-y._i;return sign*(a-b)||x._i-y._i;}
   if(key==='route')return sign*(ko?a.localeCompare(b,'ko'):a.localeCompare(b))||x._i-y._i;
   return sign*(a-b)||x._i-y._i;
  });
  body.append(...rows);limit();
  heads.forEach(h=>h.dataset.key===key?h.setAttribute('aria-sort',dir):h.removeAttribute('aria-sort'));
  sortSelect.value=key?`${key}:${dir}`:'';
 }
 // Show Reset and mark a chosen station whenever the table differs from its first state, and keep the address in step.
 function sync(){
  const unticked=boxes.some(b=>!b.checked);
  reset.hidden=!(unticked||value(from)||value(to)||value(calls)||words()||number?.value.trim()||value(depHour)||value(arrHour)||key);
  from?.classList.toggle('on',!!value(from));to?.classList.toggle('on',!!value(to));calls?.classList.toggle('on',!!value(calls));q?.classList.toggle('on',!!words());
  number?.classList.toggle('on',!!number.value.trim());depHour?.classList.toggle('on',!!value(depHour));arrHour?.classList.toggle('on',!!value(arrHour));
  bars.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.hour===value(depHour))));
  const query=new URLSearchParams();
  if(unticked)query.set('types',boxes.filter(b=>b.checked).map(b=>b.value).join(','));
  if(value(from))query.set('from',value(from));
  if(value(to))query.set('to',value(to));
  if(value(calls))query.set('calls',value(calls));
  if(words())query.set('q',q.value.trim());
  if(number?.value.trim())query.set('number',number.value.trim());
  if(value(depHour))query.set('dep',value(depHour));
  if(value(arrHour))query.set('arr',value(arrHour));
  if(key)query.set('sort',`${key}_${dir==='ascending'?'asc':'desc'}`);
  const text=query.toString().replace(/%2C/g,',');
  history.replaceState(history.state,'',location.pathname+(text?`?${text}`:'')+location.hash);
  const languageSwitch=document.querySelector('.language-switch');
  if(languageSwitch){const address=new URL(languageSwitch.href);address.search=location.search;languageSwitch.href=address.href;}
 }
 // A bar of the journey page's hour chart picks its departure hour, and picking it again clears it. The table is below the chart, so bring it into view when it is off screen.
 bars.forEach(b=>b.addEventListener('click',()=>{
  if(!depHour)return;
  depHour.value=depHour.value===b.dataset.hour?'':b.dataset.hour;
  options();apply();sync();
  const top=count.getBoundingClientRect().top;
  if(depHour.value&&(top<0||top>innerHeight-80))count.scrollIntoView({block:'center',behavior:'smooth'});
 }));
 form.addEventListener('submit',event=>event.preventDefault());
 form.addEventListener('input',event=>{
  if(event.target===sortSelect){[key,dir]=sortSelect.value?sortSelect.value.split(':'):['','ascending'];sort();}
  else{options();apply();}
  sync();
 });
 heads.forEach(h=>h.querySelector('button').addEventListener('click',()=>{
  const k=h.dataset.key;
  if(key===k)dir=dir==='ascending'?'descending':'ascending';else{key=k;dir=h.dataset.first||(k==='share'?'descending':'ascending');}
  sort();sync();
 }));
 reset.addEventListener('click',()=>{
  boxes.forEach(b=>b.checked=true);if(from)from.value='';if(to)to.value='';if(calls)calls.value='';if(q)q.value='';if(number)number.value='';if(depHour)depHour.value='';if(arrHour)arrHour.value='';key='';all=false;dir='ascending';
  options();apply();sort();sync();
 });
 // Restore the choices in the address; an unknown value is ignored.
 const query=new URLSearchParams(location.search),wanted=query.get('types')?.split(',').filter(t=>boxes.some(b=>b.value===t));
 if(wanted?.length||query.get('types')==='')boxes.forEach(b=>b.checked=wanted.includes(b.value));
 if(from)from.value=query.get('from')||'';if(to)to.value=query.get('to')||'';if(calls)calls.value=query.get('calls')||'';if(q)q.value=query.get('q')||'';
 if(number)number.value=query.get('number')||'';
 // An hour that is not an option leaves the select empty.
 if(depHour)depHour.value=query.get('dep')||'';if(arrHour)arrHour.value=query.get('arr')||'';
 const [k,d]=(query.get('sort')||'').split('_');
 if(heads.some(h=>h.dataset.key===k)&&(d==='asc'||d==='desc')){key=k;dir=d==='asc'?'ascending':'descending';}
 options();
 // Unsupported station values are cleared; valid type, number, and name filters still apply.
 apply();sort();sync();
 form.hidden=false;status.hidden=false;
}
