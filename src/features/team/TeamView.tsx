"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Minus, UserPlus } from "lucide-react";
import { Badge, Button, Dialog, Field, Select, StateView } from "@/ui";
import type { TenantRoleCode } from "@/domain/team/roles";
import {
  CATEGORY_LABELS,
  PERMISSION_CATEGORY_OF,
  PERMISSION_LABELS,
  PERMISSIONS_BY_ROLE,
  TENANT_ROLE_CODES,
} from "@/domain/team/roles";
import type { TeamMemberRecord } from "@/domain/team/teamMember";
import { MEMBERSHIP_STATUS_META, ROLE_META, ROLE_OPTIONS } from "./constants";
import { getTeamFacade } from "./facade";
import { InviteForm } from "./InviteForm";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isSelf(member: TeamMemberRecord, memberId: string): boolean {
  return member.id === memberId;
}

export function TeamView(): React.ReactElement {
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [me, setMe] = useState<{ memberId: string; role: TenantRoleCode; canSidekick: boolean }>({
    memberId: "",
    role: "OWNER",
    canSidekick: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleDialog, setRoleDialog] = useState<{ member: TeamMemberRecord; role: TenantRoleCode } | null>(
    null,
  );
  const [roleError, setRoleError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string> | null>(null);
  const [savingInvite, setSavingInvite] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const facade = getTeamFacade();
      const [access, list] = await Promise.all([
        facade.team.currentAccess(),
        facade.team.listMembers(),
      ]);
      setMe({ memberId: access.memberId, role: access.role, canSidekick: access.canManageTeam });
      const term = search.trim().toLowerCase();
      setMembers(
        term === ""
          ? list
          : list.filter(
              (m) =>
                m.full_name.toLowerCase().includes(term) ||
                m.phone?.toLowerCase().includes(term),
            ),
      );
    } catch {
      setError("Impossible de charger l'équipe.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        // load encode déjà l'erreur
      }
    })();
  }, [load]);

  async function submitInvite(values: { fullName: string; phone: string; role: string }) {
    setSavingInvite(true);
    setInviteErrors(null);
    try {
      const result = await getTeamFacade().team.inviteMember({
        fullName: values.fullName,
        phone: values.phone || null,
        role: values.role,
      });
      if (!result.ok) {
        setInviteErrors((result.errors as Record<string, string>) ?? null);
        return;
      }
      setInviteOpen(false);
      await load();
    } finally {
      setSavingInvite(false);
    }
  }

  async function accept(member: TeamMemberRecord) {
    setBusyId(member.id);
    setActionError(null);
    try {
      const result = await getTeamFacade().team.acceptInvite(member.id);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load();
    } catch {
      setActionError("L'acceptation a échoué.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRole() {
    if (!roleDialog) return;
    setSavingRole(true);
    setRoleError(null);
    try {
      const result = await getTeamFacade().team.setRole(roleDialog.member.id, roleDialog.role);
      if (!result.ok) {
        setRoleError(result.reason);
        return;
      }
      setRoleDialog(null);
      await load();
    } finally {
      setSavingRole(false);
    }
  }

  async function deactivate(member: TeamMemberRecord) {
    setBusyId(member.id);
    setActionError(null);
    try {
      const result = await getTeamFacade().team.deactivateMember(member.id);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load();
    } catch {
      setActionError("La désactivation a échoué.");
    } finally {
      setBusyId(null);
    }
  }

  async function reactivate(member: TeamMemberRecord) {
    setBusyId(member.id);
    setActionError(null);
    try {
      const result = await getTeamFacade().team.reactivateMember(member.id);
      if (!result.ok) {
        setActionError(result.reason);
        return;
      }
      await load();
    } catch {
      setActionError("La réactivation a échoué.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Équipe · Rôles</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Membres de l&apos;atelier, rôles et permissions associées.
          </p>
        </div>
        {me.canSidekick ? (
          <Button onClick={() => { setInviteErrors(null); setInviteOpen(true); }}>
            <UserPlus className="size-4" aria-hidden="true" />
            Inviter un membre
          </Button>
        ) : null}
      </header>

      <main className="mt-8">
        {error ? (
          <StateView
            variant="error"
            title="Impossible de charger l'équipe"
            description={error}
            action={<Button onClick={() => load().catch(() => undefined)}>Réessayer</Button>}
          />
        ) : loading ? (
          <StateView variant="loading" title="Chargement de l'équipe…" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                aria-label="Rechercher un membre"
                className="w-full max-w-xs rounded-md border border-outline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-chocolat-600 focus:outline-none"
                placeholder="Rechercher un membre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {actionError ? (
                <p className="ml-auto text-sm text-danger" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>

            {members.length === 0 ? (
              <StateView
                variant="empty"
                title="Aucun membre"
                description="Invitez votre première personne pour partager l'atelier."
                action={
                  me.canSidekick ? (
                    <Button onClick={() => setInviteOpen(true)}>
                      Inviter un membre
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {members.map((member) => {
                  const roleMeta = ROLE_META[member.role];
                  const statusMeta = MEMBERSHIP_STATUS_META[member.status];
                  const self = isSelf(member, me.memberId);
                  return (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-outline bg-surface p-3"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beige-100 font-medium text-chocolat-800">
                        {initials(member.full_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{member.full_name}</span>
                          {self ? <Badge tone="info">Vous</Badge> : null}
                          <Badge tone={roleMeta.tone}>{roleMeta.label}</Badge>
                          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-ink-faint">
                          {member.phone ?? "Aucun numéro"}
                          {member.joined_at
                            ? ` · Membre depuis ${new Date(member.joined_at).toLocaleDateString("fr-FR")}`
                            : " · En attente d'acceptation"}
                        </p>
                      </div>

                      {!self && me.canSidekick ? (
                        <div className="flex flex-wrap gap-1.5">
                          {member.status === "INVITED" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              loading={busyId === member.id}
                              onClick={() => void accept(member)}
                            >
                              Accepter
                            </Button>
                          ) : null}
                          {member.status === "ACTIVE" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRoleError(null);
                                setRoleDialog({ member, role: member.role });
                              }}
                            >
                              Rôle
                            </Button>
                          ) : null}
                          {member.status === "ACTIVE" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={busyId === member.id}
                              onClick={() => void deactivate(member)}
                            >
                              Désactiver
                            </Button>
                          ) : member.status === "DEACTIVATED" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={busyId === member.id}
                              onClick={() => void reactivate(member)}
                            >
                              Réactiver
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <section className="mt-8 rounded-lg border border-outline bg-surface p-3 sm:p-5">
              <h2 className="font-display text-xl text-ink">Permissions par rôle</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Lecture seule pour les apprentis ; les rôles managés (changer un
                rôle, désactiver) sont réservés au propriétaire.
              </p>
              <div className="overflow-x-auto">
                <table className="mt-4 w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-outline text-xs uppercase tracking-wide text-ink-soft">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Permission</th>
                      {TENANT_ROLE_CODES.map((r) => (
                        <th key={r} className="px-3 py-2 text-center font-medium">
                          {ROLE_META[r].label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      Object.entries(
                        TENANT_ROLE_CODES.reduce<Record<string, string[]>>((acc, role) => {
                          for (const p of PERMISSIONS_BY_ROLE[role]) {
                            (acc[p] ??= []).push(role);
                          }
                          return acc;
                        }, {}),
                      ) as unknown as [string, string[]][]
                    )
                      .sort(([a], [b]) =>
                        PERMISSION_LABELS[a as keyof typeof PERMISSION_LABELS].localeCompare(
                          PERMISSION_LABELS[b as keyof typeof PERMISSION_LABELS],
                          "fr",
                        ),
                      )
                      .map(([permission, roles]) => (
                        <tr key={permission} className="border-b border-anthracite-100 last:border-0">
                          <td className="py-2 pr-3">
                            <span className="block text-ink">
                              {PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS]}
                            </span>
                            <span className="text-xs text-ink-faint">{CATEGORY_LABELS[PERMISSION_CATEGORY_OF[permission as keyof typeof PERMISSION_CATEGORY_OF]]}</span>
                          </td>
                          {TENANT_ROLE_CODES.map((r) => (
                            <td key={r} className="px-3 py-2 text-center">
                              {roles.includes(r) ? (
                                <Check className="mx-auto size-4 text-success" aria-hidden="true" />
                              ) : (
                                <Minus className="mx-auto size-4 text-ink-faint" aria-hidden="true" />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Inviter un membre"
        size="md"
      >
        <InviteForm
          errors={inviteErrors}
          busy={savingInvite}
          onSubmit={submitInvite}
          onCancel={() => setInviteOpen(false)}
        />
      </Dialog>

      <Dialog
        open={roleDialog !== null}
        onClose={() => setRoleDialog(null)}
        title={roleDialog ? `${roleDialog.member.full_name} — Rôle` : "Rôle"}
        size="sm"
      >
        {roleDialog ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmRole();
            }}
            noValidate
          >
            <Field label="Rôle" htmlFor="role-change" error={roleError ?? undefined}>
              <Select
                id="role-change"
                value={roleDialog.role}
                onChange={(e) =>
                  setRoleDialog({ ...roleDialog, role: e.target.value as TenantRoleCode })
                }
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r].label}
                  </option>
                ))}
              </Select>
            </Field>
            {roleDialog.member.role === "OWNER" ? (
              <p className="text-sm text-ink-soft">
                Rétrograder ce propriétaire retirera la gestion de l&apos;équipe
                à moins qu&apos;une autre propriétaire actif(ve) ne demeure.
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-anthracite-100 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRoleDialog(null)}
                disabled={savingRole}
              >
                Annuler
              </Button>
              <Button type="submit" loading={savingRole}>
                Changer le rôle
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}