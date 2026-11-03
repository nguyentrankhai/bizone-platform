import { PHSidebar } from "./PHSidebar";
import { PHHeader } from "./PHHeader";

interface PHLayoutProps {
  children: React.ReactNode;
}

export function PHLayout({ children }: PHLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <PHSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PHHeader />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
