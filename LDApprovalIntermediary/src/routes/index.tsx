import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy, CircleCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LD Approval Intermediary" },
      { name: "description", content: "LaunchDarkly Custom Approvals intermediary backed by ServiceNow." },
      { property: "og:title", content: "LD Approval Intermediary" },
      { property: "og:description", content: "LaunchDarkly Custom Approvals intermediary backed by ServiceNow." },
    ],
  }),
  component: Index,
});

const API_TOKEN = "ld-snow-demo-secret-2026";
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ld-approval`;

type ApprovalRow = {
  id: string;
  created_at: string;
  flag_key: string | null;
  environment_key: string | null;
  cr_number: string | null;
  cr_state: string | null;
  decision: string | null;
  message: string | null;
  approval_id: string | null;
  event_type: string | null;
};

function CopyBox({ value, label, mask = false }: { value: string; label: string; mask?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const displayed = mask ? "•".repeat(Math.min(value.length, 24)) : value;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <code className="flex-1 truncate font-mono text-sm text-foreground">{displayed}</code>
        <Button size="sm" variant="ghost" onClick={copy} className="h-7 gap-1.5 px-2">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string | null }) {
  const d = decision ?? "pending";
  const styles: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    pending: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    declined: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
    applied: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
    deleted: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", styles[d] ?? styles.pending)}>
      {d}
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Index() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("approval_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error(error);
    } else {
      setRows((data ?? []) as ApprovalRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const { data, error } = await supabase
        .from("approval_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.error(error);
      } else {
        setRows((data ?? []) as ApprovalRow[]);
      }
      setLoading(false);
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const clearLog = async () => {
    if (!confirm("Clear all audit log entries? This cannot be undone.")) return;
    setClearing(true);
    const { error } = await supabase.from("approval_log").delete().not("id", "is", null);
    setClearing(false);
    if (error) {
      console.error(error);
      alert("Failed to clear log: " + error.message);
      return;
    }
    setRows([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">LD Approval Intermediary</h1>
          <p className="text-sm text-muted-foreground">
            Bridges LaunchDarkly Custom Approvals to ServiceNow change requests.
          </p>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Health</CardTitle>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
              <CircleCheck className="h-3.5 w-3.5" />
              Online
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <CopyBox label="Webhook base URL" value={ENDPOINT} />
            <CopyBox label="API Token" value={API_TOKEN} mask />
            <p className="text-xs text-muted-foreground">
              Enter the base URL in LaunchDarkly → Integrations → Custom Approvals → service base URL.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Audit Log</CardTitle>
              <p className="text-xs text-muted-foreground">Auto-refreshes every 10 seconds · last 100</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={clearLog}
              disabled={clearing || rows.length === 0}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {clearing ? "Clearing…" : "Clear log"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Time</th>
                    <th className="px-4 py-2 text-left font-medium">Event</th>
                    <th className="px-4 py-2 text-left font-medium">Flag</th>
                    <th className="px-4 py-2 text-left font-medium">Environment</th>
                    <th className="px-4 py-2 text-left font-medium">CR Number</th>
                    <th className="px-4 py-2 text-left font-medium">CR State</th>
                    <th className="px-4 py-2 text-left font-medium">Decision</th>
                    <th className="px-4 py-2 text-left font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {loading ? "Loading…" : "No approval events yet."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-muted-foreground">{formatTime(r.created_at)}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.event_type ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.flag_key ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.environment_key ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.cr_number ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.cr_state ?? "—"}</td>
                        <td className="px-4 py-2"><DecisionBadge decision={r.decision} /></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-md truncate">{r.message ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
