# notify-partner privacy behavior

The server is authoritative for notification copy. Client payload fields such as `message_text` and `emoji` are intentionally ignored when composing private partner push notifications.

When Discreet Notifications is enabled, non-system notifications always use `New Activity`. When disabled, the function returns only a safe activity-type label. For chat media, the function looks up the sender's newest chat message to determine photo/video/GIF without exposing its content.
