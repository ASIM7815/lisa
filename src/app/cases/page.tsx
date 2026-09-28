"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Filter, Plus, Search, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/client/api";
import { PriorityBadge, StatusBadge } from "@/app/page";
import { categoryLabel, relativeTime } from "@/lib/utils/format";
import type { BusinessCase } from "@/lib/domain/types";

const categories = ["all", "customer_complaint", "delivery_failure", "refund_request", "supplier_issue", "operational_incident", "escalation"];
const statuses = ["all", "open", "awaiting_decision", "in_progress", "resolved", "dismissed"];

export default function CasesPage() {
  const [items, setItems] = useState<BusinessCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") : null;
    if (search || initialQuery) params.set("q", search || initialQuery || "");
    if (status !== "all") params.set("status", status);
    if (category !== "all") params.set("category", category);
    params.set("limit", "100");
    try { const result = await api<{ cases: BusinessCase[]; total: number }>(`/api/cases?${params}`); setItems(result.cases); setTotal(result.total); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load cases"); }
    finally { setLoading(false); }
  }, [search, status, category]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 250 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  useEffect(() => { const listener = () => void load(); window.addEventListener("lisa:refresh", listener); return () => window.removeEventListener("lisa:refresh", listener); }, [load]);
  const openCreate = () => window.dispatchEvent(new Event("lisa:create-case"));

  return <div className="page-content">
    <div className="page-heading"><div><div className="page-eyebrow">Operations workspace</div><h1 className="page-title">Cases</h1><p className="page-description">Every customer issue, decision and outcome in one place.</p></div><button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> New case</button></div>
    <section className="metric-grid" style={{ marginBottom: 17 }}><SmallMetric label="All cases" value={total} icon={<SlidersHorizontal size={14} />} /><SmallMetric label="Open" value={items.filter((x) => ["open", "analyzing", "in_progress"].includes(x.status)).length} icon={<Filter size={14} />} /><SmallMetric label="Awaiting decision" value={items.filter((x) => x.status === "awaiting_decision").length} icon={<Search size={14} />} /><SmallMetric label="Resolved" value={items.filter((x) => x.status === "resolved").length} icon={<ArrowRight size={14} />} /></section>
    <div className="filter-row"><div className="filter-search"><Search size={14} /><input placeholder="Search cases, customers, order IDs…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select aria-label="Filter by status" className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((x) => <option key={x} value={x}>{x === "all" ? "All statuses" : x.replace(/_/g, " ")}</option>)}</select><select aria-label="Filter by category" className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((x) => <option key={x} value={x}>{x === "all" ? "All categories" : categoryLabel(x)}</option>)}</select><span className="filter-spacer" /><span style={{ color: "var(--foreground-muted)", fontSize: 10 }}>{total} result{total === 1 ? "" : "s"}</span></div>
    {error && <div className="card card-pad" style={{ color: "#ad4841", marginBottom: 12 }}>{error}</div>}
    <section className="card card-pad"><div className="card-header" style={{ marginBottom: 10 }}><div><h2 className="card-title">Case inbox</h2><p className="card-caption">Select a case to review LISA&apos;s analysis, evidence and activity timeline.</p></div></div>
      {loading ? <div style={{ display: "grid", gap: 8 }}>{[1,2,3,4,5].map((n) => <div key={n} className="loading-skeleton" style={{ height: 47 }} />)}</div> : items.length ? <div className="case-table-wrap"><table className="case-table"><thead><tr><th>Case</th><th>Category</th><th>Priority</th><th>Status</th><th>Outcome</th><th>Updated</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><Link href={`/cases/${item.id}`} className="case-title-link">{item.title}</Link><span className="case-ref">{item.ref}{item.customer.name ? ` · ${item.customer.name}` : ""}</span></td><td>{categoryLabel(item.category)}</td><td><PriorityBadge priority={item.priority} /></td><td><StatusBadge status={item.status} /></td><td>{item.outcome ? <span className={`badge ${item.outcome === "success" ? "badge-resolved" : item.outcome === "failure" ? "badge-critical" : "badge-medium"}`}>{item.outcome}</span> : <span style={{ color: "var(--foreground-muted)" }}>—</span>}</td><td style={{ color: "var(--foreground-muted)", whiteSpace: "nowrap" }}>{relativeTime(item.updatedAt)}</td><td><Link aria-label={`Open ${item.ref}`} href={`/cases/${item.id}`} className="icon-button"><ArrowRight size={14} /></Link></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-state-icon"><Search size={19} /></span><h3>No cases found</h3><p>Try a different search or filter, or create a new case.</p><button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={13} /> Create case</button></div>}
    </section>
  </div>;
}

function SmallMetric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <article className="card metric-card" style={{ minHeight: 87, padding: "13px 15px" }}><div className="metric-top">{label}<span className="metric-icon">{icon}</span></div><div className="metric-value" style={{ marginTop: 10, fontSize: 21 }}>{value}</div></article>; }
