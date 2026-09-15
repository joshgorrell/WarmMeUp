# Implementation summary

The notification copy decision is centralized in the `notify-partner` Edge Function. The client notification API remains unchanged. For chat media, the server resolves the sender's latest chat message to determine picture, video, or GIF. This avoids expanding the client payload and ensures private message content is ignored by notification rendering.
