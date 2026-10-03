"use client";

/**
 * Ouvre la preuve dans un nouvel onglet. L'onglet est ouvert AVANT d'attendre
 * le lien signé : les navigateurs mobiles bloquent un onglet ouvert après une
 * attente réseau.
 */
export async function openProof(getUrl: () => Promise<string>): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  try {
    const url = await getUrl();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
