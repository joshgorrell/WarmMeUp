# Chat activity cards

Wish, Dare, and Dice actions are surfaced directly in the couple's Chat timeline as tappable activity cards.

Implementation notes:
- Feature actions create system-style rows in `chat_messages` using the `__WMU_ACTIVITY__:` payload prefix.
- `MessageRow` recognizes those rows and renders `ActivityCard` instead of a normal text bubble.
- Cards deep-link to the originating Wish, Dare, or Dice interaction.
- Draft Wishes are not surfaced until they are shared.
- Existing Chat pagination and realtime subscriptions require no separate activity timeline.
