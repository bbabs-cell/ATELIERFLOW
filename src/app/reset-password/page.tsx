import type { Metadata } from "next";
import { ResetPasswordView } from "@/features/auth/ResetPasswordView";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisir un nouveau mot de passe.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
