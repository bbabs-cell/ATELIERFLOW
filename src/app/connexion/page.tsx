import type { Metadata } from "next";
import { LoginView } from "@/features/auth/LoginView";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connexion et création de compte.",
};

export default function ConnexionPage() {
  return <LoginView />;
}
