# Korean Train Stats

How punctual are South Korea’s trains? This static site shows reported arrival delays for Korail trains at <https://koreantrainstats.com/>.

The front page shows the newest complete day and the past 30 days, with explicit dates when collection is behind. Each daily dot is a train; selecting it opens a page with one row per stop and one dot per recorded day. Station pages, such as `station/daejeon/`, show the station, its punctuality rankings, and the trains that call there.

The header links to three directories:

- **All trains:** train numbers, routes, and punctuality, with filters by number, type, first station, and last station.
- **All stations:** station-name search, service types, train counts, and punctuality.
- **All journeys:** a catalogue of journeys with at least 40 services, plus a search for direct journeys between two stations. Each of those journeys has its own page (`journey/seoul-to-busan/`) with its figures, the delay by departure hour, and a table of its trains. Clear segments of circular services are included; a selected journey’s departures can be filtered by train number.

The build supplies English and Korean versions. Korean pages use `/ko/`, and the language switch keeps the current page and list filters.

## Data and credits

The delays are reported by Korail and collected by a separate private scraper. They are not official statistics, and a figure that cannot be computed is shown as a dash. The compilation and figures are licensed under CC BY 4.0; Korail’s rights in its underlying data are unaffected. The train list and station positions come from Mikołaj Kuranowski’s GTFS (CC BY 4.0). The map outline is from Natural Earth (public domain).

## Working on the site

The site is plain HTML, CSS, and ES modules. `scripts/build.mjs` builds the pages with those same modules, and GitHub Actions validates and builds them before publishing. `data/` holds the private backend exporter’s output; do not edit it by hand. [AGENTS.md](AGENTS.md) owns the working rules. [BUILD_NOTES.md](BUILD_NOTES.md) owns the code map, current behavior, open proposals, checks, and production release procedure.
