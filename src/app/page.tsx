"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Brain,
  Clock3,
  FolderOpen,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, jsonBody } from "@/lib/client/api";
import { categoryLabel, relativeTime } from "@/lib/utils/format";
import type { BusinessCase } from "@/lib/domain/types";

interface DashboardPayload {
  metrics: {
    totalCases: number; totalCasesChange: number; openCases: number; awaitingDecision: number; resolvedCases: number;
    resolvedThisMonth: number; successRate: number; successRateChange: number; memoryCount: number;
    averageResolutionHours: number; analysesCount: number; decisionsCount: number;
  };
  trend: Array<{ label: string; cases: number; resolved: number; successRate: number }>;
  categoryCounts: Array<{ category: string; label: string; count: number }>;
  recentCases: Array<Pick<BusinessCase, "id" | "ref" | "title" | "category" | "priority" | "status" | "outcome" | "customer" | "createdAt">>;
  recentLessons: Array<{ id: string; lesson: string; caseRef: string; createdAt: string; outcome: string }>;
  providers: { llm: string; memory: string; database: string; cache: string };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [operatorName, setOperatorName] = useState("Alex Morgan");

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 18 ? "Good afternoon" : "Good evening";

  const load = async () => {
    setLoading(true); setError("");
    try {
      let result = await api<DashboardPayload>("/api/dashboard");
      // Give a fresh demo workspace something real to learn from. This only
      // runs in a completely empty store and never overwrites operator data.
      if (result.metrics.totalCases === 0) {
        await api("/api/seed", { method: "POST", body: jsonBody({ scenario: "all" }) }).catch(() => undefined);
        result = await api<DashboardPayload>("/api/dashboard");
      }
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    api<{ settings: { operatorName?: string } }>("/api/settings").then((result) => {
      if (result.settings.operatorName) setOperatorName(result.settings.operatorName);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const listener = () => void load();
    window.addEventListener("lisa:refresh", listener);
    return () => window.removeEventListener("lisa:refresh", listener);
  }, []);

  const onCreate = () => window.dispatchEvent(new Event("lisa:create-case"));
  const metrics = data?.metrics;
  const maxCategory = Math.max(1, ...(data?.categoryCounts.map((item) => item.count) ?? [1]));
  const trendTotal = data?.trend.reduce((sum, item) => sum + item.cases, 0) ?? 0;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div><div className="page-eyebrow">{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div><h1 className="page-title">{greeting}, {operatorName.split(" ")[0]} <span style={{ fontSize: 20 }}>✦</span></h1><p className="page-description">Here’s what’s happening across your operations today.</p></div>
        <button className="btn btn-primary" onClick={onCreate}><Plus size={15} /> Create new case</button>
      </div>

      {error && <div className="card card-pad" style={{ marginBottom: 14, color: "#ad4841" }}>{error} <button className="btn btn-sm" onClick={() => void load()} style={{ marginLeft: 8 }}>Retry</button></div>}

      <section className="metric-grid" aria-label="Business operations metrics">
        <MetricCard title="Total cases" value={metrics?.totalCases} foot={metrics ? `${signed(metrics.totalCasesChange)} this month` : "Loading your workspace"} trend={metrics?.totalCasesChange} icon={<FolderOpen size={15} />} loading={loading} />
        <MetricCard title="Awaiting decision" value={metrics?.awaitingDecision} foot={metrics?.awaitingDecision ? "Your attention makes a difference" : "All caught up"} icon={<Clock3 size={15} />} loading={loading} tone={metrics?.awaitingDecision ? "amber" : "green"} />
        <MetricCard title="Positive outcomes" value={metrics ? `${Math.round(metrics.successRate * 100)}%` : undefined} foot={metrics ? `${metrics.resolvedCases} resolved cases recorded` : "Calculated from resolved cases"} trend={metrics?.successRateChange} icon={<TrendingUp size={15} />} loading={loading} />
        <MetricCard title="Learned experiences" value={metrics?.memoryCount} foot="Decisions with real outcomes remembered" icon={<Brain size={15} />} loading={loading} tone="violet" />
      </section>

      <section className="dashboard-grid">
        <article className="card card-pad">
          <div className="card-header"><div><h2 className="card-title">Case activity</h2><p className="card-caption">Weekly case volume · last 7 weeks</p></div><div className="chart-legend"><span><i className="legend-dot" />Created</span><span><i className="legend-dot" style={{ background: "#b8d7ca" }} />Resolved</span></div></div>
          <div className="chart-wrap">
            {loading ? <div className="loading-skeleton" style={{ width: "100%", height: "100%" }} /> : trendTotal === 0 ? <ChartEmpty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.trend} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="caseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3c8874" stopOpacity={0.16} /><stop offset="95%" stopColor="#3c8874" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--foreground-muted)", fontSize: 9 }} dy={9} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--foreground-muted)", fontSize: 9 }} />
                  <Tooltip contentStyle={{ border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--foreground)", fontSize: 10, boxShadow: "var(--card-shadow)" }} />
                  <Area type="monotone" dataKey="cases" name="Created" stroke="#37816f" strokeWidth={2} fill="url(#caseFill)" activeDot={{ r: 4, fill: "#37816f", strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#9fc8b5" strokeWidth={1.8} fill="transparent" activeDot={{ r: 3, fill: "#9fc8b5", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
        <article className="card card-pad">
          <div className="card-header"><div><h2 className="card-title">Cases by category</h2><p className="card-caption">Where your team is spending time</p></div><Link href="/analytics" className="btn btn-ghost btn-sm">View all <ArrowRight size={12} /></Link></div>
          {loading ? <div style={{ display: "grid", gap: 17, marginTop: 22 }}>{[1,2,3,4].map((n) => <div key={n} className="loading-skeleton" style={{ height: 25 }} />)}</div> : data?.categoryCounts.length ? <div className="category-list">{data.categoryCounts.slice(0, 5).map((item) => <div className="category-row" key={item.category}><span className="category-name">{item.label}</span><span className="category-count">{item.count}</span><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(5, item.count / maxCategory * 100)}%` }} /></div></div>)}</div> : <div className="empty-state" style={{ padding: 28 }}><p>Case categories will appear here.</p></div>}
        </article>
      </section>

      <section className="card card-pad" style={{ marginBottom: 15 }}>
        <div className="card-header" style={{ marginBottom: 9 }}><div><h2 className="card-title">Recent cases</h2><p className="card-caption">Stay close to the latest customer and operations issues.</p></div><Link href="/cases" className="btn btn-sm">All cases <ArrowRight size={13} /></Link></div>
        {loading ? <TableSkeleton /> : data?.recentCases.length ? <CaseTable cases={data.recentCases} /> : <div className="empty-state"><span className="empty-state-icon"><FolderOpen size={20} /></span><h3>Your case workspace is ready</h3><p>Create your first case, or start with the demo experience to see how LISA learns from outcomes.</p><button className="btn btn-primary btn-sm" onClick={onCreate}><Plus size={13} /> Create a case</button></div>}
      </section>

      <section className="bottom-grid">
        <article className="card card-pad">
          <div className="card-header"><div><h2 className="card-title">Latest learning</h2><p className="card-caption">Real outcomes shaping future recommendations</p></div><Link href="/memory" className="btn btn-ghost btn-sm">Memory <ArrowRight size={12} /></Link></div>
          <div className="activity-list">
            {loading ? [1,2].map((n) => <div className="loading-skeleton" key={n} style={{ height: 45, marginTop: 13 }} />) : data?.recentLessons.length ? data.recentLessons.slice(0, 3).map((item) => <div className="activity-item" key={item.id}><div className="activity-icon"><Sparkles size={13} /></div><div><div className="activity-title">{item.caseRef} · {item.outcome} outcome recorded</div><div className="activity-meta">{item.lesson}</div></div></div>) : <div className="activity-item"><div className="activity-icon"><Brain size={13} /></div><div><div className="activity-title">No resolved outcomes yet</div><div className="activity-meta">Resolve a case and LISA will remember what happened.</div></div></div>}
          </div>
        </article>
        <article className="card card-pad learning-card">
          <div className="card-header"><div><h2 className="card-title">LISA is learning</h2><p className="card-caption">Every resolution makes the next one better.</p></div><div className="metric-icon"><Brain size={15} /></div></div>
          {loading ? <div className="loading-skeleton" style={{ height: 98, marginTop: 22 }} /> : <><div className="learning-score"><span className="learning-number">{metrics?.memoryCount ?? 0}</span><span className="learning-label">experiences remembered</span></div><div className="learning-bar"><span style={{ width: `${Math.min(100, (metrics?.memoryCount ?? 0) * 12 + 7)}%` }} /></div><p className="learning-note">LISA recalls similar cases, weighs their real outcomes, and shows the evidence behind each recommendation. You stay in control.</p></>}
          <Link href="/memory" className="btn btn-ghost btn-sm" style={{ marginTop: 12, paddingLeft: 0 }}>Explore what LISA remembers <ArrowRight size={12} /></Link>
        </article>
      </section>
    </div>
  );
}

function MetricCard({ title, value, foot, trend, icon, loading, tone = "green" }: { title: string; value?: number | string; foot: string; trend?: number; icon: React.ReactNode; loading: boolean; tone?: string }) {
  return <article className="card metric-card"><div className="metric-top"><span>{title}</span><span className="metric-icon" style={tone === "amber" ? { color: "#b08039", background: "#faf2e3" } : tone === "violet" ? { color: "#7270a0", background: "#f0eff8" } : undefined}>{icon}</span></div>{loading ? <div className="loading-skeleton" style={{ width: 70, height: 27, marginTop: 12 }} /> : <div className="metric-value">{value ?? 0}</div>}<div className="metric-foot">{trend !== undefined && <span className={trend < 0 ? "metric-trend down" : "metric-trend"}>{trend > 0 ? "+" : ""}{trend}%</span>}<span>{foot}</span></div></article>;
}

function CaseTable({ cases }: { cases: DashboardPayload["recentCases"] }) {
  return <div className="case-table-wrap"><table className="case-table"><thead><tr><th>Case</th><th>Category</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead><tbody>{cases.slice(0, 6).map((item) => <tr key={item.id}><td><Link className="case-title-link" href={`/cases/${item.id}`}>{item.title}</Link><span className="case-ref">{item.ref}{item.customer.name ? ` · ${item.customer.name}` : ""}</span></td><td>{categoryLabel(item.category)}</td><td><PriorityBadge priority={item.priority} /></td><td><StatusBadge status={item.status} /></td><td style={{ color: "var(--foreground-muted)", whiteSpace: "nowrap" }}>{relativeTime(item.createdAt)}</td></tr>)}</tbody></table></div>;
}

export function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = { open: "badge-open", analyzing: "badge-progress", awaiting_decision: "badge-awaiting", in_progress: "badge-progress", resolved: "badge-resolved", dismissed: "badge-dismissed" };
  const label: Record<string, string> = { awaiting_decision: "Awaiting decision", in_progress: "In progress" };
  return <span className={`badge ${classes[status] ?? "badge-open"}`}><i className="badge-dot" />{label[status] ?? status.replace(/_/g, " ")}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge badge-${priority}`}>{priority}</span>;
}

function ChartEmpty() { return <div className="empty-state" style={{ padding: 30 }}><span className="empty-state-icon"><Activity size={18} /></span><h3>Case activity will appear here</h3><p>Create or import cases to start tracking your weekly operation.</p></div>; }
function TableSkeleton() { return <div style={{ display: "grid", gap: 1 }}>{[1,2,3,4].map((n) => <div className="loading-skeleton" key={n} style={{ height: 37 }} />)}</div>; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value}%`; }
