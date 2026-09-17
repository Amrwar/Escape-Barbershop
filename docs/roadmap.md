# Roadmap

Ticked means built, tested and deployed. This is the page to keep current.

Last updated: 17 September 2026.

---

## Phase 0 — the management system (done, running)

The shop has been using this for a while. Listed so the rest has context.

- [x] Visits, services, customers, barbers
- [x] Cash drawer: open, movements, close, reconcile, shift and day reports
- [x] Payment by cash, card, **InstaPay**, or any mix of the three
- [x] Expenses and advances, per account (cash / card / InstaPay)
- [x] Payroll: commissions, advances, penalties, attendance
- [x] Warehouse: purchases, suppliers, issue notes, stocktakes
- [x] Reports and the owner's overview, discounts, activity trail
- [x] Logins end after 2 hours, or 30 minutes idle, on shop devices

## Phase 1 — booking core (done)

- [x] **1a** Appointment model; opening hours, barber hours, time off, who does what;
      service lengths; the free-slot rules, tested including the summer clock change
- [x] **1b** Appointments API and the shop's diary: book, move, arrived, no-show, cancel;
      booking settings screen; no double-booking, enforced on save
- [x] **1c** Customer accounts by phone number; the customer app (`/app`): book, see, cancel,
      profile; staff and customers walled apart, with tests

## Phase 2 — the till side (done)

The piece that makes booking worth having: one appointment, one visit, one set of figures.

- [x] Ring up an appointment → it becomes a `Visit`, exactly once, carrying its lines
- [x] A customer who leaves without paying: closed as **done, not paid**, counted nowhere
- [x] Walk-ins: the same appointment as a booking, starting now, in a live queue
- [x] Live queue screen: in a chair, waiting with an estimated wait, expected today
- [x] Seat a customer: assign a barber and start them, one barber per chair
- [x] Today at a glance for the owner: booked, walk-ins, completed, no-shows, takings
- [x] No-shows counted, with what they cost, on the overview and in the day journal
- [x] Who appears in the customer app is the shop's choice, per person

## Phase 3 — keeping customers (done)

- [x] Barber logins and their own day: schedule, their customers, their earnings
- [x] Customer notes the barber sees ("low fade, same as last time")
- [x] Barber profiles in the customer app: photo, bio, book with them
- [x] Reminders the day before, and a booking confirmation — on the phone itself, free
- [x] Offers, shown in the app (a notice, never a price the till enforces)
- [x] Reviews after a visit: stars and a line, asked for on the phone the day after

Reminders go to the phone as a notification, not as a text message: there is nothing to
pay per message and no sender name to register. The customer turns them on once, from
their profile in the app. On an iPhone they must first add the app to the Home Screen —
Apple allows notifications only then — and the app says so plainly instead of failing
quietly. A booking is confirmed straight away, and a reminder goes out the evening before.

**Needs from you:** photos for each barber whenever you have them; the slots are already in
place, and a line of bio can be written on the barbers screen today. An SMS or WhatsApp
provider is no longer needed for reminders, and would only add reach to customers who
never install the app — worth revisiting once we see how many turn notifications on.

## Phase 4 — the phone apps

- [ ] React Native (Expo) app over the same API
- [x] Push notifications (already working in the web app; the phone apps inherit them)
- [ ] Android build, then submission to Google Play
- [ ] iPhone build, then submission to the App Store

**Needs from you:** a Google Play account (one-off $25) and an Apple Developer account
($99 a year). The accounts must be in the shop's name, and only you can submit. I build the
apps and prepare the listings.

## The app's look and the customer's own record (done)

- [x] **Brass & Ink** across the customer and barber apps: one set of tokens, square
      corners, hairline rules, brass on the one action that matters, and Bodoni on
      anything read as a number
- [x] Light and dark, switched in the header and remembered on that phone
- [x] The customer owns their record: their picture, name, the number they sign in with,
      and the birthday the shop wishes them on
- [x] The shop's till screens deliberately untouched — worked on for eight hours a day,
      and still white

## Phase 8 — the room itself (in progress)

- [x] The screen on the wall: the live queue, the wait, and today's offers
- [x] Barbers asking for their own time off, approved in a tap
- [ ] A barber's own portfolio of work on their profile

## Phase 7 — the counter (done)

- [x] Sell products on a visit: the money on the takings, the stock off the shelf
- [x] A waiting list when the day is full, offered to the first in line when
      somebody cancels
- [x] Deposits by InstaPay for the long, expensive services

## Phase 6 — the chair, filled (done)

Three things aimed at the customers the shop already has, rather than at finding
new ones.

- [x] **The usual** — their barber, their cut and the times nearest their hour,
      booked in one tap from the home screen
- [x] The owner's nightly digest on the phone: takings, no-shows, tomorrow
- [x] "It's been a while" — a nudge when a regular is past their own rhythm

## Phase 5 — loyalty and depth (done)

- [x] Loyalty: a punch card — a stamp per paid visit, a reward you describe
- [x] Referrals and birthday offers
- [x] Deeper reports: retention, busiest times, barber utilisation, new versus returning
- [x] Customer groups, and a notification the owner can send one of them

## Kept in mind, not scheduled

- Deposits or paying online — needs a gateway and a refund policy
- A second branch — the model allows it; nothing is built for it
- Forgot-password for customers — safest once SMS exists; until then the shop resets it

---

## Quality

- [x] 478 tests: 212 on the rules, 266 on the API against a real database
- [x] Every endpoint tested for what it does *and* who it refuses
- [x] A walk through the preview shop end to end (`npm run test:preview`), kept out of
      the suite so a green run means the code is sound rather than that Docker was up
- [ ] Tests for the screens themselves (clicking through a browser)

## Open questions

1. **Cancellation window** is 2 hours. Right for Escape?
0. **Who shows in the app** — new barbers appear by default. Turn anyone off on the
   barbers screen ("takes bookings in the customer app"); owners and managers with a
   login are hidden automatically.
2. **Three bookings at once** per customer. Enough?
3. **No-show policy** — does a customer who misses twice get blocked from booking online?
4. **Service lengths** are seeded estimates (haircut 30, beard 20, protein 120). They decide
   how many slots a day holds, so they are worth correcting on the services screen.
5. **Rewards are switched off until you set them up** — the loyalty card, referrals and
   birthdays all wait on Setup → Rewards, where you decide how many visits earn what.

## How to try it

`docker compose up --build`, then <http://localhost:3000>. Sign in with the accounts printed
in the log; the customer app is at `/app`, and you can create a customer account from there
with any Egyptian mobile number.
