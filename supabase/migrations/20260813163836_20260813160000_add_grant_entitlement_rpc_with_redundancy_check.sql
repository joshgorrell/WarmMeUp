/*
# Add grant_entitlement RPC with partner-coverage redundancy check

## Purpose
When an admin grants premium access to a user who is already connected to a
partner with premium access, the grant is redundant — the user already gets
`isPremium: true` via the "partner" source path in get-effective-subscription.
This RPC detects that situation and returns a warning so the admin UI can show
it, while still creating the grant (the admin may have a reason to override).

## Changes
1. New function `grant_entitlement(p_user_id, p_entitlement_type, p_expires_at, p_notes, p_can_invite)`
   - SECURITY DEFINER, search_path pinned to public
   - Checks caller is admin via is_current_user_admin()
   - Revokes any existing active grant for the user
   - Inserts the new grant
   - Checks whether the user is in an active couple whose partner already has
     premium access (own subscription, admin grant, or admin/super_admin flag)
   - Returns JSON with { success, grant_id, already_covered_by_partner, partner_name, warning }

## Security
- EXECUTE revoked from anon, granted to authenticated
- Caller must pass is_current_user_admin() check
- search_path pinned to public
*/

CREATE OR REPLACE FUNCTION public.grant_entitlement(
  p_user_id uuid,
  p_entitlement_type text DEFAULT 'free_access',
  p_expires_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_can_invite boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
  v_existing_grant_id uuid;
  v_new_grant_id uuid;
  v_partner_id uuid;
  v_partner_name text;
  v_partner_has_premium boolean := false;
  v_partner_sub_active boolean := false;
  v_partner_grant_active boolean := false;
  v_partner_is_admin boolean := false;
BEGIN
  -- Authorize the caller
  SELECT is_current_user_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate entitlement type
  IF p_entitlement_type NOT IN ('free_access', 'extended_trial', 'comped_subscription') THEN
    RAISE EXCEPTION 'Invalid entitlement type';
  END IF;

  -- Revoke any existing active grant for this user
  UPDATE admin_grants
  SET active = false
  WHERE user_id = p_user_id AND active = true
  RETURNING id INTO v_existing_grant_id;

  -- Insert the new grant
  INSERT INTO admin_grants (
    user_id, entitlement_type, expires_at, notes, active,
    granted_by, can_invite
  )
  VALUES (
    p_user_id, p_entitlement_type, p_expires_at, p_notes, true,
    v_caller_id, p_can_invite
  )
  RETURNING id INTO v_new_grant_id;

  -- Check if user is in an active couple with a partner who already has premium
  SELECT
    CASE WHEN c.user_a_id = p_user_id THEN c.user_b_id ELSE c.user_a_id END
  INTO v_partner_id
  FROM couples c
  WHERE c.active = true
    AND (c.user_a_id = p_user_id OR c.user_b_id = p_user_id)
    AND c.user_b_id IS NOT NULL
  LIMIT 1;

  IF v_partner_id IS NOT NULL THEN
    -- Get partner's display name
    SELECT display_name INTO v_partner_name FROM profiles WHERE id = v_partner_id;

    -- Check partner's own subscription
    SELECT EXISTS(
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = v_partner_id
        AND s.status = 'active'
        AND (s.expires_at IS NULL OR s.expires_at > now())
        AND s.plan IN ('monthly', 'yearly')
    ) INTO v_partner_sub_active;

    -- Check partner's active admin grant
    SELECT EXISTS(
      SELECT 1 FROM admin_grants g
      WHERE g.user_id = v_partner_id
        AND g.active = true
        AND (g.expires_at IS NULL OR g.expires_at > now())
    ) INTO v_partner_grant_active;

    -- Check partner is admin/super_admin
    SELECT EXISTS(
      SELECT 1 FROM profiles p
      WHERE p.id = v_partner_id
        AND (p.is_admin = true OR p.is_super_admin = true)
    ) INTO v_partner_is_admin;

    v_partner_has_premium := v_partner_sub_active OR v_partner_grant_active OR v_partner_is_admin;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'grant_id', v_new_grant_id,
    'revoked_grant_id', v_existing_grant_id,
    'already_covered_by_partner', v_partner_has_premium,
    'partner_name', v_partner_name,
    'warning', CASE WHEN v_partner_has_premium THEN
      'This user is already connected to a partner with premium access. The grant is redundant — they already have access through their partner.'
    ELSE NULL END
  );
END;
$$;

-- Revoke from anon, grant to authenticated
REVOKE EXECUTE ON FUNCTION public.grant_entitlement FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_entitlement TO authenticated;
