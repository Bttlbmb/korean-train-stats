#!/usr/bin/env node
// Build both languages from shared renderers and the exported data. No private backend files are needed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderTrain,pageInfo} from '../js/train.js';
import {renderDay,pageInfo as dayInfo} from '../js/day.js';
import {renderFront,frontInfo,archiveLine} from '../js/front.js';
import {trainRow,renderTrains,pageInfo as trainsInfo} from '../js/trains.js';
import {stationRows,renderStation,pageInfo as stationInfo} from '../js/station.js';
import {stationList,renderStations,pageInfo as stationsInfo} from '../js/stations.js';
import {journeyData,indexJourneys,compactJourneyData,pageable,journeysAt,journeyPath,pairStats,renderJourneys,renderJourney,journeyPageInfo,journeysCard,journeysFrom,pageInfo as journeysInfo} from '../js/journeys.js';
import {renderStats,pageInfo as statsInfo} from '../js/stats.js';
import {monthFigures,renderMonth,pageInfo as monthInfo} from '../js/month.js';
import {esc} from '../js/utils.js';
import {stationAddresses,addressed} from './addresses.mjs';
import {localeUtils,configureKoreanStations} from '../js/locale.js';
const root=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const requested=path.resolve(process.argv[2]||path.join(root,'_site'));
const buildMarker='.korean-train-stats-build',markerText='Korean Train Stats build output\n';
const isInside=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
// Resolve existing ancestors too, so an output path through a symlink cannot point back into source.
function realOutput(file){
 return fs.lstatSync(file,{throwIfNoEntry:false})?fs.realpathSync(file):path.join(realOutput(path.dirname(file)),path.basename(file));
}
function buildOutput(file){
 if(fs.lstatSync(file,{throwIfNoEntry:false})?.isSymbolicLink())throw Error(`Build output must be a directory, not a symlink: ${file}`);
 const out=realOutput(file);
 if(out===root||isInside(out,root)||(isInside(root,out)&&out!==path.join(root,'_site')&&!isInside(path.join(root,'artifacts'),out)))
  throw Error(`Build output must be _site, a subdirectory of artifacts, or outside the source tree: ${out}`);
 if(fs.existsSync(out)){
  if(!fs.statSync(out).isDirectory())throw Error(`Build output must be a directory: ${out}`);
  const entries=fs.readdirSync(out),marker=path.join(out,buildMarker);
  if(entries.length&&(!fs.lstatSync(marker,{throwIfNoEntry:false})?.isFile()||fs.readFileSync(marker,'utf8')!==markerText))
   throw Error(`Build output is not empty or owned by this build: ${out}. Choose a new directory or move the old one aside.`);
 }
 return out;
}
const out=buildOutput(requested);
const SITE='https://koreantrainstats.com/',rawRead=file=>JSON.parse(fs.readFileSync(path.join(root,'data',file),'utf8'));
// Apply retained station addresses in memory and keep the stable IDs in the exported data.
const slugs=stationAddresses(rawRead('stations/index.json').stations),read=file=>addressed(file,rawRead(file),slugs);
const publicStationIds=new Set(slugs.values());
if(publicStationIds.size!==slugs.size)throw Error('Two stations have the same public address');
const stationAliases=new Map([...slugs].filter(([id,address])=>id!==address&&!publicStationIds.has(id)).map(([id,address])=>[address,id]));
const meta=read('meta.json'),{days}=read('days.json'),stations=read('stations/index.json'),yesterday=read('windows/yesterday.json'),month=read('windows/month.json');
// The Stats page needs the exporter's stats.json; without it the page and its header button are left out.
const stats=fs.existsSync(path.join(root,'data/stats.json'))?read('stats.json'):null,hasStats=!!statsInfo(stats);
const readGroup=dir=>{
 const folder=path.join(root,'data',dir),files=fs.existsSync(folder)?fs.readdirSync(folder).filter(file=>file.endsWith('.json')).sort():[];
 return new Map(files.map(file=>[file.slice(0,-5),read(`${dir}/${file}`)]));
};
const trainData=readGroup('trains'),dayData=readGroup('days'),dayPages=[...dayData.keys()];
if(days.length!==dayPages.length||days.some(({date},i)=>date!==dayPages[i]||dayData.get(date).date!==date))
 throw Error('The dates in days.json do not match the archived day files');
const names=Object.create(null),required=new Set();
// Older records have only English station names. Use a Korean name when unambiguous;
// keep the English name when distinct stations share it. New records carry the source-language name.
function rememberName(name,korean){
 if(!name)return;
 if(korean)names[name]=Object.hasOwn(names,name)&&names[name]!==korean?name:korean;
}
for(const s of stations.stations)rememberName(s.name,s.name_ko);
for(const train of trainData.values())for(const t of train.timetables)for(const s of t.stops)rememberName(s.station,s.station_ko);
const records=[...dayData.values()].flatMap(day=>day.most_delayed).concat(yesterday.trains||[]);
for(const record of records)for(const key of ['origin','destination','station'])rememberName(record[key],record[`${key}_ko`]);
for(const train of trainData.values()){
 const stops=train.timetables.at(-1)?.stops||[];
 if(!stops[0]?.station_ko)required.add(train.origin);
 if(!stops.at(-1)?.station_ko)required.add(train.destination);
}
for(const record of records)for(const key of ['origin','destination','station'])
 if(record[key]&&!record[`${key}_ko`])required.add(record[key]);
const missing=[...required].filter(name=>name&&!Object.hasOwn(names,name));
if(missing.length)throw Error('Missing Korean station names: '+missing.join(', '));
configureKoreanStations(names);
// Stage beside the destination so a failed build leaves the previous site available.
fs.mkdirSync(path.dirname(out),{recursive:true});
const staging=fs.mkdtempSync(path.join(path.dirname(out),`.${path.basename(out)}-build-`));
const site=path.join(staging,'site'),previous=path.join(staging,'previous');
let keepPrevious=false;
process.once('exit',()=>{if(!keepPrevious)fs.rmSync(staging,{recursive:true,force:true});});
function write(file,html){
 const target=path.join(site,file);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 try{fs.writeFileSync(target,html,{flag:'wx'});}
 catch(error){if(error.code==='EEXIST')throw Error(`Multiple pages use ${file}`);throw error;}
}
// A page that moved: a zero-second refresh and a canonical link to the new address, for the old address of a station or journey that took a name (GitHub Pages cannot send a 301).
const moved=(oldAddress,address)=>{for(const ko of [false,true]){const to=SITE+(ko?'ko/':'')+address;write((ko?'ko/':'')+oldAddress+'index.html',`<!doctype html>\n<html lang="${ko?'ko':'en'}"><head>\n  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${ko?'페이지가 이동했습니다':'This page has moved'} · Korean Train Stats</title>\n  <meta http-equiv="refresh" content="0;url=/${(ko?'ko/':'')+address}"><link rel="canonical" href="${to}">\n</head><body><p><a href="${to}">${ko?'새 주소로 이동합니다':'Go to the new address'}</a></p></body></html>\n`);}};
write(buildMarker,markerText);
const publicFiles=['CNAME','app.html','favicon.svg','logo.svg','og.png','og-ko.png','robots.txt','styles.css','tokens.css'];
for(const file of publicFiles)fs.copyFileSync(path.join(root,file),path.join(site,file));
for(const [dir,extension] of [['data','.json'],['js','.js']])
 fs.cpSync(path.join(root,dir),path.join(site,dir),{recursive:true,filter:source=>{
  const entry=fs.lstatSync(source),name=path.basename(source);
  return !name.startsWith('.')&&(entry.isDirectory()||(entry.isFile()&&name.endsWith(extension)));
 }});
const alternate=address=>`  <link rel="alternate" hreflang="en" href="${SITE}${address}">\n  <link rel="alternate" hreflang="ko" href="${SITE}ko/${address}">\n  <link rel="alternate" hreflang="x-default" href="${SITE}${address}">`;
// Derive both archive languages and the front-page links from complete calendar months.
const months=new Map([...new Set([...dayData.keys()].map(iso=>iso.slice(0,7)))].sort()
 .map(key=>[key,monthFigures(key,dayData)]).filter(([,figures])=>figures));
const monthKeys=[...months.keys()];
const preview=(info,address,ko)=>[['og:type','website'],['og:site_name','Korean Train Stats'],['og:locale',ko?'ko_KR':'en_US'],['og:title',info.title],['og:description',info.description],['og:url',SITE+address],['og:image',SITE+(ko?'og-ko.png':'og.png')],['og:image:width','1200'],['og:image:height','630'],['og:image:alt',ko?'Korean Train Stats: 한국의 열차는 얼마나 제시간에 도착할까요?':'Korean Train Stats: How punctual are South Korea’s trains?']]
 .map(([property,content])=>`  <meta property="${property}" content="${esc(content)}">`).join('\n')+'\n  <meta name="twitter:card" content="summary_large_image">';
// One link to the same page in the other language, drawn as two cells. Both names always show; the current one is filled.
const languageSwitch=(address,ko)=>`<a class="language-switch" lang="${ko?'en':'ko'}" hreflang="${ko?'en':'ko'}" href="${ko?(address||'./'):'ko/'+address}" aria-label="${ko?'English':'한국어'}"><span lang="en"${ko?'':' class="on"'}>EN</span><span lang="ko"${ko?' class="on"':''}>한국어</span></a>`;
// The list pages and the Stats page as header buttons. The front page shows them on every screen; other pages show them above 640 pixels (the .desktop-nav rule in styles.css) and, at 640 pixels and below, above the footer (cls 'footer-nav').
const pagesNav=(ko,address='',front=false,up='',cls='header-nav'+(front?'':' desktop-nav'))=>`<nav class="${cls}${hasStats?' nav-four':''}" aria-label="${ko?'페이지':'Pages'}">${[['trains/',ko?'전체 열차':'All trains'],['stations/',ko?'전체 역':'All stations'],['journeys/',ko?'전체 구간':'All journeys'],...(hasStats?[['stats/',ko?'통계':'Stats']]:[])].map(([to,label])=>`<a class="nav-btn" href="${up}${ko?'ko/':''}${to}"${address===to?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
const stationJSON=JSON.stringify(names).replaceAll('<','\\u003c');
// A BreadcrumbList for the search result's address line: the brand, then each crumb; the last crumb is the page itself.
const breadcrumbs=(crumbs,ko,local)=>{if(!crumbs?.length)return '';const base=SITE+(ko?'ko/':''),items=[{name:'Korean Train Stats',item:base},...crumbs.map(c=>({name:c.name,item:c.to?base+c.to:SITE+local}))];
 return `  <script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((it,i)=>({'@type':'ListItem',position:i+1,name:it.name,item:it.item}))}).replaceAll('<','\\u003c')}</script>\n`;};
function page(address,info,main,locale='en',front=false,dataset=null){
 // Links inside renderers are relative to the site root. The base accounts for language/depth; the skip link names this page explicitly.
 const ko=locale==='ko',local=(ko?'ko/':'')+address,home=ko?'ko/':'./';
 return `<!doctype html>
<html lang="${locale}"><head>
  <meta charset="utf-8"><base href="${'../'.repeat(local.split('/').filter(Boolean).length)||'./'}">
  <meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f4f4f3">
  <meta name="description" content="${esc(info.description)}"><title>${esc(info.title)}</title>
${info.noindex?'  <meta name="robots" content="noindex">\n':''}  <link rel="canonical" href="${SITE}${local}">
${alternate(address)}
${preview(info,local,ko)}
${dataset?`  <script type="application/ld+json">${JSON.stringify(dataset).replaceAll('<','\\u003c')}</script>\n`:''}${breadcrumbs(info.crumbs,ko,local)}  <link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600${ko?'':'&text=%E2%86%92'}&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="styles.css">
${front&&ko?`  <script id="korean-stations" type="application/json">${stationJSON}</script>`:''}
  <script type="module" src="js/${front?'start':'app'}.js"></script>
</head><body>
  <a class="skip" href="${local}#main">${ko?'본문으로 바로가기':'Skip to content'}</a>
  <div class="page"><header id="header"><a class="brand" href="${home}"><img src="logo.svg" alt="" width="26" height="26"><span>Korean Train Stats</span></a><div class="header-end">${pagesNav(ko,address,front)}${languageSwitch(address,ko)}</div></header>
  <main id="main" tabindex="-1">${main}</main><footer id="footer">${front?archiveLine(monthKeys,locale):pagesNav(ko,address,false,'','footer-nav')}${localeUtils(locale).footer(meta)}</footer></div>
  <div id="tooltip" role="tooltip" hidden></div>
</body></html>\n`;
}
// Structured data. The Dataset markup names where the figures can be downloaded (the public JSON under data/), when they were made, and how they were measured; the English home page also says what the site is called.
const modified=meta.generated_at?new Date(meta.generated_at).toISOString():null;
const technique=ko=>ko?'코레일이 제공한 역별 도착 지연 정보를 시간표와 비교해 집계했습니다. 예정 시각보다 5분 이내에 도착한 기록을 5분 이내로 셉니다.':'Arrival delay at each stop as reported by Korail, compared with the timetable. A stop counts as within 5 minutes when it arrives no more than 5 minutes after schedule.';
const download=(file,name)=>({'@type':'DataDownload',name,encodingFormat:'application/json',contentUrl:SITE+'data/'+file});
const richer=(d,ko,files)=>({...d,...(modified?{dateModified:modified}:{}),measurementTechnique:technique(ko),distribution:files.map(([file,en,kr])=>download(file,ko?kr:en))});
const script=json=>`<script type="application/ld+json">${JSON.stringify(json).replaceAll('<','\\u003c')}</script>`;
const frontFiles=[['windows/yesterday.json','Newest complete day','가장 최근 완료된 하루'],['windows/month.json','Last 30 days','최근 30일'],['days.json','Daily share of stops within 5 minutes','날짜별 5분 이내 도착 비율']],monthFiles=[['days.json','Daily share of stops within 5 minutes','날짜별 5분 이내 도착 비율']];
// Retain the verified Naver tag and front-page dataset in the existing English source.
let index=fs.readFileSync(path.join(root,'index.html'),'utf8');
index=index.replace('<main id="main" tabindex="-1" aria-busy="true"><div class="skeleton"></div></main>',`<main id="main" tabindex="-1">${renderFront(meta,days,yesterday,month).html}</main>`)
 .replace('<footer id="footer"></footer>',`<footer id="footer">${archiveLine(monthKeys,'en')}${localeUtils('en').footer(meta)}</footer>`)
 .replace('<a class="nav-btn" href="journeys/">All journeys</a>','<a class="nav-btn" href="journeys/">All journeys</a>'+(hasStats?'<a class="nav-btn" href="stats/">Stats</a>':'')).replace('<nav class="header-nav"',`<div class="header-end"><nav class="header-nav${hasStats?' nav-four':''}"`).replace('</nav></header>','</nav>'+languageSwitch('',false)+'</div></header>').replace('</head>',alternate('')+'\n</head>');
const frontEn=frontInfo(yesterday,month,'en');
if(frontEn)index=index.replace(/(<meta name="description" content=")[^"]*/,(m,p)=>p+esc(frontEn.description)).replace(/<title>[^<]*<\/title>/,()=>`<title>${esc(frontEn.title)}</title>`)
 .replace(/(<meta property="og:title" content=")[^"]*/,(m,p)=>p+esc(frontEn.title)).replace(/(<meta property="og:description" content=")[^"]*/,(m,p)=>p+esc(frontEn.description));
index=index.replace(/<script type="application\/ld\+json">(.*?)<\/script>/s,(m,json)=>{
 const dataset=JSON.parse(json);
 if(meta.first_complete_date&&meta.last_complete_date)dataset.temporalCoverage=`${meta.first_complete_date}/${meta.last_complete_date}`;
 else delete dataset.temporalCoverage;
 return script(richer(dataset,false,frontFiles));
}).replace('</head>',`  ${script({'@context':'https://schema.org','@type':'WebSite',name:'Korean Train Stats',alternateName:['한국 열차 도착 지연 통계'],url:SITE})}\n</head>`);
write('index.html',index);
const frontDataset=JSON.parse(index.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
const dataset=Object.assign({...frontDataset},richer({},true,frontFiles),{name:'한국 열차 도착 지연 통계',description:'코레일이 제공한 역별 도착 지연 기록을 집계한 자료입니다. 공식 통계가 아닙니다. 5분 이내 도착 비율과 지연 시간을 제공합니다.',url:SITE+'ko/',inLanguage:'ko',variableMeasured:['5분 이내 도착 비율','도착 지연 시간(분)'],keywords:['코레일','KTX','열차 지연','연착','도착 지연 통계','한국']});
write('ko/index.html',page('',frontInfo(yesterday,month,'ko')||{title:'코레일 KTX 열차 연착·지연 통계 · Korean Train Stats',description:'코레일 열차(KTX 포함)는 얼마나 제시간에 도착할까요? 역별 도착 기록으로 살펴보는 5분 이내 도착 비율과 도착 지연.'},renderFront(meta,days,yesterday,month,'ko').html,'ko',true,dataset));
// Stations with a page, by ID and by English name, so a stop name on a train or day page can link to it.
const callsAt=stationRows(trainData.values()),stationIds=new Map(),sourceNames=new Map(),pageIds=new Set();
for(const s of stations.stations){
 stationIds.set(s.name,stationIds.has(s.name)?null:s.id);
 if(s.name_ko)sourceNames.set(s.name_ko,s.id);
 if(!stationInfo(s,callsAt.get(s.id),month))continue;
 pageIds.add(s.id);
}
const stationId=(name,sourceName)=>{
 const id=sourceName?sourceNames.get(sourceName):stationIds.get(name);return pageIds.has(id)?id:null;
};
const addresses=[''],trainPages=new Set(),rows=[];
const locales=['en','ko'],prefixFor=locale=>locale==='ko'?'ko/':'',
 emptyInfo=title=>({title,description:title,noindex:true});
function directory(address,info,render,titles){
 for(const [i,locale] of locales.entries())write(`${prefixFor(locale)}${address}index.html`,page(address,info(locale)||emptyInfo(titles[i]),render(locale),locale));
 if(info('en'))addresses.push(address);
}
// Eligibility determines both emitted pages and historical links. Old day records remain readable when their train no longer has a page.
for(const [id,train] of trainData){
 if(!pageInfo(train))continue;
 const address=`train/${id}/`;
 for(const locale of ['en','ko'])write(`${locale==='ko'?'ko/':''}${address}index.html`,page(address,pageInfo(train,locale),renderTrain(train,days,stations,locale,id=>pageIds.has(id)),locale));
 trainPages.add(id);addresses.push(address);const row=trainRow(train);if(row)rows.push(row);
}
directory('trains/',locale=>trainsInfo(rows,month,locale),locale=>renderTrains(rows,month,locale),['All trains','전체 열차']);
// The journeys, computed before the station pages because each station page ends with its busiest ones.
const journeyStops=journeyData(trainData.values(),stations.stations),journeyIndex=indexJourneys(journeyStops),allJourneys=journeysAt(journeyIndex),journeyRows=allJourneys.filter(pageable);
// A station page for each station where a train reported an arrival in the past month.
let stationPages=0;
for(const station of stations.stations){
 const calls=callsAt.get(station.id);
 if(!stationInfo(station,calls,month))continue;
 const address=`station/${station.id}/`;
 for(const locale of ['en','ko'])write(`${locale==='ko'?'ko/':''}${address}index.html`,page(address,stationInfo(station,calls,month,locale),renderStation(station,calls,month,locale,journeysFrom(station,journeyRows,locale))+journeysCard(station,allJourneys,locale),locale));
 if(station.legacyId!==station.id&&stationAliases.has(station.id))moved(`station/${station.legacyId}/`,address);
 stationPages++;addresses.push(address);
}
// The front page's lookup row (js/start.js) reads this: train IDs by number, and each station with a page as [ID, English name, Korean name].
const byNumber={};for(const id of trainPages)(byNumber[trainData.get(id).number]??=[]).push(id);
write('find.json',JSON.stringify({trains:byNumber,stations:stations.stations.filter(s=>pageIds.has(s.id)).map(s=>[s.id,s.name,s.name_ko||''])}));
// The all-stations page lists those stations.
const stationRowsAll=stationList(stations.stations,callsAt);
directory('stations/',locale=>stationsInfo(stationRowsAll,month,locale),locale=>renderStations(stationRowsAll,month,locale),['All stations','전체 역']);
// The all-journeys page lists the journeys that at least 40 trains make; journeys/pairs.json lets its search answer any pair of stations.
// Each listed journey also gets a page at journey/<from>-to-<to>/, built here from the delay bands in the detailed data, so visitors download nothing extra.
directory('journeys/',locale=>journeysInfo(journeyRows,month,locale,allJourneys.length),locale=>renderJourneys(journeyRows,month,locale,allJourneys.length),['All journeys','전체 구간']);
if(allJourneys.length){
 write('journeys/pairs.json',JSON.stringify(compactJourneyData(journeyStops)));
 const stationAt=new Map(journeyStops.stations.map((s,i)=>[s[2],i]));
 const legacy=id=>stationAliases.get(id)??id;
 for(const row of journeyRows){
  const address=journeyPath(row.fromId,row.toId);
  const old=journeyPath(legacy(row.fromId),legacy(row.toId));
  if(old!==address)moved(old,address);
  const from=stationAt.get(row.fromId),to=stationAt.get(row.toId),stats=pairStats(journeyIndex,from,to);
  for(const locale of ['en','ko'])write(`${locale==='ko'?'ko/':''}${address}index.html`,page(address,journeyPageInfo(row,month,locale),renderJourney({row,stats},month,locale,id=>pageIds.has(id)),locale));
  addresses.push(address);
 }
}
// The Stats page: one time frame at a time, every frame built in.
if(hasStats){
 for(const locale of ['en','ko'])write(`${locale==='ko'?'ko/':''}stats/index.html`,page('stats/',statsInfo(stats,locale),renderStats(stats,locale,stations.stations),locale));
 addresses.push('stats/');
}
// Each day page links the days before and after it that have a page.
const dayPageIds=new Set(dayPages);
for(const [i,iso] of dayPages.entries()){
 const day=dayData.get(iso),address=`day/${iso}/`,near={prev:dayPages[i-1],next:dayPages[i+1]};
 for(const locale of locales)write(`${prefixFor(locale)}${address}index.html`,page(address,dayInfo(day,iso,locale)||emptyInfo(iso),renderDay(day,iso,id=>trainPages.has(id),locale,stationId,near),locale));
 if(dayInfo(day,iso))addresses.push(address);
}
for(const [key,figures] of months){
 const address=key+'/';
 for(const locale of ['en','ko']){
  const ko=locale==='ko',local=(ko?'ko/':'')+address,info=monthInfo(key,figures,locale);
  const monthDataset=richer({...(ko?dataset:frontDataset),name:ko?`${key} 한국 열차 도착 지연 통계`:`Korail train punctuality, ${info.crumbs[0].name}`,
   description:info.description,url:SITE+local,inLanguage:locale,temporalCoverage:`${figures.days[0].date}/${figures.days.at(-1).date}`},ko,monthFiles);
  write(local+'index.html',page(address,info,renderMonth(key,figures,id=>trainPages.has(id),locale,iso=>dayPageIds.has(iso)),locale,false,monthDataset));
 }
 addresses.push(address);
}
// GitHub Pages has one fallback document; its script chooses the language from the missing URL.
const errorInfo={title:'페이지를 찾을 수 없습니다 · Korean Train Stats',description:'요청한 페이지를 찾을 수 없습니다.'};
let error=page('404.html',errorInfo,'<div class="empty"><h1>페이지를 찾을 수 없습니다.</h1><p class="muted">주소를 확인하거나 첫 화면에서 열차와 날짜별 기록을 찾아보세요. <a href="ko/">첫 화면으로 이동</a></p></div>','ko');
error=error.replace('<base href="../">','<base href="/">').replace(/  <link rel="canonical"[^\n]*\n/, '').replace(/  <link rel="alternate"[^\n]*\n/g,'').replace('</head>','<meta name="robots" content="noindex"></head>');
write('ko/404.html',error);
let fallback=fs.readFileSync(path.join(root,'404.html'),'utf8');
fallback=fallback.replace('</head>','<script type="module" src="/js/not-found.js"></script></head>').replace('</main>','<p><a href="/ko/">한국어 첫 화면</a></p></main>');
write('404.html',fallback);
write('ko/app.html',fs.readFileSync(path.join(root,'app.html'),'utf8').replace('<html lang="en">','<html lang="ko">').replace('<head>','<head>\n  <base href="../">').replace('`train/${train}/`','`ko/train/${train}/`').replace('`day/${day}/`','`ko/day/${day}/`').replace(":'./'",":'ko/'").replace('href="./"','href="ko/"'));
// List the actual emitted addresses in both languages.
// Daily archives and complete months retain their own dates; rolling pages use last_complete_date, not the observation timestamp.
const stamp=meta.last_complete_date?`<lastmod>${meta.last_complete_date}</lastmod>`:'';
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+addresses.flatMap(address=>['', 'ko/'].map(prefix=>`<url><loc>${SITE}${prefix}${address}</loc>${/^day\//.test(address)?`<lastmod>${address.split('/')[1]}</lastmod>`:/^\d{4}-\d{2}\/$/.test(address)?`<lastmod>${months.get(address.slice(0,-1)).days.at(-1).date}</lastmod>`:stamp}</url>`)).join('\n')+'\n</urlset>\n';
write('sitemap.xml',sitemap);
// Check ownership again before the swap. If the second rename fails, restore the previous build.
if(buildOutput(requested)!==out)throw Error('Build output path changed');
if(fs.existsSync(out))fs.renameSync(out,previous);
try{fs.renameSync(site,out);}
catch(error){
 if(fs.existsSync(previous)){
  if(fs.existsSync(out)){
   keepPrevious=true;
   throw Error(`Could not replace the build output. The previous site is at ${previous}`,{cause:error});
  }
  try{fs.renameSync(previous,out);}
  catch(cause){keepPrevious=true;throw Error(`Could not restore the previous site from ${previous}`,{cause});}
 }
 throw error;
}
console.log(`Built both languages: front page, ${trainPages.size} trains, train list, ${stationPages} stations, station list, ${journeyRows.length} journeys with pages, ${dayData.size} days, and ${monthKeys.length} months${hasStats?', and the stats page':''}.`);
