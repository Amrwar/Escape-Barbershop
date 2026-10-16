# The phone app

The customer app for iPhone and Android, built with Expo (SDK 57) over the same API the
web app's customer screens use. Nothing about the shop's data lives here; it is a second
face on the same server.

## What it does so far

- **Sign in and sign up** with a phone number and password, exactly as on the web
- **Home** — the next appointment, "the usual" (their own habit with the free times nearest
  their hour, one tap to book), "is it worth walking down now" — the live queue when the
  shop runs one, otherwise what usually happens at this hour, labelled as a guide — the
  loyalty card when a reward is waiting, "how was it?"
  for the last cut they have not rated, anything else booked, running offers, the barbers
- **Book** — service, barber, time, confirm. Only times the server says are free, shown
  in the shop's time zone; a full day offers the waitlist instead of a dead end
- **Bookings** — upcoming and past, with cancelling, and any deposit still owed with the
  InstaPay number and reference one tap to copy
- **Profile** — who they are to the shop, the loyalty card, "tell a friend" with their
  code and an invite link that opens sign-up with it filled in, notifications, English or
  Arabic, dark or light, their own details — picture, name, the number they sign in
  with, birthday, password — and sign out
- **Your haircuts** — every visit the shop has on record, newest first, twenty at a time;
  each opens as a receipt they can send on WhatsApp or through the phone's share sheet
- **The price list** — open before signing in, as on the web
- **Notifications** — the same messages the shop already sends (booked, the reminder the
  day before, a chair opening up), on the phone; a tap opens the screen it is about

Everything the web app's customer screens do is now in the app.

## Notifications: what they need before they work

The server side is done: the app registers its Expo push token at `POST /api/mobile/push`,
and `sendPush` in `src/lib/push.ts` now writes to app phones as well as browsers, so every
existing notification reaches them without any change where it is sent. A phone that has
removed the app is forgotten the first time Expo says so.

On the phone, three things are still needed, all outside the code:

- **An EAS project in the shop's name** (`npx eas-cli@latest init`), whose id lands in
  `app.json` under `extra.eas.projectId`. Without it the app has no way to ask for a
  token, and the switch says "this version of the app cannot receive notifications yet".
- **A development or store build on Android.** Expo Go on Android cannot receive push
  since SDK 53; on iPhone, Expo Go can.
- **Apple and Google credentials** for the build, which EAS sets up on the first
  `eas build` once the shop's developer accounts exist.

`EXPO_ACCESS_TOKEN` on the server is optional; set it only if push security is turned on
for the EAS project.

## The look: Mashrabiya

Designed right to left first and mirrored for English, from the design directions at
<https://claude.ai/artifact/GL7bTUEgGcLAkvtCc32nrb> (05) and the sign-in concepts at
<https://claude.ai/artifact/1XnNSpi6TGQMXGJwiWtiE7> ("Bab", the door).

- **Colour** (`src/lib/theme.tsx`): plaster cream ground, indigo woodwork for the header
  band, tab bar and the card of stamps, teal for what is chosen or next, rust on the one
  action that books, lantern amber for the lattice. Dark mode turns the ground indigo and
  the action amber.
- **Type**: IBM Plex Sans Arabic for reading in both languages; headings and big numbers
  use `<T display>`, which is Reem Kufi in Arabic and Marcellus in English. Every font is
  bundled, one file per weight, because Android ignores `fontWeight` on a custom font.
- **Shape**: square cards with fine borders. The arch is kept for windows onto something:
  the next appointment's day, a barber, a free time, the sign-in door.
- **Ornament** (`src/components/ornament.tsx`): the Cairene eight-point star (two squares,
  one turned) as the lattice behind indigo surfaces and as the loyalty stamps.

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
until then, and cannot be changed once a store has seen it.

The icon, Android's adaptive and themed layers, the splash and the favicon are made from
the shop's logo by `node scripts/app-icons.mjs` (run from the repository root): the logo
in cream inside an amber-edged arch on the indigo lattice. Run it again if the logo
changes; it writes straight into `mobile/assets`.
