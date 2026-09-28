"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { api, jsonBody } from "@/lib/client/api";
import { useShell } from "@/components/app-shell";
import { PriorityBadge, StatusBadge } from "@/app/page";
import { categoryLabel, formatDate, percent } from "@/lib/utils/format";
import type { ActionCategory, BusinessCase, CaseAnalysis, DecisionRecord, TimelineEvent } from "@/lib/domain/types";

interface Details { case: BusinessCase; analysis: CaseAnalysis | null; decisions: DecisionRecord[]; timeline: TimelineEvent[] }

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const shell = useShell();
  const [data, setData] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [outcome, setOutcome] = useState("success");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifiedAction, setModifiedAction] = useState("");
  const [modifiedCategory, setModifiedCategory] = useState<ActionCategory>("contact_customer");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<Details>(`/api/cases/${encodeURIComponent(id)}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load case"); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const analyze = async (force = false) => {
    setWorking(true); setError("");
    try { await api(`/api/cases/${id}/analyze`, { method: "POST", body: jsonBody({ force }) }); await load(); shell?.showToast("LISA's analysis is ready"); }
    catch (err) { setError(err instanceof Error ? err.message : "Analysis failed"); }
    finally { setWorking(false); }
  };

  const decide = async (action: "approve" | "reject" | "modify", recommendation?: CaseAnalysis["recommendation"]) => {
    setWorking(true); setError("");
    try {
      await api(`/api/cases/${id}/decision`, { method: "POST", body: jsonBody({ action, operator: shell?.operatorName ?? "Operator", note: decisionNote, ...(recommendation ? { modifiedRecommendation: recommendation } : {}) }) });
      await load(); setDecisionNote(""); setModifyOpen(false); shell?.showToast(action === "approve" ? "Recommendation approved — ready to resolve" : action === "reject" ? "Recommendation rejected" : "Your recommendation was recorded");
    } catch (err) { setError(err instanceof Error ? err.message : "Decision failed"); }
    finally { setWorking(false); }
  };

  const resolve = async (event: React.FormEvent) => {
    event.preventDefault(); setWorking(true); setError("");
    try {
      const result = await api<{ resolution: { memoryRetained: boolean } }>(`/api/cases/${id}/resolve`, { method: "POST", body: jsonBody({ outcome, outcomeNote, resolutionNote, operator: shell?.operatorName ?? "Operator" }) });
      setResolveOpen(false); await load(); shell?.showToast(result.resolution.memoryRetained ? "Outcome recorded and added to LISA's memory" : "Outcome recorded locally");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not resolve case"); }
    finally { setWorking(false); }
  };

  const record = data?.case;
  const analysis = data?.analysis;
  const latestDecision = data?.decisions?.at(-1);
  const canDecide = record && !["resolved", "dismissed"].includes(record.status) && Boolean(analysis);
  const action = latestDecision?.modifiedRecommendation ?? analysis?.recommendation;

  if (loading) return <div className="page-content"><div className="loading-skeleton" style={{ height: 35, width: "32%", marginBottom: 20 }} /><div className="loading-skeleton" style={{ height: 140, marginBottom: 15 }} /><div className="loading-skeleton" style={{ height: 300 }} /></div>;
  if (!record) return <div className="page-content"><Link href="/cases" className="btn"><ArrowLeft size={14} /> Back to cases</Link><div className="empty-state"><h3>Case not found</h3><p>{error || "This case may have been removed."}</p><button className="btn btn-primary" onClick={() => router.push("/cases")}>Open cases</button></div></div>;

  return <div className="page-content">
    <div style={{ marginBottom: 18 }}><Link href="/cases" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}><ArrowLeft size={13} /> All cases</Link></div>
    <div className="page-heading"><div><div className="page-eyebrow">{record.ref} · {categoryLabel(record.category)}</div><h1 className="page-title" style={{ maxWidth: 850 }}>{record.title}</h1><p className="page-description">Created {formatDate(record.createdAt)}{record.customer.name ? ` · ${record.customer.name}` : ""}{record.customer.orderId ? ` · Order ${record.customer.orderId}` : ""}</p></div><div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}><StatusBadge status={record.status} /><PriorityBadge priority={record.priority} /></div></div>
    {error && <div className="card card-pad" role="alert" style={{ color: "#ad4841", marginBottom: 14 }}>{error}</div>}
    <div className="case-detail-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">Case summary</h2><p className="card-caption">Original context provided to LISA</p></div>{record.customer.email && <a className="btn btn-sm" href={`mailto:${encodeURIComponent(record.customer.email)}`}><ExternalLink size={12} /> Contact customer</a>}</div><p style={{ margin: "14px 0 0", color: "var(--foreground-secondary)", fontSize: 11, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{record.description}</p>{record.customer.email && <div style={{ marginTop: 13, color: "var(--foreground-muted)", fontSize: 10 }}>Customer · {record.customer.email}</div>}</section>

        {analysis ? <section className="card card-pad recommendation"><div className="card-header"><div><div className="recommendation-label"><Sparkles size={13} /> LISA recommendation</div><h2 className="recommendation-action">{action?.action}</h2><p style={{ margin: 0, color: "var(--foreground-secondary)", fontSize: 10, lineHeight: 1.7 }}>{action?.rationale}</p><div className="confidence"><span className="confidence-track"><span style={{ width: `${(action?.confidence ?? 0) * 100}%` }} /></span><strong>{percent(action?.confidence ?? 0)} confidence</strong><span>· {analysis.provider}{analysis.providerMode === "local" ? " (local)" : ""}</span></div></div><button className="icon-button" title="Run fresh analysis" disabled={working || ["resolved", "dismissed"].includes(record.status)} onClick={() => void analyze(true)}><RefreshCw size={14} className={working ? "spinner" : ""} /></button></div>
          <div style={{ marginTop: 17, paddingTop: 14, borderTop: "1px solid var(--border)" }}><div className="card-title">Recommended next steps</div><ol className="step-list">{action?.steps.map((step, i) => <li key={`${step}-${i}`}><span className="step-num">{i + 1}</span>{step}</li>)}</ol></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 17 }}>{canDecide && (!latestDecision || latestDecision.action === "reject") && <><button className="btn btn-primary btn-sm" disabled={working} onClick={() => void decide("approve")}><ThumbsUp size={13} /> Approve recommendation</button><button className="btn btn-sm" disabled={working} onClick={() => { setModifiedAction(action?.action ?? ""); setModifiedCategory(action?.actionCategory ?? "contact_customer"); setModifyOpen(true); }}>Modify</button><button className="btn btn-sm btn-danger" disabled={working} onClick={() => void decide("reject")}><ThumbsDown size={13} /> Reject</button></>}{record.status === "in_progress" && <button className="btn btn-primary btn-sm" onClick={() => setResolveOpen(true)}><CheckCircle2 size={13} /> Record outcome</button>}</div>
          {latestDecision && <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 11, color: "var(--foreground-muted)", fontSize: 9 }}>Latest operator decision: <strong style={{ color: "var(--foreground-secondary)" }}>{latestDecision.action}</strong>{latestDecision.note ? ` · ${latestDecision.note}` : ""}</div>}
        </section> : <section className="card card-pad"><div className="empty-state" style={{ padding: 20 }}><span className="empty-state-icon"><Sparkles size={19} /></span><h3>Ready for LISA’s analysis</h3><p>LISA will recall similar resolved cases, compare their outcomes and recommend a next step for you to review.</p><button className="btn btn-primary" disabled={working} onClick={() => void analyze()}>{working ? <><Loader2 size={14} className="spinner" /> Analyzing…</> : <><Sparkles size={14} /> Analyze with LISA</>}</button></div></section>}

        {analysis?.memory.similarCases.length ? <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">Similar resolved cases</h2><p className="card-caption">Precedents retrieved from LISA’s experience memory</p></div><Brain size={16} color="var(--accent)" /></div><div style={{ display: "grid", gap: 12, marginTop: 17 }}>{analysis.memory.similarCases.map((item) => <Link href={`/cases/${item.caseId}`} key={item.caseId} className="memory-match" style={{ textDecoration: "none" }}><p style={{ color: "var(--foreground)", fontWeight: 670 }}>{item.title}</p><div className="memory-match-meta"><span>{item.ref}</span><span>·</span><span>{Math.round(item.score * 100)}% match</span><span>·</span><span className={`badge ${item.outcome === "success" ? "badge-resolved" : item.outcome === "failure" ? "badge-critical" : "badge-medium"}`}>{item.outcome ?? "no outcome"}</span></div>{item.takeaway && <p style={{ marginTop: 7 }}>{item.takeaway}</p>}</Link>)}</div><div style={{ marginTop: 13, color: "var(--foreground-muted)", fontSize: 9 }}>Retrieved using {analysis.memory.provider}{analysis.memory.providerMode === "local" ? " · local lexical fallback" : " · Hindsight recall"}</div></section> : analysis && <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">Memory evidence</h2><p className="card-caption">Similar resolved case history</p></div><Brain size={16} color="var(--accent)" /></div><p style={{ color: "var(--foreground-secondary)", fontSize: 10, lineHeight: 1.7, margin: "14px 0 0" }}>{analysis.memory.reflection}</p></section>}

        {analysis?.riskFactors.length ? <section className="card card-pad"><div className="card-header"><h2 className="card-title">Things to verify</h2><AlertTriangle size={15} color="#af7b35" /></div><ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--foreground-secondary)", fontSize: 10, lineHeight: 1.8 }}>{analysis.riskFactors.map((risk) => <li key={risk}>{risk}</li>)}</ul></section> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <section className="card card-pad"><div className="card-header"><div><h2 className="card-title">Activity</h2><p className="card-caption">A complete, auditable case history</p></div><Clock3 size={15} color="var(--foreground-muted)" /></div><div className="timeline">{data?.timeline.map((event) => <div className="timeline-row" key={event.id}><div className="timeline-node"><EventIcon type={event.type} /></div><div><div className="timeline-name">{event.title}</div>{event.detail && <div className="timeline-detail">{event.detail}</div>}<div className="timeline-date">{formatDate(event.createdAt)} · {event.actor}</div></div></div>)}</div></section>
        <section className="card card-pad"><h2 className="card-title">Analysis details</h2><div className="service-row"><span className="service-name"><Sparkles size={13} /> AI provider</span><span className="status-text">{analysis?.provider ?? "Not analyzed"}</span></div><div className="service-row"><span className="service-name"><Brain size={13} /> Memory provider</span><span className="status-text">{analysis?.memory.provider ?? "Pending"}</span></div><div className="service-row"><span className="service-name"><Clock3 size={13} /> Analysis time</span><span className="status-text">{analysis ? `${analysis.latencyMs}ms` : "—"}</span></div><div className="service-row"><span className="service-name"><Check size={13} /> Learned adjustments</span><span className="status-text">{analysis?.memory.adjustments.length ?? 0}</span></div></section>
        {record.status === "resolved" && <section className="card card-pad"><div className="recommendation-label"><CheckCircle2 size={13} /> Resolution recorded</div><h2 style={{ margin: "11px 0 4px", fontSize: 14, textTransform: "capitalize" }}>{record.outcome} outcome</h2><p style={{ margin: 0, color: "var(--foreground-secondary)", fontSize: 10, lineHeight: 1.7 }}>{record.outcomeNote}</p><Link href="/memory" className="btn btn-ghost btn-sm" style={{ marginTop: 11, paddingLeft: 0 }}>See what LISA learned <ArrowRight size={12} /></Link></section>}
      </div>
    </div>
    {resolveOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={resolve}><div className="modal-header"><div><h2>Record the real outcome</h2><p>This evidence is what helps LISA learn from the decision.</p></div><button type="button" className="icon-button" onClick={() => setResolveOpen(false)}><X size={15} /></button></div><div className="modal-body"><div className="field"><label>Outcome *</label><select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="success">Success — worked as intended</option><option value="partial">Partial — some progress, some gaps</option><option value="failure">Failure — did not solve the issue</option><option value="unknown">Unknown — outcome not yet confirmed</option></select></div><div className="field"><label>What happened? *</label><textarea minLength={3} required value={outcomeNote} onChange={(e) => setOutcomeNote(e.target.value)} placeholder="What did the customer or business experience after the action?" /></div><div className="field"><label>Resolution notes</label><input value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Optional internal notes" /></div>{error && <div className="error-text">{error}</div>}<p className="field-hint">LISA will store the case, operator decision, action and outcome together in its long-term memory.</p></div><div className="modal-footer"><button type="button" className="btn" onClick={() => setResolveOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={working}>{working ? "Saving…" : "Resolve & teach LISA"}</button></div></form></div>}
    {modifyOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={(event) => { event.preventDefault(); const recommendation = { ...(analysis!.recommendation), action: modifiedAction, actionCategory: modifiedCategory }; void decide("modify", recommendation); }}><div className="modal-header"><div><h2>Modify LISA’s recommendation</h2><p>Your adjustment is recorded as a human decision.</p></div><button type="button" className="icon-button" onClick={() => setModifyOpen(false)}><X size={15} /></button></div><div className="modal-body"><div className="field"><label>Recommended action</label><input minLength={5} maxLength={500} required value={modifiedAction} onChange={(e) => setModifiedAction(e.target.value)} /></div><div className="field"><label>Action type</label><select value={modifiedCategory} onChange={(e) => setModifiedCategory(e.target.value as ActionCategory)}>{Object.entries({ reship: "Reship order", replacement: "Send replacement", refund_full: "Full refund", refund_partial: "Partial refund", voucher_goodwill: "Goodwill voucher", contact_customer: "Contact customer", escalate_manager: "Escalate to manager", escalate_supplier: "Escalate to supplier", engineer_fix: "Engineering fix", process_change: "Process change", no_action: "No action" }).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div><div className="field"><label>Why did you change it?</label><textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Optional — your reasoning becomes useful evidence." /></div></div><div className="modal-footer"><button type="button" className="btn" onClick={() => setModifyOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={working}>{working ? "Saving…" : "Save modified decision"}</button></div></form></div>}
  </div>;
}

function EventIcon({ type }: { type: string }) {
  const props = { size: 11, strokeWidth: 2 };
  if (type === "resolved" || type === "decision") return <CheckCircle2 {...props} />;
  if (type === "analyzed" || type === "recommended") return <Sparkles {...props} />;
  if (type === "memory_retained") return <Brain {...props} />;
  return <Clock3 {...props} />;
}
