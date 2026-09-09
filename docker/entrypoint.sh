#!/bin/sh
# Bring the database up to the schema, seed it the first time, then start.
set -e

echo "> waiting for the database"
tries=0
until npx prisma db push --skip-generate >/tmp/dbpush.log 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "> database never became reachable:"
    cat /tmp/dbpush.log
    exit 1
  fi
  sleep 2
done
echo "> schema in sync"

# The core seed only upserts services, settings and the two accounts, so it is
# safe to run on every boot: existing accounts are never overwritten.
if [ "${SEED_ON_START:-1}" = "1" ]; then
  echo "> seeding services and accounts"
  npx tsx prisma/seed.ts
fi

# Demo data is opt-in, and refuses to touch a database that already has visits
# unless it is told to, so it can never quietly land on a real shop.
if [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "> seeding demo data"
  npx tsx prisma/seed-demo.ts
fi

echo "> starting the app on port ${PORT:-3000}"
exec "$@"
