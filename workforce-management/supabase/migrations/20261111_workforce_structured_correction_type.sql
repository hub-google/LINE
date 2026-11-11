-- HR-LVE-10: Preserve the original text while storing correction category as structured data.
-- Existing historical requests without a recognized prefix remain "未分類"; no raw punch changes.
ALTER TABLE public.wm_requests
 ADD COLUMN IF NOT EXISTS correction_type text;
ALTER TABLE public.wm_requests
 DROP CONSTRAINT IF EXISTS wm_requests_correction_type_check;
ALTER TABLE public.wm_requests
 ADD CONSTRAINT wm_requests_correction_type_check
 CHECK (correction_type IS NULL OR correction_type IN
  ('漏上班卡','漏下班卡','上下班皆漏卡','出勤時間更正','未分類'));

CREATE OR REPLACE FUNCTION wm_private.extract_workforce_correction_type()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_category text;
BEGIN
 IF NEW.kind='correction' THEN
   v_category:=substring(coalesce(NEW.reason,'')
     FROM '^【(漏上班卡|漏下班卡|上下班皆漏卡|出勤時間更正)】');
   -- Historical clients without the modern 4-option form stay clearly marked.
   NEW.correction_type:=coalesce(v_category,'未分類');
 ELSE
   NEW.correction_type:=NULL;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wm_request_correction_type ON public.wm_requests;
CREATE TRIGGER wm_request_correction_type
 BEFORE INSERT OR UPDATE OF reason,kind ON public.wm_requests
 FOR EACH ROW EXECUTE FUNCTION wm_private.extract_workforce_correction_type();

UPDATE public.wm_requests
 SET correction_type=coalesce(substring(coalesce(reason,'')
       FROM '^【(漏上班卡|漏下班卡|上下班皆漏卡|出勤時間更正)】'),'未分類')
 WHERE kind='correction'
 AND correction_type IS DISTINCT FROM
    coalesce(substring(coalesce(reason,'')
       FROM '^【(漏上班卡|漏下班卡|上下班皆漏卡|出勤時間更正)】'),'未分類');
REVOKE ALL ON FUNCTION wm_private.extract_workforce_correction_type() FROM PUBLIC,anon,authenticated;
