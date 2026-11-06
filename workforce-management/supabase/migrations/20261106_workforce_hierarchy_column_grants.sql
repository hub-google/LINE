-- Salary remains column-restricted. Reporting chain and job title are authorized
-- employee-profile fields: row visibility still enforced by wm_member_read RLS.
GRANT SELECT (reports_to, job_title) ON public.wm_members TO authenticated;
