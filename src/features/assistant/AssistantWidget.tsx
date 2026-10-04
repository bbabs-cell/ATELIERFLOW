"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Send, Sparkles, X } from "lucide-react";
import { cx } from "@/lib/cx";
import { formatMoney } from "@/domain/money";
import { answerQuestion, ASSISTANT_STARTERS, type AnswerBlock, type AssistantAnswer } from "@/domain/assistant/assistant";
import { getDashboardFacade } from "@/features/dashboard/facade";
import { ORDER_PRIORITY_LABELS, ORDER_STATUS_LABELS } from "@/features/orders/constants";

interface Message {
  id: number;
  from: "user" | "assistant";
  text?: string;
  answer?: AssistantAnswer;
}

let nextId = 1;

const WELCOME: AssistantAnswer = {
  kind: "smalltalk",
  blocks: [
    {
      text: "Bonjour ! Je suis l'assistant de votre atelier. Je réponds avec les données de cet appareil (rien n'est envoyé ailleurs) et je vous explique comment utiliser l'application.",
    },
  ],
  links: [],
  suggestions: [...ASSISTANT_STARTERS],
};

async function ask(question: string): Promise<AssistantAnswer> {
  const sources = await getDashboardFacade().dashboard.getAssistantSources();
  return answerQuestion(question, {
    now: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    permissions: new Set(sources.permissions),
    orders: sources.orders,
    payments: sources.payments,
    customers: sources.customers,
    appointments: sources.appointments,
    fabrics: sources.fabrics,
    money: (n) => formatMoney(n),
    labels: { status: ORDER_STATUS_LABELS, priority: ORDER_PRIORITY_LABELS },
  });
}

const TONE_DOT: Record<string, string> = {
  danger: "bg-wax-500",
  warning: "bg-flamme-500",
  success: "bg-menthe-500",
  neutral: "bg-chocolat-300",
};

function Block({ block }: { block: AnswerBlock }) {
  return (
    <div className="flex flex-col gap-1.5">
      {block.title ? <p className="font-display text-base font-bold text-ink">{block.title}</p> : null}
      {block.text ? <p>{block.text}</p> : null}
      {block.steps ? (
        <ol className="flex list-decimal flex-col gap-1 pl-5 marker:font-bold marker:text-flamme-600">
          {block.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {block.items && block.items.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {block.items.map((item, i) => (
            <li key={`${item.label}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface px-2.5 py-1.5">
              <span aria-hidden="true" className={cx("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[item.tone ?? "neutral"])} />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{item.label}</span>
                {item.detail ? <span className="block text-xs text-ink-soft">{item.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {block.note ? <p className="text-xs text-ink-soft">{block.note}</p> : null}
    </div>
  );
}

/**
 * Assistant de l'atelier : bulle en bas à droite, conversation locale.
 * Les réponses sont calculées sur l'appareil (domain/assistant).
 */
export function AssistantWidget(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [{ id: nextId++, from: "assistant", answer: WELCOME }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || thinking) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId++, from: "user", text: question }]);
    setThinking(true);
    try {
      const answer = await ask(question);
      setMessages((m) => [...m, { id: nextId++, from: "assistant", answer }]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: nextId++, from: "assistant", answer: { kind: "unknown", blocks: [{ text: "Je n'arrive pas à lire les données de l'atelier pour le moment. Réessayez dans un instant." }], links: [], suggestions: [] } },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      {!open ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-flamme-gradient px-4 font-semibold xl:pr-5 text-white shadow-glow transition-all duration-300 hover:-translate-y-1 hover:shadow-lift print:hidden"
        >
          <Sparkles className="size-5 animate-float" aria-hidden="true" />
          <span className="hidden xl:inline">Assistant</span>
        </button>
      ) : null}

      {open ? (
        <section
          role="dialog"
          aria-label="Assistant de l'atelier"
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface shadow-modal animate-scale-in sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-outline print:hidden"
        >
          <header className="flex shrink-0 items-center gap-3 bg-chocolat-900 px-4 py-3 text-ivoire-50">
            <span className="grid size-9 place-items-center rounded-full bg-flamme-gradient shadow-soft">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold leading-tight">Assistant</p>
              <p className="truncate text-xs text-chocolat-200">Vos données restent sur l&apos;appareil</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => buttonRef.current?.focus(), 0);
              }}
              aria-label="Fermer l'assistant"
              className="grid size-10 place-items-center rounded-full text-chocolat-100 transition-all hover:rotate-90 hover:bg-white/10"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain bg-surface-2 px-3 py-4" aria-live="polite">
            <ul className="flex flex-col gap-3">
              {messages.map((m) =>
                m.from === "user" ? (
                  <li key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-flamme-gradient px-3.5 py-2 text-sm text-white shadow-soft animate-fade-up">
                    {m.text}
                  </li>
                ) : (
                  <li key={m.id} className="mr-auto flex max-w-[92%] flex-col gap-3 rounded-2xl rounded-bl-md border border-outline bg-surface-2 px-3.5 py-3 text-sm text-ink-soft animate-fade-up [&_p]:text-ink">
                    {m.answer?.blocks.map((b, i) => (
                      <Block key={i} block={b} />
                    ))}
                    {m.answer && m.answer.links.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {m.answer.links.map((l) => (
                          <Link
                            key={l.href}
                            href={l.href}
                            onClick={() => {
                              if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-chocolat-900 px-3.5 text-xs font-semibold text-ivoire-50 transition-all hover:-translate-y-0.5 pointer-coarse:h-11"
                          >
                            {l.label}
                            <ArrowRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    {m.answer && m.answer.suggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {m.answer.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void send(s)}
                            className="min-h-9 rounded-full border border-flamme-200 bg-flamme-50 px-3 py-1.5 text-left text-xs font-semibold text-flamme-700 transition-all hover:-translate-y-0.5 hover:border-flamme-400 pointer-coarse:min-h-11"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ),
              )}
              {thinking ? (
                <li className="mr-auto rounded-2xl border border-outline bg-surface px-4 py-3" aria-label="L'assistant réfléchit">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-2 animate-bounce rounded-full bg-flamme-400" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </span>
                </li>
              ) : null}
            </ul>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex shrink-0 items-center gap-2 border-t border-outline bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              aria-label="Votre question"
              placeholder="Posez votre question…"
              className="h-12 min-w-0 flex-1 rounded-full border-2 border-outline bg-surface px-4 text-sm text-ink placeholder:text-ink-faint focus:border-flamme-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Envoyer"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-flamme-gradient text-white shadow-soft transition-all hover:-translate-y-0.5 disabled:opacity-40"
            >
              <Send className="size-5" aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
