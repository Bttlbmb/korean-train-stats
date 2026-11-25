import {esc,hiddenTable,num,pct0,tipText} from './utils.js';

const WEEKDAYS=[['Mon','월'],['Tue','화'],['Wed','수'],['Thu','목'],['Fri','금'],['Sat','토'],['Sun','일']];
// A weekday-and-hour cell with fewer stops than this is drawn as unknown: the night hours hold a train or two.
const MIN_CELL=100;

// Weekday by hour. A cell is the share of stops more than 5 minutes late for trains that leave in that hour, against the average of the grid: greener where fewer stops were late, warmer where more were.
// The scale runs from the best to the worst cell, so a pattern shows even in a calm window; the legend names those two figures. heatBody also redraws the grid when a train type is picked (stats-page.js).
const clock=h=>`${String(h).padStart(2,'0')}:00`;
export function heatBody(hours,share_punctual,ko){
 const late=cell=>cell&&cell[0]>=MIN_CELL?1-cell[1]/cell[0]:null,rows=hours.map((cells,day)=>({day,cells})).filter(r=>r.cells.some(Boolean));
 const known=rows.flatMap(r=>r.cells.map(late)).filter(v=>v!=null);
 if(!known.length)return `<p class="meta heat-note">${ko?'이 조건에서는 패턴을 보여 줄 만큼 도착 기록이 없습니다.':'Too few stops here to show a pattern.'}</p>`;
 const used=[...Array(24).keys()].filter(h=>rows.some(r=>late(r.cells[h])!=null)),first=used[0],last=used.at(-1),span=Array.from({length:last-first+1},(_,i)=>first+i);
 const low=Math.min(...known),high=Math.max(...known),mid=1-share_punctual;
 // Below the average the cell is green and above it orange; the further from the average, the stronger, up to 80%.
 const color=v=>v>=mid?`color-mix(in srgb,var(--d3) ${Math.round(high>mid?(v-mid)/(high-mid)*80:0)}%,var(--line-soft))`:`color-mix(in srgb,var(--ontime) ${Math.round(low<mid?(mid-v)/(mid-low)*80:0)}%,var(--line-soft))`;
 const day=d=>WEEKDAYS[d][ko?1:0],at=(d,h)=>`${day(d)} ${clock(h)}`;
 let worst,best;for(const r of rows)for(const h of span){const v=late(r.cells[h]);if(v==null)continue;if(!worst||v>worst.v)worst={v,d:r.day,h};if(!best||v<best.v)best={v,d:r.day,h};}
 const cells=rows.map(r=>`<span class="heat-day">${day(r.day)}</span>${span.map(h=>{const v=late(r.cells[h]),c=r.cells[h];
  return v==null?`<i class="heat-cell none"${c?` ${tipText(at(r.day,h),ko?`도착 기록 ${num(c[0])}건으로 적어 표시하지 않음`:`${num(c[0])} stops, too few to show`)}`:''}></i>`
   :`<i class="heat-cell" style="background:${color(v)}" ${tipText(at(r.day,h),ko?`5분 넘게 늦음 ${pct0(v)} · 도착 기록 ${num(c[0])}건`:`${pct0(v)} late · ${num(c[0])} stops`)}></i>`;}).join('')}`).join('');
 const axis=span.map((h,i)=>`<span class="heat-hour${i%2?' alt':''}">${h}</span>`).join('');
 const read=ko?'각 칸은 그 요일, 그 시각에 출발한 열차의 도착 기록 중 5분 넘게 늦은 비율입니다.':'Each cell is the share of stops more than 5 min late, for trains that leave in that hour on that weekday.';
 const peaks=ko?`가장 많이 늦음 <b>${at(worst.d,worst.h)}</b> (${pct0(worst.v)}) · 가장 적게 늦음 <b>${at(best.d,best.h)}</b> (${pct0(best.v)})`:`Most late: <b>${at(worst.d,worst.h)}</b> (${pct0(worst.v)}) · Least late: <b>${at(best.d,best.h)}</b> (${pct0(best.v)})`;
 const table=rows.flatMap(r=>span.filter(h=>late(r.cells[h])!=null).map(h=>[day(r.day),clock(h),pct0(late(r.cells[h])),num(r.cells[h][0])]));
 return `<p class="heat-peaks">${peaks}</p><div class="heat" style="--cols:${span.length}" role="img" aria-label="${esc(read)}"><span></span>${axis}${cells}</div>`
  +`<div class="heat-key" aria-hidden="true"><span>${ko?'지연 적음':'Fewer late'} (${pct0(low)})</span><i class="heat-ramp"></i><span>${ko?'지연 많음':'More late'} (${pct0(high)})</span></div>`
  +`<p class="meta heat-note">${esc(read)} ${ko?`초록은 평균(${pct0(mid)})보다 적게, 주황은 많이 늦었다는 뜻입니다. 도착 기록이 ${MIN_CELL}건 미만인 칸은 빗금으로 표시합니다.`:`Green is below the average (${pct0(mid)}), orange above it. Hatched cells have fewer than ${MIN_CELL} stops.`}</p>`
  +hiddenTable(ko?'요일과 출발 시각별로 5분 넘게 늦은 도착 기록의 비율':'Share of stops more than 5 min late, by weekday and departure hour',ko?['요일','출발 시각','5분 넘게 늦음','도착 기록']:['Weekday','Departure hour','More than 5 min late','Stops'],table);
}
