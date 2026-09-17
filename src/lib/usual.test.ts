import { describe, expect, it } from "vitest";
import { nearestTimes, usualFor } from "./usual";

/** Cairo is UTC+3 in September, so 12:00 UTC is 15:00 in the shop. */
const at = (iso: string) => new Date(iso);

const served = (startAt: string, barberId: string | null, serviceIds: string[], status = "COMPLETED") => ({
  startAt: at(startAt),
  status,
  barberId,
  serviceIds,
});

describe("reading somebody's habit", () => {
  it("says nothing until they have been in twice", () => {
    expect(usualFor([served("2026-08-01T12:00:00Z", "abdullah", ["haircut"])])).toBeNull();
  });

  it("offers the barber and the cut they usually have", () => {
    const usual = usualFor([
      served("2026-06-01T12:00:00Z", "abdullah", ["haircut"]),
      served("2026-07-01T12:00:00Z", "abdullah", ["haircut"]),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual).toMatchObject({ barberId: "abdullah", serviceIds: ["haircut"], from: 3 });
  });

  it("keeps a pair of services together, because that is what they book", () => {
    const usual = usualFor([
      served("2026-06-01T12:00:00Z", "abdullah", ["haircut", "beard"]),
      served("2026-07-01T12:00:00Z", "abdullah", ["haircut", "beard"]),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual?.serviceIds).toEqual(["beard", "haircut"]);
  });

  it("follows them when they change barber, rather than following the count", () => {
    // Two old ones with Khaled, three recent with Abdullah.
    const usual = usualFor([
      served("2025-01-01T12:00:00Z", "khaled", ["haircut"]),
      served("2025-02-01T12:00:00Z", "khaled", ["haircut"]),
      served("2026-06-01T12:00:00Z", "abdullah", ["haircut"]),
      served("2026-07-01T12:00:00Z", "abdullah", ["haircut"]),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual?.barberId).toBe("abdullah");
  });

  it("breaks a tie towards the more recent one", () => {
    const usual = usualFor([
      served("2026-06-01T12:00:00Z", "khaled", ["haircut"]),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual?.barberId).toBe("abdullah");
  });

  it("counts a haircut they left without paying for — they still had it", () => {
    const usual = usualFor([
      served("2026-07-01T12:00:00Z", "abdullah", ["haircut"], "COMPLETED_UNPAID"),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual?.from).toBe(2);
  });

  it("ignores what was cancelled or missed — it says nothing about a habit", () => {
    const usual = usualFor([
      served("2026-06-01T12:00:00Z", "khaled", ["protein"], "CANCELLED"),
      served("2026-06-15T12:00:00Z", "khaled", ["protein"], "NO_SHOW"),
      served("2026-07-01T12:00:00Z", "abdullah", ["haircut"]),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual).toMatchObject({ barberId: "abdullah", serviceIds: ["haircut"], from: 2 });
  });

  it("reads their hour in shop time, not the server's", () => {
    // 12:00 UTC is 15:00 in Cairo, which is the hour they would say.
    const usual = usualFor([
      served("2026-07-01T12:00:00Z", "abdullah", ["haircut"]),
      served("2026-08-01T12:00:00Z", "abdullah", ["haircut"]),
    ]);

    expect(usual?.hour).toBe(15);
  });

  it("takes the middle hour, so one odd early visit does not move it", () => {
    const usual = usualFor([
      served("2026-06-01T08:00:00Z", "abdullah", ["haircut"]), // 11:00 Cairo
      served("2026-07-01T17:00:00Z", "abdullah", ["haircut"]), // 20:00
      served("2026-08-01T16:00:00Z", "abdullah", ["haircut"]), // 19:00
    ]);

    expect(usual?.hour).toBe(19);
  });

  it("still offers the cut when they have never asked for a particular barber", () => {
    const usual = usualFor([
      served("2026-07-01T12:00:00Z", null, ["haircut"]),
      served("2026-08-01T12:00:00Z", null, ["haircut"]),
    ]);

    expect(usual).toMatchObject({ barberId: null, serviceIds: ["haircut"] });
  });
});

describe("the times to offer them", () => {
  const day = [
    "2026-09-19T08:00:00Z", // 11:00 Cairo
    "2026-09-19T11:00:00Z", // 14:00
    "2026-09-19T12:00:00Z", // 15:00
    "2026-09-19T13:30:00Z", // 16:30
    "2026-09-19T19:00:00Z", // 22:00
  ];

  it("puts the nearest to their usual hour first", () => {
    const times = nearestTimes(day, 15);
    expect(times[0]).toBe("2026-09-19T12:00:00.000Z");
    expect(times[1]).toBe("2026-09-19T11:00:00.000Z");
  });

  it("offers three by default, and no more than there are", () => {
    expect(nearestTimes(day, 15)).toHaveLength(3);
    expect(nearestTimes(day.slice(0, 2), 15)).toHaveLength(2);
    expect(nearestTimes([], 15)).toHaveLength(0);
  });

  it("gives the earliest of two equally distant times", () => {
    // 14:00 and 16:00 are both an hour from 15:00.
    const times = nearestTimes(["2026-09-19T11:00:00Z", "2026-09-19T13:00:00Z"], 15, "Africa/Cairo", 1);
    expect(times[0]).toBe("2026-09-19T11:00:00.000Z");
  });
});
