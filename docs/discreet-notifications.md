# Discreet Notifications

Final behavior:

- **Discreet Notifications ON:** every non-system push displays `Warm Me Up` / `New Activity`.
- **Discreet Notifications OFF:** push notifications identify activity type only: `New Message`, `New Picture`, `New Video`, `New GIF`, `New Dare`, `New Wish`, with `New Activity` as the fallback.
- Push notifications never expose message text, captions, partner names, media previews/thumbnails, Dare/Wish content, emoji/reaction content, or other private content.
- Account settings retain the existing single Discreet Notifications toggle and existing info action; no additional privacy levels are introduced.
- System/account lifecycle notifications (partner connection and trial/subscription notices) remain explicit because they are operational notices rather than private partner content.
