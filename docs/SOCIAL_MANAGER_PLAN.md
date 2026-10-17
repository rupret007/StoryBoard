# StoryBoard social manager

Phase 1 (this PR) is approve-and-post. Phases 2 and 3 are designed in the data
model now and left unimplemented. StoryLiner stays a separate repo; its posting
adapters and Stalemate / Rad Dad voices were ported here. Do not archive it.

Official API pages were checked on 2026-10-15 before this code was written.
Meta developer HTML returned HTTP 403 from this environment; those citations
use the official URLs plus Meta's published limit text as reported on the live
guides that day.

## Hard rules (all phases)

- Nothing posts without an explicit `ApprovalRequest` (`actionType=social_post_batch`,
  `status=approved`, `approvedAt` set) and an audited owner decision.
  The approved snapshot is immutable; durable claims prevent replay or concurrent
  clicks from sending twice. Failed or uncertain sends require platform review,
  never an automatic retry.
- An ID alone does not prove public publication. Mock sends are `simulated`,
  YouTube receipts are `private_upload`, and TikTok init receipts are
  `processing`. Only confirmed public post receipts are `posted`. Lost
  responses and interrupted sends stay unconfirmed.
- Every send attempt records `SocialSendLog` before the provider call and
  finalizes it with the result. Interrupted attempts retain an unknown outcome.
- Free official APIs only. No scraping, no browser bots, no X/Twitter.
- App secrets stay in env vars; publishing tokens stay in encrypted,
  artist-bound `IntegrationConnection` blobs matching the approved account. Never
  commit tokens.
- Stalemate and Rad Dad keep separate voice profiles. An account-mismatch check
  runs before every send.
- Manager chat still will not draft or publish. The Social page is the only
  write path.

## Official limits and permissions (verified 2026-10-15)

### Facebook Pages (Graph API v23.0)

- Photo: `POST /{page-id}/photos`
- Video: `POST /{page-id}/videos`
- Feed text: `POST /{page-id}/feed`
- Show Event: disabled in this phase; it needs a separate durable approval
  and receipt before it can become a supported side effect.
- Permissions used in Connect: `pages_show_list`, `pages_manage_posts`,
  `pages_read_engagement`, `pages_manage_engagement`, `pages_read_user_content`,
  `pages_messaging`, `read_insights`
- App Review is not required when the app only manages Pages that the app's
  own admins already administer (Standard Access / dev mode).
- Docs:
  - https://developers.facebook.com/docs/pages-api/posts
  - https://developers.facebook.com/docs/video-api/guides/publishing
  - https://developers.facebook.com/docs/graph-api/overview/access-levels
  - https://developers.facebook.com/docs/graph-api/reference/page/events

### Instagram Content Publishing

- Create container `POST /{ig-user-id}/media`, then
  `POST /{ig-user-id}/media_publish`. Video containers must be `FINISHED`
  before publish.
- Media must be a public `https` URL. Business/Creator account linked to the
  Page.
- Live guide (Requirements → Limitations) states **100 API-published posts
  in a 24-hour moving period**. The same page's carousel section and
  `GET /{ig-user-id}/content_publishing_limit?fields=quota_usage,config` still
  document `quota_total` as **currently 50** / 86400 seconds. Phase 1 queries
  `content_publishing_limit` and refuses when `quota_usage >= quota_total`.
- Scopes: `instagram_basic`, `instagram_content_publish`, plus comment /
  message / insights scopes reserved for Phase 2–3.
- Docs:
  - https://developers.facebook.com/docs/instagram-platform/content-publishing
  - https://developers.facebook.com/docs/instagram-api/reference/ig-user/content_publishing_limit

### YouTube Data API v3

- Upload: `POST https://www.googleapis.com/upload/youtube/v3/videos`
  (`videos.insert`, resumable). Scope:
  `https://www.googleapis.com/auth/youtube.upload`
- Official quota (2026-10-15): default **100 `videos.insert` calls per day**
  at **1 unit each** in the Video Uploads bucket, plus **10,000 units/day**
  for other methods. Daily reset at midnight PT.
- Live `videos.insert` page (updated 2026-10-15) says unverified API projects
  are **not** forced private. Phase 1 still uploads as **`privacyStatus=private`**
  until Jeff's project is audited, then he can flip the video public in Studio.
- Docs:
  - https://developers.google.com/youtube/v3/docs/videos/insert
  - https://developers.google.com/youtube/v3/determine_quota_cost
  - https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits

### TikTok Content Posting API

- Phase 1 uses **upload-to-inbox / draft**, not Direct Post:
  `POST /v2/post/publish/inbox/video/init/` (`video.upload`).
  Photos use `/v2/post/publish/content/init/` with `post_mode=MEDIA_UPLOAD`.
- Init returns a `publish_id` tracking asynchronous transfer. It is logged
  as `processing`, never as a delivered inbox draft or public post. Check
  TikTok for completion and finish publication in the app.
- Unaudited clients: private / `SELF_ONLY` for Direct Post; inbox draft is
  the supported unaudited path.
- Docs:
  - https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content
  - https://developers.tiktok.com/doc/content-posting-api-get-started
  - https://developers.tiktok.com/doc/content-sharing-guidelines

## Phase 1 — approve and post (built)

Flow: drop a photo/video file (drag-and-drop or picker, including phone)
or an optional public URL + note → chunked store on the server with
progress → the manager LLM drafts 2–3 caption variants per platform
(template fallback when `OPENAI_ENABLED` is off) → one **Approve & post** →
adapter calls from the local file → separate confirmed-public, private-upload,
processing, unknown, or simulated receipts. Configured caption-provider errors
return a sanitized failure with no drop or approval created; templates are
reserved for explicitly disabled or unconfigured caption generation.

Caption prompts separate note data from fixed instructions. Instruction overrides,
role delimiters, and similar attacks in notes or fact fields are rejected before
the provider call, including when templates are used. Validation rejects malformed
or incomplete batches and detected unsupported links, dates, times, prices,
locations, venues, lineups, and hashtags across every caption, title, and variant.
Generated wording must use supplied fact spans and a small presentation vocabulary;
venue and lineup relations also require evidence. These conservative lexical
checks can reject otherwise reasonable paraphrases and do not verify whether a
user-supplied fact is true; the owner must review every caption.
`#chicago` and other recognized city tags require that place in the data. Instagram/TikTok stay short;
Facebook is longer; YouTube is a title plus description.

Caption SDK calls have a 30-second timeout and no retries. Before each call,
`SocialCaptionDailyUsage` atomically reserves one attempt across all bands and
API processes using the database's UTC day. `SOCIAL_CAPTION_DAILY_CALL_LIMIT`
defaults to 100; zero disables calls. Failed, rate-limited, timed-out, or invalid
responses consume their reservation. A missing migration, unavailable database,
invalid setting, or exhausted cap blocks generation with no fallback draft.
Disabled/unconfigured LLM templates do not consume a call. Apply the forward
`20261016010000_social_caption_daily_budget` migration before enabling drafting.
This cap covers Social caption calls; it does not change Manager chat budgets.

| Platform | How Phase 1 sends the file |
| --- | --- |
| Facebook | Local photo as `source` upload; local video as Graph **resumable** `upload_phase` start/transfer/finish. Public `https` URL still works. |
| Instagram | Video: resumable (`upload_type=resumable` + rupload). Photo: hosted token URL (`API_URL` must be public https) or an existing `https` URL. |
| YouTube | Resumable `videos.insert` from the stored file (chunked `Content-Range`) |
| TikTok | Inbox draft via **FILE_UPLOAD** (`video_size` / `chunk_size` / `total_chunk_count`) then PUT chunks. `publish_id` only. |

Local files live under `SOCIAL_MEDIA_DIR` (default `data/social-media`). Photos
max 20 MB, videos max 2 GB, 8 MB chunks. Official transfer docs:

- https://developers.facebook.com/docs/graph-api/video-uploads
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide

Connect buttons (owner-only) start OAuth for Meta, YouTube upload, and TikTok.
Publishing requires a verified, encrypted connection for this band; global
env-var tokens cannot silently choose a destination for another workspace. `SOCIAL_ADAPTER=mock`
is the default; mock mode provisions workspace-bound accounts so local demo
never talks to a live API.

## Phase 2 — reply inbox (not built)

Unified inbox for Facebook comments/DMs, Instagram comments/DMs, and YouTube
comments via webhooks + polling. TikTok comments/DMs stay a manual reminder
list (no ordinary-developer reply API).

Each item is triaged (`thanks`, `question`, `booking`, `troll`, `spam`) and
gets a drafted reply in that band's voice using `SocialVoiceProfile.confirmedFacts`
only. Unknown facts go to Jeff.

Daily digest: checkboxes + **Approve selected** (batch approval still creates
one approval record per sent reply). Booking/venue DMs are priority.

Tables already in the schema: `SocialInboxItem`, `SocialReplyDraft`.

Permissions still needed (requested in Phase 1 Connect, unused now):
`pages_read_user_content`, `pages_manage_engagement`, `pages_messaging`,
`instagram_manage_comments`, `instagram_manage_messages`,
`youtube.force-ssl` for `comments.insert` (50 units).

Standing auto-rules from the research plan stay opt-in and off by default.

## Phase 3 — weekly plan and analytics (not built)

Monday plan from the show calendar: promo-arc items per confirmed gig plus
filler ideas from `SocialMediaAsset`. Jeff approves the week in one pass
(`SocialWeeklyPlan`).

Analytics snapshots (`SocialAnalyticsSnapshot`) from Page Insights
(`read_insights`), IG Insights (`instagram_manage_insights`), YouTube
Analytics API, and TikTok Display basics or a manual paste. Venue/promoter
"share their post" work stays a manual reminder.

## Data model (Phase 1 + later)

```
Artist
  └ SocialVoiceProfile          one voice per workspace (stalemate | rad_dad | unknown)
  └ SocialAccount               connected Page / IG / channel / open_id + bound voice
  └ SocialMediaAsset            public https media
  └ SocialPost                  one drop
       └ SocialPostTarget       per-platform caption / Event flag / platform id
       └ SocialSendLog          every attempt
       └ ApprovalRequest        the only authorization to send
  └ SocialInboxItem / SocialReplyDraft     Phase 2
  └ SocialWeeklyPlan / SocialAnalyticsSnapshot   Phase 3
```

`IntegrationConnection.provider` values `meta`, `youtube_publish`, and `tiktok`
hold encrypted OAuth secrets and verified destination IDs. Client DTOs omit
credentials, local storage paths, and provider media bearer URLs. Page tokens
never go in git.

## What Jeff still connects

1. Meta developer app (free), admin on both band Pages, Business/Creator IG
   linked to each Page, Messages → allow connected-tools access.
2. Google Cloud project, YouTube Data API enabled, OAuth consent **In
   production**, Connect YouTube once per channel. Optional compliance audit
   before public API uploads.
3. TikTok developer app + `video.upload`. Inbox draft works before the audit.

StoryLiner is not deleted or archived. Confirm before any later retirement.
