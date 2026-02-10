const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
export type User = { id: string; role: "gm" | "contractor"; fullName: string; email: string };

export function getToken() { return localStorage.getItem("token"); }
export function setToken(t: string) { localStorage.setItem("token", t); }
export function clearToken() { localStorage.removeItem("token"); localStorage.removeItem("user"); }
export function getUser(): User | null { const raw = localStorage.getItem("user"); return raw ? JSON.parse(raw) : null; }
export function setUser(u: User) { localStorage.setItem("user", JSON.stringify(u)); }

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string,string> = {};
  const token = getToken();
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers as any) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) => request<{token:string; user:User}>("/auth/login", { method:"POST", body: JSON.stringify({ email, password }) }),
  getSites: () => request<any[]>("/sites"),
  getUsers: () => request<any[]>("/users"),
  createUser: (data: any) => request("/users", { method:"POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request(`/users/${id}`, { method:"PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method:"DELETE" }),
  listWorkOrders: (params?: Record<string,string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any[]>(`/work-orders${q}`);
  },
  getContractorsDashboard: (params?: Record<string,string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any>(`/dashboard/contractors${q}`);
  },
  getContractorDetail: (id: string, params?: Record<string,string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any>(`/dashboard/contractors/${id}${q}`);
  },
  getWorkOrder: (id: string) => request<any>(`/work-orders/${id}`),
  createWorkOrder: (data: any) => request(`/work-orders`, { method:"POST", body: JSON.stringify(data) }),
  updateWorkOrder: (id: string, data: any) => request(`/work-orders/${id}`, { method:"PATCH", body: JSON.stringify(data) }),
  addPart: (workOrderId: string, data: any) => request(`/work-orders/${workOrderId}/parts`, { method:"POST", body: JSON.stringify(data) }),
  updatePart: (workOrderId: string, partId: string, data: any) => request(`/work-orders/${workOrderId}/parts/${partId}`, { method:"PATCH", body: JSON.stringify(data) }),
  assign: (workOrderId: string, data: any) => request(`/work-orders/${workOrderId}/assign`, { method:"POST", body: JSON.stringify(data) }),
  close: (workOrderId: string) => request(`/work-orders/${workOrderId}/close`, { method:"POST" }),
  addComment: (workOrderId: string, message: string) => request(`/comments/${workOrderId}`, { method:"POST", body: JSON.stringify({ message }) }),
  submitCompletion: async (workOrderId: string, hoursWorkedMinutes: number, completionNotes: string, photos: File[]) => {
    const form = new FormData();
    form.append("hoursWorkedMinutes", String(hoursWorkedMinutes));
    form.append("completionNotes", completionNotes || "");
    photos.forEach(p => form.append("photos", p));
    return request(`/completions/${workOrderId}/submit`, { method:"POST", body: form });
  },
  reviewCompletion: (workOrderId: string, completionId: string, decision: "approve"|"reject", reviewNotes: string) =>
    request(`/completions/${workOrderId}/review/${completionId}`, { method:"POST", body: JSON.stringify({ decision, reviewNotes }) })
};
