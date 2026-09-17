"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { Avatar, EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";
import { RatingLine } from "@/components/customer/Stars";

interface Barber {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  serviceIds: string[];
  rating: { average: number | null; count: number };
}

/** The team, for a customer who has a favourite — most of them do. */
export default function BarbersPage() {
  const { t } = useTranslation();
  const [barbers, setBarbers] = useState<Barber[] | null>(null);

  useEffect(() => {
    fetch("/api/customer/catalog")
      .then((r) => r.json())
      .then((d) => setBarbers(Array.isArray(d?.barbers) ? d.barbers : []))
      .catch(() => setBarbers([]));
  }, []);

  return (
    <div className="space-y-5 pt-2">
      <ScreenTitle title={t("app.ourBarbers")} hint={t("app.ourBarbersHint")} />

      {barbers === null ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : barbers.length === 0 ? (
        <EmptyState icon="users" title={t("app.noBarbers")} />
      ) : (
        <div className="space-y-2">
          {barbers.map((b) => (
            <Link
              key={b.id}
              href={`/app/barbers/${b.id}`}
              className="c-card flex items-center gap-4 p-4 transition-colors hover:border-white/20"
            >
              <Avatar name={b.name} photo={b.photo} size={52} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white">{b.name}</div>
                {b.bio && <div className="mt-0.5 truncate text-xs text-white/45">{b.bio}</div>}
                <div className="mt-1">
                  <RatingLine rating={b.rating ?? { average: null, count: 0 }} />
                </div>
              </div>
              <span className="text-white/25">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
