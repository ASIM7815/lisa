"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { BusinessCase, CaseCategory, Priority } from "@/lib/domain/types";
import { CATEGORY_LABELS } from "@/lib/domain/types";
import { api, jsonBody } from "@/lib/client/api";

const CATEGORIES = Object.entries(CATEGORY_LABELS) as Array<[CaseCategory, string]>;

export function CreateCaseModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (record: BusinessCase) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CaseCategory>("customer_complaint");
  const [priority, setPriority] = useState<Priority>("medium");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDescription(""); setCategory("customer_complaint"); setPriority("medium");
      setCustomerName(""); setEmail(""); setOrderId(""); setError("");
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await api<{ case: BusinessCase }>("/api/cases", {
        method: "POST",
        body: jsonBody({ title, description, category, priority, customer: { name: customerName || undefined, email: email || undefined, orderId: orderId || undefined, channel: "dashboard" } }),
      });
      onCreated(result.case);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create case"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-case-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <div><h2 id="create-case-title">Create an operations case</h2><p>Give LISA the context it needs to find a helpful precedent.</p></div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="field"><label htmlFor="case-title">Case title *</label><input id="case-title" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parcel marked delivered but not received" autoFocus /></div>
          <div className="field"><label htmlFor="case-description">What happened? *</label><textarea id="case-description" required minLength={10} maxLength={12000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue, what the customer needs, and any relevant timing or evidence…" /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="case-category">Category</label><select id="case-category" value={category} onChange={(e) => setCategory(e.target.value as CaseCategory)}>{CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div className="field"><label htmlFor="case-priority">Priority</label><select id="case-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
            <div className="field"><label htmlFor="case-customer">Customer name</label><input id="case-customer" maxLength={160} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" /></div>
            <div className="field"><label htmlFor="case-email">Customer email</label><input id="case-email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" /></div>
            <div className="field"><label htmlFor="case-order">Order / reference ID</label><input id="case-order" maxLength={120} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Optional" /></div>
          </div>
          {error && <div className="error-text" role="alert">{error}</div>}
        </div>
        <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" disabled={busy} className="btn btn-primary">{busy ? <><Loader2 className="spinner" size={14} /> Creating…</> : "Create case"}</button></div>
      </form>
    </div>
  );
}
