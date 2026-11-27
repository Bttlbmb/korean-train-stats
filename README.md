# Korean Train Stats

How punctual are South Korea’s trains? This static site shows reported arrival delays for Korail trains at <https://koreantrainstats.com/>.

The front page shows the newest complete day and the newest 30 completed dates. Each daily dot represents a train and opens its page, which shows the reports by stop and day. Station pages, such as `station/daejeon/`, give the station’s figures, the trains that call there, and its busiest journeys.

The header links to three directories:

- **All trains:** train numbers, routes, and punctuality, with filters by number, type, and station.
- **All stations:** station-name search, service types, train counts, and punctuality.
- **All journeys:** a [catalogue of busy journeys](BUILD_NOTES.md#display-thresholds), plus a search for direct journeys between two stations. Catalogue entries have their own pages (`journey/seoul-to-busan/`) with figures, a delay-by-departure-hour chart, and the list of trains. Clear segments of circular services are included; a selected journey’s departures can be filtered by train number.

The Stats page, when the export supplies its data, shows delay patterns by service group, weekday, departure hour, and track stretch. The day and month archives preserve the completed collection dates.

Korean pages use `/ko/`. The language switch keeps the current page and list filters.

## Data and credits

The delays are reported by Korail and collected by a separate private scraper. They are not official statistics, they may contain errors or gaps, and no guarantee is made that they are correct or complete. A figure that cannot be computed is shown as a dash. The compilation and figures are licensed under CC BY 4.0; Korail’s rights in its underlying data are unaffected. The train list and station positions come from Mikołaj Kuranowski’s GTFS (CC BY 4.0). The map outline is from Natural Earth (public domain).

## Working on the site

The site is plain HTML, CSS, and ES modules. `scripts/build.mjs` builds the pages with those same modules, and GitHub Actions validates and builds them before publishing. `data/` holds the private backend exporter’s output; do not edit it by hand. [AGENTS.md](AGENTS.md) owns the working rules. [BUILD_NOTES.md](BUILD_NOTES.md) owns the code map, current behavior, open proposals, checks, and production release procedure.
