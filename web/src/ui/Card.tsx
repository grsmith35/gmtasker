import React from "react";
export function Card(props: React.PropsWithChildren<{ className?: string }>) {
  return <div className={["rounded-2xl bg-white p-4 shadow-sm border border-slate-100", props.className ?? ""].join(" ")}>{props.children}</div>;
}
