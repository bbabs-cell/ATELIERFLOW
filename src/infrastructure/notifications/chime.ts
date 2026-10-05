/**
 * Sonnerie générée par le navigateur (Web Audio) : aucun fichier à charger,
 * fonctionne hors connexion. Les navigateurs n'autorisent le son qu'après un
 * geste de l'utilisateur : `unlockAudio` est branché sur le premier toucher.
 */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** À appeler sur un geste de l'utilisateur (toucher, clic) : autorise le son ensuite. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

/** Le son est-il autorisé (contexte audio actif) ? */
export function audioReady(): boolean {
  return ctx?.state === "running";
}

function bell(c: AudioContext, at: number, freq: number, length = 0.9, volume = 0.35): void {
  // Deux sinus (fondamentale + harmonique) avec une attaque courte et une
  // longue extinction : un son de cloche clair, audible sans être agressif.
  for (const [mult, gainMul] of [
    [1, 1],
    [2.76, 0.25],
  ] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume * gainMul, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/**
 * Joue la sonnerie : trois notes montantes ; `urgent` (rendez-vous
 * imminent) les répète trois fois. Renvoie false si le son est bloqué.
 */
export function playChime(urgent = false): boolean {
  const c = context();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  if (c.state !== "running") return false;
  const notes = [659.25, 783.99, 1046.5]; // mi, sol, do
  const repeats = urgent ? 3 : 1;
  const start = c.currentTime + 0.05;
  for (let r = 0; r < repeats; r += 1) {
    notes.forEach((f, i) => bell(c, start + r * 1.1 + i * 0.18, f));
  }
  return true;
}

/** Vibration (téléphones Android) : longue pour un rendez-vous imminent. */
export function vibrate(urgent = false): void {
  try {
    navigator.vibrate?.(urgent ? [400, 150, 400, 150, 400] : [250, 120, 250]);
  } catch {
    // non pris en charge
  }
}
