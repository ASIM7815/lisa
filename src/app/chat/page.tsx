"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Loader2, MessageSquare, Sparkles, UserRound } from "lucide-react";
import { api, jsonBody } from "@/lib/client/api";
import type { ChatMessage, MemoryMatch } from "@/lib/domain/types";

const PROMPTS = ["What patterns have we learned from delivery failures?", "Which cases are waiting for my decision?", "What should I do about a damaged replacement?", "How does LISA learn from resolved cases?"];
type UiMessage = { id: string; role: "user" | "assistant"; content: string; memories?: MemoryMatch[] };

export default function ChatPage() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastMemories, setLastMemories] = useState<MemoryMatch[]>([]);
  const [provider, setProvider] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("lisa-chat-session");
    const session = saved || `session_${crypto.randomUUID()}`;
    localStorage.setItem("lisa-chat-session", session);
    setSessionId(session);
    api<{ messages: ChatMessage[] }>(`/api/chat?sessionId=${encodeURIComponent(session)}`)
      .then(({ messages: history }) => {
        const mapped = history.map((item) => ({ id: item.id, role: item.role, content: item.content, memories: item.memories }));
        setMessages(mapped);
        const assistant = [...history].reverse().find((item) => item.role === "assistant");
        if (assistant?.memories) setLastMemories(assistant.memories);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const send = async (text = input) => {
    const message = text.trim();
    if (!message || busy || !sessionId) return;
    const optimistic: UiMessage = { id: crypto.randomUUID(), role: "user", content: message };
    setMessages((prev) => [...prev, optimistic]); setInput(""); setBusy(true);
    try {
      const response = await api<{ turn: { sessionId: string; reply: string; memories: MemoryMatch[]; provider: string } }>("/api/chat", { method: "POST", body: jsonBody({ message, sessionId }) });
      const turn = response.turn;
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: turn.reply, memories: turn.memories }]);
      setLastMemories(turn.memories); setProvider(turn.provider);
    } catch (error) {
      const content = error instanceof Error ? error.message : "I couldn’t complete that message. Please try again.";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `I hit a snag: ${content}` }]);
    } finally { setBusy(false); }
  };

  return <div className="page-content">
    <div className="page-heading"><div><div className="page-eyebrow">Your operations copilot</div><h1 className="page-title">LISA Chat</h1><p className="page-description">Ask about cases, decisions and what your team has learned.</p></div><div className="badge badge-resolved"><span className="memory-pulse" /> Long-term memory on</div></div>
    <div className="chat-layout">
      <section className="card chat-panel">
        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 ? <div className="chat-welcome"><div className="chat-welcome-mark"><Sparkles size={21} /></div><h2>Good day. I’m LISA.</h2><p>I remember how your team resolved past cases, what worked, and what didn’t. Ask me about a pattern or get a second opinion on an issue.</p><div className="prompt-chips">{PROMPTS.map((prompt) => <button key={prompt} className="prompt-chip" onClick={() => void send(prompt)}>{prompt}</button>)}</div></div> : messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><div className="chat-avatar">{message.role === "assistant" ? <Sparkles size={13} /> : <UserRound size={13} />}</div><div className="chat-bubble">{message.content}</div></div>)}
          {busy && <div className="chat-message"><div className="chat-avatar"><Sparkles size={13} /></div><div className="chat-bubble" style={{ display: "flex", alignItems: "center", gap: 7 }}><Loader2 size={13} className="spinner" /> Recalling experience and thinking…</div></div>}
          <div ref={bottomRef} />
        </div>
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea ref={textareaRef} aria-label="Message LISA" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask LISA about an issue, a past decision, or a pattern…" maxLength={8000} /><button className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Send message"><ArrowUp size={16} /></button></form>
      </section>
      <aside className="chat-side">
        <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">Memory context</h2><p className="card-caption">Experience recalled for this turn</p></div><Brain size={15} color="var(--accent)" /></div>{lastMemories.length ? <div className="chat-memory-list">{lastMemories.slice(0, 4).map((item) => <div className="memory-match" key={item.id}><p>{item.text}</p><div className="memory-match-meta"><span>{item.type}</span><span>·</span><span>{Math.round(item.score * 100)}% relevance</span>{item.outcome && <><span>·</span><span>{item.outcome}</span></>}</div></div>)}</div> : <div className="empty-state" style={{ padding: "25px 8px 10px" }}><p>Ask a question to see the experiences LISA recalls.</p></div>}</section>
        <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">How LISA learns</h2><p className="card-caption">Memory is part of every case</p></div><Sparkles size={15} color="var(--accent)" /></div><div className="activity-list"><div className="activity-item"><div className="activity-icon"><Brain size={13} /></div><div><div className="activity-title">Recall</div><div className="activity-meta">Find relevant past experiences</div></div></div><div className="activity-item"><div className="activity-icon"><MessageSquare size={13} /></div><div><div className="activity-title">Reason</div><div className="activity-meta">Compare decisions and real outcomes</div></div></div><div className="activity-item"><div className="activity-icon"><Sparkles size={13} /></div><div><div className="activity-title">Retain</div><div className="activity-meta">Remember what happened after resolution</div></div></div></div><div style={{ marginTop: 10, color: "var(--foreground-muted)", fontSize: 9 }}>Current provider · {provider || "Ready"}</div></section>
      </aside>
    </div>
  </div>;
}
