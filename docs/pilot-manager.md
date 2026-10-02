# Manager in the Rad Dad and Stalemate pilot

The five daily questions use recorded, deterministic answers even when optional
AI is enabled. They do not call a provider or propose a write. Select the right
band before asking; each answer names that band.

| Question | Evidence and next step |
| --- | --- |
| What do I need to do? | Open tasks assigned to the active performer linked to the signed-in account. Names and free-text owner labels do not establish identity. Review the named tasks, due dates, blockers and prerequisites in Tasks → My tasks. An owner must link an unlinked account in Manager → Band context first. |
| What is blocking our next show? | Nearest current/upcoming dated gig, its recorded readiness gaps, and linked task blockers. A rehearsal is not substituted for a show. Open the event to review its lineup, advance and day-of details. |
| Who has not responded? | Availability for the nearest current/upcoming dated event. Missing/unknown responses, tentative answers, and unavailable performers are separate. The active lineup defines the expected response list. Append “for our next rehearsal” or “for our next show” to narrow the event type. |
| What is Travis waiting on? | Waiting or blocked tasks assigned to a uniquely named active Travis, plus the earliest recorded open campaign follow-up. A missing person, opportunity, or deadline is explicit; a campaign draft is not delivery. Open Tasks or Pitch campaigns. No buyer interest, external reply, or personal task ownership is inferred. |
| What money is outstanding? | Recorded issued, partially paid and overdue invoices, with remaining balances grouped by currency. Draft settlements need review but are not added to receivables. Open Deals & money to reconcile records. A finalized settlement or net amount does not prove performer payment. |

Answers expose code-owned evidence links to existing screens. Those links are
saved with the Manager run and remain available when reopening a conversation.
They follow the existing band selection and route access checks; a link does not
silently switch bands. Hidden conversation evidence never becomes a link.

Manager's current view is bounded: at most 100 tasks, 30 active events, 30 open
opportunities, 30 campaign follow-ups, 30 unpaid invoices, and 20 draft
settlements. It is not a complete external ledger, inbox, schedule, or promise
that all obligations are known. Current facts must be recorded in the selected
band; stale active events and omitted records need review on their full screens.
Due dates use recorded UTC calendar days; event times use the recorded timezone.
No question above sends reminders, posts promotion, pitches Travis, books a
show, or transfers money.

Rad Dad and Stalemate may have separate real band workspaces. That decision is
independent of Vault's default import slice and parked catalogs. No approved
local Vault feed has been supplied for the pilot. Neither workspace authorizes
an import or selecting another band's repertoire; preview the authorized local
feed for the selected band before applying it. Demo records are test evidence,
not the bands' actual lineup, commitments, songs, or finances.

## Engineering checks and remaining field proof

`apps/api/test/manager-pilot-desk.test.mjs` covers the five answers, exact account
identity across two band contexts, missing facts, task sequencing, show/rehearsal
selection, availability states, same-day due dates, currencies, draft-delivery
honesty, safe destinations, private-evidence projection and provider bypass.
The existing Manager desk suite covers other schedule/invoice/catalog paths.

These are synthetic engineering checks. They do not establish a public URL,
real sign-in, reminder receipt, a correct real roster, or completed band work.
Once Jeff provides member invitations and actual events, Jeff, Travis and a
bandmate must ask these questions separately in both bands and verify the
named evidence against the real commitments. Readiness remains unactivated
until that work is done, and field validation requires actual use.
