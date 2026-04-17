"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Zap, BookOpen, X, Pin, ChevronDown } from "lucide-react";
import { api, type CitedChunk, type Pin as PinType } from "@/lib/api";
import { readSSE } from "@/lib/sse";
import React from "react";

interface Message {
  role: "user" | "assistant";
  text: string;
  intent?: string;
  chunks?: CitedChunk[];
  sessionId?: string;
}

interface QueryPanelProps {
  repoId: string;
  onCitationClick?: (chunk: CitedChunk) => void;
  onPin?: (pin: PinType) => void;
}

const SUGGESTED_QUESTIONS = [
  "Where is authentication handled?",
  "What are the main entry points?",
  "How does the data flow from API to database?",
  "Which modules have the most dependencies?",
];

export default function QueryPanel({
  repoId,
  onCitationClick,
  onPin,
}: QueryPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || streaming) return;
      setError(null);
      setInput("");

      const userMsg: Message = { role: "user", text: question };
      setMessages((prev) => [...prev, userMsg]);

      const assistantMsg: Message = { role: "assistant", text: "", chunks: [] };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreaming(true);

      try {
        const sessionId =
          messages.find((m) => m.sessionId)?.sessionId ?? undefined;
        const res = await api.query.stream({
          repo_id: repoId,
          question,
          session_id: sessionId,
        });

        for await (const event of readSSE(res)) {
          if (event.type === "meta") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              last.intent = event.intent as string;
              last.chunks = (event.cited_chunks ?? []) as CitedChunk[];
              last.sessionId = event.session_id as string;
              updated[updated.length - 1] = last;
              return updated;
            });
          } else if (event.type === "token") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              last.text += event.text as string;
              updated[updated.length - 1] = last;
              return updated;
            });
          } else if (event.type === "done") {
            break;
          }
        }
      } catch (err) {
        setError((err as Error).message);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            text: "⚠ Failed to get a response. Check that the backend is running.",
          };
          return updated;
        });
      } finally {
        setStreaming(false);
      }
    },
    [repoId, messages, streaming],
  );

  async function handlePin(msg: Message) {
    if (!msg.sessionId) return;
    try {
      const pin = await api.pins.create({
        repo_id: repoId,
        module_node_id: msg.chunks?.[0]?.id ?? "unknown",
        question: messages[messages.indexOf(msg) - 1]?.text ?? "",
        answer: msg.text,
        cited_refs: msg.chunks ?? [],
      });
      onPin?.(pin);
    } catch (e) {
      console.error("pin failed:", e);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Message list */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {messages.length === 0 && (
          <div className="empty-state">
            <Zap
              size={36}
              style={{ color: "var(--yasml-primary)", opacity: 0.6 }}
            />
            <h3>Ask anything about this codebase</h3>
            <p style={{ fontSize: "0.875rem", maxWidth: 360 }}>
              YASML uses hybrid graph + semantic search to find relevant code
              and answer precisely.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                justifyContent: "center",
                marginTop: "0.5rem",
              }}
            >
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendQuestion(q)}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--yasml-primary)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              gap: "0.4rem",
            }}
          >
            {msg.intent && (
              <span
                className="badge badge-ingesting"
                style={{ alignSelf: "flex-start", marginBottom: 2 }}
              >
                {msg.intent}
              </span>
            )}

            <div className={`chat-bubble ${msg.role}`}>
              {msg.text ||
                (streaming && i === messages.length - 1 ? (
                  <span style={{ opacity: 0.6 }}>
                    Thinking<span className="cursor-blink">▋</span>
                  </span>
                ) : null)}
            </div>

            {/* Citations */}
            {msg.chunks && msg.chunks.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px",
                  maxWidth: "85%",
                }}
              >
                {msg.chunks.map((chunk, ci) => (
                  <button
                    key={ci}
                    className="citation"
                    onClick={() => onCitationClick?.(chunk)}
                    title={`${chunk.path ?? chunk.file_path ?? ""}:${chunk.start_line}-${chunk.end_line}`}
                  >
                    <BookOpen size={11} />
                    {(chunk.path ?? chunk.file_path ?? "").split("/").pop()}:
                    {chunk.start_line}
                  </button>
                ))}
              </div>
            )}

            {/* Pin button for assistant messages */}
            {msg.role === "assistant" && msg.text && !streaming && (
              <button
                onClick={() => handlePin(msg)}
                style={{
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--yasml-accent)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-muted)")
                }
              >
                <Pin size={11} /> Pin to graph
              </button>
            )}
          </div>
        ))}

        {error && (
          <div
            style={{
              color: "var(--error)",
              fontSize: "0.8rem",
              padding: "0.5rem",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        style={{
          borderTop: "1px solid var(--bg-card-border)",
          padding: "0.875rem 1rem",
          display: "flex",
          gap: "0.5rem",
          alignItems: "flex-end",
        }}
      >
        <textarea
          id="query-input"
          className="input"
          placeholder="Ask a question about this codebase..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendQuestion(input);
            }
          }}
          rows={2}
          style={{ resize: "none", flex: 1 }}
        />
        <button
          id="send-query-btn"
          className="btn btn-primary"
          onClick={() => sendQuestion(input)}
          disabled={!input.trim() || streaming}
          style={{ flexShrink: 0, height: 42 }}
        >
          {streaming ? (
            <span
              className="animate-spin"
              style={{
                display: "inline-block",
                width: 15,
                height: 15,
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff",
                borderRadius: "50%",
              }}
            />
          ) : (
            <Send size={15} />
          )}
        </button>
      </div>
    </div>
  );
}
