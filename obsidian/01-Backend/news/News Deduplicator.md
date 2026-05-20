---
tags: [backend, news]
---

# News Deduplicator

> Two-layer dedup: SHA-256 over a tracking-param-stripped URL, plus SHA-256 over
> whitespace-normalised content.

## Source

- `backend/app/news/deduplicator.py` (`NewsDeduplicator`)

## How it works

`normalize_url(url)` parses with `urllib.parse`, drops a fixed `SKIP_PARAMS` set
(UTM, click ids, `_ga`, partner/affiliate, `fbclid`, `gclid`, `msclkid`,
mailchimp ids, `mc_cid`, `mc_eid`), re-encodes, and trims trailing slashes —
canonicalising tracker-decorated URLs to one form.

`hash_url()` SHA-256s the normalised URL; `hash_content()` SHA-256s
`" ".join(content.lower().split())` so capitalisation and whitespace differences
collapse to one hash. `is_duplicate_url()` and `is_duplicate_content()` do
`NewsArticle.find_one()` on `url_hash` / `content_hash` fields (both indexed
in the model). `is_duplicate(url, content)` is the combined gate the crawler
runs before inserting.

## Depends on

- [[NewsArticle Model]]

## Used by

- [[RSS Crawler]] (`_process_rss_entry` runs URL dedup first, then content dedup)

## Gotchas

- Sites that mutate article copy after publish will dodge content-hash dedup — URL hash still catches them.

## See also

- [[_index]]
