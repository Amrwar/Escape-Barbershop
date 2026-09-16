# Escape Barbershop — documentation

Five documents, each answering a different question.

| Document | Answers |
| --- | --- |
| [Proposal](proposal.md) | What we are building, for whom, and why it is one system rather than three |
| [Design](design.md) | How it is put together: the data model, the rules, the decisions and their reasons |
| [MVP](mvp.md) | What "finished enough to use" means, and what is deliberately left out |
| [Roadmap](roadmap.md) | What is done, what is next, and what each phase needs from you |
| [Testing](testing.md) | The two suites, what they cover, and how to add to them |

**Start with the [roadmap](roadmap.md)** — it carries the ticked boxes and the open questions.

## Where things stand

The shop's management system has been running for a while: visits, the cash drawer,
expenses, advances, payroll, the warehouse and the reports. Customer booking is newer:
the booking rules, the shop's appointment screens and the customer app are built and
tested, and the till side of an appointment is next.

A phone app for the App Store and Google Play comes after that, built on the same API
the customer app already uses.

## For whoever works on this next

- `npm run dev` — the app on <http://localhost:3000>
- `npm test` — the rules (booking, payments, sessions, receipts), no database, seconds
- `npm run test:all` — those plus the API against a real Postgres (needs Docker)
- `docker compose up --build` — the whole thing with its own database and demo data

The money and booking rules live in `src/lib` as plain functions with tests
(`booking.ts`, `payments.ts`, `finance.ts`, `session-policy.ts`). They are the part worth
reading first: every screen is a view onto those.
