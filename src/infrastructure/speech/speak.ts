/**
 * Lecture à voix haute (synthèse vocale du téléphone, en français).
 *
 * Pourquoi : beaucoup de personnes dans les ateliers ne lisent pas ; un
 * toucher sur le haut-parleur d'une carte dit la commande (client, étape,
 * échéance, prix). Aucun service extérieur : la voix du téléphone, hors ligne
 * si le téléphone l'a installée.
 */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function speak(text: string): boolean {
  if (!canSpeak()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = 0.95;
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("fr"));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
