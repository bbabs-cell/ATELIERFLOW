/**
 * Traduction des erreurs Supabase Auth en messages utilisateur (français),
 * sans exposer de détail technique.
 */
export function authErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return "Une erreur est survenue. Réessayez.";
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "E-mail ou mot de passe incorrect.";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Adresse e-mail non confirmée. Ouvrez le lien reçu par e-mail, puis reconnectez-vous.";
  }
  if (code === "user_already_exists" || message.includes("already registered")) {
    return "Un compte existe déjà avec cette adresse. Connectez-vous.";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return "Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error.status === 429) {
    return "Trop de tentatives. Patientez quelques minutes puis réessayez.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Connexion Internet requise pour cette action.";
  }
  return "Une erreur est survenue. Réessayez.";
}

export const MIN_PASSWORD_LENGTH = 8;

export function validateCredentials(email: string, password: string): string | null {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Adresse e-mail invalide.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mot de passe : ${MIN_PASSWORD_LENGTH} caractères minimum.`;
  }
  return null;
}
