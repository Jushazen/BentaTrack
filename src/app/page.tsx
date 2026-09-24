import { redirect } from "next/navigation";

// The app starts at the dashboard; the proxy sends signed-out visitors to /login first.
export default function HomePage() {
  redirect("/dashboard");
}
