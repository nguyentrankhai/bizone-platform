import { ToastProvider } from "@/components/ui/Toast";

// POS runs full screen (no admin sidebar), so it mounts its own toast container
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
