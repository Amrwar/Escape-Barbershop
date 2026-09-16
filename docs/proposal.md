# Proposal

## The idea

Escape already has a management system: visits are rung up, the drawer is reconciled,
salaries and commissions come out of the same figures, and the warehouse and expenses
feed the day's journal. What it does not have is the customer.

The proposal is to add the customer to the same system rather than beside it:

- **Customers** book from their phone, see their next appointment, and keep a history.
- **Barbers** see their own day, the customers coming, and what they are owed.
- **The shop** runs the floor: the diary, the walk-in queue, the till, the reports.

The point is not "a booking app". A shop that already knows what it sold does not need a
second system that also thinks it knows. One booking should become one visit, one
payment, one line in the barber's commission, one row in the owner's report — the same
record seen from different sides.

## Why one system

Booking products usually sit next to the till and never quite agree with it. Then the
day's takings say one thing, the calendar says another, and someone reconciles by hand
every night. Escape already has the harder half built — the money — so the booking work
should feed it rather than shadow it.

Concretely: an appointment holds a chair and quotes a price. When the customer sits down
and pays, that appointment becomes a `Visit` — the record the drawer, commissions and
reports already run on. Nothing is entered twice, and there is nothing to reconcile.

## What the customer sees

A small app, in Arabic or English, that does four things well:

1. Book: service, barber (or "any"), day, time, confirm.
2. See what is coming, and what has been.
3. Change or cancel, within the shop's rules.
4. Keep their details and their history.

No dashboard, no clutter. The first screen answers "when is my next haircut?" and gives
one obvious button.

## What the shop gets

- A diary that is always right, because free times come from the same rules the booking
  is saved with.
- Walk-ins and bookings in one queue and one set of figures.
- Every appointment that turns into money doing so exactly once.
- Reports that need no typing: they already come from what happened at the till.

## How it reaches phones

The customer app is part of the existing site first, so customers can use it from a link
straight away. The same API then serves a React Native app published to the App Store and
Google Play. That step needs an Apple Developer account (about $99 a year) and a Google
Play account (a one-off $25); the accounts, and the submission itself, have to be yours.

## What it is not

- Not a replacement for the management system — an extension of it.
- Not a multi-shop product. One shop, done properly. The model leaves room for a second
  branch later, but nothing is built for it now.
- Not a marketing website. The public site stays the shop window; the app is for people
  who have decided to come.

## The honest part

This is a large piece of work — months rather than weeks, at the level of finish being
asked for. It is being built in phases, each one tested and usable on its own, so the
shop gets value before the whole thing is finished and you can change direction between
phases. What is deliberately not promised is "everything at once, perfect": the way to get
something perfect is to get a smaller thing right, use it, then add to it.
