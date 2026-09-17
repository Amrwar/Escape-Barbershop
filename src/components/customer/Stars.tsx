"use client";

import { useId } from "react";
import { stars as starShape, MAX_RATING, type Star } from "@/lib/reviews";

/**
 * Stars, in two moods: a rating being shown, and a rating being chosen.
 *
 * Both draw the same star so a customer recognises what they picked when they
 * see it again on the barber's profile.
 */

function StarShape({ fill, size }: { fill: Star; size: number }) {
  // Stable across server and client: a random id would not match on hydration.
  const id = useId();
  const path =
    "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4 6.2 20.4l1.1-6.4L2.6 9.4l6.5-.9z";

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {fill === "half" && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d={path}
        className={fill === "empty" ? "text-white/15" : "text-brass-300"}
        fill={fill === "half" ? `url(#${id})` : "currentColor"}
        stroke={fill === "empty" ? "currentColor" : "none"}
        strokeWidth={fill === "empty" ? 1.5 : 0}
      />
    </svg>
  );
}

/** A rating as it stands: five stars, filled as far as the average reaches. */
export function Stars({ rating, size = 16 }: { rating: number | null; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {starShape(rating).map((fill, i) => (
        <StarShape key={i} fill={fill} size={size} />
      ))}
    </div>
  );
}

/** The average and how many it rests on — or nothing at all, if nobody has said. */
export function RatingLine({
  rating,
  size = 14,
  emptyText,
}: {
  rating: { average: number | null; count: number };
  size?: number;
  emptyText?: string;
}) {
  if (rating.count === 0) {
    return emptyText ? <span className="text-xs text-white/35">{emptyText}</span> : null;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Stars rating={rating.average} size={size} />
      <span className="text-xs tabular-nums text-white/45">
        {rating.average?.toFixed(1)} ({rating.count})
      </span>
    </div>
  );
}

/** Five stars to tap. Nothing is chosen until they touch one. */
export function StarPicker({
  value,
  onChange,
  disabled,
  size = 34,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup">
      {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating}`}
          disabled={disabled}
          onClick={() => onChange(rating)}
          className="rounded-full p-1 transition-transform active:scale-90 disabled:opacity-50"
        >
          <StarShape fill={rating <= value ? "full" : "empty"} size={size} />
        </button>
      ))}
    </div>
  );
}
