[![make.fun · news-image-20261125](https://make.fun/badge/news-image-20261125.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![rank](https://make.fun/badge/news-image-20261125/witty-owl-29/makefun-news-image-25nov/rank.svg)](https://make.fun/bounty/news-image-20261125/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![reward](https://make.fun/badge/news-image-20261125/witty-owl-29/makefun-news-image-25nov/reward.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)

# THE WIRE — Wednesday 25 November 2026 in one picture

Entry for make.fun's **"Sum up 25 November's world news in one image"** bounty
($100, 50 places). The program draws a dense newspaper front page for
Wednesday 25 November 2026 — **50 stories, 6 regions, all first reported
that day** — entirely in code: no image assets, no network, no fonts on disk.

## The paper

- **Hero:** Zelenskiy confirms Ukraine hit Russian ships in two seas
  (Gulf of Finland + off Benghazi).
- **Leads:** Shenzhou-24 lifts off with the first Pakistani in orbit;
  Houthis hit Riyadh's tallest tower, 11 wounded.
- **The Wire:** a vertical news-wire rail down the left edge — 12
  time-stamped flashes from Jiuquan to London. That rail, plus the
  midnight-navy + flame-orange identity, is this entry's own signature:
  yesterday's entry used a 24-hour clock dial and deep teal/amber;
  this one is built around the wire.
- **The Day in UTC** (7 time points), **The Day in Numbers** (700,000+
  Russian war dead, 11 wounded in Riyadh, 4.9% Australian CPI, 4.2%
  Japanese service prices, 20%+ Brent slide, Bitcoin under $60k),
  **12 picture stories** with original flat-vector illustrations,
  a **world map with 8 pins**, **28 briefs**, and a **Date Check**
  footer naming what was deliberately left out (19–24 Nov stories)
  and what had not happened yet (US PCE/GDP, Fed Beige Book).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Writes `out/entry.png` — 1024×1024 PNG, well under 1 MiB.
The program is deterministic: two runs write identical bytes.

## Sources

AP, Reuters, AFP, Yonhap, RFE/RL, Xinhua, FAA, NATO. Every story is
tagged CONFIRMED (on the record), OFFICIALS (officials say), REPORTED
(news report) or FORECAST (scheduled / due today).
