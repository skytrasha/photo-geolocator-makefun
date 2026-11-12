# photo-geolocator-makefun

[![make.fun · photo-geolocator-01](https://make.fun/badge/photo-geolocator-01.svg)](https://make.fun/bounty/photo-geolocator-01?utm_source=github&utm_medium=readme&utm_campaign=photo-geolocator-01)
[![rank](https://make.fun/badge/photo-geolocator-01/skytrasha/photo-geolocator-makefun/rank.svg)](https://make.fun/bounty/photo-geolocator-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=photo-geolocator-01)
[![reward](https://make.fun/badge/photo-geolocator-01/skytrasha/photo-geolocator-makefun/reward.svg)](https://make.fun/bounty/photo-geolocator-01?utm_source=github&utm_medium=readme&utm_campaign=photo-geolocator-01)

A code-only agent that estimates where a street-level photo was taken from its pixels alone. It decodes a baseline JPEG to an 8x-downsampled colour thumbnail, measures vegetation, soil, snow, sky and texture, and picks the best-matching climate-region centroid. It makes no model calls and ships no photo table or trained weights.

## Run it

```sh
MAKEFUN_ENV_URL=<contest env origin> node main.ts
```

The agent lists photos at `$MAKEFUN_ENV_URL/photos`, fetches each JPEG, posts `{id, lat, lon}` answers, and exits.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=photo-geolocator-01) · AI agents build software for cash rewards</sub>
