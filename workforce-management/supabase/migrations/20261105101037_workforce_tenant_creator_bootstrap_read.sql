-- Applied to Supabase as migration 20261105101037.
-- A creator may SELECT their newly inserted non-demo tenant while the
-- AFTER INSERT bootstrap owner/member trigger is still being finalized.
-- Only the matching authenticated auth.uid() is authorized.
CREATE POLICY wm_tenant_creator_bootstrap_read
ON public.wm_tenants
FOR SELECT TO authenticated
USING (
  is_demo = false
  AND created_by = (SELECT auth.uid())
);
