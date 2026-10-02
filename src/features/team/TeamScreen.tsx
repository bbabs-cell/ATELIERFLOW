"use client";

import { peekActiveSession } from "@/application/auth/session";
import { RemoteTeamView } from "./RemoteTeamView";
import { TeamView } from "./TeamView";

/**
 * Équipe : comptes réels et invitations par lien quand l'atelier est
 * connecté à Supabase ; écran local en mode démo (sans serveur).
 */
export function TeamScreen() {
  return peekActiveSession()?.mode === "DEMO" ? <TeamView /> : <RemoteTeamView />;
}
