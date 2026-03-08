

## Problem

The `capacitor.config.json` currently points to the Lovable development preview URL:
```json
"server": {
  "url": "https://cd533557-c028-42e7-82a8-0c9d79c4de7a.lovableproject.com?forceHideBadge=true",
  "cleartext": true
}
```

This URL is a **private development server** that requires Lovable authentication. When real users open the app from Google Play, it tries to load this URL, gets blocked by the auth gate, and shows "Not Found."

## Fix

Remove the `server` block from `capacitor.config.json` so the app loads from the locally built files (`dist/` folder) instead of the remote preview:

```json
{
  "appId": "app.lovable.cd533557c02842e782a80c9d79c4de7a",
  "appName": "Melo",
  "webDir": "dist"
}
```

## After the change

You will need to rebuild and re-upload to Google Play:

1. Pull the latest code from GitHub
2. Run `npm run build` to generate the `dist` folder
3. Run `npx cap sync` to copy the built files into the native project
4. Open Android Studio with `npx cap open android`
5. Build a new release APK/AAB from Android Studio
6. Upload the new bundle to Google Play internal testing

**Important note:** With the server URL removed, hot-reload from Lovable won't work during development. If you want hot-reload while developing, you can temporarily add the server block back, but **always remove it before building for the store.**

