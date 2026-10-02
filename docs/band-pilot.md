# Rad Dad and Stalemate pilot

Status: preparation in progress. Engineering checks are recorded in
[pilot-evidence.md](pilot-evidence.md). Nothing here claims an activated URL,
real Google login, delivered message, real catalog import, or successful show.

Jeff chose **both Rad Dad and Stalemate**. They are separate workspaces. Their
membership, performer/account links, commitments, songs, money, and settings
must be checked independently. Travis owns booking. The historical Vault
“parked” import slice does not prohibit a Stalemate workspace; it still must
not silently opt that workspace into a private catalog import.

## Missing activation inputs

Jeff supplies/approves these when the engineering candidate is reviewable:

- A hosting account/server and two trusted subdomains under one parent domain,
  plus the acceptable hosting cost. There is no existing target.
- Google operator sign-in OAuth configuration, entered locally as secrets.
- Travis's and at least one bandmate's email, plus membership/role per band.
  Jeff supplied his owner identity privately; do not put member email lists in Git.
- Next rehearsal and gig dates/timezones, locations, commitments and responsible
  people for each band. Missing facts stay missing.
- An approved local Vault `app_api.json` feed and band-specific import scope.
  No file path was supplied. No private feed has been searched for or applied.

See [hosting choice and budget](pilot-hosting-choice.md) and
[Docker deployment preparation](pilot-deployment.md). No deployment, merge,
provider connection, purchase, invitation send, or catalog apply is automatic.

## First production project

A lyric video is still in progress, with possible
promotion afterward. This is a preparation project, not a published video or
approved campaign. The video link, finish date, release date, editor, review
owner and promotional budget are unknown. No live project has been created. The working title and private contact details
are kept in local activation notes, outside this public repository.

After activation, open Stalemate → Band operations → Projects and create
**Lyric video and promotion preparation** as a content campaign with
no target date. Record that the video is in progress and promotion is proposed.
Use manual milestones while dates are unknown; use the generated sequence only
after the real target date is agreed. Proposed work to review with the band:

| Next action | Completion evidence | Owner / date |
| --- | --- | --- |
| Confirm what remains in the lyric-video edit | Editor's remaining-work list and current review link | Unassigned / unset |
| Review lyrics, timing, credits and final export | Named reviewer's approval of the exact video version | Unassigned / unset |
| Agree release date and publishing account | Recorded decision and authorized account owner | Jeff coordinates / unset |
| Prepare promotion in StoryLiner | Reviewed captions, clips, artwork and channel plan linked here | Unassigned / unset |
| Approve publication and any promotion spend | Explicit approval before external action | Jeff / unset |
| Record the actual published URL and follow-up | Working public link, actual publication time, agreed review of results | Unassigned / unset |

These are proposed tasks, not reported assignments or approvals. StoryBoard
tracks readiness, owners, dates and evidence; StoryLiner owns promotional content.
Keep the video on its existing approved storage/video service and attach links;
no new video hosting, automatic posting, paid ads, or invented audience target.
This project can provide a useful first pilot before the next gig date is known,
but does not substitute for rehearsal, show-day or money field validation.

## Five-minute band onboarding

1. Jeff signs in at the approved URL, creates Rad Dad, then uses **Team → Manage
   another band** to create Stalemate. This creates empty, separate workspaces.
   Use the **Band** selector to check which workspace is open.
2. In each band's **Team**, create the correct email-bound invitation and copy
   its link. Share it personally. The app explicitly says no email was sent;
   an optional Gmail draft must still be sent by its human owner.
3. A bandmate opens that link on their phone, signs in with the invited Google
   account, and chooses **Join band**. A wrong account can be changed without
   losing the invitation. Accept separate invitations for separate bands.
4. Jeff uses **Manager → Member accounts** to link each
   recorded performer to the correct accepted account. Roles/instruments are
   recorded facts; names alone do not establish identity. The same person can
   have independent performer links in both bands.
5. A member opens **Tasks → My tasks**, then **Band operations** to respond to
   their rehearsal/show availability. Open the assigned set and day-of view.
   Refresh and confirm the saved result. Ask Manager one practical question.

Jeff's initial setup also includes the true booking, show timezone/contact,
advance checklist, approved setlist, and money records. That data-entry work
is separate from a bandmate's five-minute introduction. Import Vault using the
existing preview/apply flow only after reviewing the selected band's preview.
Do not rename one workspace to simulate the other or mix unrelated feeds.

## Fourteen-day operating trial

Day 1: Jeff and one bandmate independently sign in on their own phones. Check
both allowed workspaces; a band-specific member cannot read or write the other.
Confirm one performer/account link, owned task and availability response per
band. Jeff records the active version and URLs.

Days 2–7: use StoryBoard for actual rehearsal preparation and the next gig's
advance. Travis records the next booking follow-up and its due date. Every open
commitment has an owner and a next action, or a visible missing-owner blocker.
Save and reopen the correct assigned set; do not equate unknown durations with
a complete show length. Use the phone day-of view at rehearsal as a practice
run. Keep a human-readable copy of essential contact/schedule/set details if
venue connectivity fails; unsaved browser drafts are not offline storage.

Week 1 and week 2: Jeff reviews the Manager brief with Travis. Ask “What do I
need to do?”, “What is blocking our next show?”, “Who has not responded?”,
“What is Travis waiting on?”, and “What money is outstanding?” Compare each
answer with the actual band records and open its evidence links. Correct the
record or log the faulty answer; do not tune from invented results.

At the show: verify actual local times, contact, lineup, running order and
advance work on the phone. Afterward record actual revenue, expenses, payment
receipts, buyer outcome and lessons. Review the existing draft settlement
before finalization. An invoice/payment record is not a money transfer; a
settlement calculation is not proof somebody was paid.

Day 14: review outcomes. If a real gig did not occur, mark show-day and settlement
field validation pending and continue to the actual date. A rehearsal or
synthetic test may prove a workflow but cannot count as an actual gig.

## Success measures and owners

| Measure | Pilot acceptance | Owner |
| --- | --- | --- |
| Access | Jeff + Travis + a bandmate can independently open their allowed bands on phones | Jeff + each member |
| Ownership | All agreed pilot tasks have correct owners; each participating member completes one | Jeff + task owners |
| Availability | Every active lineup member's response or missing response is visible before rehearsal/show | Band coordinator |
| Follow-ups | Zero missed recorded follow-ups without an explicit reschedule/blocker; count and review misses | Travis |
| Show readiness | Exact show/set/contact/timing visible; every remaining gap acknowledged before the show | Band coordinator |
| Money | Recorded receipts/expenses agree with actual documents; outstanding amounts stay explicit per currency | Jeff/designated money owner |
| Reminders | Agreed reminder received by its intended person; no duplicate or mock treated as delivered | Jeff + recipient |
| Recovery | Backup exists privately; restore to an empty disposable database reproduces band facts | Deployment operator |

Proposed initial reminder routine: in-app daily check by members plus Jeff's
manual sharing of invitation links and urgent follow-ups. This is a proposal
until the band agrees and receipt is demonstrated. Optional Telegram urgent
alerts need separate owner setup and an actual receipt test. Do not promise
email reminders while the email channel only produces drafts.

## Evidence and decision

For each acceptance item record date, version, band, role, observed result and
next blocker without copying private tokens, catalogs or financial documents
into Git. Keep sensitive receipts in the band's approved private storage.
Labels: **engineering-ready** (automated and simulated checks pass), **activated**
(real URL/accounts/data/reminder routine verified), **field-validated** (the
band has actually completed the agreed rehearsal, show and follow-through).
Jeff makes the go/no-go decision for both bands from that evidence.
