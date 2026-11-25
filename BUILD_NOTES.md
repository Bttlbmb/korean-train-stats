# Korean Train Stats website

The public site at <https://koreantrainstats.com/> shows Korail’s reported arrival delays in English and Korean. The separate backend collects the reports and writes the JSON in `data/`. The backend’s `BUILD_NOTES.md` owns the data contract, the calculation of statistics, and the inclusion of dates. It is in `../backend/` in the paired checkout.

## Preview and checks

Use Node.js 24, the version in the publishing workflow. Run the preview from this repository.

```sh
python3 scripts/preview.py
```

The preview builds into `_site/` and serves it on this machine only. Restart the server after changing the code. [English preview](http://127.0.0.1:8765/) · [Korean preview](http://127.0.0.1:8765/ko/)

Run the following checks after changing a renderer, refreshing the data, or preparing a release.

```sh
node scripts/check_trains.mjs
node scripts/build.mjs
node scripts/check_locales.mjs
```

The first checks the figures against the exported records, including the trains, dates, station calls, journeys, and (when available) Stats. The second builds both languages. The third checks built pages, links, language pairs, frozen addresses and aliases, search indexes, sitemap dates, the optional publication marker, and reconstructed calendar months.

Check affected pages in a browser at 360, 768, 1,280, and 1,440 pixels. Exercise matching, sorting, Reset, row limits, restored URLs, Back from a detail page, and the language switch. Check that long station options fit their fields and modified clicks open links normally. When changing data loading, test a failed request and a successful retry for the front page and journey finder. Built figures should keep their dates and a requested journey query should survive a failure. Check the accessibility tree for table headings and values, and use the visible sorting controls on narrow screens.

Save temporary exports, screenshots, logs, and previews under the ignored `artifacts/` directory.

## Build and publishing

The build uses the same render modules in Node and in the browser. It writes finished HTML, both languages’ archive pages, the sitemap, and public assets. Render modules must be safe to import without a browser. Keep browser initialization in the page scripts.

`node scripts/build.mjs [output-directory]` defaults to `_site/`. Put custom output under `artifacts/` or outside the checkout. The build accepts a new or empty directory. It marks a successful build as its own before replacing that directory on later runs. A rendering failure leaves the previous successful build available.

GitHub Actions checks pushes to `main` and `production`. Production builds supply the Pages artifact and have deployment permissions. To release a website change, start a separate checkout at the latest `origin/production`, cherry-pick the intended code commits, and run the checks above. Push with `git push origin HEAD:production`. If a daily update lands first, repeat from the new production tip.

The home-server job exports `data/` from the latest production tree and keeps that tree’s website code. Daily publication replaces production history with a single commit. Development history stays on `main`. The website build that generates both languages’ archive pages must be in production before updating the home server to the JSON-only archive exporter. The backend guide owns the daily job and its checks.

`CNAME` names the custom domain. The project uses a DNS-only Cloudflare record. Keep the Naver Search Advisor verification tag in `index.html`.

## Definitions and decisions

One report counts for each arrival at a stop on a recorded trip. A punctual arrival is at most 5 minutes late, including early arrivals. Delay charts use five bands (within 5 minutes, 6–10, 11–20, 21–30, and over 30 minutes). The backend guide defines countable arrivals, the median delay when late, and the identities of train services. A train is identified by its number and display type. Separately numbered coupled services can share the same physical movement. These figures count reported services by ID.

The rolling month includes the newest 30 completed operating dates. The Stats page also offers the newest complete date, the newest 7 completed dates, and all completed dates. A gap can extend the calendar range without adding a completed date. The date ranges and actual counts explain which reports enter each figure.

Durations of 60 minutes or more use hours and minutes. Whole-percent headline and list figures reserve 100% for a perfect share. Journey delay-band labels round to the nearest whole percent. The front page shows decimal shares.

A calculated arrival time is the scheduled arrival plus the reported delay. When two consecutive stops both have reports and the second calculated arrival precedes the first, both reports are flagged. Missing reports break the consecutive comparison. Flagged reports still count in the statistics, including changes in delay on Stats. Train pages show a data-issue note above the stop chart, and a journey page shows the note by the figures when it counts one of the flagged destination arrivals.

### Display thresholds

| Where | Rule |
| --- | --- |
| Share for a train in All trains | At least 10 recorded runs. |
| Share at a station call or journey destination | At least 10 arrival reports there for that train. |
| All-trains punctuality rankings and perfect-train count | At least 20 recorded runs and a share. |
| Share in All stations | At least 10 reported arrivals. |
| All-stations punctuality ranking | At least 200 reported arrivals. Both ranking cards appear when at least 5 stations qualify. |
| Journey share in the finder | At least 10 distinct trains and a reported destination arrival. |
| Default journey catalogue and dedicated pages | At least 40 distinct trains and a reported destination arrival. |
| Journey departure-hour shares | At least 20 reported destination arrivals. |
| Stats weekday and departure-hour shares | At least 100 reported arrivals. |
| Stats route map | At least 3 observed traversals of a stretch per completed date, with a floor of 5 and a cap of 30. Its color scale uses the 95th percentile of qualifying stretches’ absolute mean changes, with a 0.5-minute floor. |
| Station train-table controls | More than 10 call rows. |
| Expandable tables | Show 40 matching rows before expansion. |

Punctuality rankings break ties using actual reported-arrival counts. A dash marks a share that cannot be computed or does not meet its display threshold. The detail page of a train shows its figures even with a short record, alongside an explanation of the list threshold.

## Interface

### Front page

The front page shows the latest completed day and the rolling month independently. Its daily heading uses Yesterday when the date is yesterday in Korea. An empty completed day shows its date and a message. Monthly figures and the lookup remain available. The headline uses reported arrivals, with one note explaining why a train can contribute several reports.

The daily chart shows one dot per train in scheduled departure order. Orange marks a train with a late reported arrival, green a train with reports and no late arrival, and gray a train with no countable arrival. A dot opens the train page. On touch screens the first tap selects the train and the second opens it.

The monthly chart shows one position per calendar day, on a 0–100% axis. Collected dates link to the day archive, including dates with zero reports. A missing date has an outlined stub without a link. Both charts support arrow-key navigation and Enter. When a refresh fails, the built figures retain their explicit dates. Retry reloads the data together.

The lookup accepts a train number or station name. A unique match opens its page. Multiple matches open the corresponding directory with a filter.

### Train page

`train/<id>/` covers a train with a recorded run during the rolling month. The heading names the current route, the scheduled endpoint times, the number of stops, the date range, and the number of runs. Its figures give the overall punctuality share, punctual days at each trip’s final scheduled arrival, the typical delay when late, and the longest reported delay. Missing final arrivals do not count toward the final-stop figure.

The stop chart follows the newest timetable. A report on an older timetable matches a row by station and visit number. The chart’s horizontal axis starts at −2 minutes and ends at the 97th percentile of displayed delays rounded up to a multiple of 5 minutes, with an end value of at least 15 minutes. A quiet line marks zero and a dashed line the punctuality cutoff. Dots at the end with outward arrows indicate delays beyond the drawing limit. They keep their actual values in the statistics. The chart’s header says that the times are scheduled.

The date strip distinguishes complete dates without a run, unavailable lookups, missing final arrivals, uncollected dates, and timetable changes. It gives the final arrival delay when reported. The small route map is decorative and requires coordinates for every stop. It follows available track points.

### All trains

`trains/` lists the same trains as the individual train pages. Most punctual and Least punctual rank five trains each, with three visible on phones. The perfect-train count uses the same ranking threshold.

The table has the train, route, departure, arrival, and punctuality. Starts at and Final destination match the endpoints of the current timetable. Stops at matches any station on it. Type boxes and the complete train number combine with the station filters. The default order is by service type and number. The controls support sorting and keep their values in the URL, for example `?number=1&types=KTX&from=Seoul&to=Busan&sort=dep_asc`.

### Stations

`stations/` lists stations with reported arrivals at a current stop. Busiest ranks stations by the number of distinct trains that call there. Least punctual uses the ranking threshold in the table above. Both cards show five stations (three on phones). The directory has a bilingual name search, service-type filters, and sortable train counts and shares.

`station/<id>/` summarizes distinct trains and reported arrivals. A loop and a train that starts and finishes at the same station can contribute more than one call row. The station figures pool reports that match its current calls by station and visit. Reports at removed calls remain in the historical train and network figures. The heading breaks down the shares by service group when at least two groups other than Other have reported arrivals.

The station table shows the time, train, final destination, and share for that call. An origin shows its departure with “departs” and a dash for the share. The Going to filter matches any later station on the current timetable. A train ending here has its own option. When an eligible journey page exists for an unambiguous station label, the filter offers a link to it.

The page closes with its six busiest journeys, three on phones, including a journey with too few trains to qualify for a page. Links below them open all incoming and outgoing journeys in the finder. A station with coordinates has a decorative map pin.

### All journeys and journey pages

`journeys/` offers a catalogue of busy journeys and a finder for any supported direct pair. Its heading counts every searchable pair, and the default table has its own catalogue count. With one station selected, the finder lists every available journey in that direction. With two selected, it shows the timetable and the destination share for that pair. The finder works even when the catalogue has no entries.

The latest observed timetable determines which pairs each train serves and its displayed departure, arrival, and duration. A past trip contributes when its own timetable has exactly one valid forward segment for the pair. Circular services can therefore contribute for unambiguous segments. The typical scheduled duration is the middle of the per-train times. An even count uses the upper middle.

Each qualifying direction has its own page at `journey/<from>-to-<to>/`. The heading links to station pages where available, and shows destination shares within 5, 10, and 15 minutes and the typical scheduled time. The hour chart groups reports by the scheduled departure hour of each recorded trip. It shows the five delay bands, their arrival count, and the share within 5 minutes. Hour labels mark past-only hours with an asterisk. The train count and selectable hours describe the current timetable. Below the hour threshold the chart and accessible table display dashes for all shares, with the actual count. Selecting an available departure hour filters the current timetable below the chart. The time and train-number filters leave the overall figures in place.

The finder uses the compact `journeys/pairs.json` produced by the build. It stores the latest timetable’s calls and arrival counts, with separate counts for pairs affected by older timetables. The build uses detailed counts and delay bands for dedicated pages. When the compact file fails to load, the catalogue remains available and the requested query survives a retry.

A query such as `?from=Seoul&to=Busan&number=1` keeps the selected pair and number. Unique names retain their established URL values. Shared names use their station IDs to distinguish the choices. Ordinary clicks on journeys without a page open the panel, while modified clicks follow the link normally.

### Day and month archives

Every complete date has a page in both languages at `day/<date>/`. It shows the share within 5 minutes, trains with a late stop, typical and longest delay when late, the delay distribution, and the ten trains with the largest delays. The latter list shows one largest reported delay per train on that date. Its “With delay” time is calculated from the scheduled arrival and reported delay. The reported train links to its page when the page still exists.

Previous and next links follow the archived dates. Complete dates without reports have an explanatory page outside the sitemap.

A calendar month gets a page at `<year>-<month>/` when every date has a day file. Both languages pool the archived arrival counts and combine the per-day largest-delay lists. A completed date without reports counts toward coverage. The day-by-day chart connects the archive pages, and the footer links the completed months.

### Stats page

`stats/` uses `data/stats.json`. It appears when the export contains a usable frame. The frame selector keeps the choice in the URL, such as `?range=week`. The default is the rolling month when it has reports. Each frame with reports contains its figures, a delay distribution, a breakdown by service group, and the weekday and departure-hour grid when departure times are known. A complete date with zero reports has an archive page but no Stats frame for that day.

The heatmap groups arrival reports by the operating weekday and scheduled departure hour at the train’s origin. Its colors compare the share more than 5 minutes late with the frame or selected train type’s own average. Green indicates fewer late arrivals and orange more. Insufficient samples are hatched. The best and worst qualifying cells are named. A type selector uses data from the same Stats export.

The route card shows the average difference between delays at consecutive scheduled arrivals when both have reports. It pools both directions and includes both dwell and travel time. Green indicates time made up, orange indicates time lost, and gray indicates inadequate samples or no change. The map uses available track geometry and requires coordinates at both stops. The rankings also include qualifying stretches without coordinates. It shows up to eight stretches where delay increased and five where it decreased. The source counts observed traversals, which include repeated trips by a train.

### Shared controls and colors

Train-number search accepts leading zeros and full-width digits. Station matching covers English and Korean names. Filtering and sorting apply to all matching rows, including rows beyond the display cap. Expanding moves focus to the first newly visible row. Reset restores the initial state.

The language switch keeps the page and its active query. The back arrow returns to the previous same-language page when the reader arrived from this site, including its filters and scroll position. On a direct visit or without scripts it links to the front page. Built tables remain usable without JavaScript.

The site uses IBM Plex Sans and IBM Plex Sans KR with tabular numerals, the light Porcelain palette, and navy focus. Green means within 5 minutes on delay charts, warm colors mean later, and gray is neutral. Share bars use one green (`--ontime-mark`) on an orange track (`--d3`). Stats uses separate, explicitly labeled scales.

Figures appear above their labels. The headers use 20-pixel figures on desktop and two columns on narrow screens. Use at least 12-pixel text, 15-pixel card titles, and 44-pixel tap targets for phone controls and the back arrow. The desktop controls are 36 pixels tall. Mobile tables keep the original headers in the accessibility tree and offer a visible Sort by control. Where columns repeat in a mobile summary, retain the original values for assistive software.

## Addresses and search metadata

The site root holds the English pages and `/ko/` their Korean equivalents. The build emits canonical addresses, reciprocal language links, and a sitemap containing both languages’ indexable pages. It preserves the already published readable aliases in `scripts/station-addresses.json`. New stations use stable source IDs, with a distinct fallback when an ID collides with a reserved address. Station names can change without sending existing links to the wrong station. Journey addresses use these same station addresses.

Old numeric station and journey URLs point to the current ones where the old address is available. `app.html` forwards old train and day URLs. The missing-page handler uses the requested path to choose the language.

Use relative public URLs. Built detail pages set a `<base>` at their site root and give their skip links a page-specific address. Provide a title, description, and language-specific social image. Search titles use the relevant subject and terms such as delays or punctuality. The title helper aims for 60 characters. The front page and complete calendar months carry Dataset metadata and links to their public JSON. Detail pages have breadcrumbs. Social images contain the site name and logo without dated figures, since messenger previews are cached.

The [Korean glossary](docs/korean.md) owns the translations, source references, and review status. The [writing guide](docs/writing.md) owns the documentation style.

## Code map

| Files | Responsibility |
| --- | --- |
| `scripts/build.mjs`, `scripts/addresses.mjs` | Page eligibility, public addresses, language pairs, metadata, assets, and sitemap. |
| `js/front.js`, `js/start.js`, `js/dots.js` | Front-page figures, charts, lookup, and refresh. |
| `js/train.js`, `js/day.js`, `js/month.js`, `js/app.js` | Train and archive renderers, and shared detail-page interactions. |
| `js/trains.js`, `js/station.js`, `js/stations.js`, `js/trains-page.js` | Directory and station renderers, browser filtering, sorting, and URL state. |
| `js/journeys.js`, `js/journeys-page.js` | Journey eligibility, figures, catalogue, finder, and detail pages. |
| `js/stats.js`, `js/stats-heat.js`, `js/stats-page.js` | Stats frames, type selection, heatmap, and route map. |
| `js/track.js`, `js/rail.js`, `scripts/rail_segments.py` | Track points keyed by station ID and credited to [OpenStreetMap](https://www.openstreetmap.org/copyright) under the ODbL. A stretch without track points uses a straight line. |
| `js/utils.js`, `js/locale.js`, `styles.css`, `tokens.css` | Shared wording, search and format helpers, and layout. |
| `scripts/check_trains.mjs`, `scripts/check_locales.mjs` | Data, renderer, build, bilingual, and link checks. |

## Open interface proposals

- Keep a selected date on train pages, expose the exact selected-stop delay, and carry that date across train links.
- Bring a restored journey answer into view with appropriate focus and remove catalogue-only controls from the selected-pair view.
- Distinguish an unsupported journey pair from an unknown station and preserve both query states.
- Revisit the arrival-time and English scheduled-duration wording. Consider showing individual train sample sizes alongside their shares.
