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
