"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { Avatar, EmptyState, ScreenTitle, Skeleton } from "@/components/customer/kit";
import { RatingBadge } from "@/components/customer/Stars";

interface Barber {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  serviceIds: string[];
  rating: { average: number | null; count: number };
  /** A few of their own cuts, shipped with the catalogue. */
  work?: string[];
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
        <div className="space-y-3">
          {barbers.map((b) => (
            <Link
              key={b.id}
              href={`/app/barbers/${b.id}`}
              className="c-card block overflow-hidden transition-colors hover:border-hair"
            >
              <div className="flex items-center gap-4 p-4">
                <Avatar name={b.name} photo={b.photo} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-medium text-ink">{b.name}</span>
                    <RatingBadge rating={b.rating ?? { average: null, count: 0 }} />
                  </div>
                  {/* Two lines rather than one truncated to nothing: a bio cut
                      off after four words says less than no bio at all. */}
                  {b.bio && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-soft">{b.bio}</p>}
                </div>
                <span className="shrink-0 text-faint">›</span>
              </div>

              {(b.work?.length ?? 0) > 0 && (
                <div className="grid grid-cols-3 gap-px border-t border-hair bg-line">
                  {b.work!.slice(0, 3).map((image, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={image} alt="" className="aspect-square w-full bg-surface object-cover" />
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
