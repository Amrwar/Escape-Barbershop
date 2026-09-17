# Barbershop Manager

A production-ready web app to manage your barbershop — visits, customers, salaries, and more.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **PostgreSQL** via Prisma ORM
- **NextAuth.js** — credentials login with OWNER / BARBER roles
- Deployable to **Vercel**

---

## Run it with Docker

Nothing to sign up for and no API keys — the compose file brings its own
database:

```bash
docker compose up --build
```

Then open <http://localhost:3000>. On first boot the container pushes the schema,
seeds the services and accounts, and seeds six weeks of demo data, so the app
opens on a populated shop rather than empty tables. The accounts are printed in
the log and are, by default:

| Email | Password | Sees |
|-------|----------|------|
| `Admin@escape.com` | `demo-owner-1234` | Admin side and the till |
| `cashier@escape.com` | `demo-cashier-1234` | The till only |

Change those by setting `SEED_OWNER_PASSWORD` / `SEED_CASHIER_PASSWORD` in
`docker-compose.yml`, and set `SEED_DEMO: "0"` there to start with an empty shop
instead. `docker compose down -v` removes the database volume so the next boot
starts over.

The demo seed refuses to run against a database that already contains visits, so
it cannot quietly land on a real shop. Override with `DEMO_FORCE=1` only if that
is genuinely what you want.

---

## Quick Start (Local)

### 1. Prerequisites

- Node.js 18+
- PostgreSQL running locally (or use [Neon](https://neon.tech) for free cloud Postgres)

### 2. Clone & install

```bash
npm install
```

### 3. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/barbershop_manager?schema=public"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Set up the database

```bash
# Push schema to your database
npm run db:push

# Seed with services + default accounts
npm run db:seed
```

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Accounts:** the seed creates an owner (`Admin@escape.com`) and a sample
cashier (`cashier@escape.com`). No password is stored in this repository — the
seed prints the one it generates, or uses `SEED_OWNER_PASSWORD` /
`SEED_CASHIER_PASSWORD` if you set them. Existing accounts are never
overwritten.

Change passwords and add or remove staff logins inside the app, on the
**Account** screen. An owner sees the admin side; a cashier only ever sees the
till.

---

## Deploy to Vercel

1. Push to GitHub
2. Create a new Vercel project from the repo
3. Add environment variables in Vercel dashboard:
   - `DATABASE_URL` — use [Neon](https://neon.tech) or [Supabase](https://supabase.com) for hosted Postgres
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL` — your production URL (e.g. `https://mybarbershop.vercel.app`)
   - `CRON_SECRET` — any long random string. The nightly reminder run refuses
     anyone who does not send it; Vercel sends it automatically for scheduled
     calls. Without it the run still works, but the URL is open to anyone.
   - `PUSH_CONTACT` (optional) — `mailto:` address the push services can reach
     you at. Defaults to a placeholder.
   - `PUSH_PUBLIC_KEY` / `PUSH_PRIVATE_KEY` (optional) — the notification key
     pair. Left unset, the app makes one on first use and keeps it in the
     database, which is what you want unless you are moving an existing one.
4. Deploy

After deployment, run the seed against your production DB:
```bash
DATABASE_URL="your-prod-url" npm run db:seed
```

---

## Features

| Feature | OWNER | CASHIER |
|---------|-------|---------|
| Dashboard | full | today only |
| New visit / visits | yes | yes |
| Cash drawer | yes | yes (read) |
| Expenses (cash or visa) | yes | yes |
| Issue notes (main store to branch) | yes | yes |
| Admin console | yes | no |
| Reports, day journal | yes | no |
| Salaries, penalties, advances | yes | no |
| Purchases, suppliers, stocktake, stock balances | yes | no |
| Services, barbers, settings | yes | no |

Everything an owner needs is gathered on `/admin`.

## How the money is accounted for

Five rules decide where every figure lands:

1. **Expenses and advances are paid in cash, by visa or by InstaPay.** Cash ones
   reduce the drawer, visa ones the card account, InstaPay ones the InstaPay
   account. All three are visible split in the day journal.
2. **Penalties never touch the daily journal.** A penalty is deducted in the
   payroll sheet only. The same is true of a salary advance: the money leaves
   the drawer, but it is recovered from payroll, so it is never an expense.
3. **The warehouse feeds the journal.** A cash or visa purchase invoice posts an
   expense on its own date; a credit invoice posts nothing until the supplier is
   paid. Stock balances come from a single movement ledger (purchases in, issue
   notes between locations, usage out, stocktake adjustments), so a deleted
   document always reverses cleanly. A stocktake difference is reported at cost
   but never posted as an expense — the purchase was already expensed.
4. **Visa collections carry a commission.** Set the rate once in
   Settings → Finance; it is deducted from the card account and from net revenue
   everywhere. Cash pays no commission.
5. **Customers pay cash, visa, InstaPay, or any mix of the three.** InstaPay is a
   bank transfer: it pays no commission and never reaches the drawer, so it counts
   towards revenue but not towards the cash the drawer should hold. A tip that
   was not handed over in cash is paid to the barber out of the drawer.

## Useful Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run db:push      # Sync Prisma schema → DB
npm run db:seed      # Seed services + default accounts
npm run db:seed:demo # Add six weeks of demo visits, expenses, purchases, payroll
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:generate  # Regenerate Prisma client
```
