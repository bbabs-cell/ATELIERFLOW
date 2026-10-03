"use client";

import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle, RotateCcw } from "lucide-react";
import { Button, Dialog, Field, Input, Select, Textarea } from "@/ui";
import { cx } from "@/lib/cx";
import {
  APPOINTMENT_MESSAGE_KINDS,
  APPOINTMENT_MESSAGE_LABELS,
  buildAppointmentMessage,
  type AppointmentMessageKind,
} from "@/domain/appointments/messages";
import { countryCodeOf, toWhatsappNumber, WHATSAPP_MESSAGE_MAX } from "@/domain/messaging/whatsapp";
import type { AtelierIdentity } from "@/domain/orders/receiptDocument";
import type { AppointmentListItem } from "@/application/appointments/appointmentService";
import { createClickToChatGateway } from "@/application/messaging/whatsappGateway";

export interface MessageComposerProps {
  item: AppointmentListItem;
  initialKind: AppointmentMessageKind;
  atelier: AtelierIdentity | null;
  onClose: () => void;
  /** Appelé après l'ouverture de WhatsApp, avec le type de message envoyé. */
  onOpened: (kind: AppointmentMessageKind) => void;
}

// MVP : click-to-chat. Une passerelle Business API pourra la remplacer ici.
const gateway = createClickToChatGateway((url) => window.open(url, "_blank", "noopener,noreferrer"));

export function MessageComposer({ item, initialKind, atelier, onClose, onOpened }: MessageComposerProps) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const generate = (kind: AppointmentMessageKind) =>
    buildAppointmentMessage({
      kind,
      appointment: item.appointment,
      customerName: item.customer?.full_name ?? null,
      atelierName: atelier?.name ?? "L'atelier",
      atelierAddress: atelier?.address ?? null,
      orderReference: item.order?.reference ?? null,
      now: new Date().toISOString(),
      timeZone,
    });

  const [kind, setKind] = useState<AppointmentMessageKind>(initialKind);
  const [text, setText] = useState(() => generate(initialKind));
  const [phone, setPhone] = useState(item.customer?.whatsapp ?? item.customer?.phone ?? "");
  const [copied, setCopied] = useState(false);

  const number = useMemo(() => toWhatsappNumber(phone, countryCodeOf(atelier?.phone)), [phone, atelier?.phone]);
  const edited = text !== generate(kind);

  function changeKind(next: AppointmentMessageKind) {
    setKind(next);
    setText(generate(next));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function open() {
    await gateway.dispatch({ to: number, text, context: { entity: "appointments", id: item.appointment.id, kind } });
    onOpened(kind);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Message WhatsApp"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => void copy()}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? "Copié" : "Copier"}
          </Button>
          <button
            type="button"
            onClick={() => void open()}
            disabled={text.trim() === ""}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-azur-600 px-5 text-sm font-semibold text-white shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift disabled:pointer-events-none disabled:opacity-50"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Ouvrir WhatsApp
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 min-[480px]:grid-cols-2">
          <Field label="Message" htmlFor="message-kind">
            <Select id="message-kind" value={kind} onChange={(e) => changeKind(e.target.value as AppointmentMessageKind)}>
              {APPOINTMENT_MESSAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {APPOINTMENT_MESSAGE_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Numéro WhatsApp du client" htmlFor="message-phone">
            <Input id="message-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 000 00 00" />
          </Field>
        </div>
        <p className={cx("-mt-2 text-xs", number ? "text-azur-600" : "text-ink-soft")}>
          {number
            ? `Conversation directe avec +${number}.`
            : "Numéro absent ou non reconnu : WhatsApp vous laissera choisir le contact. Ajoutez l'indicatif (+221…) pour ouvrir directement la conversation."}
        </p>

        <Field label="Texte (modifiable)" htmlFor="message-text">
          <Textarea id="message-text" rows={8} value={text} maxLength={WHATSAPP_MESSAGE_MAX} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="-mt-2 flex items-center justify-between gap-2 text-xs text-ink-faint">
          <span className="tabular">
            {text.length} / {WHATSAPP_MESSAGE_MAX}
          </span>
          {edited ? (
            <button type="button" onClick={() => setText(generate(kind))} className="inline-flex items-center gap-1 font-semibold text-azur-700 hover:underline">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Revenir au message proposé
            </button>
          ) : null}
        </div>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-soft">
          WhatsApp s&apos;ouvre avec ce texte : relisez-le et appuyez sur Envoyer dans WhatsApp.
          {kind === "REMINDER" ? " Le rappel sera noté comme envoyé pour toute l'équipe." : ""}
        </p>
      </div>
    </Dialog>
  );
}
