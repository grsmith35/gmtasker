import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";

export default function CreateTask() {
  const nav = useNavigate();
  const [sites, setSites] = useState<any[]>([]);
  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getSites().then((s) => {
      setSites(s);
      if (s[0]?.id) setSiteId(s[0].id);
    }).catch((e:any) => setErr(e.message));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const wo = await api.createWorkOrder({
        siteId,
        title,
        description,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        locationId: null
      });
      nav(`/tasks/${(wo as any).id}`);
    } catch (e:any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <h1 className="text-xl font-semibold">Create Work Order</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="text-sm text-slate-600">Site</label>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm text-slate-600">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Broken toilet - leaking" />
          </div>
          <div>
            <label className="text-sm text-slate-600">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details about the issue..." />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-600">Priority</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-600">Due</label>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>
          {err && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => nav(-1)}>Cancel</Button>
            <Button disabled={loading}>{loading ? "Creating..." : "Create"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
