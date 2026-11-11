-- PRD HR-LVE-05: distinguish advance/retroactive overtime APPLICATIONS.
-- Original IN/OUT/BREAK facts remain independent, never altered by approval.
ALTER TABLE public.wm_requests ADD COLUMN IF NOT EXISTS overtime_timing text;
ALTER TABLE public.wm_requests DROP CONSTRAINT IF EXISTS wm_request_overtime_timing_check;
ALTER TABLE public.wm_requests ADD CONSTRAINT wm_request_overtime_timing_check
 CHECK ((kind='overtime' AND overtime_timing IN ('advance','retroactive'))
   OR (kind<>'overtime' AND overtime_timing IS NULL));
-- Historical requests retain their original creation and start times.
UPDATE public.wm_requests
 SET overtime_timing=CASE WHEN starts_at>=created_at THEN 'advance' ELSE 'retroactive' END
 WHERE kind='overtime' AND overtime_timing IS NULL;

CREATE OR REPLACE FUNCTION wm_private.autofill_workforce_overtime_timing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF new.kind='overtime' THEN
   IF new.overtime_timing IS NULL THEN
     new.overtime_timing:=CASE
      WHEN new.starts_at>=coalesce(new.created_at,clock_timestamp())
       THEN 'advance' ELSE 'retroactive' END;
   END IF;
 ELSE
   new.overtime_timing:=NULL;
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS wm_request_overtime_classify ON public.wm_requests;
CREATE TRIGGER wm_request_overtime_classify BEFORE INSERT ON public.wm_requests
 FOR EACH ROW EXECUTE FUNCTION wm_private.autofill_workforce_overtime_timing();

CREATE OR REPLACE FUNCTION public.wm_submit_overtime_request(
 p_member uuid,p_start timestamptz,p_end timestamptz,p_reason text,p_timing text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r public.wm_requests%rowtype;v_tenant uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_timing NOT IN ('advance','retroactive') OR p_timing IS NULL
 THEN RAISE EXCEPTION '請選擇事前或事後加班'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end>p_start+interval '24 hours'
 THEN RAISE EXCEPTION '加班區間必須有效，單次不得超過 24 小時'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION '請填寫加班事由（不超過 500 字）'; END IF;
 IF p_timing='advance' AND p_start<=clock_timestamp() THEN
  RAISE EXCEPTION '事前申請的開始時間須在送件時間之後'; END IF;
 IF p_timing='retroactive' AND p_end>clock_timestamp() THEN
  RAISE EXCEPTION '事後申請必須是已結束的加班時段'; END IF;
 SELECT tenant_id INTO v_tenant FROM public.wm_members
  WHERE id=p_member AND user_id=auth.uid() AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION '只能為本人提出加班申請' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.wm_period_closures c WHERE c.tenant_id=v_tenant AND
   tstzrange(p_start,p_end,'[)') &&
   tstzrange(make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei'),
    make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)'))
 THEN RAISE EXCEPTION '涉及已月結期間，請由人資以追溯更正處理'; END IF;
 SELECT * INTO r FROM public.wm_submit_request(
   p_member,'overtime',p_start,p_end,btrim(p_reason),NULL,NULL);
 UPDATE public.wm_requests SET overtime_timing=p_timing WHERE id=r.id AND tenant_id=v_tenant;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(v_tenant,auth.uid(),'overtime_submitted','request',r.id,
  jsonb_build_object('timing',p_timing,'period',jsonb_build_object('start',p_start,'end',p_end)));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'overtime_timing',p_timing);
END $$;

REVOKE ALL ON FUNCTION wm_private.autofill_workforce_overtime_timing() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_submit_overtime_request(uuid,timestamptz,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_submit_overtime_request(uuid,timestamptz,timestamptz,text,text) TO authenticated;
