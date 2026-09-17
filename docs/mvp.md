# MVP

What has to be true before Escape can run a day on this — customers booking, the shop
working from the diary, the money still adding up.

## The test it has to pass

> A customer books on their phone on Tuesday. On Saturday they arrive, the shop sees them
> in the diary, sits them down, rings them up, and that evening the drawer, the barber's
> commission and the owner's report all agree — with nobody typing anything twice.

Everything below is either needed for that sentence, or it is not in the MVP.

## In

**Customer**
- [x] Sign up and sign in with a phone number
- [x] Book: service → barber or "any" → day → time → confirm
- [x] See upcoming and past bookings
- [x] Cancel within the shop's window
- [x] Arabic and English, built for a phone

**Shop**
- [x] Opening hours, per day, with closed days
- [x] Service lengths, and which services may be booked online
- [x] A diary for any day: book, move, arrived, no-show, cancel
- [x] Booking rules: notice, buffer, how far ahead, slot grid
- [x] Walk-ins in the same diary, with a live queue
- [x] Ring up an appointment: it becomes the visit, once

**Owner**
- [x] Nothing double-booked, ever (enforced on save)
- [x] Money unchanged and still reconciling: drawer, card, InstaPay, commissions
- [x] Today at a glance: booked, walk-ins, completed, no-shows, takings

## Out, on purpose

Not because they do not matter — because they are not needed for that Saturday to work.

| Left out | Why, and when |
| --- | --- |
| SMS and WhatsApp reminders | Done another way: reminders go to the phone as notifications, free, since phase 3. A paid provider would only reach customers who never install the app |
| Loyalty, offers, reviews | Retention work. Worth doing once people are booking |
| Barber logins and their own screens | The shop runs the diary at first; barbers get screens in phase 3 |
| Deposits and paying online | Needs a payment gateway and a refund policy. Later, if ever |
| Native apps in the stores | Phase 4, and needs your developer accounts |
| Forgot-password for customers | Needs SMS to be safe. Until then the shop can reset it |
| Multi-branch | The model allows it; nothing is built for it |

## Done means

Not "the screen exists". For each item:

- the rule is a tested function, not logic inside a screen;
- the server refuses what the screen refuses, independently;
- both languages read properly, right-to-left included;
- it has been run end to end against a real database, not only unit-tested;
- money touched by it still reconciles.

## Where the MVP stands

**The MVP is complete.** The sentence at the top now holds: a customer books on their phone, the shop sees them in
the diary, seats them from the queue, rings them up, and the money lands once — in the
drawer, the commission and the report. What is left of the MVP is the owner's view of the
day at a glance, and counting no-shows.
