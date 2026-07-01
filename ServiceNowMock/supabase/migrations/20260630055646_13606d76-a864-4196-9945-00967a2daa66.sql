CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  state text NOT NULL CHECK (state IN ('new','assess','authorize','scheduled','implement','review','closed','cancelled')),
  short_description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO anon, authenticated;
GRANT ALL ON public.change_requests TO service_role;
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.change_requests FOR SELECT USING (true);
CREATE POLICY "Public insert" ON public.change_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON public.change_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete" ON public.change_requests FOR DELETE USING (true);

INSERT INTO public.change_requests (number, state, short_description) VALUES
  ('CHG0001','new','Deploy dark mode flag'),
  ('CHG0002','implement','Enable checkout redesign'),
  ('CHG0003','cancelled','Rollback payment flow')
ON CONFLICT (number) DO NOTHING;