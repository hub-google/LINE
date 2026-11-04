
-- Workforce HR-LVE-07: private medical/leave evidence bucket and request ownership rules.
-- Storage objects are always uploaded via the Storage API, never SQL metadata writes.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('wm-private-evidence','wm-private-evidence',false,5242880,
 ARRAY['application/pdf','image/jpeg','image/png']::text[])
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wm_request_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id),
 request_id uuid NOT NULL REFERENCES public.wm_requests(id),
 storage_path text NOT NULL UNIQUE,
 filename text NOT NULL CHECK(char_length(trim(filename)) BETWEEN 1 AND 180),
 mime_type text NOT NULL CHECK(mime_type IN('application/pdf','image/jpeg','image/png')),
 byte_size int NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 uploaded_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS wm_request_documents_request ON public.wm_request_documents(tenant_id,request_id);
ALTER TABLE public.wm_request_documents ENABLE ROW LEVEL SECURITY;

-- Private helper applies the *same* tenant/request/member test for upload and read.
CREATE OR REPLACE FUNCTION wm_private.can_access_evidence(p_path text,p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;v_request uuid;v_file text;v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR p_path IS NULL OR p_write IS NULL THEN RETURN false;END IF;
 IF p_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$'
 THEN RETURN false;END IF;
 v_tenant:=split_part(p_path,'/',1)::uuid;
 v_request:=split_part(p_path,'/',2)::uuid;
 RETURN EXISTS(
  SELECT 1 FROM public.wm_requests r
   JOIN public.wm_members m ON m.id=r.member_id AND m.tenant_id=r.tenant_id
  WHERE r.id=v_request AND r.tenant_id=v_tenant AND
    (not p_write OR r.status='pending') AND
    (m.user_id=v_user OR wm_private.can_manage(r.tenant_id))
 );
END $fn$;

REVOKE ALL ON public.wm_request_documents FROM anon,authenticated;
GRANT SELECT,INSERT ON public.wm_request_documents TO authenticated;
CREATE POLICY wm_request_documents_read ON public.wm_request_documents FOR SELECT TO authenticated
 USING(wm_private.can_access_evidence(storage_path,false));
CREATE POLICY wm_request_documents_insert ON public.wm_request_documents FOR INSERT TO authenticated
 WITH CHECK (
  auth.uid()=uploaded_by
  AND wm_private.can_access_evidence(storage_path,true)
  AND tenant_id=split_part(storage_path,'/',1)::uuid
  AND request_id=split_part(storage_path,'/',2)::uuid
  AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='wm-private-evidence' AND o.name=storage_path)
 );

DROP POLICY IF EXISTS wm_request_evidence_storage_upload ON storage.objects;
DROP POLICY IF EXISTS wm_request_evidence_storage_download ON storage.objects;
CREATE POLICY wm_request_evidence_storage_upload ON storage.objects
 FOR INSERT TO authenticated WITH CHECK(
 bucket_id='wm-private-evidence' AND wm_private.can_access_evidence(name,true));
CREATE POLICY wm_request_evidence_storage_download ON storage.objects
 FOR SELECT TO authenticated USING(
 bucket_id='wm-private-evidence' AND wm_private.can_access_evidence(name,false));

CREATE OR REPLACE FUNCTION wm_private.guard_request_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 PERFORM 1 FROM public.wm_requests
  WHERE id=new.request_id AND tenant_id=new.tenant_id AND status='pending'
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '附件只能上傳到待審申請';END IF;
 IF (SELECT count(*) FROM public.wm_request_documents WHERE request_id=new.request_id)>=5
 THEN RAISE EXCEPTION '每份申請最多五個附件';END IF;
 RETURN new;
END $fn$;
DROP TRIGGER IF EXISTS wm_request_evidence_guard ON public.wm_request_documents;
CREATE TRIGGER wm_request_evidence_guard BEFORE INSERT ON public.wm_request_documents
 FOR EACH ROW EXECUTE FUNCTION wm_private.guard_request_documents();

-- Evidence is immutable and request-specific; no direct updates or deletes.
REVOKE UPDATE,DELETE,TRUNCATE ON public.wm_request_documents FROM authenticated,anon;
REVOKE ALL ON FUNCTION wm_private.can_access_evidence(text,boolean) FROM public,anon;
REVOKE ALL ON FUNCTION wm_private.guard_request_documents() FROM public,anon,authenticated;
NOTIFY pgrst,'reload schema';
