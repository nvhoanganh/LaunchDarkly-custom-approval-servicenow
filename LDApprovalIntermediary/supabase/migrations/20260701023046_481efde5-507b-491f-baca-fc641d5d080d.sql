GRANT DELETE ON public.approval_log TO anon, authenticated;
CREATE POLICY "Anyone can clear approval log" ON public.approval_log FOR DELETE USING (true);