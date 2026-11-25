#!/usr/bin/env node
// Check the built bilingual site, its links, and reconstructed calendar-month figures.
// Usage: node scripts/check_locales.mjs [output-folder] (default: _site)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {monthFigures,renderMonth,pageInfo as monthInfo} from '../js/month.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'_site')),SITE='https://koreantrainstats.com/';
const problems=[],fail=(where,why)=>problems.push(`${where}: ${why}`);
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,s=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[s.slice(1,-1).toLowerCase()]??String.fromCodePoint(parseInt(s.slice(s[2]?.toLowerCase()==='x'?3:2,-1),s[2]?.toLowerCase()==='x'?16:10))));
// The build writes quoted attributes. Ignore '<1%' text when reading its markup.
const tags=html=>[...html.matchAll(/<([a-z][\w:-]*)(?=\s|\/?>)([^>]*?)>/gi)].map(m=>({tag:m[1].toLowerCase(),a:Object.fromEntries([...m[2].matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(a=>[a[1],decode(a[2]??a[3])]))}));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const built=new Map(files(out).filter(f=>f.endsWith('.html')).map(f=>[path.relative(out,f).split(path.sep).join('/'),fs.readFileSync(f,'utf8')]));
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
const address=file=>SITE+(file.endsWith('index.html')?file.slice(0,-10):file);
const local=url=>{const p=decodeURIComponent(new URL(url).pathname).slice(1);return p+(p===''||p.endsWith('/')?'index.html':'');};
const exists=file=>fs.existsSync(path.join(out,file));
const ids=file=>new Set([...built.get(file).matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
const hasClass=(a,name)=>(a.class||'').split(/\s+/).includes(name);
const canonicalURLs=new Set();let pages=0,links=0,resources=0,alternates=0,pairs=0,moves=0;
for(const [file,html] of built){
 const parsed=tags(html),url=address(file),base=new URL(parsed.find(t=>t.tag==='base')?.a.href||url,url);
 const lang=parsed.find(t=>t.tag==='html')?.a.lang;
 const canonical=parsed.filter(t=>t.tag==='link'&&t.a.rel==='canonical').map(t=>new URL(t.a.href,base).href);
 // A pointer page (the old address of a station or journey that took a name) is not indexable itself: its refresh and canonical must name a built page that is not a pointer.
 const refresh=parsed.find(t=>t.tag==='meta'&&(t.a['http-equiv']||'').toLowerCase()==='refresh');
 if(refresh){
  const raw=(refresh.a.content||'').match(/^0;url=(.+)$/)?.[1],to=raw&&new URL(raw,base);
  if(!to||canonical.length!==1||canonical[0]!==to.href)fail(file,'pointer page: refresh and canonical differ');
  else if(to.origin!==new URL(SITE).origin||!built.has(local(to))||/http-equiv="refresh"/i.test(built.get(local(to))))
   fail(file,`pointer page: ${to.href} is missing or is itself a pointer`);
  moves++;
 }
 const noindex=!!refresh||parsed.some(t=>t.tag==='meta'&&t.a.name==='robots'&&/\bnoindex\b/.test(t.a.content||''));
 if(lang!==(file.startsWith('ko/')?'ko':'en'))fail(file,'HTML language does not match the address');
 if(!noindex){pages++;for(const u of canonical)canonicalURLs.add(u);}
 if(!refresh&&!['404.html','app.html'].includes(file.replace(/^ko\//,''))){
  if(canonical.length!==1||canonical[0]!==url)fail(file,'canonical does not name this page');
  const identity=url.slice(SITE.length).replace(/^ko\//,'');
  const expected={en:SITE+identity,ko:SITE+'ko/'+identity,'x-default':SITE+identity};
  const languageLinks=parsed.filter(t=>t.tag==='link'&&t.a.rel==='alternate');
  const found=Object.fromEntries(languageLinks.map(t=>[t.a.hreflang,new URL(t.a.href,base).href]));
  if(languageLinks.length!==3||Object.entries(expected).some(([k,v])=>found[k]!==v))fail(file,'language alternates do not pair equivalent pages');
  alternates+=Object.keys(found).length;
  const switches=parsed.filter(t=>t.tag==='a'&&hasClass(t.a,'language-switch')).map(t=>new URL(t.a.href,base).href);
  if(switches.length!==1||switches[0]!==expected[lang==='ko'?'en':'ko'])fail(file,'language switch does not open equivalent page');
 }
 const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 if(/\b(?:undefined|NaN|null)\b/.test(visible))fail(file,'invalid value in rendered markup');
 for(const {tag,a} of parsed){
  const attr=['script','img','iframe','source'].includes(tag)?'src':['a','link'].includes(tag)?'href':null;
  if(!attr||!a[attr])continue;
  let target;try{target=new URL(a[attr],base);}catch{fail(file,`invalid ${attr}: ${a[attr]}`);continue;}
  if(target.origin!==new URL(SITE).origin)continue;
  const dest=local(target);if(tag==='a')links++;else resources++;
  if(!exists(dest))fail(file,`missing local target ${a[attr]} (resolves to ${dest})`);
  if(tag==='a'&&lang==='ko'&&!hasClass(a,'language-switch')&&!target.pathname.startsWith('/ko/'))fail(file,`Korean navigation leaves /ko/: ${a[attr]}`);
  if(tag==='a'&&target.hash&&built.has(dest)&&!ids(dest).has(decodeURIComponent(target.hash.slice(1))))fail(file,`missing fragment ${a[attr]}`);
 }
 // Compare language-independent chart geometry across each published language pair.
 if(file.startsWith('ko/')&&!noindex){
  const en=built.get(file.slice(3));if(!en){fail(file,'missing English equivalent');continue;}
  pairs++;
  for(const [label,pattern] of [['train dots',/<i class="rail-dot(?: late)?"[^>]*>/g],['delay buckets',/class="seg" style="flex:[^";]+;background:[^"]+/g]]){
   if(JSON.stringify(html.match(pattern)||[])!==JSON.stringify(en.match(pattern)||[]))fail(file,`${label} differ between languages`);
  }
  const headline=markup=>markup.match(/class="meta train-stats">.*?<b>([^<]+)<\/b>/s)?.[1];
  if(headline(html)!==headline(en))fail(file,'headline figure differs between languages');
  const note=markup=>markup.match(/<p class="meta arrival-data-note">[^<]+<\/p>/g)?.length||0;
  if(note(html)!==note(en)||note(html)>1)fail(file,'arrival data notes differ between languages or repeat');
 }
}
const sitemap=fs.readFileSync(path.join(out,'sitemap.xml'),'utf8'),entries=[...sitemap.matchAll(/<url>(.*?)<\/url>/gs)].map(([,body])=>{
 const loc=body.match(/<loc>(.*?)<\/loc>/)?.[1],lastmod=body.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
 return [loc&&decode(loc),lastmod];
});
const listed=entries.map(([url])=>url),urls=new Set(listed),meta=read('data/meta.json');
const yesterday=read('data/windows/yesterday.json'),rolling=read('data/windows/month.json');
const coverage=meta.first_complete_date&&meta.last_complete_date?`${meta.first_complete_date}/${meta.last_complete_date}`:undefined;
const expectedPeriods=[['day',yesterday],['month',rolling]].filter(([kind,w])=>kind==='day'?w.to:!!w.summary.all.stops)
 .map(([kind,w])=>[kind,w.from,w.to,w.summary.all.share_punctual==null?'—':`${(100*w.summary.all.share_punctual).toFixed(1)}%`]);
for(const file of ['index.html','ko/index.html'])try{
 const html=built.get(file);assert(html,'missing front page');
 const dataset=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
 assert.equal(dataset['@type'],'Dataset');assert.equal(dataset.temporalCoverage,coverage);
 assert(!html.includes('<div class="skeleton"></div>'),'front page was not rendered');
 const periods=[...html.matchAll(/<section class="period" data-period="([^"]+)" data-from="([^"]+)" data-to="([^"]+)">.*?<div class="hero">([^<]+)<\/div>/gs)].map(m=>m.slice(1));
 assert.deepEqual(periods,expectedPeriods,'front page periods and percentages');
}catch(error){fail(file,error.message);}
if(urls.size!==listed.length)fail('sitemap','duplicate URL');
for(const u of canonicalURLs)if(!urls.has(u))fail('sitemap',`missing canonical ${u}`);
for(const [u,lastmod] of entries){
 if(!u||!u.startsWith(SITE)){fail('sitemap',`invalid local URL ${u}`);continue;}
 if(!canonicalURLs.has(u))fail('sitemap',`URL has no indexable built page: ${u}`);
 const p=u.slice(SITE.length),other=SITE+(p.startsWith('ko/')?p.slice(3):'ko/'+p);
 if(!urls.has(other))fail('sitemap',`missing language equivalent for ${u}`);
 const month=p.match(/^(?:ko\/)?(\d{4})-(\d\d)\/$/),day=p.match(/^(?:ko\/)?day\/(\d{4}-\d\d-\d\d)\/$/)?.[1];
 const expected=day||(month?new Date(Date.UTC(+month[1],+month[2],0)).toISOString().slice(0,10):meta.last_complete_date??undefined);
 if(lastmod!==expected)fail('sitemap',`${u} has date ${lastmod}, expected ${expected}`);
}

if(exists('data/publication.json')){
 const marker=read('data/publication.json');
 if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(marker.tree)||marker.last_complete_date!==meta.last_complete_date)
  fail('data/publication.json','invalid content tree or date does not match meta.json');
}
const archive=read('data/days.json');
for(const {date} of archive.days)for(const prefix of ['', 'ko/']){
 if(!built.has(`${prefix}day/${date}/index.html`))fail('archive',`missing ${prefix?'Korean':'English'} page for ${date}`);
}
const dayFolder=path.join(out,'data/days');
const dayFiles=fs.existsSync(dayFolder)?fs.readdirSync(dayFolder).filter(f=>f.endsWith('.json')):[];
const documents=new Map(dayFiles.map(f=>[f.slice(0,-5),read(`data/days/${f}`)]));
for(const [date,document] of documents)for(const prefix of ['', 'ko/']){
 if(urls.has(`${SITE}${prefix}day/${date}/`)!==!!document.trains)fail('archive',`${prefix}day/${date}/ has the wrong sitemap eligibility`);
}
const lookup=read('find.json'),knownStations=read('data/stations/index.json').stations;
const retained=JSON.parse(fs.readFileSync(path.join(root,'scripts/station-addresses.json'),'utf8'));
const stationsByName=new Map(knownStations.map(station=>[station.name_ko,station]));
const idsByName=new Map(lookup.stations.map(([id,,name])=>[name,id])),publicIds=new Set(idsByName.values());
if(idsByName.size!==lookup.stations.length||publicIds.size!==lookup.stations.length)fail('find.json','duplicate station search entries');
const reservedAddresses=new Set(Object.values(retained));
for(const [name,id] of idsByName){
 const station=stationsByName.get(name),expected=Object.hasOwn(retained,name)?retained[name]:null;
 if(!station||expected&&id!==expected)fail('station addresses',`${name} lost its retained address ${expected}`);
 for(const prefix of ['', 'ko/']){
  if(!urls.has(`${SITE}${prefix}station/${id}/`))fail('find.json',`missing station page ${prefix}station/${id}/`);
  if(station&&station.id!==id&&!publicIds.has(station.id)&&!reservedAddresses.has(station.id)){
   const pointer=built.get(`${prefix}station/${station.id}/index.html`);
   if(!pointer?.includes(`<link rel="canonical" href="${SITE}${prefix}station/${id}/">`))fail('station addresses',`missing old address ${prefix}station/${station.id}/ for ${name}`);
  }
 }
}
const lookupTrains=new Set();
for(const [number,ids] of Object.entries(lookup.trains))for(const id of ids){
 if(lookupTrains.has(id)||!exists(`data/trains/${id}.json`)||String(read(`data/trains/${id}.json`).number)!==number)
  fail('find.json',`incorrect or duplicate train result ${id} for ${number}`);
 lookupTrains.add(id);
 for(const prefix of ['', 'ko/'])if(!urls.has(`${SITE}${prefix}train/${id}/`))fail('find.json',`missing train page ${prefix}train/${id}/`);
}
for(const file of built.keys()){
 const train=file.match(/^train\/([^/]+)\/index\.html$/),station=file.match(/^station\/([^/]+)\/index\.html$/);
 if(train&&!lookupTrains.has(train[1]))fail('find.json',`train ${train[1]} is absent from the search index`);
 if(station&&urls.has(address(file))&&!publicIds.has(station[1]))fail('find.json',`station ${station[1]} is absent from the search index`);
}
const lexical=(a,b)=>a<b?-1:a>b?1:0;
// Check which archive months should exist independently of the build's month discovery.
const expectedMonths=[...new Set([...documents.keys()].map(iso=>iso.slice(0,7)))].filter(key=>{
 const first=new Date(key+'-01T00:00:00Z');
 for(const day=new Date(first);day.getUTCMonth()===first.getUTCMonth();day.setUTCDate(day.getUTCDate()+1))
  if(!documents.has(day.toISOString().slice(0,10)))return false;
 return true;
}).sort();
const builtMonths=[...built.keys()].flatMap(file=>file.match(/^(\d{4}-\d{2})\/index\.html$/)?.slice(1)||[]).sort();
try{assert.deepEqual(builtMonths,expectedMonths);}catch(e){fail('archive',e.message);}
let months=0;
for(const [file,html] of built){
 const key=file.match(/^ko\/(\d{4}-\d{2})\/index\.html$/)?.[1];if(!key)continue;
 try{
  const f=monthFigures(key,documents);assert(f,'missing complete month');
  const source=[...documents.entries()].filter(([iso])=>iso.startsWith(key+'-')).map(([,d])=>d);
  const buckets=Array.from({length:5},(_,i)=>source.reduce((n,d)=>n+d.buckets[i],0));
  const stops=source.reduce((n,d)=>n+d.stops,0),share=stops?buckets[0]/stops:null;
  const top=source.flatMap(d=>d.most_delayed.map(t=>({...t,date:d.date}))).sort((a,b)=>b.delay-a.delay||lexical(a.date,b.date)||lexical(a.departure,b.departure)||a.number-b.number||lexical(a.type,b.type)).slice(0,10);
  assert.deepEqual(f.buckets,buckets);assert.equal(f.stops,stops);assert.equal(f.share_punctual,share);assert.deepEqual(f.most_delayed,top);
  for(const [language,markup] of [['Korean',html],['English',built.get(key+'/index.html')]]){
   const dataset=JSON.parse(markup.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
   assert.equal(dataset['@type'],'Dataset');
   assert.equal(dataset.temporalCoverage,`${f.days[0].date}/${f.days.at(-1).date}`);
   assert.equal(dataset.license,'https://creativecommons.org/licenses/by/4.0/');
   assert.equal(dataset.inLanguage,language==='Korean'?'ko':'en');
   const segments=[...markup.matchAll(/class="seg" style="flex:(\d+)/g)].map(m=>+m[1]);
   assert.deepEqual(segments,buckets.filter(n=>n),`${language} month buckets`);
   const table=[...markup.matchAll(/<tbody>(.*?)<\/tbody>/gs)].at(-1)?.[1]||'';
   // A delay of 60 minutes or more reads "+2 h 59 min" or "+2시간 59분", so read both forms back into minutes.
   const delays=[...table.matchAll(/\+(?:(\d+)(?: h|시간)(?: (\d+)(?: min|분))?|(\d+)(?: min|분))/g)].map(m=>m[3]!=null?+m[3]:+m[1]*60+(+m[2]||0));assert.deepEqual(delays,top.map(t=>t.delay),`${language} largest delays`);
   const dates=[...table.matchAll(/href="[^"]*day\/(\d{4}-\d{2}-\d{2})\//g)].map(m=>m[1]);assert.deepEqual(dates,top.map(t=>t.date),`${language} largest-delay dates`);
   const linked=[...table.matchAll(/href="[^"]*train\/([^/]+)\//g)].map(m=>m[1]);assert.deepEqual(linked,top.filter(t=>exists(`train/${t.id}/index.html`)).map(t=>t.id),`${language} largest-delay train identities`);
   const headline=markup.match(/class="meta train-stats">.*?<b>([^<]+)<\/b>/s)?.[1],expected=share==null?'—':`${share>=1?100:Math.min(99,Math.round(share*100))}%`;
   assert.equal(headline,expected,`${language} month headline`);
  }
  months++;
 }catch(e){fail(key,e.message);}
}

// A missing date differs from a completed date without any countable arrivals.
try{
 const key='2026-01',fixture=new Map(Array.from({length:31},(_,i)=>{
  const date=`${key}-${String(i+1).padStart(2,'0')}`,buckets=i?[0,1,0,0,0]:[99,1,0,0,0],stops=buckets[0]+buckets[1];
  return [date,{date,stops,buckets,share_punctual:buckets[0]/stops,most_delayed:[]}];
 }));
 const f=monthFigures(key,fixture);assert.equal(f.share_punctual,99/130,'month must pool arrivals rather than average daily shares');
 const absent=new Map(fixture);absent.delete(key+'-01');assert.equal(monthFigures(key,absent),null);
 const zero={...fixture.get(key+'-01'),stops:0,buckets:[0,0,0,0,0],share_punctual:null};
 const oneZero=new Map(fixture);oneZero.set(key+'-01',zero);
 const sparse=monthFigures(key,oneZero);
 assert.equal(sparse.days.length,31);assert.equal(sparse.share_punctual,0);
 const allZero=new Map([...fixture].map(([date])=>[date,{...zero,date}])),emptyMonth=monthFigures(key,allZero);
 assert.equal(emptyMonth.share_punctual,null);
 for(const locale of ['en','ko']){
  const sparseHTML=renderMonth(key,sparse,undefined,locale),emptyHTML=renderMonth(key,emptyMonth,undefined,locale);
  assert(!/NaN|undefined|\bnull\b/.test(sparseHTML+emptyHTML));
  assert(sparseHTML.includes('day/2026-01-01/'),'completed days with no reports still have archive pages');
  assert(!renderMonth(key,sparse,undefined,locale,iso=>iso!==key+'-01').includes('day/2026-01-01/'),'the archive only links to an emitted day page');
  assert(sparseHTML.includes(locale==='ko'?'집계할 수 있는 도착 기록 없음':'No reported arrivals'));
  assert(emptyHTML.includes('<b>—</b>'));
  assert(!emptyHTML.includes(locale==='ko'?'가장 높은 날':'best day'));
  assert(monthInfo(key,emptyMonth,locale).description.includes(locale==='ko'?'집계 가능한 도착 기록이 없습니다':'no reported arrivals'));
 }
}catch(e){fail('synthetic month cases',e.message);}
console.log(`${pages} indexable pages, ${pairs} language pairs, ${links} local navigation links, ${resources} local resources and metadata links, ${alternates} alternates, ${moves} pointer pages, ${months} calendar months checked; ${problems.length} problems.`);
for(const p of problems.slice(0,20))console.log('  '+p);
if(problems.length>20)console.log(`  and ${problems.length-20} more`);
process.exit(problems.length?1:0);
