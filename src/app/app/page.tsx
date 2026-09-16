"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { AppointmentCard, type CustomerAppointment } from "@/components/customer/AppointmentCard";

/** The first thing a customer sees: their next appointment, and a way to book. */
export default function CustomerHomePage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [upcoming, setUpcoming] = useState<CustomerAppointment[] | null>(null);

  useEffect(() => {
    fetch("/api/customer/appointments?scope=upcoming")
      .then((r) => r.json())
      .then((d) => setUpcoming(Array.isArray(d) ? d : []))
      .catch(() => setUpcoming([]));
  }, []);

  const next = upcoming?.[0];
  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {firstName ? `${t("app.greeting")} ${firstName}` : t("app.greeting")}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{t("app.greetingHint")}</p>
      </div>

      {upcoming === null ? (
        <div className="card h-36 animate-pulse bg-gray-100" />
      ) : next ? (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("app.nextAppointment")}</h2>
          <AppointmentCard appointment={next} highlight />
        </div>
      ) : (
        <div className="card p-6 text-center">
          <div className="text-3xl mb-2">✂️</div>
          <p className="text-sm text-gray-500 mb-4">{t("app.nothingBooked")}</p>
          <Link href="/app/book" className="btn-primary inline-flex">
            {t("app.bookNow")}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/book" className="card p-4 hover:border-primary-300 transition-colors">
          <Icon name="plus" className="w-5 h-5 text-primary-700 mb-2" />
          <div className="text-sm font-semibold text-gray-900">{t("app.bookAppointment")}</div>
          <div className="text-xs text-gray-500 mt-0.5">{t("app.bookAppointmentHint")}</div>
        </Link>
        <Link href="/app/appointments" className="card p-4 hover:border-primary-300 transition-colors">
          <Icon name="calendar" className="w-5 h-5 text-primary-700 mb-2" />
          <div className="text-sm font-semibold text-gray-900">{t("app.myAppointments")}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {upcoming && upcoming.length > 0 ? `${upcoming.length} ${t("app.upcomingCount")}` : t("app.historyHint")}
          </div>
        </Link>
      </div>

      {upcoming && upcoming.length > 1 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("app.alsoBooked")}</h2>
          <div className="space-y-2">
            {upcoming.slice(1).map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
