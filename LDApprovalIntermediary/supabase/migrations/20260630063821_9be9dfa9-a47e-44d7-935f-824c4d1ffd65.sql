
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id text PRIMARY KEY,
  cr_number text,
  flag_key text,
  environment_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.approval_requests TO anon, authenticated;
GRANT ALL ON public.approval_requests TO service_role;

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approval requests"
  ON public.approval_requests FOR SELECT
  USING (true);

ALTER TABLE public.approval_log
  ADD COLUMN IF NOT EXISTS approval_id text,
  ADD COLUMN IF NOT EXISTS event_type text;
