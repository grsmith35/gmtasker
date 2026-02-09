import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  needs_review: "Needs Review",
  closed: "Closed"
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-slate-800">{children}</div>;
}

function MoneyInput({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const display = value === null || value === undefined ? "" : (value / 100).toFixed(2);
  return (
    <Input
      value={display}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") { onChange(null); return; }
        const normalized = raw.replace(/[^0-9.]/g, "");
        const dollars = Number(normalized);
        if (Number.isNaN(dollars)) return;
        onChange(Math.round(dollars * 100));
      }}
      placeholder="0.00"
    />
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = getUser()!;
  const [data, setData] = useState<any | null>(null);
  const [tab, setTab] = useState<"details"|"parts"|"completion"|"comments"|"history">("details");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const d = await api.getWorkOrder(id!);
      setData(d);
    } catch (e:any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  const wo = data?.workOrder;
  const parts = data?.parts ?? [];
  const comments = data?.comments ?? [];
  const events = data?.events ?? [];
  const completions = data?.completions ?? [];
  const attachments = data?.attachments ?? [];
  const activeAssignment = data?.assignment ?? null;

  const partsBlocking = useMemo(() => parts.filter((p:any) => p.isRequired && !(p.approvalStatus === "approved" && p.procurementStatus === "arrived")), [parts]);

  // editable fields
  const [editStatus, setEditStatus] = useState("open");
  const [holdReason, setHoldReason] = useState("");
  const [holdNotes, setHoldNotes] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  useEffect(() => {
    if (!wo) return;
    setEditStatus(wo.status);
    setHoldReason(wo.onHoldReason || "");
    setHoldNotes(wo.onHoldNotes || "");
    setPriority(wo.priority || "normal");
    if (wo.dueAt) {
      const local = new Date(wo.dueAt);
      setDueDate(local.toISOString().slice(0, 10));
      setDueTime(local.toISOString().slice(11, 16));
    } else {
      setDueDate("");
      setDueTime("17:00");
    }
  }, [wo?.id]);

  async function saveDetails() {
    setErr(null);
    try {
      const dueAtValue = dueDate && dueTime ? new Date(`${dueDate}T${dueTime}`).toISOString() : null;
      await api.updateWorkOrder(id!, {
        status: editStatus,
        onHoldReason: holdReason || null,
        onHoldNotes: holdNotes || null,
        priority,
        dueAt: dueAtValue
      });
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  // parts
  const [partName, setPartName] = useState("");
  const [partQty, setPartQty] = useState(1);
  async function addPart() {
    setErr(null);
    try {
      await api.addPart(id!, { name: partName, quantity: partQty, isRequired: true });
      setPartName(""); setPartQty(1);
      await load();
      setTab("parts");
    } catch (e:any) { setErr(e.message); }
  }
  async function updatePart(partId: string, patch: any) {
    setErr(null);
    try { await api.updatePart(id!, partId, patch); await load(); }
    catch (e:any) { setErr(e.message); }
  }

  // assign
  const [contractors, setContractors] = useState<any[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [forceAssign, setForceAssign] = useState(false);
  const [isEditingAssignee, setIsEditingAssignee] = useState(false);
  useEffect(() => {
    if (user.role !== "gm") return;
    api.getUsers().then((u) => {
      const c = u.filter((x:any) => x.role === "contractor");
      setContractors(c);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!contractors.length) return;
    if (activeAssignment?.assignedToUserId) setAssigneeId(activeAssignment.assignedToUserId);
    else if (!assigneeId && contractors[0]?.id) setAssigneeId(contractors[0].id);
  }, [contractors, activeAssignment?.assignedToUserId]);
  useEffect(() => {
    setIsEditingAssignee(!activeAssignment);
  }, [activeAssignment?.id]);
  async function assign() {
    setErr(null);
    try {
      await api.assign(id!, { assignedToUserId: assigneeId, force: forceAssign });
      setIsEditingAssignee(false);
      setForceAssign(false);
      await load();
    }
    catch (e:any) { setErr(e.message); }
  }

  // comments
  const [comment, setComment] = useState("");
  async function addComment() {
    setErr(null);
    try { await api.addComment(id!, comment); setComment(""); await load(); setTab("comments"); }
    catch (e:any) { setErr(e.message); }
  }

  // completion (contractor)
  const [minutes, setMinutes] = useState("60");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  async function submitCompletion() {
    setErr(null);
    try {
      await api.submitCompletion(id!, Number(minutes), notes, photos);
      setNotes(""); setPhotos([]);
      await load();
      setTab("completion");
    } catch (e:any) { setErr(e.message); }
  }
  async function reviewCompletion(completionId: string, decision: "approve"|"reject") {
    const reviewNotes = decision === "reject" ? prompt("Reason / notes for contractor? (optional)") ?? "" : "";
    setErr(null);
    try { await api.reviewCompletion(id!, completionId, decision, reviewNotes); await load(); }
    catch (e:any) { setErr(e.message); }
  }

  async function closeWO() {
    setErr(null);
    try { await api.close(id!); await load(); }
    catch (e:any) { setErr(e.message); }
  }

  if (err) return <Card className="border-rose-200 bg-rose-50 text-rose-800">{err}</Card>;
  if (!wo) return <Card>Loading…</Card>;

  const canEditGM = user.role === "gm" && wo.status !== "closed";
  const completionPhotosFor = (completionId: string) =>
    attachments.filter((a:any) => a.completionId === completionId).map((a:any) => a.fileUrl);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{wo.title}</h1>
          <div className="mt-1 text-sm text-slate-600">{wo.description || "—"}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-1">Status: {STATUS_LABEL[wo.status] ?? wo.status}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">Priority: {wo.priority}</span>
            {wo.onHoldReason && <span className="rounded-full bg-amber-100 px-2 py-1">Hold: {wo.onHoldReason}</span>}
            {partsBlocking.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-1">{partsBlocking.length} required part(s) not ready</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => nav(-1)}>Back</Button>
          {user.role === "gm" && wo.status !== "closed" && <Button variant="danger" onClick={closeWO}>Close</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["details","parts","completion","comments","history"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>
            {t === "details" ? "Details" : t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {tab === "details" && (
        <Card className="space-y-3">
          <SectionTitle>Task status & hold</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-600">Priority</label>
              <Select disabled={!canEditGM} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-600">Due</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  disabled={!canEditGM}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <Select
                  disabled={!canEditGM}
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from({ length: 96 }, (_, i) => {
                    const hours = String(Math.floor(i / 4)).padStart(2, "0");
                    const minutes = String((i % 4) * 15).padStart(2, "0");
                    const value = `${hours}:${minutes}`;
                    return <option key={value} value={value}>{value}</option>;
                  })}
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-600">Status</label>
              <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="needs_review" disabled={user.role !== "gm"}>Needs Review</option>
                <option value="closed" disabled>Closed</option>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-600">Hold reason</label>
              <Select value={holdReason} onChange={(e) => setHoldReason(e.target.value)}>
                <option value="">—</option>
                <option value="awaiting_parts">awaiting_parts</option>
                <option value="awaiting_approval">awaiting_approval</option>
                <option value="awaiting_access">awaiting_access</option>
                <option value="awaiting_vendor">awaiting_vendor</option>
                <option value="other">other</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-600">Hold notes</label>
            <Input value={holdNotes} onChange={(e) => setHoldNotes(e.target.value)} placeholder="e.g. waiting on part shipment ETA Friday" />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveDetails}>Save</Button>
          </div>

          {user.role === "gm" && wo.status !== "closed" && (
            <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
              <SectionTitle>Assign contractor</SectionTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200"
                  onClick={() => setIsEditingAssignee((value) => !value)}
                  title={isEditingAssignee ? "Hide assignee editor" : "Edit assignee"}
                >
                  {activeAssignment ? `Assigned: ${activeAssignment.assignedToName}` : "Unassigned"}
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  onClick={() => setIsEditingAssignee((value) => !value)}
                  title={isEditingAssignee ? "Hide assignee editor" : "Edit assignee"}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-9 9-3.7.8a.8.8 0 0 1-.9-.9l.8-3.7 9-9Zm-8.8 9.9-.4 1.8 1.8-.4 8.2-8.2-1.4-1.4-8.2 8.2Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                  onClick={() => setIsEditingAssignee((value) => !value)}
                >
                  {isEditingAssignee ? "Done" : "Edit"}
                </button>
              </div>
              {isEditingAssignee && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                      {contractors.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.email})</option>)}
                    </Select>
                    {partsBlocking.length > 0 && !forceAssign && (
                      <div className="mt-2 text-xs text-amber-700">
                        Assignment blocked: required parts must be <b>approved</b> and <b>arrived</b>.
                        Toggle “Force assign” to override (recorded in history).
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input id="force" type="checkbox" checked={forceAssign} onChange={(e) => setForceAssign(e.target.checked)} />
                    <label htmlFor="force" className="text-sm text-slate-700">Force assign</label>
                  </div>
                </div>
              )}
              {isEditingAssignee && (
                <div className="flex justify-end">
                  <Button onClick={assign} disabled={!assigneeId}>Assign & Notify</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === "parts" && (
        <Card className="space-y-3">
          <SectionTitle>Parts</SectionTitle>
          {user.role === "gm" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Part name" />
              <Input value={String(partQty)} onChange={(e) => setPartQty(Number(e.target.value))} placeholder="Qty" />
              <Button onClick={addPart} disabled={!partName.trim()}>Add part</Button>
            </div>
          )}
          <div className="space-y-3">
            {parts.length === 0 ? (
              <div className="text-sm text-slate-600">No parts yet.</div>
            ) : parts.map((p:any) => (
              <div key={p.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name} <span className="text-xs text-slate-500">x{p.quantity}</span></div>
                  <div className="text-xs text-slate-500">{p.isRequired ? "Required" : "Optional"}</div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="text-xs text-slate-600">Approval</label>
                    <Select disabled={user.role !== "gm"} value={p.approvalStatus} onChange={(e) => updatePart(p.id, { approvalStatus: e.target.value })}>
                      <option value="not_requested">not_requested</option>
                      <option value="pending_approval">pending_approval</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Procurement</label>
                    <Select disabled={user.role !== "gm"} value={p.procurementStatus} onChange={(e) => updatePart(p.id, { procurementStatus: e.target.value })}>
                      <option value="not_started">not_started</option>
                      <option value="quoted">quoted</option>
                      <option value="ordered">ordered</option>
                      <option value="arrived">arrived</option>
                      <option value="backordered">backordered</option>
                      <option value="cancelled">cancelled</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Quoted total ($)</label>
                    <MoneyInput value={p.quotedTotalCostCents} onChange={(n) => updatePart(p.id, { quotedTotalCostCents: n })} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Actual total ($)</label>
                    <MoneyInput value={p.actualTotalCostCents} onChange={(n) => updatePart(p.id, { actualTotalCostCents: n })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "completion" && (
        <Card className="space-y-3">
          <SectionTitle>Completion</SectionTitle>

          {user.role === "contractor" && wo.status !== "closed" && (
            <div className="space-y-3 rounded-xl border border-slate-100 p-3">
              <div className="text-sm text-slate-700">Submit completion package (GM will review).</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-600">Minutes worked</label>
                  <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Photos</label>
                  <Input type="file" multiple accept="image/*" onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-600">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done, anything to note..." />
              </div>
              <div className="flex justify-end">
                <Button onClick={submitCompletion} disabled={photos.length === 0 || Number(minutes) <= 0}>Submit</Button>
              </div>
            </div>
          )}

          {completions.length === 0 ? (
            <div className="text-sm text-slate-600">No completion submissions yet.</div>
          ) : completions.map((c:any) => (
            <div key={c.id} className="rounded-xl border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{c.submittedByName} • {Math.round((c.hoursWorkedMinutes/60)*10)/10} hrs</div>
                <div className="text-xs text-slate-500">{new Date(c.submittedAt).toLocaleString()}</div>
              </div>
              <div className="text-sm text-slate-700">{c.completionNotes || "—"}</div>
              <div className="text-xs">Review status: <span className="font-semibold">{c.reviewStatus}</span></div>
              {c.reviewNotes && <div className="text-sm text-amber-700">GM notes: {c.reviewNotes}</div>}
              <div className="flex flex-wrap gap-2">
                {completionPhotosFor(c.id).map((url: string) => (
                  <img key={url} src={`${import.meta.env.VITE_API_BASE || "http://localhost:4000"}${url}`} className="h-24 w-24 rounded-lg object-cover border border-slate-100" />
                ))}
              </div>

              {user.role === "gm" && c.reviewStatus === "submitted" && wo.status !== "closed" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => reviewCompletion(c.id, "approve")}>Approve</Button>
                  <Button variant="danger" onClick={() => reviewCompletion(c.id, "reject")}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {tab === "comments" && (
        <Card className="space-y-3">
          <SectionTitle>Comments</SectionTitle>
          <div className="flex gap-2">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." />
            <Button onClick={addComment} disabled={!comment.trim()}>Post</Button>
          </div>
          <div className="space-y-2">
            {comments.length === 0 ? (
              <div className="text-sm text-slate-600">No comments.</div>
            ) : comments.map((c:any) => (
              <div key={c.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{c.userName}</div>
                  <div className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-sm text-slate-700">{c.message}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "history" && (
        <Card className="space-y-3">
          <SectionTitle>History</SectionTitle>
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-sm text-slate-600">No history yet.</div>
            ) : events.map((e:any) => (
              <div key={e.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{e.actorName}</div>
                  <div className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-sm text-slate-700">{e.message}</div>
                <div className="mt-1 text-xs text-slate-500">{e.type}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
