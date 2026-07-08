CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert app settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update app settings" ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.app_settings (key, value) VALUES ('servicenow_mode', 'real')
ON CONFLICT (key) DO NOTHING;
