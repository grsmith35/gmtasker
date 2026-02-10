import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import Login from "./Login";
import Dashboard from "./Dashboard";
import TaskDetail from "./TaskDetail";
import CreateTask from "./CreateTask";
import Users from "./Users";
import Contractors from "./Contractors";
import { clearToken, getUser } from "../lib/api";
import { Button } from "../ui/Button";

function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const user = getUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

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

  useEffect(() => {
    if (!menuOpen) return;
    function updateMenuPos() {
      const anchor = menuAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    updateMenuPos();
    window.addEventListener("resize", updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    return () => {
      window.removeEventListener("resize", updateMenuPos);
      window.removeEventListener("scroll", updateMenuPos, true);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold">Work Orders</Link>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative" ref={menuRef}>
                <div ref={menuAnchorRef}>
                  <Button variant="secondary" onClick={() => setMenuOpen((open) => !open)}>
                    {user.fullName}
                  </Button>
                </div>
                {menuOpen && (
                  <div
                    className="fixed z-50 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
                    style={{ top: menuPos.top, right: menuPos.right }}
                  >
                    <div className="px-2 py-1 text-xs text-slate-500">{user.role === "gm" ? "General Manager" : "Contractor"}</div>
                    <button
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      onClick={() => nav("/")}
                    >
                      Work Orders
                    </button>
                    {user.role === "gm" && (
                      <>
                        <button
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => nav("/contractors")}
                        >
                          Contractors
                        </button>
                        <button
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => nav("/users")}
                        >
                          Users
                        </button>
                      </>
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
        <Route path="/contractors" element={<RequireGM><Contractors /></RequireGM>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
