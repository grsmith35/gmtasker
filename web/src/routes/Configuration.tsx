import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

type EmailConfig = {
  gmailAddress: string;
  appPassword: string;
  fromName: string;
  replyTo: string;
};

export default function Configuration() {
  const [config, setConfig] = useState<EmailConfig>({
    gmailAddress: "",
    appPassword: "",
    fromName: "",
    replyTo: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [showPasswordField, setShowPasswordField] = useState(true);

  useEffect(() => {
    api.getEmailConfig().then((res: any) => {
      if (res?.configured) {
        setConfig({
          gmailAddress: res.gmailAddress || "",
          appPassword: "",
          fromName: res.fromName || "",
          replyTo: res.replyTo || "",
        });
        setHasPassword(Boolean(res.hasAppPassword));
        setShowPasswordField(!res.hasAppPassword);
      }
    }).catch(() => {});
  }, []);

  async function saveConfig() {
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      await api.saveEmailConfig({
        gmailAddress: config.gmailAddress.trim(),
        appPassword: config.appPassword.trim(),
        fromName: config.fromName.trim() || undefined,
        replyTo: config.replyTo.trim() || undefined,
      });
      setHasPassword(true);
      setConfig((c) => ({ ...c, appPassword: "" }));
      setShowPasswordField(false);
      setSuccess("Saved securely.");
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setErr(null);
    setSuccess(null);
    try {
      await api.testEmailConfig({
        gmailAddress: config.gmailAddress.trim() || undefined,
        appPassword: config.appPassword.trim() || undefined,
        fromName: config.fromName.trim() || undefined,
        replyTo: config.replyTo.trim() || undefined,
        testTo: testTo.trim(),
      });
      setSuccess("Test email sent successfully.");
      if (config.appPassword.trim()) {
        setConfig((c) => ({ ...c, appPassword: "" }));
        setShowPasswordField(false);
      }
      setTestOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Configuration</h1>
        <p className="text-sm text-slate-600">Set up email delivery (Gmail).</p>
      </div>

      {err && <Card className="border-rose-200 bg-rose-50 text-rose-800">{err}</Card>}
      {success && <Card className="border-emerald-200 bg-emerald-50 text-emerald-800">{success}</Card>}

      <Card className="space-y-3">
        <div className="text-lg font-semibold">Gmail SMTP</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm text-slate-600">Gmail address</label>
            <Input value={config.gmailAddress} onChange={(e) => setConfig((c) => ({ ...c, gmailAddress: e.target.value }))} placeholder="you@gmail.com" />
          </div>
          <div>
            <label className="text-sm text-slate-600">App password</label>
            {showPasswordField ? (
              <Input type="password" value={config.appPassword} onChange={(e) => setConfig((c) => ({ ...c, appPassword: e.target.value }))} placeholder="16-character app password" />
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span>Saved</span>
                <button className="text-slate-700 underline" onClick={() => setShowPasswordField(true)}>Change</button>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm text-slate-600">From name (optional)</label>
            <Input value={config.fromName} onChange={(e) => setConfig((c) => ({ ...c, fromName: e.target.value }))} placeholder="Work Orders" />
          </div>
          <div>
            <label className="text-sm text-slate-600">Reply-to (optional)</label>
            <Input value={config.replyTo} onChange={(e) => setConfig((c) => ({ ...c, replyTo: e.target.value }))} placeholder="support@yourdomain.com" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveConfig} disabled={saving || !config.gmailAddress || !config.appPassword}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="secondary" onClick={() => setTestOpen(true)} disabled={!config.gmailAddress || (!config.appPassword && !hasPassword)}>Test email</Button>
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="text-lg font-semibold">How to get Gmail credentials</div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Enable 2‑Step Verification on your Google Account.</li>
          <li>Open Google Account → Security → App passwords.</li>
          <li>Create an app password for “Mail” on this device.</li>
          <li>Use your Gmail address + the 16‑character app password above.</li>
        </ol>
        <div className="text-xs text-slate-500">We recommend using a dedicated mailbox for system emails. App passwords are stored encrypted on the server.</div>
      </Card>

      {testOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="text-lg font-semibold">Send test email</div>
            <div className="mt-2 text-sm text-slate-600">Enter an email address to send a test message.</div>
            <div className="mt-3">
              <label className="text-sm text-slate-600">Test recipient</label>
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTestOpen(false)}>Cancel</Button>
              <Button onClick={sendTest} disabled={!testTo.trim() || testing}>
                {testing ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
