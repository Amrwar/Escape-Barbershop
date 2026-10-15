# The phone app

The customer app for iPhone and Android, built with Expo (SDK 57) over the same API the
web app's customer screens use. Nothing about the shop's data lives here; it is a second
face on the same server.

## What it does so far

- **Sign in and sign up** with a phone number and password, exactly as on the web
- **Home** — the next appointment, anything else booked, running offers, the barbers
- **Book** — service, barber, time, confirm. Only times the server says are free, shown
  in the shop's time zone; a full day offers the waitlist instead of a dead end
- **Bookings** — upcoming and past, with cancelling, and any deposit still owed with the
  InstaPay number and reference one tap to copy
- **Profile** — who they are to the shop, English or Arabic, dark or light, sign out
- **The price list** — open before signing in, as on the web

Not yet: the usual, the busy card, loyalty, reviews, history, receipts, profile editing,
and push notifications.

## How it signs in

A browser keeps its login in a cookie; the app has no cookie jar it can rely on, so it
signs in at `POST /api/mobile/session` and gets back the very token NextAuth would have
put in the cookie. It keeps that in the phone's secure storage (Keychain / Keystore) and
sends it as `Authorization: Bearer` on every call. `getSession()` on the server reads
either, so every customer route works unchanged. Only customer logins can get a token.

The app renews the token (`GET /api/mobile/session`) each time it opens, so a customer
who opens it at least once a month stays signed in up to the same ninety-day cap a
browser has.

## Shared with the web app, not copied

- `../messages/en.ts` and `../messages/ar.ts` — every word on screen
- `../src/lib/customers.ts` — what counts as a valid phone number, and how one is shown
- `../src/lib/appointments.ts` — how an appointment's status is worded

Only plain functions with no imports are shared. `metro.config.js` adds those two
folders to what Metro watches.

## Running it

```sh
cd mobile
npm install
npx expo start
```

Open it with **Expo Go** on a phone, or an emulator. By default it talks to the demo
(`https://escape-barbershop-demo.vercel.app`), which holds only invented customers, so
nothing done in development touches the real shop. To point it at the web app running
on your own machine, put the computer's address on your network in `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:3100
```

The demo needs this branch deployed before sign-in works there: the token route is new.

### In a browser

For a quick look without a phone, against the local shop from `docker compose up`
(its own database and demo data, never the real shop):

```sh
DEV_API_PROXY=http://localhost:3100 EXPO_PUBLIC_API_URL=http://localhost:8081 npx expo start --web
```

The dev server passes `/api/*` through to the shop, so the page calls its own origin and
the API needs no CORS rules. The browser has no secure storage, so a login there lasts
until the tab closes. It is a preview; the phone is what ships.

## Checks

```sh
npx tsc --noEmit      # types
npx expo lint         # lint
npx expo-doctor       # dependencies match the SDK
```

CI runs all three and bundles for Android on every push.

`package.json` pins `react-native-reanimated`, `react-native-worklets` and `react-dom`
through `overrides` to the versions SDK 57 lists — `react-dom` by reference to its own
entry, which npm requires once a package is both a dependency and an override. Without
them `expo-router` pulls newer releases than the SDK allows, and every later
`npm install` fails on the conflict.
Remove them when moving to the next SDK, then run `npx expo install --fix`.

## Shipping it

Built and submitted with EAS (`npx eas-cli@latest build`, `submit`). This waits on the
shop's own developer accounts — Google Play ($25 once) and Apple ($99 a year), both in
the shop's name. The bundle id `com.escapebarbershop.app` in `app.json` is a placeholder
until then, and cannot be changed once a store has seen it. The icon and splash screen
are still Expo's defaults.
