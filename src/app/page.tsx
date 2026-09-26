import { redirect } from "next/navigation";

/** L'application s'ouvre sur le tableau de bord (la vitrine du design system est sur /design). */
export default function Home() {
  redirect("/dashboard");
}
