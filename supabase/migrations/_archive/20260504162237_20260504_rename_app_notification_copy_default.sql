/*
  # Update notification_copy default value

  Changes the default value of the notification_copy column in user_settings
  from 'New activity in Warmup' to 'New activity' to match the app rename
  from "Warmup" to "Warm Me Up".

  Also updates any existing rows that still have the old default so they
  pick up the new copy automatically.
*/

ALTER TABLE user_settings
  ALTER COLUMN notification_copy SET DEFAULT 'New activity';

UPDATE user_settings
  SET notification_copy = 'New activity'
  WHERE notification_copy = 'New activity in Warmup';
