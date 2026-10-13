import { describe, expect, it } from "vitest";
import { bottomEntries, permissionsOfRole, visibleEntries, type NavEntry } from "@/domain/navigation/nav";

const MENU: NavEntry[] = [
  { href: "/dashboard" },
  { href: "/clients", permission: "customers.read" },
  { href: "/commandes", permission: "orders.read" },
  { href: "/rdv", permission: "appointments.read" },
  { href: "/modeles", permission: "files.read" },
  { href: "/stock", permission: "stock.read" },
  { href: "/rapports", permission: "reports.read" },
  { href: "/equipe", permission: "team.read" },
  { href: "/abonnement", permission: "subscriptions.view" },
  { href: "/parametres" },
];
const hrefs = (list: NavEntry[]) => list.map((e) => e.href);

describe("menu selon le rôle", () => {
  it("un apprenti ne voit ni Rapports, ni Équipe, ni Abonnement", () => {
    const visible = hrefs(visibleEntries(MENU, permissionsOfRole("APPRENTICE")));
    expect(visible).not.toContain("/rapports");
    expect(visible).not.toContain("/equipe");
    expect(visible).not.toContain("/abonnement");
    expect(visible).toContain("/commandes");
    expect(visible).toContain("/parametres");
  });

  it("le propriétaire voit tout", () => {
    expect(visibleEntries(MENU, permissionsOfRole("OWNER"))).toHaveLength(MENU.length);
  });

  it("rôle inconnu (démo, ancien jeton) : tout reste visible, le serveur tranche", () => {
    expect(permissionsOfRole(null)).toBeNull();
    expect(permissionsOfRole("SAAS_ADMIN")).toBeNull();
    expect(visibleEntries(MENU, null)).toHaveLength(MENU.length);
  });

  it("barre du bas : les 4 écrans les plus ouverts, dans l'ordre", () => {
    expect(hrefs(bottomEntries(visibleEntries(MENU, permissionsOfRole("OWNER"))))).toEqual(["/dashboard", "/commandes", "/clients", "/rdv"]);
  });

  it("barre du bas : un écran interdit est remplacé par le suivant autorisé", () => {
    const limited = new Set(permissionsOfRole("APPRENTICE"));
    limited.delete("appointments.read");
    expect(hrefs(bottomEntries(visibleEntries(MENU, limited)))).toEqual(["/dashboard", "/commandes", "/clients", "/stock"]);
  });
});
