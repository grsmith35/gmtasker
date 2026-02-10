import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

const PRESETS = [7, 30, 90] as const;

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fromToForPreset(days: number) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { fromDate: toDateInputValue(start), toDate: toDateInputValue(end) };
}

function rangeToParams(fromDate: string, toDate: string) {
  const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
  return {
    from: from ? from.toISOString() : "",
    to: to ? to.toISOString() : "",
  };
}

function formatHours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString();
}

function isOverdue(dueAt?: string | null) {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

export default function Contractors() {
  const nav = useNavigate();
  const [preset, setPreset] = useState<string>("30");
  const initial = fromToForPreset(30);
  const [fromDate, setFromDate] = useState(initial.fromDate);
  const [toDate, setToDate] = useState(initial.toDate);
  const [siteId, setSiteId] = useState<string>("");
  const [sites, setSites] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"overdue" | "open" | "hours" | "closed" | "name" | "needs_review" | "on_hold">("overdue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    api.getSites().then((rows) => {
      setSites(rows);
      if (rows.length === 1) setSiteId(rows[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (preset === "custom") return;
    const days = Number(preset);
    const next = fromToForPreset(days);
    setFromDate(next.fromDate);
    setToDate(next.toDate);
  }, [preset]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const range = rangeToParams(fromDate, toDate);
      const params: Record<string, string> = { from: range.from, to: range.to };
      if (siteId) params.siteId = siteId;
      const res = await api.getContractorsDashboard(params);
      setData(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [fromDate, toDate, siteId]);

  const rows = data?.rows ?? [];
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter((r: any) =>
          String(r.full_name).toLowerCase().includes(q) || String(r.email).toLowerCase().includes(q)
        )
      : rows;

    const sorted = [...list];
    sorted.sort((a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "overdue") {
        if (b.overdue_count !== a.overdue_count) return (b.overdue_count - a.overdue_count) * dir;
        return (b.open_count - a.open_count) * dir;
      }
      if (sortKey === "open") return (b.open_count - a.open_count) * dir;
      if (sortKey === "needs_review") return (b.needs_review_count - a.needs_review_count) * dir;
      if (sortKey === "on_hold") return (b.on_hold_count - a.on_hold_count) * dir;
      if (sortKey === "hours") return (b.hours_minutes - a.hours_minutes) * dir;
      if (sortKey === "closed") return (b.closed_range_count - a.closed_range_count) * dir;
      if (sortKey === "name") return String(a.full_name).localeCompare(String(b.full_name)) * dir;
      return 0;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  function setSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  async function openDetail(contractorId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const range = rangeToParams(fromDate, toDate);
      const params: Record<string, string> = { from: range.from, to: range.to };
      if (siteId) params.siteId = siteId;
      const res = await api.getContractorDetail(contractorId, params);
      setDetail(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  const kpis = data?.kpis ?? { open_count: 0, overdue_count: 0, overdue_priority_count: 0, closed_range_count: 0, hours_minutes: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contractors</h1>
          <p className="text-sm text-slate-600">Workload and productivity across contractors.</p>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div>
            <label className="text-sm text-slate-600">Date range</label>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-slate-600">From</label>
              <Input type="date" value={fromDate} onChange={(e) => { setPreset("custom"); setFromDate(e.target.value); }} />
            </div>
            <div>
              <label className="text-sm text-slate-600">To</label>
              <Input type="date" value={toDate} onChange={(e) => { setPreset("custom"); setToDate(e.target.value); }} />
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-600">Site</label>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">All sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm text-slate-600">Search</label>
            <Input placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">Defaults to Last 30 days. Open/overdue counts are current.</div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Sort</span>
            <Select
              value={`${sortKey}_${sortDir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split("_");
                setSortKey(key as typeof sortKey);
                setSortDir((dir as "asc" | "desc") ?? "desc");
              }}
              className="w-48"
            >
              <option value="overdue_desc">Overdue (desc)</option>
              <option value="open_desc">Open (desc)</option>
              <option value="needs_review_desc">Needs Review (desc)</option>
              <option value="on_hold_desc">On Hold (desc)</option>
              <option value="hours_desc">Hours (desc)</option>
              <option value="closed_desc">Closed (desc)</option>
              <option value="name_asc">Name (A–Z)</option>
            </Select>
            <Button variant="secondary" onClick={load}>Refresh</Button>
          </div>
        </div>
      </Card>

      {err && <Card className="border-rose-200 bg-rose-50 text-rose-800">{err}</Card>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-sm text-slate-600">Open work orders</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.open_count ?? 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600">Overdue work orders</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.overdue_count ?? 0}</div>
          <div className="mt-1 text-xs text-rose-600">Emergency/High overdue: {kpis.overdue_priority_count ?? 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600">Completed (range)</div>
          <div className="mt-2 text-2xl font-semibold">{kpis.closed_range_count ?? 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600">Hours logged (range)</div>
          <div className="mt-2 text-2xl font-semibold">{formatHours(kpis.hours_minutes ?? 0)}</div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <Card>Loading contractors...</Card>
        ) : filteredRows.length === 0 ? (
          <Card>No contractors found.</Card>
        ) : filteredRows.map((row: any) => (
          <Card key={row.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">{row.full_name}</div>
                <div className="text-sm text-slate-600">{row.email}</div>
                <div className="text-xs text-slate-500">{row.phone || "No phone"}</div>
              </div>
              <div className="text-xs text-slate-500">Last activity: {formatDateTime(row.last_activity_at)}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-1">Open {row.open_count}</span>
              <span className="rounded-full bg-amber-100 px-2 py-1">Needs Review {row.needs_review_count}</span>
              <span className="rounded-full bg-blue-100 px-2 py-1">On Hold {row.on_hold_count}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-1">Closed {row.closed_range_count}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600">Hours (range)</div>
                <div className="text-xl font-semibold">{formatHours(row.hours_minutes)}</div>
              </div>
              <div className="text-sm text-slate-700">
                Overdue: {row.overdue_count}
                {row.overdue_priority_count > 0 && <span className="ml-2 text-rose-600">🔥 {row.overdue_priority_count}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => nav(`/?assignedTo=${row.id}`)}>View Tasks</Button>
              <Button variant="secondary" onClick={() => openDetail(row.id)}>View Details</Button>
              <Button variant="secondary" disabled>Message</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contractor Summary</h2>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("name")}>Contractor</button>
                </th>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("open")}>Open</button>
                </th>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("needs_review")}>Needs Review</button>
                </th>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("on_hold")}>On Hold</button>
                </th>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("closed")}>Closed (range)</button>
                </th>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("hours")}>Hours (range)</button>
                </th>
                <th className="py-2">
                  <button className="text-left" onClick={() => setSort("overdue")}>Overdue</button>
                </th>
                <th className="py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row: any) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2">
                    <div className="font-medium">{row.full_name}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td className="py-2">{row.open_count}</td>
                  <td className="py-2">{row.needs_review_count}</td>
                  <td className="py-2">{row.on_hold_count}</td>
                  <td className="py-2">{row.closed_range_count}</td>
                  <td className="py-2">{formatHours(row.hours_minutes)}</td>
                  <td className="py-2">{row.overdue_count}</td>
                  <td className="py-2">{formatDateTime(row.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{detail?.contractor?.full_name || "Contractor"}</div>
                <div className="text-sm text-slate-600">{detail?.contractor?.email}</div>
              </div>
              <Button variant="secondary" onClick={() => setDetailOpen(false)}>Close</Button>
            </div>

            {detailLoading ? (
              <div className="mt-4 text-sm text-slate-600">Loading details…</div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Card>
                  <div className="text-sm font-semibold">Assigned open tasks</div>
                  <div className="mt-2 space-y-2 text-sm">
                    {(detail?.openTasks ?? []).length === 0 ? (
                      <div className="text-slate-500">None</div>
                    ) : (detail?.openTasks ?? []).map((t: any) => (
                      <div key={t.id} className="rounded-lg border border-slate-100 p-2">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">{t.priority} • {t.status}</div>
                        <div className="text-xs text-slate-500">Due: {t.due_at ? new Date(t.due_at).toLocaleString() : "—"}</div>
                        {isOverdue(t.due_at) && <div className="text-xs text-rose-600">Overdue</div>}
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <div className="text-sm font-semibold">Needs review</div>
                  <div className="mt-2 space-y-2 text-sm">
                    {(detail?.needsReview ?? []).length === 0 ? (
                      <div className="text-slate-500">None</div>
                    ) : (detail?.needsReview ?? []).map((t: any) => (
                      <div key={t.id} className="rounded-lg border border-slate-100 p-2">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">{t.priority} • {t.status}</div>
                        <div className="text-xs text-slate-500">Due: {t.due_at ? new Date(t.due_at).toLocaleString() : "—"}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <div className="text-sm font-semibold">Completed in range</div>
                  <div className="mt-2 space-y-2 text-sm">
                    {(detail?.completed ?? []).length === 0 ? (
                      <div className="text-slate-500">None</div>
                    ) : (detail?.completed ?? []).map((t: any) => (
                      <div key={t.id} className="rounded-lg border border-slate-100 p-2">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">Closed: {t.closed_at ? new Date(t.closed_at).toLocaleString() : "—"}</div>
                        <div className="text-xs text-slate-500">Hours: {formatHours(t.hours_worked_minutes || 0)}</div>
                        {t.completion_notes && (
                          <div className="text-xs text-slate-600">{String(t.completion_notes).slice(0, 120)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
