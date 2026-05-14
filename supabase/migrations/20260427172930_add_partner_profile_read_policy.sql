/*
  # Allow users to read their partner's profile

  ## Problem
  The profiles table only allows users to read their own row (auth.uid() = id).
  But the app needs to read the partner's profile to display their name and avatar
  on the home screen and score card.

  ## Change
  Add a SELECT policy on profiles that lets a user read any profile
  that belongs to someone they share a couple with (i.e., their partner).

  ## Security
  - Still restricted to authenticated users
  - Can only read the profile of someone in a shared couple row
  - Users cannot read arbitrary profiles outside their couple
*/

CREATE POLICY "Users can read their partner's profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT
        CASE
          WHEN user_a_id = auth.uid() THEN user_b_id
          ELSE user_a_id
        END
      FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND user_b_id IS NOT NULL
    )
  );
