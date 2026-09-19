"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";

/**
 * The price list, on its own.
 *
 * Every price the shop charges was already in the app — but only inside step
 * one of a four-step booking wizard, or cut down to four on the home screen.
 * "What does a beard trim cost" is the most ordinary question a customer has
 * and it should not require starting a booking to answer.
 */

interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  durationMinutes: number;
}

export default function PricesPage() {
  const { t, lang, fmtCurrency } = useTranslation();
  const [services, setServices] = useState<Service[] | null>(null);

  useEffect(() => {
    fetch("/api/customer/catalog")
      .then((r) => r.json())
      .then((d) => setServices(Array.isArray(d?.services) ? d.services : []))
      .catch(() => setServices([]));
  }, []);

  const name = (s: Service) => (lang === "ar" && s.arabicName ? s.arabicName : s.name);

  return (
    <div className="space-y-6">
      <ScreenTitle title={t("prices.title")} hint={t("prices.hint")} />

      {services === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <EmptyState icon="scissors" title={t("prices.none")} hint={t("prices.noneHint")} />
      ) : (
        <>
          <div className="c-card divide-y divide-hair">
            {services.map((service) => (
              <div key={service.id} className="flex items-baseline justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{name(service)}</div>
                  <div className="text-xs text-soft">
                    {service.durationMinutes} {t("appointments.minutesShort")}
                  </div>
                </div>
                <div className="c-display shrink-0 text-lg leading-none text-accent">
                  {fmtCurrency(service.defaultPrice)}
                </div>
              </div>
            ))}
          </div>

          {/* The price list is a guide; the till charges what the shop decides. */}
          <p className="text-center text-xs text-faint">{t("prices.guide")}</p>

          <Link href="/app/book" className="c-btn-primary block w-full text-center">
            {t("app.navBook")}
          </Link>
        </>
      )}
    </div>
  );
}
