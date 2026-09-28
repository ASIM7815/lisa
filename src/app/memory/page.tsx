"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Brain, CheckCircle2, Clock3, Search, Sparkles, ThumbsDown } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/utils/format";

interface MemoryData {
  provider: { configured: boolean; ok: boolean; mode: string; provider: string; latencyMs?: number };
  totalLessons: number;
  totalLocalMemories: number;
  outcomeCounts: Record<string, number>;
  lessons: Array<{ id: string; caseId: string; caseRef: string; caseTitle: string; category: string; actionCategory: string; lesson: string; outcome: string; weight: number; createdAt: string }>;
  recentMemories: Array<{ id: string; text: string; context: string; outcome: string; tags: string[]; createdAt: string }>;
}

export default function MemoryPage() {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => { api<MemoryData>("/api/memory").then(setData).catch(() => undefined).finally(() => setLoading(false)); }, []);
  const lessons = useMemo(() => (data?.lessons ?? []).filter((item) => (filter === "all" || item.outcome === filter) && (!search || `${item.lesson} ${item.caseRef} ${item.caseTitle} ${item.actionCategory}`.toLowerCase().includes(search.toLowerCase()))), [data, filter, search]);
  const count = data?.totalLessons ?? 0;
  const good = (data?.outcomeCounts.success ?? 0) + (data?.outcomeCounts.partial ?? 0);
  const failures = data?.outcomeCounts.failure ?? 0;
  const positiveRate = count ? good / count : 0;

  return <div className="page-content">
    <div className="page-heading"><div><div className="page-eyebrow">A learning loop, not just a chat log</div><h1 className="page-title">LISA’s memory</h1><p className="page-description">Experience from real decisions and outcomes informs the next recommendation.</p></div><div className={`badge ${data?.provider.ok ? "badge-resolved" : "badge-awaiting"}`}><span className="memory-pulse" />{data?.provider.provider ?? "Memory"} · {data?.provider.mode ?? "loading"}</div></div>
    <div className="metric-grid"><MemoryMetric title="Lessons retained" value={count} icon={<Brain size={15} />} loading={loading} foot="Resolved cases with recorded outcomes" /><MemoryMetric title="Positive outcomes" value={`${Math.round(positiveRate * 100)}%`} icon={<CheckCircle2 size={15} />} loading={loading} foot={`${good} success or partial`} /><MemoryMetric title="Unsuccessful" value={failures} icon={<ThumbsDown size={15} />} loading={loading} foot="Negative outcomes remain visible" /><MemoryMetric title="Memory provider" value={data?.provider.mode === "hindsight" ? "Hindsight" : "Local"} icon={<Sparkles size={15} />} loading={loading} foot={data?.provider.configured ? "Persistent agent memory" : "Connect Hindsight for semantic recall"} /></div>
    <section className="card card-pad" style={{ marginBottom: 15 }}><div className="card-header"><div><h2 className="card-title">The learning loop</h2><p className="card-caption">Every human decision becomes useful evidence only after its real-world outcome is recorded.</p></div><Sparkles size={16} color="var(--accent)" /></div><div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9, marginTop: 20 }}>{[{ n: "01", title: "Case analyzed", detail: "LISA recalls relevant experience" }, { n: "02", title: "Human decides", detail: "Approve, reject or modify" }, { n: "03", title: "Outcome recorded", detail: "Success, partial or failure" }, { n: "04", title: "Memory updated", detail: "Future recommendations adapt" }].map((step, index) => <div key={step.n} style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 11, padding: "13px 12px", background: index === 3 ? "var(--accent-soft)" : "var(--surface-muted)" }}><div style={{ color: "var(--accent)", fontSize: 9, fontWeight: 760 }}>{step.n}</div><div style={{ marginTop: 6, fontSize: 10, fontWeight: 700 }}>{step.title}</div><div style={{ marginTop: 4, color: "var(--foreground-muted)", fontSize: 9 }}>{step.detail}</div>{index < 3 && <ArrowRight size={12} style={{ position: "absolute", top: "50%", right: -11, zIndex: 2, color: "var(--foreground-muted)", background: "var(--surface)" }} />}</div>)}</div></section>
    <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">Learned experiences</h2><p className="card-caption">A transparent record of what worked and what needs caution</p></div><span className="badge badge-resolved">{lessons.length} lessons</span></div><div className="filter-row" style={{ marginTop: 15, marginBottom: 10 }}><div className="filter-search"><Search size={13} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lessons…" /></div><select className="filter-select" aria-label="Filter by outcome" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All outcomes</option><option value="success">Success</option><option value="partial">Partial</option><option value="failure">Failure</option><option value="unknown">Unknown</option></select></div>
      {loading ? <div style={{ display: "grid", gap: 10 }}>{[1,2,3,4].map((x) => <div key={x} className="loading-skeleton" style={{ height: 80 }} />)}</div> : lessons.length ? <div style={{ display: "grid", gap: 9 }}>{lessons.map((item) => <article key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, border: "1px solid var(--border)", borderRadius: 11, padding: "13px 14px" }}><div><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Link href={`/cases/${item.caseId}`} className="case-title-link">{item.caseRef} · {item.caseTitle}</Link><span className={`badge ${item.outcome === "success" ? "badge-resolved" : item.outcome === "failure" ? "badge-critical" : "badge-medium"}`}>{item.outcome}</span></div><p style={{ margin: "7px 0 0", color: "var(--foreground-secondary)", fontSize: 10, lineHeight: 1.7 }}>{item.lesson}</p><div className="memory-match-meta"><span>{item.category.replace(/_/g, " ")}</span><span>·</span><span>{item.actionCategory.replace(/_/g, " ")}</span><span>·</span><span>{formatDate(item.createdAt)}</span></div></div><div style={{ display: "flex", alignItems: "flex-start", color: item.outcome === "success" ? "#4c9875" : item.outcome === "failure" ? "#c16b5f" : "var(--foreground-muted)" }}>{item.outcome === "success" ? <CheckCircle2 size={16} /> : item.outcome === "failure" ? <ThumbsDown size={16} /> : <Clock3 size={16} />}</div></article>)}</div> : <div className="empty-state"><span className="empty-state-icon"><Brain size={20} /></span><h3>No lessons match yet</h3><p>When a case is resolved with an outcome, LISA retains what happened here. Negative and partial outcomes are kept too, so the agent can learn what not to repeat.</p><Link className="btn btn-primary btn-sm" href="/cases">Review cases <ArrowRight size={12} /></Link></div>}
    </section>
    <p style={{ margin: "13px 2px 0", color: "var(--foreground-muted)", fontSize: 9, lineHeight: 1.7 }}>LISA uses {data?.provider.provider ?? "memory"} for long-term recall and keeps a local application record for audit and resilience. Memory is evidence for an operator, not a substitute for human review.</p>
  </div>;
}

function MemoryMetric({ title, value, icon, loading, foot }: { title: string; value: string | number; icon: React.ReactNode; loading: boolean; foot: string }) { return <article className="card metric-card"><div className="metric-top">{title}<span className="metric-icon">{icon}</span></div>{loading ? <div className="loading-skeleton" style={{ width: 80, height: 25, marginTop: 12 }} /> : <div className="metric-value" style={{ fontSize: 21 }}>{value}</div>}<div className="metric-foot">{foot}</div></article>; }
