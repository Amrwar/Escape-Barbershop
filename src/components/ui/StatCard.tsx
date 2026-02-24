interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  color?: "purple" | "blue" | "green" | "yellow";
}

const colorClasses = {
  purple: "bg-primary-50 text-primary-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  yellow: "bg-yellow-50 text-yellow-700",
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = "purple",
}: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        {icon && (
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${colorClasses[color]}`}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
