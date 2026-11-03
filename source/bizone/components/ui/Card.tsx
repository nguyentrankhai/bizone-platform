import { cn } from "@/lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between border-b border-gray-100 px-5 py-4", className)}>
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: CardProps) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
