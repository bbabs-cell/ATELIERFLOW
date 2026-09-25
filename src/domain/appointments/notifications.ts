export const NOTIFICATION_CHANNELS = ["IN_APP", "WHATSAPP"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const APPOINTMENT_REMINDER_TYPE = "APPOINTMENT_REMINDER";

/**
 * Notifications : messagerie d'atelier. Le canal WHATSAPP représente un message
 * préparé qui sera délivré par le transporteur externe (Meta Graph API) lors du
 * provisionnement (phase 04). Le tenant est libre de la mention WhatsApp via son
 * abonnement (0024_entitlements).
 */
export interface NotificationRecord {
  id: string;
  tenant_id: string;
  recipient_profile_id: string;
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface NotificationDraftInput {
  type: string;
  channel: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
}

export type NotificationDraftErrors = Partial<
  Record<"type" | "channel" | "title", string>
>;

export interface NotificationDraftClean {
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
}

export function validateNotificationDraft(
  input: NotificationDraftInput,
): { value: NotificationDraftClean; errors: NotificationDraftErrors } {
  const errors: NotificationDraftErrors = {};
  if (input.type.trim().length === 0) errors.type = "Le type est requis.";
  if (!NOTIFICATION_CHANNELS.includes(input.channel as NotificationChannel)) {
    errors.channel = "Canal invalide.";
  }
  if (input.title.trim().length === 0) {
    errors.title = "Le titre est requis.";
  }
  return {
    value: {
      type: input.type.trim(),
      channel: input.channel as NotificationChannel,
      title: input.title.trim(),
      body: input.body !== undefined && input.body !== null && input.body.trim() !== ""
        ? input.body
        : null,
      payload: input.payload ?? {},
    },
    errors,
  };
}