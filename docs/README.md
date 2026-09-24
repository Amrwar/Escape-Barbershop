# Escape Barbershop — documentation

**New here? Read the [overview](overview.md)** — the whole system in one document: what it
does, how it is built, how it is worked on, and where it stands. The rest go deeper on a
single question each.

| Document | Answers |
| --- | --- |
| [Overview](overview.md) | Everything, in one place. The one to hand somebody who has not seen this before |
| [Proposal](proposal.md) | What we are building, for whom, and why it is one system rather than three |
| [Design](design.md) | How it is put together: the data model, the rules, the decisions and their reasons |
| [MVP](mvp.md) | What "finished enough to use" means, and what is deliberately left out |
| [Roadmap](roadmap.md) | What is done, what is next, and what each phase needs from you |
| [Testing](testing.md) | The two suites, what they cover, and how to add to them |

**Start with the [roadmap](roadmap.md)** — it carries the ticked boxes and the open questions.

## Where things stand

Everything on the roadmap is built, tested and deployed except the phone apps.

The management system runs the shop as it always did — visits, the drawer, expenses,
advances, payroll, the warehouse, the reports. On top of it: customers book from their
phone and are rung up as one visit; the queue and the diary; barbers with their own day,
earnings and reviews; reminders and confirmations as phone notifications; a loyalty card,
referrals and birthdays; reviews; insight screens; customer groups the owner can message;
products sold at the till; a waiting list; deposits on the expensive work; a screen for
the wall; time off; portfolios; and a no-show policy that asks for a deposit rather than
barring anybody.

Most recently, the parts aimed at a shop that books nothing and walks everyone in: floor
reports and the cut a customer wants; barber logins by phone and PIN; reviews, "the usual"
and the busyness forecast all reading walk-in visits rather than appointments; a QR on
every receipt; the price list, the roster, a customer's own haircuts and a receipt they
can keep; barber photos; and each barber's own working hours.

What is left is **phase 4** — the same app published to Google Play and the App Store —
which waits on the shop's own developer accounts. The roadmap says what those cost.

A demo with invented data lives at <https://escape-barbershop-demo.vercel.app>.

## For whoever works on this next

- `npm run dev` — the app on <http://localhost:3100> (3100, not 3000: another project
  on this machine owns 3000, and two apps fighting over a port is a confusing
  half-hour every time)
- `npm test` — the rules (booking, payments, loyalty, reviews, sessions), no database, seconds
- `npm run test:all` — those plus the API against a real Postgres (needs Docker)
- `npm run test:preview` — a walk through the customer app against the demo shop
- `npm run docs:pdf` — rebuild the PDFs in `docs/pdf`
- `docker compose up --build` — the whole thing with its own database and demo data

The rules live in `src/lib` as plain functions with tests beside them — `booking.ts`,
`payments.ts`, `finance.ts`, `session-policy.ts`, `loyalty.ts`, `reviews.ts`,
`referrals.ts`, `birthdays.ts`, `segments.ts`, `insights.ts`. They are the part worth
reading first: every screen is a view onto those, and the server enforces them
independently of what any screen allows.

The two apps are dressed from one set of tokens at the top of `src/app/globals.css`.
Nothing in the customer or barber app names a colour of its own, which is what lets the
whole thing turn from night to day by swapping that block.
