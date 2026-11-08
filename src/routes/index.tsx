import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { ChatStatus } from "ai";
import {
  CopyIcon,
  FileTextIcon,
  LightbulbIcon,
  MailIcon,
  PenLineIcon,
  SquarePenIcon,
} from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import logo from "@/assets/nimbus-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nimbus — Your calm AI assistant" },
      {
        name: "description",
        content:
          "Chat with Nimbus, a professional AI assistant for writing, planning and clear answers.",
      },
      { property: "og:title", content: "Nimbus — Your calm AI assistant" },
      {
        property: "og:description",
        content:
          "Chat with Nimbus, a professional AI assistant for writing, planning and clear answers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

const SUGGESTIONS = [
  {
    icon: MailIcon,
    title: "Draft an email",
    prompt: "Help me write a polite follow-up email to a client who hasn't replied in a week.",
  },
  {
    icon: FileTextIcon,
    title: "Summarize text",
    prompt: "Explain how to write a strong executive summary, with a short example.",
  },
  {
    icon: LightbulbIcon,
    title: "Brainstorm ideas",
    prompt: "Give me 5 creative ideas for a team-building activity for a remote team.",
  },
  {
    icon: PenLineIcon,
    title: "Plan my week",
    prompt: "Help me plan a productive work week with focus time and breaks.",
  },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "submitted" || status === "streaming") return;

      const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
      const assistantId = uid();
      const history = [...messages.filter((m) => !m.error), userMsg];
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setStatus("submitted");

      const controller = new AbortController();
      abortRef.current = controller;

      const update = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantId);
          const base = exists
            ? prev
            : [...prev, { id: assistantId, role: "assistant" as const, content: "" }];
          return base.map((m) => (m.id === assistantId ? fn(m) : m));
        });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error("Request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line) as { t: string; d?: string; m?: string };
            if (evt.t === "delta" && evt.d) {
              setStatus("streaming");
              update((m) => ({ ...m, content: m.content + evt.d }));
            } else if (evt.t === "error") {
              update((m) => ({
                ...m,
                content: m.content || evt.m || "Something went wrong.",
                error: !m.content,
              }));
            }
          }
        }
        setStatus("ready");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("ready");
        } else {
          update((m) => ({
            ...m,
            content: "I couldn't reach the server. Please try again.",
            error: true,
          }));
          setStatus("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [messages, status],
  );

  const handleSubmit = (msg: PromptInputMessage) => {
    void send(msg.text);
  };

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    stop();
    setMessages([]);
    setStatus("ready");
    setInput("");
  };

  const isEmpty = messages.length === 0;
  const isBusy = status === "submitted" || status === "streaming";
  const lastMsg = messages.at(-1);
  const showThinking = status === "submitted" && lastMsg?.role === "user";

  return (
    <div className="flex h-dvh flex-col bg-page">
      <header className="border-b border-border/60 bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-card shadow-soft ring-1 ring-border">
              <img src={logo} alt="Nimbus" width={28} height={28} className="size-7" />
            </div>
            <div className="leading-tight">
              <h1 className="text-[0.95rem] font-semibold tracking-tight">Nimbus</h1>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success animate-pulse-dot" />
                Online · Ready to help
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={newChat} disabled={isEmpty}>
            <SquarePenIcon />
            New chat
          </Button>
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
          {isEmpty ? (
            <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center animate-fade-up">
              <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-card shadow-soft ring-1 ring-border">
                <img src={logo} alt="" width={56} height={56} className="size-14" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                How can I help today?
              </h2>
              <p className="mt-2 max-w-md text-[0.95rem] text-muted-foreground">
                Ask a question, draft a message, or work through an idea together.
              </p>
              <div className="mt-10 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map(({ icon: Icon, title, prompt }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => void send(prompt)}
                    className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {prompt}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role} className="animate-fade-up">
                {m.role === "assistant" ? (
                  <div className="flex gap-3">
                    <img
                      src={logo}
                      alt=""
                      width={28}
                      height={28}
                      className="mt-0.5 size-7 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <MessageContent className={m.error ? "text-destructive" : undefined}>
                        <MessageResponse>{m.content}</MessageResponse>
                      </MessageContent>
                      {!m.error && m.content && !(isBusy && m.id === lastMsg?.id) && (
                        <MessageActions className="mt-1 -ml-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <MessageAction
                            tooltip="Copy"
                            label="Copy"
                            onClick={() => void navigator.clipboard.writeText(m.content)}
                          >
                            <CopyIcon className="size-3.5" />
                          </MessageAction>
                        </MessageActions>
                      )}
                    </div>
                  </div>
                ) : (
                  <MessageContent>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </MessageContent>
                )}
              </Message>
            ))
          )}
          {showThinking && (
            <div className="flex items-center gap-3 animate-fade-up">
              <img src={logo} alt="" width={28} height={28} className="size-7" />
              <Shimmer className="text-sm">Thinking...</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pb-5 pt-2">
        <div className="mx-auto max-w-3xl">
          <PromptInput
            onSubmit={handleSubmit}
            className="rounded-2xl border-border bg-card shadow-composer [&_[data-slot=input-group]]:rounded-2xl"
          >
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Message Nimbus..."
              className="min-h-14 px-4 pt-4 text-[0.95rem]"
            />
            <PromptInputFooter className="justify-between px-3 pb-3">
              <span className="pl-1 text-xs text-muted-foreground">
                Enter to send · Shift + Enter for a new line
              </span>
              <PromptInputSubmit
                status={status}
                onStop={stop}
                disabled={!isBusy && !input.trim()}
                className="rounded-xl bg-gradient-primary text-primary-foreground"
              />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2.5 text-center text-[0.7rem] text-muted-foreground">
            Nimbus can make mistakes. Double-check important information.
          </p>
        </div>
      </div>
    </div>
  );
}
