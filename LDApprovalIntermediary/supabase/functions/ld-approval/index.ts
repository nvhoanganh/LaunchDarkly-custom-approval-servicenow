// LaunchDarkly Custom Approvals intermediary.
// Routes:
//   POST   /api/approvals             creationRequest
//   GET    /api/approvals/:id/status  statusRequest
//   POST   /api/approvals/:id/apply   postApplyRequest
//   DELETE /api/approvals/:id         deletionRequest
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BEARER_TOKEN = "ld-snow-demo-secret-2026";
const SNOW_MOCK_BASE = "https://trhyprcfbjsjothusmco.supabase.co/functions/v1/servicenow";
const SNOW_REAL_BASE = "https://dev426633.service-now.com";
const SNOW_REAL_CLIENT_ID = "204734b49a2349138dbc0affe60870a6";
const SNOW_REAL_CLIENT_SECRET = "Eu6mL$:#.Og!$?`<i7?}ZWRl7|u8.{]g";
const SNOW_REAL_USERNAME = "ld_integration";
const SNOW_REAL_PASSWORD = "h9iIt,K:0&Oyj1o<1HUzA1FY_A<u!e)#MK}u(4hrGYRx{x[-(LAT!}%#$HiF{VckL#K+>_0q=kYp&%tT8Mxot8UU;(_r]c=^W3p>";

const APPROVED_STATE = "-1";
const REJECTED_STATES = ["4"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function logEvent(row: {
  approval_id?: string | null;
  flag_key?: string | null;
  environment_key?: string | null;
  cr_number?: string | null;
  cr_state?: string | null;
  decision: string;
  message: string;
  event_type: string;
}) {
  try {
    await supabase.from("approval_log").insert(row);
  } catch (e) {
    console.error("approval_log insert failed", e);
  }
}

type CRResult = {
  crState: string;
  decision: "approved" | "declined" | "pending";
  display: string;
};

async function checkCR(crNumber: string): Promise<CRResult> {
  let mode: "mock" | "real" = "real";
  try {
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "servicenow_mode")
      .maybeSingle();
    if (setting?.value === "mock") mode = "mock";
  } catch (e) {
    console.error("app_settings read failed, defaulting to real", e);
  }

  const base = mode === "real" ? SNOW_REAL_BASE : SNOW_MOCK_BASE;
  const tokenUrl = `${base}/oauth_token.do`;
  const tableUrl = `${base}/api/now/table/change_request`;
  const creds = mode === "real"
    ? {
        client_id: SNOW_REAL_CLIENT_ID,
        client_secret: SNOW_REAL_CLIENT_SECRET,
        username: SNOW_REAL_USERNAME,
        password: SNOW_REAL_PASSWORD,
      }
    : { client_id: "mock", client_secret: "mock", username: "mock", password: "mock" };

  let accessToken: string;
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        ...creds,
      }).toString(),
    });
    if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
    const tokenJson = await tokenRes.json();
    accessToken = tokenJson.access_token;
    if (!accessToken) throw new Error("no access_token");
  } catch (e) {
    console.error("ServiceNow token error", e);
    return {
      crState: "unknown",
      decision: "pending",
      display: "Pending: unable to reach ServiceNow, will retry",
    };
  }

  let cr: { number?: string; state?: string } | undefined;
  try {
    const url = new URL(tableUrl);
    url.searchParams.set("sysparm_query", `number=${crNumber}`);
    url.searchParams.set("sysparm_fields", "number,state,sys_id,short_description");
    url.searchParams.set("sysparm_limit", "1");
    const lookupRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!lookupRes.ok) throw new Error(`lookup ${lookupRes.status}`);
    const lookupJson = await lookupRes.json();
    cr = Array.isArray(lookupJson?.result) ? lookupJson.result[0] : undefined;
  } catch (e) {
    console.error("ServiceNow lookup error", e);
    return {
      crState: "unknown",
      decision: "pending",
      display: "Pending: unable to reach ServiceNow, will retry",
    };
  }

  if (!cr) {
    return {
      crState: "not_found",
      decision: "declined",
      display: `Declined: CR ${crNumber} not found in ServiceNow`,
    };
  }

  const crState = String(cr.state ?? "");
  if (crState === APPROVED_STATE) {
    return {
      crState,
      decision: "approved",
      display: `Approved: CR ${crNumber} is in approved state (state=${crState})`,
    };
  }
  if (REJECTED_STATES.includes(crState)) {
    return {
      crState,
      decision: "declined",
      display: `Declined: CR ${crNumber} was rejected or cancelled (state=${crState})`,
    };
  }
  return {
    crState,
    decision: "pending",
    display: `Pending: CR ${crNumber} is not yet approved (state=${crState})`,
  };
}

function checkAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  return token === BEARER_TOKEN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET" && !new URL(req.url).pathname.includes("/api/")) {
    return Response.redirect("https://ld-approval-intermediary.lovable.app", 302);
  }
  if (!checkAuth(req)) {
    return json(401, { error: "Unauthorized" });
  }

  const url = new URL(req.url);
  // Path may be /functions/v1/ld-approval/api/approvals/:id/... — strip everything before /api/
  const idx = url.pathname.indexOf("/api/");
  const path = idx >= 0 ? url.pathname.slice(idx) : url.pathname;
  const segments = path.split("/").filter(Boolean); // ["api","approvals", id?, action?]

  try {
    // GET /api/health/servicenow
    if (
      req.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "health" &&
      segments[2] === "servicenow"
    ) {
      let mode: "mock" | "real" = "real";
      try {
        const { data: setting } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "servicenow_mode")
          .maybeSingle();
        if (setting?.value === "mock") mode = "mock";
      } catch (_) { /* default real */ }

      const base = mode === "real" ? SNOW_REAL_BASE : SNOW_MOCK_BASE;
      const creds = mode === "real"
        ? {
            client_id: SNOW_REAL_CLIENT_ID,
            client_secret: SNOW_REAL_CLIENT_SECRET,
            username: SNOW_REAL_USERNAME,
            password: SNOW_REAL_PASSWORD,
          }
        : { client_id: "mock", client_secret: "mock", username: "mock", password: "mock" };

      try {
        const tokenRes = await fetch(`${base}/oauth_token.do`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "password", ...creds }).toString(),
        });
        if (!tokenRes.ok) throw new Error(`token request failed (${tokenRes.status})`);
        const tokenJson = await tokenRes.json();
        const accessToken = tokenJson.access_token;
        if (!accessToken) throw new Error("no access_token in response");

        if (mode === "real") {
          const url = new URL(`${base}/api/now/table/change_request`);
          url.searchParams.set("sysparm_limit", "1");
          url.searchParams.set("sysparm_fields", "number");
          const lookupRes = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          });
          if (!lookupRes.ok) throw new Error(`table request failed (${lookupRes.status})`);
        }

        return json(200, { status: "ok", mode });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return json(200, { status: "error", mode, error: message });
      }
    }

    // POST /api/approvals
    if (
      req.method === "POST" &&
      segments.length === 2 &&
      segments[0] === "api" &&
      segments[1] === "approvals"
    ) {
      const body = await req.json().catch(() => ({}));
      const approvalId: string = body._id ?? body.id ?? "";
      const flagKey: string = body.flag?.key ?? "unknown";
      const environmentKey: string = body.environment?.key ?? "unknown";
      const crNumber: string | null = body.approvalFormVariables?.cr_number ?? null;

      if (!crNumber) {
        await logEvent({
          approval_id: approvalId,
          flag_key: flagKey,
          environment_key: environmentKey,
          cr_number: "",
          cr_state: "",
          decision: "declined",
          message: "CR number is required",
          event_type: "created",
        });
        return json(200, {
          _id: approvalId,
          status: { value: "declined", display: "Declined: ServiceNow CR number is required" },
        });
      }

      await supabase.from("approval_requests").upsert({
        id: approvalId,
        cr_number: crNumber,
        flag_key: flagKey,
        environment_key: environmentKey,
      });

      const { crState, decision, display } = await checkCR(crNumber);
      await logEvent({
        approval_id: approvalId,
        flag_key: flagKey,
        environment_key: environmentKey,
        cr_number: crNumber,
        cr_state: crState,
        decision,
        message: display,
        event_type: "created",
      });
      return json(200, { _id: approvalId, status: { value: decision, display } });
    }

    // GET /api/approvals/:id/status
    if (
      req.method === "GET" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "approvals" &&
      segments[3] === "status"
    ) {
      const approvalId = segments[2];
      const { data: row } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("id", approvalId)
        .maybeSingle();

      if (!row || !row.cr_number) {
        await logEvent({
          approval_id: approvalId,
          decision: "declined",
          message: "approval request not found",
          event_type: "status_check",
        });
        return json(200, {
          status: { value: "declined", display: "Declined: approval request not found" },
        });
      }

      const { crState, decision, display } = await checkCR(row.cr_number);
      await logEvent({
        approval_id: approvalId,
        flag_key: row.flag_key,
        environment_key: row.environment_key,
        cr_number: row.cr_number,
        cr_state: crState,
        decision,
        message: display,
        event_type: "status_check",
      });
      return json(200, { status: { value: decision, display } });
    }

    // POST /api/approvals/:id/apply
    if (
      req.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "approvals" &&
      segments[3] === "apply"
    ) {
      const approvalId = segments[2];
      const { data: row } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("id", approvalId)
        .maybeSingle();
      await logEvent({
        approval_id: approvalId,
        flag_key: row?.flag_key ?? null,
        environment_key: row?.environment_key ?? null,
        cr_number: row?.cr_number ?? null,
        decision: "applied",
        message: "Flag change applied in LD",
        event_type: "applied",
      });
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // DELETE /api/approvals/:id
    if (
      req.method === "DELETE" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "approvals"
    ) {
      const approvalId = segments[2];
      const { data: row } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("id", approvalId)
        .maybeSingle();
      await logEvent({
        approval_id: approvalId,
        flag_key: row?.flag_key ?? null,
        environment_key: row?.environment_key ?? null,
        cr_number: row?.cr_number ?? null,
        decision: "deleted",
        message: "Approval request deleted",
        event_type: "deleted",
      });
      await supabase.from("approval_requests").delete().eq("id", approvalId);
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return json(404, { error: "Not found", path, method: req.method });
  } catch (e) {
    console.error("ld-approval unhandled error", e);
    return json(500, { error: "Internal error" });
  }
});