-- Server-only access to the encrypted FoodRadar LINE recipient in Supabase Vault.
-- The LINE user identifier is stored only in vault.secrets via the private
-- Supabase dashboard/API; NEVER add its decrypted value to Git source.
CREATE OR REPLACE FUNCTION public.foodradar_configured_line_recipient()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT decrypted_secret
      FROM vault.decrypted_secrets
     WHERE name = 'FOODRADAR_REPORT_LINE_USER_ID'
     LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.foodradar_configured_line_recipient() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foodradar_configured_line_recipient() TO service_role;
COMMENT ON FUNCTION public.foodradar_configured_line_recipient() IS
    'Service-role-only lookup of FoodRadar daily LINE report recipient encrypted in Vault';
