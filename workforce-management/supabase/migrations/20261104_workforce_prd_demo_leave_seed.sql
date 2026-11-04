-- Fictional demo policy labels only. Do not interpret as statutory entitlements.
INSERT INTO public.wm_leave_policies(
 tenant_id,leave_kind,label,effective_from,yearly_basis,balance_required,carryover_hours,approval_levels,requires_document,is_active)
SELECT '98d3505c-cbe6-46ed-a95a-13672e6d98f4'::uuid,v.kind,v.label,'2026-01-01'::date,
 'calendar',v.requires_balance,0,1,false,true
FROM (VALUES
 ('annual','特別休假',true),('sick','病假',true),('personal','事假',true),
 ('marriage','婚假',false),('bereavement','喪假',false),('public','公假',false),
 ('family_care','家庭照顧假',false),('other','其他假',false)
) AS v(kind,label,requires_balance)
ON CONFLICT(tenant_id,leave_kind,effective_from) DO NOTHING;