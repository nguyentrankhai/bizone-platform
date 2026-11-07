import { redirect } from "next/navigation";

/** No landing page yet: the app starts at the dashboard (sidebar gives access to every module) */
export default function Home() {
  redirect("/dashboard");
}
