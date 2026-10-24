import { redirect } from "next/navigation";

// The Command Center is home; the proxy sends signed-out visitors to /login.
export default function Home() {
  redirect("/command-center");
}
