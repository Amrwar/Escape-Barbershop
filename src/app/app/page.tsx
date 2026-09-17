"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { AppointmentCard, type CustomerAppointment } from "@/components/customer/AppointmentCard";
import { Avatar, EmptyState, ScreenTitle, SectionTitle, Skeleton } from "@/components/customer/kit";
import { ReviewPrompt, type Reviewable } from "@/components/customer/ReviewPrompt";
import { RatingLine } from "@/components/customer/Stars";

/**
 * Home answers one question — "when is my next haircut?" — and offers one
 * obvious way to make another. Everything else is a step down in weight.
 */

interface Offer {
  id: string;
  title: string;
  titleAr: string | null;
  price: number | null;
  wasPrice: number | null;
}

interface Barber {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  rating: { average: number | null; count: number };
}

interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  durationMinutes: number;
}

/** Morning, afternoon or evening, so the greeting sounds like a person. */
function greetingKey(): "app.goodMorning" | "app.goodAfternoon" | "app.goodEvening" {
  const hour = new Date().getHours();
  if (hour < 12) return "app.goodMorning";
  if (hour < 17) return "app.goodAfternoon";
  return "app.goodEvening";
}

export default function CustomerHomePage() {
  const { t, fmtCurrency, lang } = useTranslation();
  const { data: session } = useSession();
  const [upcoming, setUpcoming] = useState<CustomerAppointment[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [toRate, setToRate] = useState<Reviewable | null>(null);

  useEffect(() => {
    fetch("/api/customer/appointments?scope=upcoming")
      .then((r) => r.json())
      .then((d) => setUpcoming(Array.isArray(d) ? d : []))
      .catch(() => setUpcoming([]));
    fetch("/api/customer/catalog")
      .then((r) => r.json())
      .then((d) => {
        setServices(Array.isArray(d?.services) ? d.services.slice(0, 4) : []);
        setOffers(Array.isArray(d?.offers) ? d.offers.slice(0, 2) : []);
        setBarbers(Array.isArray(d?.barbers) ? d.barbers.slice(0, 6) : []);
      })
      .catch(() => setServices([]));
    // The last visit they have not said anything about yet — asked once, here,
    // and gone as soon as they answer or ignore it.
    fetch("/api/customer/reviews")
      .then((r) => r.json())
      .then((d: Reviewable[]) => setToRate(Array.isArray(d) ? (d.find((x) => x.canReview && !x.review) ?? null) : null))
      .catch(() => setToRate(null));
  }, []);

  const next = upcoming?.[0];
  const firstName = session?.user?.name?.trim()?.split(" ")[0];

  return (
    <div className="space-y-8 pt-2">
      <ScreenTitle
        title={firstName ? `${t(greetingKey())}, ${firstName}` : t(greetingKey())}
        hint={t("app.greetingHint")}
      />

      <section>
        {upcoming === null ? (
          <Skeleton className="h-44" />
        ) : next ? (
          <>
            <SectionTitle
              action={
                <Link href="/app/appointments" className="text-[11px] font-medium text-brass-300/90 hover:text-brass-200">
                  {t("app.seeAll")}
                </Link>
              }
            >
              {t("app.nextAppointment")}
            </SectionTitle>
            <AppointmentCard
              appointment={next}
              highlight
              actions={
                <>
                  <Link href="/app/appointments" className="c-btn-secondary flex-1">
                    {t("app.manage")}
                  </Link>
                  <Link href="/app/book" className="c-btn-primary flex-1">
                    {t("app.bookAnother")}
                  </Link>
                </>
              }
            />
          </>
        ) : (
          <EmptyState
            icon="scissors"
            title={t("app.nothingBooked")}
            hint={t("app.nothingBookedHint")}
            action={
              <Link href="/app/book" className="c-btn-primary">
                {t("app.bookNow")}
              </Link>
            }
          />
        )}
      </section>

      {toRate && (
        <section>
          <SectionTitle>{t("app.rate")}</SectionTitle>
          <ReviewPrompt item={toRate} onSaved={() => undefined} />
        </section>
      )}

      {upcoming && upcoming.length > 1 && (
        <section>
          <SectionTitle>{t("app.alsoBooked")}</SectionTitle>
          <div className="space-y-2">
            {upcoming.slice(1).map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/app/offers" className="text-[11px] font-medium text-brass-300/90 hover:text-brass-200">
                {t("app.seeAll")}
              </Link>
            }
          >
            {t("app.offers")}
          </SectionTitle>
          <div className="space-y-2">
            {offers.map((o) => (
              <Link
                key={o.id}
                href="/app/offers"
                className="c-card flex items-center justify-between gap-4 p-4 transition-colors hover:border-brass-400/40"
              >
                <span className="min-w-0 truncate font-medium text-white">{lang === "ar" && o.titleAr ? o.titleAr : o.title}</span>
                {o.price !== null && (
                  <span className="shrink-0 text-end">
                    <span className="font-semibold tabular-nums text-brass-300">{fmtCurrency(o.price)}</span>
                    {o.wasPrice !== null && (
                      <span className="ms-2 text-xs tabular-nums text-white/30 line-through">{fmtCurrency(o.wasPrice)}</span>
                    )}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {barbers.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/app/barbers" className="text-[11px] font-medium text-brass-300/90 hover:text-brass-200">
                {t("app.seeAll")}
              </Link>
            }
          >
            {t("app.ourBarbers")}
          </SectionTitle>
          <div className="scroll-clean -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
            {barbers.map((b) => (
              <Link key={b.id} href={`/app/barbers/${b.id}`} className="w-[84px] shrink-0 text-center">
                <Avatar name={b.name} photo={b.photo} size={64} />
                <div className="mt-2 truncate text-xs text-white/70">{b.name}</div>
                <div className="mt-1 flex justify-center">
                  <RatingLine rating={b.rating ?? { average: null, count: 0 }} size={11} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {services.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/app/book" className="text-[11px] font-medium text-brass-300/90 hover:text-brass-200">
                {t("app.seeAll")}
              </Link>
            }
          >
            {t("app.popularServices")}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {services.map((s) => (
              <Link key={s.id} href="/app/book" className="c-card p-4 transition-colors hover:border-white/20">
                <div className="truncate text-sm font-medium text-white">
                  {lang === "ar" && s.arabicName ? s.arabicName : s.name}
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[11px] text-white/40">
                    {s.durationMinutes} {t("appointments.minutesShort")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-brass-300">{fmtCurrency(s.defaultPrice)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <QuickLink href="/app/book" icon="plus" label={t("app.bookAppointment")} hint={t("app.bookAppointmentHint")} />
        <QuickLink href="/app/appointments" icon="calendar" label={t("app.myAppointments")} hint={t("app.historyHint")} />
      </section>
    </div>
  );
}

function QuickLink({ href, icon, label, hint }: { href: string; icon: IconName; label: string; hint: string }) {
  return (
    <Link href={href} className="c-card p-4 transition-colors hover:border-white/20">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-brass-400/15 text-brass-300">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-0.5 text-[11px] text-white/40">{hint}</div>
    </Link>
  );
}
