# Barbershop Manager

A production-ready web app to manage your barbershop — visits, customers, salaries, and more.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **PostgreSQL** via Prisma ORM
- **NextAuth.js** — credentials login with OWNER / BARBER roles
- Deployable to **Vercel**

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

Four rules decide where every figure lands:

1. **Expenses and advances are paid in cash or by visa.** Cash ones reduce the
   drawer, visa ones reduce the card account. Both are visible split in the day
   journal.
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

## Useful Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run db:push      # Sync Prisma schema → DB
npm run db:seed      # Seed services + default accounts
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:generate  # Regenerate Prisma client
```
