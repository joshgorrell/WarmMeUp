# RLS Policy Matrix — WarmMeUp

Generated from the live Supabase database (`pg_policies`) after the
`20260722000000_rls_consolidation_audit` migration.

This is the **single source of truth** for what RLS policies are in effect.
The `supabase/migrations/` folder contains 175 historical files (including 33
duplicate-timestamp re-applied migrations from 2026-05-18) and should NOT be
treated as authoritative — this document is.

## Legend

- **Scope**: `couple` = both partners via `couples.user_a_id`/`user_b_id`;
  `user` = own row via `auth.uid() = id`/`user_id`; `admin` = `is_current_user_admin()`
- **Intentionally absent**: operations marked "service-role-only" have NO
  authenticated policy by design. Deletion routes exclusively through the
  `delete-account` edge function running with the service role key (bypasses RLS).

---

## Sensitive Tables

### profiles
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Users can read own profile | user |
| SELECT | Users can read their partner's profile | couple (partner only) |
| SELECT | Admins can read all profiles | admin |
| INSERT | Users can insert own profile | user |
| UPDATE | Users can update own profile | user |
| UPDATE | Super-admins can grant or revoke admin privileges | super-admin |
| **DELETE** | **Intentionally absent** | **service-role-only via delete-account** |

### couples
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view their couple | couple |
| SELECT | Admins can read all couples | admin |
| INSERT | User can create couple as user_a | user |
| UPDATE | Couple members can update their couple | couple |
| UPDATE | Admins can update any couple | admin |
| DELETE | Creator can delete their own pending invite | user (user_a, user_b IS NULL) |

### user_settings
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Users can read own settings | user |
| INSERT | Users can insert own settings | user |
| UPDATE | Users can update own settings | user |
| **DELETE** | **Intentionally absent** | **service-role-only via delete-account** |

### interactions
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view their interactions | couple |
| SELECT | Admins can read all interactions | admin |
| INSERT | Couple members can insert interactions | couple + sender |
| UPDATE | Couple members can update interactions | couple |
| DELETE | Couple members can delete interactions | couple |

### chat_messages
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can read messages | couple |
| INSERT | Couple members can send messages | couple + sender |
| UPDATE | Couple members can update messages | couple |
| DELETE | Couple members can delete messages | couple |

### vault_items
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can read vault items | couple |
| INSERT | Couple members can upload vault items | couple + uploader |
| UPDATE | Couple members can update vault items | couple |
| UPDATE | Couple members can mark vault items viewed | couple |
| DELETE | Couple members can delete vault items | couple |

### scores
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view scores | couple |
| INSERT | Couple members can insert scores | couple + user |
| UPDATE | Couple members can update scores | couple + user |
| **DELETE** | **Intentionally absent** | **One row per (couple_id, user_id), updated in place. FK couple_id → couples(id) ON DELETE CASCADE handles unpairing.** |

### point_events
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view point events | couple |
| INSERT | Couple members can insert point events | couple + user |
| **UPDATE** | **Intentionally absent** | **Immutable ledger — no updates allowed** |
| DELETE | Couple members can delete point events | couple |

### monthly_scores
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view monthly scores | couple |
| INSERT | Couple members can insert monthly scores | couple + user |
| UPDATE | Couple members can update monthly scores | couple + user |
| DELETE | Couple members can delete monthly scores | couple |

### cash_in_events
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can read cash in events | couple |
| INSERT | Couple members can insert cash in events | couple |
| **UPDATE** | **Intentionally absent** | **Immutable ledger — no updates allowed** |
| DELETE | Couple members can delete cash in events | couple |

### wishes
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view their wishes | couple |
| SELECT | Admins can read all wishes | admin |
| INSERT | Couple members can create wishes | couple + creator |
| UPDATE | Couple members can update wishes | couple |
| DELETE | Couple members can delete wishes | couple |

### wish_reactions
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can read wish reactions | couple |
| INSERT | Couple members can insert wish reactions | couple + user |
| UPDATE | Couple members can update wish reactions | couple + user |
| DELETE | Couple members can delete wish reactions | couple + user |

### media_reactions
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can read media reactions | couple |
| INSERT | Couple members can insert own media reactions | couple + user |
| UPDATE | Couple members can update own media reactions | couple + user |
| DELETE | Couple members can delete own media reactions | couple + user |

### dice_prompts
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view their dice prompts | couple + defaults |
| INSERT | Admins can insert default dice prompts | admin |
| INSERT | Couple members can insert own dice prompts | couple + creator, is_default=false |
| UPDATE | Admins can update default dice prompts | admin |
| UPDATE | Couple members can update their couple dice prompts | couple, is_default=false, active |
| DELETE | Admins can delete default dice prompts | admin |
| DELETE | Couple members can delete their couple dice prompts | couple, is_default=false, active |

### dare_prompts
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view dare prompts | couple + defaults |
| INSERT | Admins can insert default dare prompts | admin |
| INSERT | Couple members can insert own dare prompts | couple + creator, is_default=false |
| UPDATE | Admins can update default dare prompts | admin |
| UPDATE | Couple members can update their couple dare prompts | couple, is_default=false, active |
| DELETE | Admins can delete default dare prompts | admin |
| DELETE | Couple members can delete their couple dare prompts | couple, is_default=false, active |

### tell_me_prompts
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view tell me prompts | couple + defaults |
| INSERT | Admins can insert default tell me prompts | admin |
| INSERT | Couple members can insert own tell me prompts | couple + creator, is_default=false |
| UPDATE | Admins can update default tell me prompts | admin |
| UPDATE | Couple members can update their couple tell me prompts | couple, is_default=false, active |
| DELETE | Admins can delete default tell me prompts | admin |
| DELETE | Couple members can delete their couple tell me prompts | couple, is_default=false, active |

### decline_prompts
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can view decline prompts | couple |
| INSERT | Couple members can insert decline prompts | couple |
| UPDATE | Couple members can update decline prompts | couple |
| DELETE | Couple members can delete decline prompts | couple |

### activity_events
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Couple members can read their activity events | actor or target |
| INSERT | Actor can insert own activity events | actor |
| UPDATE | Target user can mark events as read | target |
| DELETE | Couple members can delete activity events | couple |

### activity_views
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Users can read own activity views | user |
| INSERT | Users can insert own activity views | user |
| **UPDATE** | **Intentionally absent** | **Write-once — no updates needed** |
| DELETE | Couple members can delete activity views | couple |

### admin_grants
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Admins can read all admin grants | admin |
| SELECT | Users can read own admin grants | user |
| INSERT | Admins can insert admin grants | admin |
| UPDATE | Admins can update admin grants | admin |
| DELETE | Super admins can delete admin grants | super-admin |

### reports
| Op | Policy | Scope |
|----|--------|-------|
| **SELECT** | **Intentionally absent** | **Admin-only — read via service role in admin screens** |
| INSERT | Users can submit reports | user |
| **UPDATE** | **Intentionally absent** | **Admin-only — managed via service role** |
| **DELETE** | **Intentionally absent** | **Admin-only — managed via service role** |

### subscriptions
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Users can read own subscription | user |
| SELECT | Admins can read all subscriptions | admin |
| INSERT | Users can insert own subscription | user |
| UPDATE | Users can update own subscription | user |
| **DELETE** | **Intentionally absent** | **service-role-only via delete-account** |

---

## Storage Buckets

All storage policies are on the `storage.objects` table, scoped by `bucket_id`.

### avatars
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Users can read their own avatars | user (folder = uid) |
| INSERT | Users can upload their own avatar | user (folder = uid) |
| UPDATE | Users can update their own avatar | user (folder = uid) |
| DELETE | Users can delete their own avatar | user (folder = uid) |

### chat_media
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Chat media: couple members can read media | couple (folder[1] = couple_id) |
| INSERT | Chat media: couple members can upload to own path | couple + uploader (folder[2] = uid) |
| UPDATE | Chat media: uploaders can update own media | couple + uploader (folder[2] = uid) |
| DELETE | Chat media: uploaders can delete own media | couple + uploader (folder[2] = uid) |

### vault
| Op | Policy | Scope |
|----|--------|-------|
| SELECT | Vault: couple members can read media | couple (folder[1] = couple_id) |
| INSERT | Vault: couple members can upload to own path | couple + uploader (folder[2] = uid) |
| UPDATE | Vault: uploaders can update own media | couple + uploader (folder[2] = uid) |
| DELETE | Vault: uploaders can delete own media | couple + uploader (folder[2] = uid) |

---

## Edge Functions — Couple Membership Verification

| Function | JWT | Couple check | Admin check |
|----------|-----|-------------|-------------|
| notify-partner | yes | yes (user_a_id/user_b_id) | n/a |
| notify-screenshot | yes | yes (user_a_id/user_b_id) | n/a |
| get-effective-subscription | yes | yes (or user_a/user_b lookup) | n/a |
| confirm-subscription | yes | n/a (self-scoped) | n/a |
| delete-account | yes | n/a (self-scoped, service role) | n/a |
| send-test-push | yes | n/a (self-scoped) | n/a |
| analytics-overview | yes | n/a | yes (is_admin) |
| analytics-couple-health | yes | n/a | yes (is_admin) |
| analytics-chat | yes | n/a | yes (is_admin) |
| analytics-trials | yes | n/a | yes (is_admin) |
| analytics-cancellations | yes | n/a | yes (is_admin) |
| weather | no | n/a | n/a (public) |
| ai-ops-* | no | n/a | n/a (internal) |

---

## Consolidation History

On 2026-07-22, migration `20260722000000_rls_consolidation_audit` dropped
redundant broader PERMISSIVE policies that were making stricter policies
ineffective. Affected tables:

- **couples**: dropped `select_own_or_pending_couples` (kept member + admin)
- **dare_prompts**: dropped broad DELETE/INSERT/UPDATE (kept admin + strict couple)
- **dice_prompts**: dropped broad DELETE/INSERT/UPDATE (kept admin + strict couple)
- **tell_me_prompts**: dropped broad DELETE/INSERT/UPDATE (kept admin + strict couple)
- **interactions**: dropped `Sender can soft-delete own interaction` (redundant with couple UPDATE)
- **media_reactions**: dropped `Couple members can delete media reactions` (kept user-scoped)

The 33 duplicate-timestamp migration files from 2026-05-18 remain in
`supabase/migrations/` for historical reference but are NOT authoritative.
This document reflects the live database state after consolidation.
