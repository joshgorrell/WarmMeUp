/*
  # Add DELETE Policy for Pending Couples

  ## Summary
  Allows the couple creator (user_a_id) to delete their own pending invite row
  before a partner has accepted. This enables the "Cancel invite" feature.

  ## Security Rules
  - Only the row creator (user_a_id = auth.uid()) may delete
  - Only allowed while the couple is still inactive (active = false)
  - Once a partner accepts (active = true) the row is protected — users must
    use the "Leave partner" flow (which deactivates rather than deletes)
*/

CREATE POLICY "Creator can delete their own pending invite"
  ON couples FOR DELETE
  TO authenticated
  USING (auth.uid() = user_a_id AND active = false);
