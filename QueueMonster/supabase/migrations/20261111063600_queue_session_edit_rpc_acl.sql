-- Supabase may have explicit anon EXECUTE grants even after revoking PUBLIC.
-- Keep the customer booking edit RPC callable only through authenticated LINE-linked sessions.
REVOKE ALL ON FUNCTION public.so_customer_edit_session_booking(text,uuid,uuid,integer,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.so_customer_edit_session_booking(text,uuid,uuid,integer,jsonb) TO authenticated;
