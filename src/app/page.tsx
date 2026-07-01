import { redirect } from "next/navigation";

// The dashboard is the home of the app; middleware bounces unauthenticated
// users to /login.
export default function Home() {
  redirect("/dashboard");
}
