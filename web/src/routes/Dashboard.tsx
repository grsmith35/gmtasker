import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  needs_review: "Needs Review",
  closed: "Closed"
};

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{children}</span>;
}

export default function Dashboard() {
  const user = getUser()!;
  const [searchParams, setSearchParams] = useSearchParams();
  const assignedTo = searchParams.get("assignedTo") || "";
  const [status, setStatus] = useState("open");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const statuses = user.role === "gm"
    ? ["open","in_progress","on_hold","needs_review","closed"]
    : ["open","in_progress","on_hold","needs_review"];

  async function load() {
    setLoading(true); setErr(null);
    try {
      const params: Record<string,string> = { status };
      if (user.role === "contractor") params.mine = "1";
      if (assignedTo && user.role === "gm") params.assignedTo = assignedTo;
      const rows = await api.listWorkOrders(params);
      setItems(rows);
    } catch (e:any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [status, assignedTo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Work Orders</h1>
          <p className="text-sm text-slate-600">{user.role === "gm" ? "Manage tasks, parts, and reviews." : "Your assigned tasks."}</p>
          {assignedTo && user.role === "gm" && (
            <div className="mt-2 text-xs text-slate-500">
              Filtered by contractor. <button className="underline" onClick={() => { const next = new URLSearchParams(searchParams); next.delete("assignedTo"); setSearchParams(next); }}>Clear filter</button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            {statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          {user.role === "gm" && <Link to="/tasks/new"><Button>Create</Button></Link>}
        </div>
      </div>

      {err && <Card className="border-rose-200 bg-rose-50 text-rose-800">{err}</Card>}

      <div className="grid gap-3">
        {loading ? (
          <Card>Loading…</Card>
        ) : items.length === 0 ? (
          <Card>No work orders in this view.</Card>
        ) : items.map((wo) => (
          <Link key={wo.id} to={`/tasks/${wo.id}`}>
            <Card className="hover:border-slate-200 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{wo.title}</div>
                  <div className="mt-1 text-sm text-slate-600 line-clamp-2">{wo.description || "—"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{STATUS_LABEL[wo.status] ?? wo.status}</Badge>
                    <Badge>Priority: {wo.priority}</Badge>
                    {wo.onHoldReason && <Badge>Hold: {wo.onHoldReason}</Badge>}
                  </div>
                </div>
                <div className="text-xs text-slate-500">Updated {new Date(wo.updatedAt).toLocaleString()}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
