#!/usr/bin/env python3
"""Write js/rail.js: the track between each pair of consecutive stops, for the train page map.

Run it by hand when a new line opens or trains call at a new pair of stations; the site does not run it.

1. Download the railways of South Korea from OpenStreetMap (ODbL, openstreetmap.org/copyright):
   curl -A "your-client-name" --data-urlencode 'data=[out:json][timeout:290];way["railway"="rail"][service!~"siding|spur"](33.0,125.9,38.7,129.8);out geom qt;' https://overpass-api.de/api/interpreter -o rail.json
2. python3 scripts/rail_segments.py rail.json

Each pair of stops is routed along the shortest connected track and thinned to about 1 km. The file keeps only the points
between the two stations, in the order of the sorted pair "a|b"; js/train.js adds the stations themselves. A pair that
cannot be routed sensibly is left out, and the map draws a straight line for it.
"""
import glob, heapq, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOLERANCE = 0.01          # degrees, about 1 km: a quarter of a pixel on the 96 px map
SNAP_KM = 1.5             # a station further than this from any track is not routed
COS = math.cos(math.radians(36.3))
km = lambda a, b: math.hypot((a[0] - b[0]) * COS, a[1] - b[1]) * 111.0

# Hand-checked waypoints for pairs the shortest path gets wrong, as "a|b": [[lon, lat], ...] the route must pass near.
VIA = {}


def load_graph(path):
    adj = {}
    for way in json.load(open(path))['elements']:
        tags = way.get('tags', {})
        if tags.get('usage') in ('industrial', 'military'):
            continue
        weight = 1.3 if tags.get('service') == 'yard' else 1.0
        pts = [(round(p['lon'], 6), round(p['lat'], 6)) for p in way['geometry']]
        for a, b in zip(pts, pts[1:]):
            if a != b:
                step = km(a, b) * weight
                adj.setdefault(a, []).append((b, step))
                adj.setdefault(b, []).append((a, step))
    # keep the largest connected piece, so a station never snaps to an island of track
    seen, best = set(), []
    for start in adj:
        if start in seen:
            continue
        comp, stack = [start], [start]
        seen.add(start)
        while stack:
            for v, _ in adj[stack.pop()]:
                if v not in seen:
                    seen.add(v); comp.append(v); stack.append(v)
        if len(comp) > len(best):
            best = comp
    return adj, best


def shortest(adj, src, dst):
    dist, prev, queue = {src: 0}, {}, [(0, src)]
    while queue:
        d, u = heapq.heappop(queue)
        if u == dst:
            break
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18):
                dist[v] = d + w; prev[v] = u; heapq.heappush(queue, (d + w, v))
    if dst not in dist:
        return None, None
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    return path[::-1], dist[dst]


def thin(pts, eps):
    """Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = (bx - ax) * COS, by - ay
    far, at = 0, 0
    for i in range(1, len(pts) - 1):
        px, py = (pts[i][0] - ax) * COS, pts[i][1] - ay
        t = 0 if dx == dy == 0 else max(0, min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
        d = math.hypot(px - t * dx, py - t * dy)
        if d > far:
            far, at = d, i
    if far <= eps:
        return [pts[0], pts[-1]]
    return thin(pts[:at + 1], eps)[:-1] + thin(pts[at:], eps)


def main(rail_json):
    adj, nodes = load_graph(rail_json)
    stations = {s['id']: s for s in json.load(open(f'{ROOT}/data/stations/index.json'))['stations'] if s.get('latitude') is not None}
    pairs = set()
    for file in glob.glob(f'{ROOT}/data/trains/*.json'):
        train = json.load(open(file))
        if not isinstance(train, dict) or 'timetables' not in train:
            continue
        ids = [s['station_id'] for s in train['timetables'][-1]['stops']]
        pairs.update(tuple(sorted(p)) for p in zip(ids, ids[1:]) if p[0] != p[1] and p[0] in stations and p[1] in stations)

    snapped = {}
    def snap(sid):
        if sid not in snapped:
            at = (stations[sid]['longitude'], stations[sid]['latitude'])
            node = min(nodes, key=lambda n: km(n, at))
            snapped[sid] = node if km(node, at) <= SNAP_KM else None
        return snapped[sid]

    out, left = {}, []
    for a, b in sorted(pairs):
        A, B = (stations[a]['longitude'], stations[a]['latitude']), (stations[b]['longitude'], stations[b]['latitude'])
        legs = [snap(a)] + [min(nodes, key=lambda n: km(n, w)) for w in VIA.get(f'{a}|{b}', [])] + [snap(b)]
        if None in legs:
            left.append((a, b, 'no track near a station')); continue
        path, length = [], 0
        for x, y in zip(legs, legs[1:]):
            part, d = shortest(adj, x, y)
            if part is None:
                path = None; break
            path += part if not path else part[1:]; length += d
        if path is None:
            left.append((a, b, 'not connected')); continue
        if length > 1.8 * km(A, B) + 5:
            left.append((a, b, f'detour {length:.0f} km for {km(A, B):.0f} km')); continue
        inner = [[round(x, 2), round(y, 2)] for x, y in thin(path, TOLERANCE)[1:-1]]
        out[f'{a}|{b}'] = inner

    text = ('// Track between consecutive stops, from OpenStreetMap (ODbL, openstreetmap.org/copyright): the points between the\n'
            '// two stations of each sorted "a|b" pair, as [longitude, latitude], thinned to about 1 km. Generated by scripts/rail_segments.py.\n'
            'export const RAIL={\n' + ',\n'.join(f'"{k}":{json.dumps(v, separators=(",", ":"))}' for k, v in out.items()) + '\n};\n')
    open(f'{ROOT}/js/rail.js', 'w').write(text)
    print(f'{len(out)} of {len(pairs)} pairs written, {len(text) / 1024:.0f} KB')
    for a, b, why in left:
        print(f'  straight: {a} | {b}: {why}')


if __name__ == '__main__':
    main(sys.argv[1])
