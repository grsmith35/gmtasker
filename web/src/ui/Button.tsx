import React from "react";
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const v = props.variant ?? "primary";
  const cls = v === "primary"
    ? "bg-slate-900 text-white hover:bg-slate-800"
    : v === "danger"
    ? "bg-rose-600 text-white hover:bg-rose-500"
    : "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50";
  return (
    <button {...props} className={[
      "rounded-xl px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
      cls, props.className ?? ""
    ].join(" ")} />
  );
}
