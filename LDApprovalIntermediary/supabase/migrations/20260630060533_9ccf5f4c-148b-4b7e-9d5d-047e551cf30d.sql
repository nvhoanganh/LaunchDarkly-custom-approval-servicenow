CREATE TABLE public.approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  flag_key text,
  environment_key text,
  cr_number text,
  cr_state text,
  decision text,
  message text
);
GRANT SELECT, INSERT ON public.approval_log TO anon;
GRANT SELECT, INSERT ON public.approval_log TO authenticated;
GRANT ALL ON public.approval_log TO service_role;
ALTER TABLE public.approval_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read approval log" ON public.approval_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert approval log" ON public.approval_log FOR INSERT WITH CHECK (true);
CREATE INDEX approval_log_created_at_idx ON public.approval_log (created_at DESC);