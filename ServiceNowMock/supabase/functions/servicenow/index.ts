// ServiceNow mock simulator edge function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STATE_MAP: Record<string, string> = {
  new: "-5",
  assess: "-4",
  authorize: "-3",
  scheduled: "-2",
  implement: "-1",
  review: "0",
  closed: "3",
  cancelled: "4",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname;

  // OAuth token endpoint
  if (path.endsWith("/oauth_token.do") && req.method === "POST") {
    return json({
      access_token: "mock-token-123",
      token_type: "Bearer",
      expires_in: 1800,
    });
  }

  // Table API
  if (path.endsWith("/api/now/table/change_request") && req.method === "GET") {
    const sysparmQuery = url.searchParams.get("sysparm_query") ?? "";
    const match = sysparmQuery.match(/number=([A-Za-z0-9]+)/);
    if (!match) return json({ result: [] });
    const number = match[1];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("change_requests")
      .select("id, number, state, short_description")
      .eq("number", number)
      .maybeSingle();

    if (error || !data) return json({ result: [] });

    return json({
      result: [
        {
          number: data.number,
          state: STATE_MAP[data.state] ?? "-5",
          sys_id: data.id,
          short_description: data.short_description,
        },
      ],
    });
  }

  return json({ error: "Not found", path }, 404);
});
