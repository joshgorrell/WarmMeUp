# Project Instructions

## Deployment Label Requirement

After every code change, always end the response with a clear deployment label:

**OTA update** (`eas update --branch production`) — JS, UI, text, query, or logic changes only.

**New EAS build required** (`eas build --profile production`) — required for any of the following:
- Native dependency changes (new/updated packages with native code)
- Expo SDK version changes
- `app.json` native config changes (scheme, bundleIdentifier, etc.)
- Permissions (new or changed)
- Icons or splash screen
- Push notification config
- In-app purchases / StoreKit
- iOS capabilities or entitlements
- Anything involving Pods or Xcode project files
- Adding or updating Expo config plugins

## Avatar + Responsive Layout Requirements

### 1. Avatar must always render correctly
- Avatar must be perfectly circular — use `borderRadius: dim / 2` on both the `View` and `Image`.
- `Image` must use `resizeMode="cover"` (as a prop, not a style) to prevent letterboxing.
- If `uri` is missing or `null`, show an initials fallback (`name?.[0].toUpperCase()`), never a broken image.
- Avatar size in headers must be fixed (40–44px rendered diameter) — never flex-sized.
- The wrapping `View` must have `flexShrink: 0` so it cannot be squeezed by adjacent text.

### 2. Prevent text overlap in chat and screen headers
The header row must follow this layout contract:

```
<BackButton flexShrink=0 /> <Avatar flexShrink=0 /> <NameView flex=1 minWidth=0 /> <Actions flexShrink=0 />
```

- Name text: `numberOfLines={1}` and `ellipsizeMode="tail"` — truncate with ellipsis, never overflow.
- Name wrapper `View`: `flex: 1` and `minWidth: 0` — allows it to shrink and give space to fixed elements.
- Action icons (call, video, etc.): `flexShrink: 0` — never compress or get pushed off-screen.

### 3. Support larger accessibility text sizes
- Message bubbles must expand vertically — no fixed heights on bubble content.
- Bubble text must wrap naturally; never set `numberOfLines` on message body text.
- Composer input must grow vertically within a sensible cap (e.g. `maxHeight: 120`).
- Bottom tab labels must not collide with icons — use `Math.min(computed, cap)` for dynamic font sizes.
- Names and labels in headers always truncate with ellipsis rather than overlapping other elements.

### 4. Composer input row layout
- `TextInput` must have `flex: 1` and `minWidth: 0` so it fills available space without overflowing.
- Attach (image/camera) and send buttons must have fixed `width`/`height` (44px minimum) and `flexShrink: 0`.
- Minimum touch target for all interactive elements: 44×44pt. Use `hitSlop` if the visual is smaller.
- Multiline input must have `maxHeight` set (120px) to cap growth and keep send button always visible.
- The `inputRow` container must use `alignItems: "flex-end"` so the send button stays bottom-aligned as the input grows.

### 5. Test cases for every chat/header UI change
Before marking complete, verify the layout holds for:
- Short partner name (e.g. "Jo")
- Long partner name (e.g. "Alexandrina Worthington")
- Missing/null avatar (initials fallback must show)
- Large iOS Dynamic Type size (Settings > Accessibility > Larger Text)
- Long typed message (20+ words — input must grow, send button must stay visible)
- Small screen width (iPhone SE — 375pt)
