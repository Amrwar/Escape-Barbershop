# Roadmap

Ticked means built, tested and deployed. This is the page to keep current.

Last updated: 16 September 2026.

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

## Phase 3 — keeping customers (in progress)

- [x] Barber logins and their own day: schedule, their customers, their earnings
- [x] Customer notes the barber sees ("low fade, same as last time")
- [ ] Barber profiles in the customer app: photo, bio, book with them
- [ ] Reminders the day before, and a booking confirmation
- [ ] Offers, shown in the app
- [ ] Reviews after a visit

**Needs from you:** an SMS or WhatsApp provider (a monthly cost, plus a registered sender
name), and photos and a line of bio for each barber.

## Phase 4 — the phone apps

- [ ] React Native (Expo) app over the same API
- [ ] Push notifications instead of SMS where the app is installed
- [ ] Android build, then submission to Google Play
- [ ] iPhone build, then submission to the App Store

**Needs from you:** a Google Play account (one-off $25) and an Apple Developer account
($99 a year). The accounts must be in the shop's name, and only you can submit. I build the
apps and prepare the listings.

## Phase 5 — loyalty and depth

- [ ] Loyalty: points or visit counts, with rules you set
- [ ] Referrals and birthday offers
- [ ] Deeper reports: retention, busiest times, barber utilisation, new versus returning
- [ ] Customer segments for offers

## Kept in mind, not scheduled

- Deposits or paying online — needs a gateway and a refund policy
- A second branch — the model allows it; nothing is built for it
- Forgot-password for customers — safest once SMS exists; until then the shop resets it

---

## Quality

- [x] 262 tests: 116 on the rules, 146 on the API against a real database
- [x] Every endpoint tested for what it does *and* who it refuses
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

## How to try it

`docker compose up --build`, then <http://localhost:3000>. Sign in with the accounts printed
in the log; the customer app is at `/app`, and you can create a customer account from there
with any Egyptian mobile number.
