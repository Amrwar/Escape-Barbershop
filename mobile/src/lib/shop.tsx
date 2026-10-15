import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

/**
 * The shop's own time zone. Every time this app shows — an appointment, a free
 * slot — is a time at the shop, so it is shown on the shop's clock whatever the
 * phone's is set to: a customer abroad booking for when they are home sees
 * 2:00 PM, not whatever 2:00 PM in Cairo is where they are standing.
 *
 * Read from the booking settings the shop keeps; Cairo until they arrive.
 */

export const FALLBACK_TIME_ZONE = "Africa/Cairo";

const ShopContext = createContext<{ timeZone: string }>({ timeZone: FALLBACK_TIME_ZONE });

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [timeZone, setTimeZone] = useState(FALLBACK_TIME_ZONE);

  useEffect(() => {
    api<{ booking?: { timezone?: string } }>("/api/customer/catalog")
      .then((d) => {
        if (d.booking?.timezone) setTimeZone(d.booking.timezone);
      })
      .catch(() => undefined);
  }, []);

  return <ShopContext.Provider value={{ timeZone }}>{children}</ShopContext.Provider>;
}

export function useShop() {
  return useContext(ShopContext);
}

/** The shop's calendar date for a moment, as YYYY-MM-DD. */
export function shopDateOf(moment: Date | number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}
