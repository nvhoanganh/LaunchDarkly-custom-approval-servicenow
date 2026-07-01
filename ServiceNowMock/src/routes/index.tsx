import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Copy, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ServiceNow CR Simulator" },
      { name: "description", content: "Mock ServiceNow instance for integration testing" },
    ],
  }),
  component: Index,
});

type CR = {
  id: string;
  number: string;
  state: string;
  short_description: string;
  created_at: string;
};

const STATES = ["new", "assess", "authorize", "scheduled", "implement", "review", "closed", "cancelled"] as const;

function stateBadge(state: string) {
  if (state === "implement") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (state === "cancelled") return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
}

function Index() {
  const [crs, setCrs] = useState<CR[]>([]);
  const [number, setNumber] = useState("");
  const [desc, setDesc] = useState("");
  const [copied, setCopied] = useState(false);

  const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/servicenow`;

  async function load() {
    const { data, error } = await supabase
      .from("change_requests")
      .select("*")
      .order("number", { ascending: true });
    if (error) toast.error(error.message);
    else setCrs(data as CR[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cr-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function createCR(e: React.FormEvent) {
    e.preventDefault();
    if (!number.trim() || !desc.trim()) return;
    const { error } = await supabase.from("change_requests").insert({
      number: number.trim(),
      short_description: desc.trim(),
      state: "new",
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Created ${number.trim()}`);
      setNumber("");
      setDesc("");
    }
  }

  async function setState(id: string, state: typeof STATES[number]) {
    const { error } = await supabase.from("change_requests").update({ state }).eq("id", id);
    if (error) toast.error(error.message);
  }

  function copyApiUrl() {
    navigator.clipboard.writeText(apiBase);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">ServiceNow CR Simulator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mock ServiceNow instance for integration testing.
          </p>
        </header>

        <Card className="mb-6 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            API base URL
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
            <code className="flex-1 break-all">{apiBase}</code>
            <Button size="sm" variant="ghost" onClick={copyApiUrl}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
            <div><code className="font-mono">POST {`{base}`}/oauth_token.do</code> — returns mock token</div>
            <div><code className="font-mono">GET {`{base}`}/api/now/table/change_request?sysparm_query=number=CHG0001</code></div>
          </div>
        </Card>

        <Card className="mb-8 p-4">
          <h2 className="mb-3 text-sm font-semibold">Create change request</h2>
          <form onSubmit={createCR} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="CHG0004"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="sm:max-w-[160px]"
            />
            <Input
              placeholder="Short description"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="flex-1"
            />
            <Button type="submit">Create</Button>
          </form>
        </Card>

        <div className="grid gap-3">
          {crs.map((cr) => {
            const isImpl = cr.state === "implement";
            const isCanc = cr.state === "cancelled";
            return (
              <Card key={cr.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold">{cr.number}</span>
                      <Badge variant="outline" className={stateBadge(cr.state)}>
                        {cr.state}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{cr.short_description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setState(cr.id, "implement")}
                      disabled={isImpl || isCanc}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setState(cr.id, "cancelled")}
                      disabled={isCanc}
                    >
                      Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setState(cr.id, "new")}>
                      Reset
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {crs.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No change requests yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
