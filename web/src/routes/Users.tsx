import React, { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";

type OrgUser = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: "gm" | "contractor";
  isActive: boolean;
};

const emptyCreateForm = {
  fullName: "",
  email: "",
  phone: "",
  role: "contractor" as "gm" | "contractor",
  password: "",
};

export default function Users() {
  const me = getUser()!;
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "contractor" as "gm" | "contractor",
    isActive: true,
    password: "",
  });

  const editingUser = useMemo(
    () => users.find((u) => u.id === editingId) ?? null,
    [users, editingId]
  );

  async function loadUsers() {
    setLoading(true);
    setErr(null);
    try {
      const rows = await api.getUsers();
      setUsers(rows);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function startEdit(user: OrgUser) {
    setEditingId(user.id);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role,
      isActive: user.isActive,
      password: "",
    });
    setErr(null);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api.createUser({
        ...createForm,
        phone: createForm.phone.trim() || undefined,
      });
      setCreateForm(emptyCreateForm);
      await loadUsers();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;

    setSaving(true);
    setErr(null);
    try {
      await api.updateUser(editingId, {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone.trim() || "",
        role: editForm.role,
        isActive: editForm.isActive,
        ...(editForm.password.trim() ? { password: editForm.password } : {}),
      });
      setEditingId(null);
      await loadUsers();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: OrgUser) {
    if (user.id === me.id) return;
    const ok = window.confirm(`Delete ${user.fullName}? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    setErr(null);
    try {
      await api.deleteUser(user.id);
      if (editingId === user.id) setEditingId(null);
      await loadUsers();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-slate-600">Manage users for this organization.</p>
      </div>

      {err && <Card className="border-rose-200 bg-rose-50 text-rose-800">{err}</Card>}

      <Card>
        <h2 className="text-lg font-semibold">Add User</h2>
        <form className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={createUser}>
          <div>
            <label className="text-sm text-slate-600">Full name</label>
            <Input
              value={createForm.fullName}
              onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Email</label>
            <Input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Phone</label>
            <Input
              value={createForm.phone}
              onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Role</label>
            <Select
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as "gm" | "contractor" }))}
            >
              <option value="contractor">Contractor</option>
              <option value="gm">General Manager</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-slate-600">Temporary password</label>
            <Input
              type="password"
              minLength={8}
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button disabled={saving}>{saving ? "Saving..." : "Add User"}</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">All Users</h2>
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="text-sm text-slate-600">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-sm text-slate-600">No users found.</div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="rounded-xl border border-slate-200 p-3">
                {editingId === user.id ? (
                  <form className="space-y-3" onSubmit={saveEdit}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-sm text-slate-600">Full name</label>
                        <Input
                          value={editForm.fullName}
                          onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Email</label>
                        <Input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Phone</label>
                        <Input
                          value={editForm.phone}
                          onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Role</label>
                        <Select
                          value={editForm.role}
                          onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as "gm" | "contractor" }))}
                        >
                          <option value="contractor">Contractor</option>
                          <option value="gm">General Manager</option>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Status</label>
                        <Select
                          value={editForm.isActive ? "active" : "inactive"}
                          onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.value === "active" }))}
                          disabled={user.id === me.id}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">New password (optional)</label>
                        <Input
                          type="password"
                          minLength={8}
                          value={editForm.password}
                          onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="Leave blank to keep current"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold">{user.fullName}</div>
                      <div className="text-sm text-slate-600">{user.email}</div>
                      <div className="text-sm text-slate-600">{user.phone || "No phone"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {user.role === "gm" ? "General Manager" : "Contractor"} • {user.isActive ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(user)}>Edit</Button>
                      <Button
                        variant="danger"
                        onClick={() => deleteUser(user)}
                        disabled={user.id === me.id || saving}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {editingUser && (
        <div className="text-xs text-slate-500">Editing: {editingUser.fullName}</div>
      )}
    </div>
  );
}
