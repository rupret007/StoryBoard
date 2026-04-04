# StoryBoard membership invitations (phase 3B)

## Model

- Table **`ArtistMembershipInvite`**: `artistId`, normalized **`email`**, **`role`** (`ArtistMembershipRole`), **`tokenHash`** (SHA-256 of the raw token; raw token is never stored), **`status`** (`pending` | `accepted` | `revoked` | `expired`), **`expiresAt`**, **`createdByOperatorId`**, optional accept/revoke timestamps and **`acceptedOperatorId`**.
- Expiry defaults from **`INVITE_EXPIRY_DAYS`** in `.env` (default **14**).

## Who can do what

- **Create / list / revoke** invites: **owners** of the artist only (`RolePolicyService.assertOwner`).
- **Accept** an invite: any **signed-in** operator whose **email matches** the invite (case-insensitive, trimmed). Creates or updates **`ArtistMembership`** and refreshes **`sb_session`** with **`currentArtistId`** set to that artist.

## API (all require session except OAuth callbacks)

| Action | Method | Path | Notes |
| ------ | ------ | ---- | ----- |
| Create | `POST` | `/memberships/invites` | Body: `{ artistId, email, role }`. Response includes **`token`** and suggested **`acceptUrl`** (web `/onboarding?invite=…`). After create, **`invite.send`** is enqueued on BullMQ: a **Gmail draft** to the invitee (per-artist adapter, or mock) when the worker runs — see **Phase 4A** in `docs/workflow-automation.md`. |
| List pending | `GET` | `/memberships/invites?artistId=` | Owner only. Rows include **`deliveredAt`**, **`deliveryChannel`**, **`deliveryLastError`** for delivery status. |
| Revoke | `POST` | `/memberships/invites/:id/revoke` | Body: `{ artistId }`. |
| Accept | `POST` | `/memberships/invites/accept` | Body: `{ token }`. Sets session cookie. |

**Membership admin** (same module, owner only):

- `GET /memberships?artistId=` — roster with operator email/name.
- `PATCH /memberships` — body `{ artistId, operatorId, role }` (guardrails: cannot demote/remove sole owner).
- `DELETE /memberships?artistId=&operatorId=` — remove a member (not yourself).

## Onboarding without seed

- **`POST /onboarding/artist`** — body `{ name, slug? }`. Allowed only when the operator has **no** `ArtistMembership` rows. Creates **`Artist`** + **owner** membership, audits, and sets **`currentArtistId`** on the session cookie.

## Security notes

- **Token**: single use in practice (status moves to `accepted`); brute force mitigated by long random token + hash-at-rest.
- **Email binding**: accept checks the authenticated operator’s email against the invite; wrong account gets **400**.
- **CSRF**: mutating API requests in **production** should send **`Origin` or `Referer`** matching **`WEB_URL`**. Next.js **RSC** server fetches set **`Origin`** from **`WEB_URL`** in `serverApiFetch`. Development allows missing headers when `NODE_ENV !== "production"`.

## Audit actions

- `membership_invite.created`, `.revoked`, `.accepted`
- `invite.delivery.completed`, `invite.delivery.failed`, `invite.delivery.skipped` (automation worker)
- `artist_membership.upsert_via_invite`, role changes, removals, onboarding creates

See `docs/auth-operators.md` for the role capability map.
