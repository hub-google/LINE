-- Supabase migration 20261105102630.
-- Workforce request-documents and private storage policies invoke this function.
-- It internally checks auth.uid(), request membership and pending write status.
-- Grant the checked predicate to authenticated users only, never anonymous users.
GRANT EXECUTE ON FUNCTION wm_private.can_access_evidence(text, boolean)
TO authenticated;
