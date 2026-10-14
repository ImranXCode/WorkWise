# workplace-monitor

React + TypeScript + Vite web app: role-based attendance system with
liveness face detection (via `@vladmandic/face-api` + a converted
TensorFlow.js MobileNetV2 anti-spoofing model) and Supabase for auth/data.

## Setup, in order

1. Install Node.js if you don't have it (nodejs.org).
2. Delete `node_modules` and `package-lock.json` if they already exist
   from a previous attempt (avoids stale/broken installs).
3. `npm install`
4. **`sync-face-models.bat`** -- copies the face detection model files
   bundled inside `@vladmandic/face-api` into `public/models/face-api`,
   so they match the library version exactly. Run this every time you
   reinstall dependencies or upgrade `@vladmandic/face-api`.
5. `npm run dev` -- starts the local dev server (usually
   http://localhost:5173).

## Notes

- The liveness (anti-spoofing) model lives in `public/models/liveness/`
  (converted from a Python-trained MobileNetV2 model via
  `tensorflowjs_converter`). See `public/models/liveness/README.md`.
- `.env` holds your Supabase project URL/key -- keep this private, never
  commit it or share the zip publicly.
- If you see `face-api`-related "is not a function" errors in the
  browser console, it usually means a duplicate/mismatched TensorFlow.js
  version got installed -- delete `node_modules` and reinstall.
- If face detection silently finds "No face detected" despite a clear
  face in frame, re-run `sync-face-models.bat` -- the model weight files
  need to exactly match the installed `@vladmandic/face-api` version.
