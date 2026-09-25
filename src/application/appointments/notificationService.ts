import { SyncEngine } from "@/application/sync/engine";
import { newIdempotencyKey } from "@/domain/ids/idempotency";
import { validateNotificationDraft } from "@/domain/appointments/notifications";
import type {
  NotificationDraftErrors,
  NotificationDraftInput,
  NotificationRecord,
} from "@/domain/appointments/notifications";
import type { NotificationsRepository } from "@/repository/ports/appointments";

const NOTIFICATIONS_ENTITY = "notifications";

export type CreateNotificationResult =
  | { ok: true; notification: NotificationRecord }
  | { ok: false; errors: NotificationDraftErrors };

export type MarkReadResult =
  | { ok: true; notification: NotificationRecord }
  | { ok: false; reason: string };

export interface NotificationService {
  listNotifications(): Promise<NotificationRecord[]>;
  createNotification(
    input: NotificationDraftInput,
  ): Promise<CreateNotificationResult>;
  markRead(id: string): Promise<MarkReadResult>;
}

export interface NotificationServiceDeps {
  tenantId: string;
  profileId: string | null;
  notifications: NotificationsRepository;
  engine: SyncEngine;
  now?: () => string;
  uuid?: () => string;
}

export function createNotificationService(
  deps: NotificationServiceDeps,
): NotificationService {
  const now = deps.now ?? (() => new Date().toISOString());
  const port =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto
      : undefined;
  const uuid = deps.uuid ?? (() => port?.randomUUID() ?? newIdempotencyKey());

  async function enqueue(notification: NotificationRecord) {
    await deps.engine.enqueue({
      tenantId: deps.tenantId,
      profileId: deps.profileId,
      entity: NOTIFICATIONS_ENTITY,
      entityId: notification.id,
      operation: "INSERT",
      payload: notification,
    });
  }

  return {
    async listNotifications() {
      return deps.notifications.listAll();
    },
    async createNotification(input) {
      const draft = validateNotificationDraft(input);
      if (Object.keys(draft.errors).length > 0) {
        return { ok: false, errors: draft.errors };
      }
      const notification: NotificationRecord = {
        id: uuid(),
        tenant_id: deps.tenantId,
        recipient_profile_id: deps.profileId ?? "",
        type: draft.value.type,
        channel: draft.value.channel,
        title: draft.value.title,
        body: draft.value.body,
        payload: draft.value.payload,
        read_at: null,
        sent_at: null,
        created_at: now(),
      };
      await deps.notifications.saveNotification(notification);
      await enqueue(notification);
      return { ok: true, notification };
    },
    async markRead(id) {
      const notification = await deps.notifications.getNotification(id);
      if (notification === null) {
        return { ok: false, reason: "Notification introuvable." };
      }
      if (notification.read_at !== null) {
        return { ok: true, notification };
      }
      const updated: NotificationRecord = {
        ...notification,
        read_at: now(),
      };
      await deps.notifications.saveNotification(updated);
      await deps.engine.enqueue({
        tenantId: deps.tenantId,
        profileId: deps.profileId,
        entity: NOTIFICATIONS_ENTITY,
        entityId: updated.id,
        operation: "UPDATE",
        payload: updated,
      });
      return { ok: true, notification: updated };
    },
  };
}