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

**Default accounts created by seed:**

| Email | Password | Role |
|-------|----------|------|
| owner@barbershop.com | changeme123 | OWNER |
| ahmed@barbershop.com | barber123 | BARBER |

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

| Feature | OWNER | BARBER |
|---------|-------|--------|
| Dashboard (stats + charts) | ✅ | ✅ (own data) |
| New Visit | ✅ | ✅ |
| View Visits | ✅ (all) | ✅ (own) |
| Customers | ✅ | ✅ |
| Services catalog | ✅ | — |
| Barbers management | ✅ | — |
| Salaries & Penalties | ✅ | — |

---

## Useful Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run db:push      # Sync Prisma schema → DB
npm run db:seed      # Seed services + default accounts
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:generate  # Regenerate Prisma client
```
