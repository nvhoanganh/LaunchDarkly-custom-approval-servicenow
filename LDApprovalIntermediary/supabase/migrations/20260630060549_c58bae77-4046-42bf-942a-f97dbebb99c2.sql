DROP POLICY "Anyone can insert approval log" ON public.approval_log;
REVOKE INSERT ON public.approval_log FROM anon, authenticated;