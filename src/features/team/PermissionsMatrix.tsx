import { Check, Minus } from "lucide-react";
import {
  CATEGORY_LABELS,
  PERMISSION_CATEGORY_OF,
  PERMISSION_LABELS,
  PERMISSIONS_BY_ROLE,
  TENANT_ROLE_CODES,
} from "@/domain/team/roles";
import { ROLE_META } from "./constants";

/** Matrice lecture seule des permissions par rôle (catalogue 0007). */
export function PermissionsMatrix() {
  return (
    <section className="mt-8 rounded-xl border border-outline bg-surface/90 shadow-soft backdrop-blur animate-fade-up p-3 sm:p-5">
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
  );
}
