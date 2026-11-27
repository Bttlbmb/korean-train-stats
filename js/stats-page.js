// The Stats page (js/stats.js) arrives with every time frame built in. This adds the selector, which shows one frame and keeps the choice in the address (?range=week), so a link, Back and a language switch keep it,
// and the train type picker of the weekday-by-hour grid, which redraws the grid from data/stats.json.
import {getJSON} from './utils.js';
const switcher=document.querySelector('#stats-range'),ko=document.documentElement.lang==='ko';
if(switcher){
 const buttons=[...switcher.querySelectorAll('button')],frames=[...document.querySelectorAll('.stats-frame')],route=document.querySelector('.route-card'),routeFrames=[...document.querySelectorAll('.route-frame')],languageSwitch=document.querySelector('.language-switch'),
  initial=buttons.find(b=>b.getAttribute('aria-pressed')==='true').dataset.frame;
 function show(key,remember){
  if(!buttons.some(b=>b.dataset.frame===key))return;
  for(const frame of frames)frame.hidden=frame.dataset.frame!==key;
  if(route){
   route.dataset.view=key;
   for(const frame of routeFrames)frame.hidden=frame.dataset.frame!==key;
   route.hidden=routeFrames.every(frame=>frame.hidden);
  }
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.frame===key));
  if(remember){const url=new URL(location.href);if(key===initial)url.searchParams.delete('range');else url.searchParams.set('range',key);history.replaceState(history.state,'',url);}
  if(languageSwitch){const address=new URL(languageSwitch.href);address.search=location.search;languageSwitch.href=address.href;}
 }
 switcher.hidden=false;
 const range=new URLSearchParams(location.search).get('range');
 show(buttons.some(b=>b.dataset.frame===range)?range:initial,false);
 switcher.addEventListener('click',event=>{const button=event.target.closest('button');if(button)show(button.dataset.frame,true);});
}
// Share the first load across pickers. A failed request can be retried.
let dataRequest;
const getStats=()=>dataRequest??=getJSON('stats.json').catch(error=>{dataRequest=null;throw error;});
for(const picker of document.querySelectorAll('.heat-types')){
 const card=picker.closest('.heat-card'),frame=picker.closest('.stats-frame').dataset.frame,body=card.querySelector('.heat-body');
 const buttons=[...picker.querySelectorAll('button')],original=body.innerHTML;
 let selected=buttons[0],pending=0;
 const select=(button,html)=>{
  body.innerHTML=html;
  selected=button;
  for(const control of buttons)control.setAttribute('aria-pressed',String(control===button));
 };
 picker.hidden=false;
 picker.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  const request=++pending;
  body.querySelector('.heat-error')?.remove();
  if(button===selected||!button.dataset.type){
   if(button!==selected)select(button,original);
   body.removeAttribute('aria-busy');
   return;
  }
  body.setAttribute('aria-busy','true');
  const load=getStats();
  try{
   const [{heatBody},data]=await Promise.all([import('./stats-heat.js'),load]);
   if(request!==pending)return;
   const type=data.windows[frame]?.types.find(t=>t.type===button.dataset.type);
   if(!type?.stops)throw Error('Train type data is absent');
   select(button,heatBody(type.hours,type.buckets[0]/type.stops,ko));
  }catch{
   if(dataRequest===load)dataRequest=null;
   if(request===pending)body.insertAdjacentHTML('afterbegin',`<p class="meta heat-error" role="alert">${ko?'열차 종류별 자료를 불러오지 못했습니다.':'The data for this train type could not be loaded.'}</p>`);
  }finally{
   if(request===pending)body.removeAttribute('aria-busy');
  }
 });
}
