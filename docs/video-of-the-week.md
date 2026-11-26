# Featured video

Internal notes for the Friday routine that fills the site’s Featured video slot. This file is not linked from the site.

Every Friday morning, in America/Edmonton, look back at the seven days just ended and prepend one native SPX6900 video from X to `window.STACKS.videos` in `library.js`. The site deploys from `main`. Work directly on `main`: add the poster, prepend the entry, commit, and push.

## Window

Use the seven full days before Friday, in America/Edmonton:

- Start: previous Friday, 00:00:00
- End: Thursday, 23:59:59

Example: a run on Friday 27 November 2026 covers Friday 20 November 00:00 through Thursday 26 November 23:59:59 MT. Convert to UTC when calling X search (`start_time` / `end_time`). After the first Sunday in November, Mountain Time is usually UTC-7; from the second Sunday in March until then it is UTC-6. Confirm the offset rather than assuming.

## What to search

Use the built-in `x` public read tools (not `user-X`).

1. `x.search_posts_all` with a query such as:

   `(SPX6900 OR #SPX6900 OR $SPX6900) has:videos -is:retweet -is:reply -from:FlipTheStock`

   Set `start_time` and `end_time` to the window above. Request:

   - `expansions`: `attachments.media_keys`, `author_id`
   - `post.fields`: `created_at`, `text`, `attachments`, `author_id`, `public_metrics`, `entities`
   - `media.fields`: `preview_image_url`, `type`, `duration_ms`, `public_metrics`, `url`, `variants`, `width`, `height`, `media_key`
   - `user.fields`: `username`, `name`
   - `max_results`: as high as allowed, and page with `next_token` until the window is exhausted

   Date operators on the query string, if used, must be UTC (`since:YYYY-MM-DD_HH:MM:SS_UTC`). Prefer `start_time` / `end_time`.

2. Rank candidates by post `public_metrics.impression_count` (this is the “attention” score). Also record media `public_metrics.view_count` and post `public_metrics.like_count` for the run note.

3. Keep only genuine, native X videos: `media.type` is `video` or `animated_gif` is not enough on its own — prefer `video` with a duration. Skip image-only posts, link cards that merely point at YouTube, quote-tweets or retweets of a video already filed, and anything authored by `@FlipTheStock`. The post should be clearly about SPX6900, not an incidental mention.

4. If a search hit is thin on media or metrics, hydrate it with `x.get_posts_by_id` or `x.get_posts_by_ids` using the same expansions and fields.

## Dedupe

Skip a candidate if any of these already appear in `library.js`:

- The same X status id (the digits in `/status/<id>`, which becomes `#v-<id>` on the site)
- The same canonical post URL (`https://x.com/<user>/status/<id>`), ignoring `twitter.com`, `www`, and query strings
- A quote, repost, or obvious re-upload of a video already filed (including the existing YouTube interviews, if the X post is just a clip of one of those)

Do not reorder the existing YouTube entries. Always **prepend** the new object so the homepage `validVideos().slice(0, 5)` band stays newest-first and five-across.

If nothing in the window survives the filters, do not add a filler video. Leave the list as it is and say so.

## Entry format

Prepend one object to `window.STACKS.videos` in `library.js`:

```js
{
  x: "https://x.com/<user>/status/<id>",
  poster: "videos/posters/<yyyy-mm-dd>-<short-slug>.jpg",
  title: "A short, dry headline",
  note: "<Source or @handle>, <D Month YYYY>. About <length>. One dry clause about what is in it.",
  credit: "Post on X · @<user>"
}
```

- `x` must be a canonical `https://x.com/<user>/status/<id>` URL. No query string.
- `poster` is a repo-relative path under `videos/posters/`. The site serves it as `/videos/posters/<file>.jpg` from both `/` and `/videos/`.
- `title`, `note`, and `credit` are required. Do not set a YouTube `id` on an X entry.

Existing YouTube entries stay `{ id, title, note }` and must not be rewritten.

## Caption and credit tone

Financial Times, dry, Canadian English (en-CA).

- Dates: `21 November 2026` (day, month, year; no comma, no American month-first form).
- `title`: short, sentence-like, no hype, no emoji, no exclamation marks. Name the speaker or the scene, not a marketing slogan.
- `note`: one or two sentences. Lead with the account or show and the date, then a length if you have it (`About forty seconds.` / `About two minutes.`), then one dry clause on what the clip actually shows. These are not advice from this page — do not editorialize a price call as a recommendation.
- `credit`: exactly `Post on X · @<user>` (middle dot, no extra words).

Match the tone of the YouTube notes already in `library.js` (source, date, length, one dry clause).

## Poster file

1. Take the video’s `preview_image_url` from the X media object (the thumbnail, not a raw mp4 variant).
2. Download it, convert to JPEG if needed, and resize so the long edge is at most 1280px. Aim for roughly 80–200KB so the repo stays small.
3. Save it as `videos/posters/<yyyy-mm-dd>-<short-slug>.jpg`, using the post’s Edmonton date and a lowercase hyphenated slug from the title (for example `2026-11-21-persist-on-the-timeline.jpg`).
4. Commit the JPEG with the `library.js` change. Do not commit temporary test posters.

## Commit

Commit message, on `main`:

`Add featured SPX6900 video for week ending YYYY-MM-DD`

The date is the Thursday that closed the window. Push to `origin main` so GitHub Pages can build.

## How the site uses the entry

- Homepage “Featured video” band: first five videos, poster image, link to `videos/#v-<statusid>`.
- `/videos/`: official X embed (`blockquote.twitter-tweet` + `platform.twitter.com/widgets.js`). If the widget fails, the poster remains, linked out to the post, with a “Watch on X” label.
