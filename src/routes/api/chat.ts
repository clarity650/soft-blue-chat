import { createFileRoute } from "@tanstack/react-router";
import { GatewayError, streamResponse } from "@lovable.dev/ai-gateway";

type ChatTurn = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT =
  "You are Nimbus, a calm, professional and friendly assistant. Give clear, well-structured answers. Use short paragraphs, and markdown lists or headings only when they genuinely help. Be concise unless the user asks for depth.";

function parseMessages(body: unknown): ChatTurn[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) return null;
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    if (content.length > 8000) return null;
    turns.push({ role, content });
  }
  return turns;
}

function friendlyError(error: unknown): string {
  if (error instanceof GatewayError) {
    if (error.name === "RateLimitError")
      return "Nimbus is a little busy right now. Please try again in a moment.";
    if (error.name === "PaymentRequiredError")
      return "The AI credits for this app have run out. Please top up to keep chatting.";
  }
  return "Something went wrong while generating a reply. Please try again.";
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        const messages = parseMessages(body);
        if (!messages) return Response.json({ error: "Invalid messages" }, { status: 400 });

        const encoder = new TextEncoder();
        const line = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              const events = await streamResponse(
                {
                  model: "openai/gpt-6-astra",
                  instructions: SYSTEM_PROMPT,
                  input: messages.map((m) => ({ role: m.role, content: m.content })),
                },
                { signal: request.signal },
              );
              for await (const event of events) {
                if (event.type === "response.output_text.delta") {
                  controller.enqueue(line({ t: "delta", d: event.delta }));
                }
              }
              controller.enqueue(line({ t: "done" }));
            } catch (error) {
              console.error("chat stream failed", error);
              controller.enqueue(line({ t: "error", m: friendlyError(error) }));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
