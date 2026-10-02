import { describe, expect, it } from "vitest";
import { authErrorMessage, validateCredentials } from "@/domain/auth/errors";

describe("authErrorMessage", () => {
  it("traduit les erreurs Supabase courantes", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "E-mail ou mot de passe incorrect.",
    );
    expect(authErrorMessage({ message: "Email not confirmed" })).toMatch(/non confirmée/);
    expect(authErrorMessage({ code: "user_already_exists", message: "User already registered" })).toMatch(
      /existe déjà/,
    );
    expect(authErrorMessage({ status: 429, message: "rate limit" })).toMatch(/Trop de tentatives/);
    expect(authErrorMessage({ message: "Failed to fetch" })).toMatch(/Internet/);
  });

  it("n'expose pas le message technique inconnu", () => {
    expect(authErrorMessage({ message: "relation auth.xyz does not exist" })).toBe(
      "Une erreur est survenue. Réessayez.",
    );
    expect(authErrorMessage(null)).toBe("Une erreur est survenue. Réessayez.");
  });
});

describe("validateCredentials", () => {
  it("valide email et longueur du mot de passe", () => {
    expect(validateCredentials("awa@atelier.sn", "motdepasse1")).toBeNull();
    expect(validateCredentials("awa@", "motdepasse1")).toBe("Adresse e-mail invalide.");
    expect(validateCredentials("awa@atelier.sn", "court")).toMatch(/8 caractères/);
  });
});
