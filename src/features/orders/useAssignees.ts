"use client";

import { useEffect, useState } from "react";
import { peekActiveSession } from "@/application/auth/session";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/browserClient";
import { createTeamRemote } from "@/infrastructure/team/teamRemote";
import { getTeamFacade } from "@/features/team/facade";

export interface Assignee {
  /** Identifiant de profil (valeur de orders.employee_id). */
  id: string;
  name: string;
}

/**
 * Personnes à qui confier une commande : membres ACTIVE de l'atelier.
 * Connecté : équipe serveur (list_team) ; sans droit de lecture de
 * l'équipe, seul l'utilisateur courant est proposé (« Moi »).
 * Mode démo : équipe locale.
 */
export function useAssignees(): Assignee[] {
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  useEffect(() => {
    let cancelled = false;
    const session = peekActiveSession();
    const self: Assignee[] = session ? [{ id: session.profileId, name: "Moi" }] : [];

    void (async () => {
      let list: Assignee[] = self;
      try {
        if (session?.mode === "DEMO") {
          const members = await getTeamFacade().team.listMembers();
          list = members.filter((m) => m.status === "ACTIVE").map((m) => ({ id: m.id, name: m.full_name }));
        } else {
          const client = getSupabaseBrowserClient();
          if (client) {
            const team = await createTeamRemote(client).listTeam();
            list = team.members
              .filter((m) => m.status === "ACTIVE")
              .map((m) => ({ id: m.profileId, name: m.isSelf ? `${m.fullName} (moi)` : m.fullName }));
          }
        }
      } catch {
        list = self;
      }
      if (!cancelled) setAssignees(list.length > 0 ? list : self);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return assignees;
}

export function assigneeName(assignees: readonly Assignee[], id: string | null): string | null {
  if (!id) return null;
  return assignees.find((a) => a.id === id)?.name ?? "Membre";
}
