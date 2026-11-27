import {RAIL} from './rail.js';

// Geometry uses the stable station IDs. Page links use the readable address.
export function trackPoints(from,to){
 const a=from.legacyId??from.id,b=to.legacyId??to.id;
 const forward=a<b,points=RAIL[forward?`${a}|${b}`:`${b}|${a}`]??[];
 return forward?points:[...points].reverse();
}

export const trackCredit=locale=>`<a href="https://www.openstreetmap.org/copyright" class="map-credit"${locale==='ko'?' aria-label="철도 선형 © OpenStreetMap 기여자"':''}>© OpenStreetMap</a>`;
