-- Retire the legacy QA recovery endpoint; previously created QA records remain archived.
revoke all on function public.so_claim_qa_recovery(text) from PUBLIC, anon, authenticated;
