
ALTER TABLE user_settings
  ALTER COLUMN notification_copy SET DEFAULT 'New activity';

UPDATE user_settings
  SET notification_copy = 'New activity'
  WHERE notification_copy = 'New activity in Warmup';
