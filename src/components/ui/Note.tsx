import { Icon, type IconName } from "./Icon";

/**
 * A short explainer that lives inside the section it describes: what this screen
 * is for, and the one rule about it that is not obvious from the numbers.
 *
 * `info` for how something works, `warn` for a rule that is easy to break by
 * accident, `rule` for an accounting decision worth stating out loud.
 */
type NoteTone = "info" | "warn" | "rule";

const TONES: Record<NoteTone, { wrap: string; chip: string; title: string; body: string; icon: IconName }> = {
  info: {
    wrap: "bg-blue-50/70 border-blue-100",
    chip: "bg-blue-100 text-blue-700",
    title: "text-blue-900",
    body: "text-blue-800/80",
    icon: "pie",
  },
  warn: {
    wrap: "bg-amber-50/80 border-amber-200",
    chip: "bg-amber-100 text-amber-800",
    title: "text-amber-900",
    body: "text-amber-900/80",
    icon: "shield",
  },
  rule: {
    wrap: "bg-primary-50 border-primary-100",
    chip: "bg-primary-100 text-primary-700",
    title: "text-primary-900",
    body: "text-primary-800/75",
    icon: "clipboard-check",
  },
};

export function Note({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: NoteTone;
  title: string;
  children: React.ReactNode;
  icon?: IconName;
}) {
  const s = TONES[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 flex gap-3 ${s.wrap}`}>
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.chip}`}>
        <Icon name={icon ?? s.icon} className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className={`text-xs font-semibold ${s.title}`}>{title}</div>
        <div className={`text-xs mt-0.5 leading-relaxed ${s.body}`}>{children}</div>
      </div>
    </div>
  );
}
