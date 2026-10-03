"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, Mail, MessageCircle, ShieldCheck, Trash2, UserPlus, UserRoundX, UserRoundCheck } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, StateView } from "@/ui";
import { cx } from "@/lib/cx";
import type { TenantRoleCode } from "@/domain/team/roles";
import {
  INVITABLE_ROLES,
  invitationLink,
  invitationMessage,
  mailtoUrl,
  normalizeEmail,
  teamErrorMessage,
  validateInvitationDraft,
  whatsappShareUrl,
  type CreatedInvitation,
  type InvitableRole,
  type TeamMember,
  type TeamSnapshot,
} from "@/domain/team/invitations";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createTeamRemote, type TeamRemote } from "@/infrastructure/team/teamRemote";
import { MEMBERSHIP_STATUS_META, ROLE_META, ROLE_OPTIONS } from "./constants";
import { PermissionsMatrix } from "./PermissionsMatrix";

const AVATAR_TONES = ["bg-flamme-gradient", "bg-ocean-gradient", "bg-sunset-gradient", "bg-[linear-gradient(120deg,#10b981,#047857)]", "bg-[linear-gradient(120deg,#ffb989,#e8461a)]"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function useTeamRemote(): TeamRemote | null {
  return useMemo(() => {
    const client = getSupabaseBrowserClient();
    return client ? createTeamRemote(client) : null;
  }, []);
}

/** Écran Équipe connecté au serveur (comptes réels, invitations par lien). */
export function RemoteTeamView(): React.ReactElement {
  const remote = useTeamRemote();
  const [team, setTeam] = useState<TeamSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("EMPLOYEE");
  const [inviteErrors, setInviteErrors] = useState<{ email?: string; role?: string; form?: string }>({});
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!remote) return;
    try {
      setTeam(await remote.listTeam());
      setError(null);
    } catch (caught) {
      setError(teamErrorMessage(caught instanceof Error ? caught : null));
    }
  }, [remote]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function openInvite() {
    setEmail("");
    setRole("EMPLOYEE");
    setInviteErrors({});
    setCreated(null);
    setCopied(false);
    setInviteOpen(true);
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!remote) return;
    const errors = validateInvitationDraft(email, role);
    if (Object.keys(errors).length > 0) {
      setInviteErrors(errors);
      return;
    }
    setInviting(true);
    setInviteErrors({});
    try {
      setCreated(await remote.createInvitation(normalizeEmail(email), role));
      void load();
    } catch (caught) {
      setInviteErrors({ form: teamErrorMessage(caught instanceof Error ? caught : null) });
    } finally {
      setInviting(false);
    }
  }

  async function act(id: string, run: () => Promise<void>) {
    setBusyId(id);
    setActionError(null);
    try {
      await run();
      await load();
    } catch (caught) {
      setActionError(teamErrorMessage(caught instanceof Error ? caught : null));
    } finally {
      setBusyId(null);
    }
  }

  const link = created ? invitationLink(window.location.origin, created.token) : "";
  const message = created ? invitationMessage(null, ROLE_META[created.role].label, link) : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-4xl text-ink sm:text-5xl">Équipe</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Invitez vos couturiers et apprentis par lien, attribuez les rôles, gérez les accès.
          </p>
        </div>
        {team?.canManage ? (
          <Button onClick={openInvite}>
            <UserPlus className="size-4" aria-hidden="true" />
            Inviter un membre
          </Button>
        ) : null}
      </header>

      <main className="mt-8 space-y-8">
        {error ? (
          <StateView
            variant={error.includes("Internet") ? "offline" : "error"}
            title={error.includes("réservée") ? "Accès à l'équipe non autorisé" : "Impossible de charger l'équipe"}
            description={error}
            action={error.includes("réservée") ? undefined : <Button onClick={() => void load()}>Réessayer</Button>}
          />
        ) : team === null ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="skeleton-shimmer h-28 rounded-xl" />
            ))}
          </ul>
        ) : (
          <>
            {actionError ? (
              <p role="alert" className="rounded-lg border-2 border-wax-300 bg-wax-50 px-3 py-2 text-sm font-semibold text-wax-600 animate-wiggle">
                {actionError}
              </p>
            ) : null}

            <section>
              <h2 className="font-display text-xl text-ink">
                Membres <span className="font-mono text-sm text-flamme-600">{team.members.length}</span>
              </h2>
              <ul className="stagger mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {team.members.map((member, index) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    tone={AVATAR_TONES[index % AVATAR_TONES.length]}
                    canManage={team.canManage}
                    busy={busyId === member.id}
                    onRole={(next) => void act(member.id, () => remote!.setMemberRole(member.id, next))}
                    onStatus={(next) => void act(member.id, () => remote!.setMemberStatus(member.id, next))}
                  />
                ))}
              </ul>
            </section>

            {team.canManage ? (
              <section>
                <h2 className="font-display text-xl text-ink">
                  Invitations en attente <span className="font-mono text-sm text-flamme-600">{team.invitations.length}</span>
                </h2>
                {team.invitations.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-flamme-200 bg-flamme-50/60 p-3 text-sm text-ink-soft">
                    Aucune invitation en attente. Les liens expirent après 7 jours.
                  </p>
                ) : (
                  <ul className="stagger mt-4 flex flex-col gap-2">
                    {team.invitations.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-outline bg-surface/90 px-4 py-3 shadow-soft backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                      >
                        <span className="grid size-10 place-items-center rounded-full bg-champagne-200 text-chocolat-900 animate-float">
                          <Mail className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{invite.email}</span>
                          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                            expire dans {daysLeft(invite.expiresAt)} j
                          </span>
                        </span>
                        <Badge tone={ROLE_META[invite.role].tone}>{ROLE_META[invite.role].label}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyId === invite.id}
                          onClick={() => void act(invite.id, () => remote!.revokeInvitation(invite.id))}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Annuler
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <PermissionsMatrix />
          </>
        )}
      </main>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Inviter un membre" size="md">
        {created ? (
          <div className="flex flex-col gap-4 animate-scale-in">
            <div className="flex items-center gap-3 rounded-xl bg-[linear-gradient(120deg,#10b981,#047857)] p-4 text-white shadow-soft">
              <span className="grid size-10 place-items-center rounded-full bg-white/20 animate-pop">
                <Check className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm">
                Invitation créée pour <strong>{created.email}</strong> ({ROLE_META[created.role].label}). Envoyez-lui ce
                lien : il est valable 7 jours et ne sera plus affiché ensuite.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-flamme-300 bg-flamme-50 p-2 pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-chocolat-800">{link}</code>
              <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <a
                href={whatsappShareUrl(message)}
                target="_blank"
                rel="noopener noreferrer"
                className="shine inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(120deg,#25d366,#128c7e)] px-5 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Envoyer par WhatsApp
              </a>
              <a
                href={mailtoUrl(created.email, message)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-surface px-5 text-sm font-semibold text-ink shadow-neo transition-all duration-200 hover:-translate-y-0.5"
              >
                <Mail className="size-4" aria-hidden="true" />
                Envoyer par e-mail
              </a>
            </div>
            <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
              <Button variant="ghost" onClick={openInvite}>
                Inviter une autre personne
              </Button>
              <Button onClick={() => setInviteOpen(false)}>Terminé</Button>
            </div>
          </div>
        ) : (
          <form className="stagger flex flex-col gap-4" onSubmit={submitInvite} noValidate>
            <Field label="E-mail de la personne" htmlFor="invite-email" required error={inviteErrors.email}>
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="ex : binta.couture@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                invalid={Boolean(inviteErrors.email)}
              />
            </Field>
            <Field label="Rôle" htmlFor="invite-role" required error={inviteErrors.role}>
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r].label}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="flex items-start gap-2 rounded-lg bg-azur-50 p-3 text-xs text-azur-700">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              La personne devra se connecter (ou créer son compte) avec cette adresse e-mail pour rejoindre
              l&apos;atelier. Le lien est à usage unique.
            </p>
            {inviteErrors.form ? (
              <p role="alert" className="rounded-lg border-2 border-wax-300 bg-wax-50 px-3 py-2 text-sm font-semibold text-wax-600 animate-wiggle">
                {inviteErrors.form}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={inviting}>
                Créer le lien d&apos;invitation
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

function MemberCard({
  member,
  tone,
  canManage,
  busy,
  onRole,
  onStatus,
}: {
  member: TeamMember;
  tone: string;
  canManage: boolean;
  busy: boolean;
  onRole: (role: TenantRoleCode) => void;
  onStatus: (status: "ACTIVE" | "DEACTIVATED") => void;
}) {
  const status = MEMBERSHIP_STATUS_META[member.status];
  const editable = canManage && !member.isSelf;
  return (
    <li
      className={cx(
        "gradient-border group relative overflow-hidden rounded-xl border border-outline bg-surface/90 p-4 shadow-soft backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-lift",
        member.status === "DEACTIVATED" && "opacity-70 grayscale-[0.4]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "grid size-12 shrink-0 place-items-center rounded-full font-display text-base font-bold text-white shadow-soft transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110",
            tone,
          )}
        >
          {initials(member.fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold text-ink">{member.fullName}</span>
            {member.isSelf ? <Badge tone="accent">Vous</Badge> : null}
          </span>
          <span className="block truncate text-sm text-ink-soft">{member.email ?? "—"}</span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={ROLE_META[member.role].tone}>{ROLE_META[member.role].label}</Badge>
            <Badge tone={status.tone} dot={member.status === "ACTIVE"}>
              {status.label}
            </Badge>
          </span>
        </span>
      </div>
      {editable ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-anthracite-100 pt-3">
          <Select
            aria-label={`Rôle de ${member.fullName}`}
            className="h-10 min-h-10 w-auto rounded-full py-0 text-xs"
            value={member.role}
            disabled={busy}
            onChange={(e) => onRole(e.target.value as TenantRoleCode)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </Select>
          {member.status === "DEACTIVATED" ? (
            <Button variant="ghost" size="sm" loading={busy} onClick={() => onStatus("ACTIVE")}>
              <UserRoundCheck className="size-4" aria-hidden="true" />
              Réactiver
            </Button>
          ) : (
            <Button variant="ghost" size="sm" loading={busy} onClick={() => onStatus("DEACTIVATED")}>
              <UserRoundX className="size-4" aria-hidden="true" />
              Désactiver
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
