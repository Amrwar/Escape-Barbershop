"use client";

import { addDays, subDays, format, parseISO } from "date-fns";

interface DateNavInputProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  className?: string;
}

export function DateNavInput({ value, onChange, className }: DateNavInputProps) {
  const step = (days: number) => {
    try {
      const next = days > 0 ? addDays(parseISO(value), days) : subDays(parseISO(value), Math.abs(days));
      onChange(format(next, "yyyy-MM-dd"));
    } catch {
      // invalid date — ignore
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-1)}
        className="h-9 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors text-lg leading-none"
        tabIndex={-1}
      >
        ‹
      </button>
      <input
        type="date"
        className={className ?? "input"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => step(1)}
        className="h-9 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors text-lg leading-none"
        tabIndex={-1}
      >
        ›
      </button>
    </div>
  );
}
