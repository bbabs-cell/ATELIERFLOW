import { planErrorMessage } from "@/domain/subscriptions/entitlements";
import type { TenantRoleCode } from "./roles";

/**
 * Invitations d'équipe (étape 19) — logique pure côté client.
 * Le jeton est généré et vérifié par la base (0017) ; le client ne fait
 * que construire le lien, valider la saisie et traduire les erreurs.
 */

/** Rôles invitables : jamais OWNER (0017 le refuse aussi). */
export const INVITABLE_ROLES = ["MANAGER", "EMPLOYEE", "APPRENTICE"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" | "NOT_FOUND";

export interface PublicInvitation {
  status: InvitationStatus;
  tenantName: string | null;
  role: TenantRoleCode | null;
  email: string | null;
  invitedBy: string | null;
  expiresAt: string | null;
}

export interface TeamMember {
  id: string;
  profileId: string;
  fullName: string;
  email: string | null;
  role: TenantRoleCode;
  status: "INVITED" | "ACTIVE" | "DEACTIVATED";
  joinedAt: string | null;
  isSelf: boolean;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: TenantRoleCode;
  expiresAt: string;
  createdAt: string;
}

export interface TeamSnapshot {
  canManage: boolean;
  members: TeamMember[];
  invitations: PendingInvitation[];
}

export interface CreatedInvitation {
  id: string;
  token: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateInvitationDraft(email: string, role: string): { email?: string; role?: string } {
  const errors: { email?: string; role?: string } = {};
  if (!EMAIL_RE.test(normalizeEmail(email))) errors.email = "Adresse e-mail invalide.";
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) errors.role = "Choisissez un rôle.";
  return errors;
}

/** Lien à partager : /invitation/<jeton> sur l'origine de l'application. */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invitation/${encodeURIComponent(token)}`;
}

export function invitationMessage(tenantName: string | null, roleLabel: string, link: string): string {
  const atelier = tenantName ? `l'atelier « ${tenantName} »` : "notre atelier";
  return `Bonjour ! Vous êtes invité(e) à rejoindre ${atelier} comme ${roleLabel.toLowerCase()}. Ouvrez ce lien pour créer votre accès : ${link}`;
}

/** Partage WhatsApp sans API Business (prompt 17) : wa.me avec texte prérempli. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function mailtoUrl(email: string, message: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Invitation à rejoindre l'atelier")}&body=${encodeURIComponent(message)}`;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: "Adresse e-mail invalide.",
  INVALID_ROLE: "Ce rôle ne peut pas être attribué par invitation.",
  ALREADY_MEMBER: "Cette personne fait déjà partie de l'atelier.",
  INVITATION_NOT_FOUND: "Invitation introuvable. Vérifiez le lien reçu.",
  INVITATION_USED: "Cette invitation a déjà été utilisée.",
  INVITATION_REVOKED: "Cette invitation a été annulée par l'atelier.",
  INVITATION_EXPIRED: "Cette invitation a expiré. Demandez-en une nouvelle.",
  EMAIL_MISMATCH: "Cette invitation est destinée à une autre adresse e-mail. Connectez-vous avec l'adresse invitée.",
  MEMBER_DEACTIVATED: "Votre accès à cet atelier est désactivé. Demandez au responsable de le réactiver.",
  ROLE_MISMATCH: "Invitation incohérente avec votre accès actuel. Demandez une nouvelle invitation.",
  MEMBER_NOT_FOUND: "Membre introuvable.",
  CANNOT_REMOVE_SELF: "Vous ne pouvez pas vous retirer vous-même de l'atelier.",
  CANNOT_REMOVE_OWNER: "Un propriétaire ne peut pas être retiré.",
  INVALID_STATUS: "Statut invalide.",
  FORBIDDEN: "Action réservée aux responsables de l'équipe.",
};

/** Traduit une erreur RPC (message = code levé par 0017) en français. */
export function teamErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const raw = error?.message ?? "";
  const plan = planErrorMessage(raw);
  if (plan) return plan;
  if (raw.startsWith("FORBIDDEN")) return ERROR_MESSAGES.FORBIDDEN;
  if (raw.includes("interdit :")) return raw.slice(raw.indexOf("interdit :")).replace(/^interdit : /, "Interdit : ");
  const code = Object.keys(ERROR_MESSAGES).find((key) => raw === key || raw.startsWith(`${key}:`));
  if (code) return ERROR_MESSAGES[code];
  if (/failed to fetch|network/i.test(raw)) return "Connexion Internet requise pour gérer l'équipe.";
  return "Une erreur est survenue. Réessayez.";
}
