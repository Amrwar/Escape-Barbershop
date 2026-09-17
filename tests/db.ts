import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * A throwaway Postgres for the integration tests, so they run against the real
 * database engine rather than a mock — the place where the interesting bugs are.
 *
 * The container is started once, reused between runs while it is up, and left
 * running afterwards so a repeat run is quick. `npm run test:db:stop` removes it.
 * Nothing here ever touches the shop's real database: the connection string is
 * built from scratch and overrides whatever is in .env.
 *
 * On a build server there is already a Postgres beside the job and no Docker to
 * start one with, so TEST_DATABASE_URL takes over when it is set: the container
 * is skipped and that database is used instead.
 */

const CONTAINER = "escape-test-db";
const PORT = 55499;

/** A database handed to us — a CI service container — rather than one we start. */
const PROVIDED = process.env.TEST_DATABASE_URL?.trim() || null;

export const TEST_DATABASE_URL = PROVIDED ?? `postgresql://escape:escape@localhost:${PORT}/escape?schema=public`;

const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function isRunning(): boolean {
  try {
    return docker(["ps", "--filter", `name=^${CONTAINER}$`, "--format", "{{.Names}}"]) === CONTAINER;
  } catch {
    throw new Error("Docker does not appear to be running. Start Docker Desktop, or run `npm test` for the unit tests only.");
  }
}

/** A blocking pause that needs no console, unlike `timeout` on Windows. */
function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForPostgres() {
  for (let i = 0; i < 60; i++) {
    try {
      docker(["exec", CONTAINER, "pg_isready", "-U", "escape", "-d", "escape"]);
      return;
    } catch {
      sleepSync(1000);
    }
  }
  throw new Error("The test database did not come up in time.");
}

/** Starts the container if needed and brings the schema up to date. */
export function startTestDatabase() {
  if (!PROVIDED && !isRunning()) {
    try {
      docker(["rm", "-f", CONTAINER]);
    } catch {
      // nothing to remove
    }
    docker([
      "run", "-d", "--name", CONTAINER,
      "-e", "POSTGRES_USER=escape",
      "-e", "POSTGRES_PASSWORD=escape",
      "-e", "POSTGRES_DB=escape",
      "-p", `${PORT}:5432`,
      "postgres:16-alpine",
    ]);
    waitForPostgres();
  }

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
}

let client: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  }
  return client;
}

/**
 * Empties every table. Asks the database for the list rather than keeping one
 * here: a hand-written list silently goes stale when a model is added, and a
 * table left behind leaks rows from one test into the next.
 */
export async function resetDatabase() {
  await testPrisma().$executeRawUnsafe(`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO tables
        FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}
