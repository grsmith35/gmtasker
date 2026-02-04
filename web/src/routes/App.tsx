import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import Login from "./Login";
import Dashboard from "./Dashboard";
import TaskDetail from "./TaskDetail";
import CreateTask from "./CreateTask";
import Users from "./Users";
import { clearToken, getUser } from "../lib/api";
import { Button } from "../ui/Button";

function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const user = getUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current || !(e.target instanceof Node)) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold">Work Orders</Link>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative" ref={menuRef}>
                <Button variant="secondary" onClick={() => setMenuOpen((open) => !open)}>
                  {user.fullName}
                </Button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    <div className="px-2 py-1 text-xs text-slate-500">{user.role === "gm" ? "General Manager" : "Contractor"}</div>
                    {user.role === "gm" && (
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => nav("/users")}
                      >
                        Users
                      </button>
                    )}
                    <button
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                      onClick={() => { clearToken(); nav("/login"); }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button variant="secondary" onClick={() => nav("/login")}>Login</Button>
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireGM({ children }: { children: React.ReactNode }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "gm") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/tasks/new" element={<RequireAuth><CreateTask /></RequireAuth>} />
        <Route path="/tasks/:id" element={<RequireAuth><TaskDetail /></RequireAuth>} />
        <Route path="/users" element={<RequireGM><Users /></RequireGM>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
