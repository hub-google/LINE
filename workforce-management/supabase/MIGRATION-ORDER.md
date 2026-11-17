# Workforce 資料庫遷移執行順序

 > 2026-11-05。僅適用 `hub-google/LINE/workforce-management`。不可與 `QueueMonster` 等其他獨立產品混用。
>
> **必須遵照以下順序執行，不能按檔名字母排序。** 後續多個檔案含相同 RPC 函式的完整 `CREATE OR REPLACE` 定義；順序錯誤會退回舊功能。

1. [`20261104094313_workforce_management_initial_schema_20261104.sql`](./migrations/20261104094313_workforce_management_initial_schema_20261104.sql)
2. [`20261104094523_workforce_demo_fictional_seed_20261104.sql`](./migrations/20261104094523_workforce_demo_fictional_seed_20261104.sql)
3. [`20261104094626_workforce_demo_scoped_public_api_20261104.sql`](./migrations/20261104094626_workforce_demo_scoped_public_api_20261104.sql)
4. [`20261104095758_workforce_restrict_anonymous_tables_and_tenant_security_20261104.sql`](./migrations/20261104095758_workforce_restrict_anonymous_tables_and_tenant_security_20261104.sql)
5. [`20261104_workforce_prd_departments_invitations_inbox.sql`](./migrations/20261104_workforce_prd_departments_invitations_inbox.sql)
6. [`20261104_workforce_prd_monthly_reports_corrections.sql`](./migrations/20261104_workforce_prd_monthly_reports_corrections.sql)
7. [`20261104_workforce_prd_demo_extended.sql`](./migrations/20261104_workforce_prd_demo_extended.sql)
8. [`20261104_workforce_prd_monthly_demo_guards.sql`](./migrations/20261104_workforce_prd_monthly_demo_guards.sql)
9. [`20261104_workforce_prd_demo_member_projection.sql`](./migrations/20261104_workforce_prd_demo_member_projection.sql)
10. [`20261104_workforce_prd_copy_week_guard.sql`](./migrations/20261104_workforce_prd_copy_week_guard.sql)
11. [`20261104_workforce_prd_shift_swap_approval.sql`](./migrations/20261104_workforce_prd_shift_swap_approval.sql)
12. [`20261104_workforce_prd_demo_swap_flows.sql`](./migrations/20261104_workforce_prd_demo_swap_flows.sql)
13. [`20261104_workforce_prd_swap_event_guards.sql`](./migrations/20261104_workforce_prd_swap_event_guards.sql)
14. [`20261104_workforce_prd_shift_overlap_month_lock.sql`](./migrations/20261104_workforce_prd_shift_overlap_month_lock.sql)
15. [`20261104_workforce_prd_bulk_employee_import.sql`](./migrations/20261104_workforce_prd_bulk_employee_import.sql)
16. [`20261104_workforce_prd_demo_bulk_import.sql`](./migrations/20261104_workforce_prd_demo_bulk_import.sql)
17. [`20261104_workforce_prd_auto_schedule_drafts.sql`](./migrations/20261104_workforce_prd_auto_schedule_drafts.sql)
18. [`20261104_workforce_prd_demo_auto_draft.sql`](./migrations/20261104_workforce_prd_demo_auto_draft.sql)
19. [`20261104_workforce_prd_gps_punch_guard.sql`](./migrations/20261104_workforce_prd_gps_punch_guard.sql)
20. [`20261104_workforce_prd_demo_departments_templates_seed.sql`](./migrations/20261104_workforce_prd_demo_departments_templates_seed.sql)
21. [`20261104_workforce_prd_private_wages.sql`](./migrations/20261104_workforce_prd_private_wages.sql)
22. [`20261104_workforce_prd_leave_policy_versions.sql`](./migrations/20261104_workforce_prd_leave_policy_versions.sql)
23. [`20261104_workforce_prd_leave_pending_ledger.sql`](./migrations/20261104_workforce_prd_leave_pending_ledger.sql)
24. [`20261104_workforce_prd_request_approval_stages.sql`](./migrations/20261104_workforce_prd_request_approval_stages.sql)
25. [`20261104_workforce_prd_demo_leave_api.sql`](./migrations/20261104_workforce_prd_demo_leave_api.sql)
26. [`20261104_workforce_prd_demo_leave_seed.sql`](./migrations/20261104_workforce_prd_demo_leave_seed.sql)
27. [`20261104_workforce_prd_demo_leave_stage_guard.sql`](./migrations/20261104_workforce_prd_demo_leave_stage_guard.sql)
28. [`20261104_workforce_prd_approval_policy_balances.sql`](./migrations/20261104_workforce_prd_approval_policy_balances.sql)
29. [`20261104_workforce_prd_demo_custom_leave_kinds.sql`](./migrations/20261104_workforce_prd_demo_custom_leave_kinds.sql)
30. [`20261104_workforce_prd_attendance_anomalies.sql`](./migrations/20261104_workforce_prd_attendance_anomalies.sql)
31. [`20261104_workforce_prd_private_evidence_bucket.sql`](./migrations/20261104_workforce_prd_private_evidence_bucket.sql)
32. [`20261104_workforce_prd_evidence_approval_guard.sql`](./migrations/20261104_workforce_prd_evidence_approval_guard.sql)
33. [`20261104_workforce_prd_shift_time_move.sql`](./migrations/20261104_workforce_prd_shift_time_move.sql)
34. [`20261104_workforce_prd_demo_shift_move.sql`](./migrations/20261104_workforce_prd_demo_shift_move.sql)
35. [`20261104_workforce_prd_month_wage_privacy.sql`](./migrations/20261104_workforce_prd_month_wage_privacy.sql)
36. [`20261105_workforce_line_identity_queue.sql`](./migrations/20261105_workforce_line_identity_queue.sql)
37. [`20261105_workforce_line_delivery_claim_ack.sql`](./migrations/20261105_workforce_line_delivery_claim_ack.sql)
38. [`20261105_workforce_line_scheduled_dispatch.sql`](./migrations/20261105_workforce_line_scheduled_dispatch.sql)
39. [`20261105_workforce_line_service_role_grants_fix.sql`](./migrations/20261105_workforce_line_service_role_grants_fix.sql)
40. [`20261105_workforce_company_schedule_rules.sql`](./migrations/20261105_workforce_company_schedule_rules.sql)
41. [`20261105_workforce_demo_company_schedule_rules.sql`](./migrations/20261105_workforce_demo_company_schedule_rules.sql)
42. [`20261105_workforce_cross_branch_assignments.sql`](./migrations/20261105_workforce_cross_branch_assignments.sql)
43. [`20261105_workforce_demo_cross_store_support.sql`](./migrations/20261105_workforce_demo_cross_store_support.sql)
44. [`20261105_workforce_dynamic_qr_clock.sql`](./migrations/20261105_workforce_dynamic_qr_clock.sql)
45. [`20261105_workforce_qr_replay_guard.sql`](./migrations/20261105_workforce_qr_replay_guard.sql)
46. [`20261117151000_workforce_gps_accuracy_guard.sql`](./migrations/20261117151000_workforce_gps_accuracy_guard.sql)
47. [`20261117091700_workforce_null_role_authorization_guard.sql`](./migrations/20261117091700_workforce_null_role_authorization_guard.sql) — 緊急跨企業授權修正，**須在第 46 份之後執行**，勿以檔名排序。

## 已部署情況與重建注意事項

- 前四份最初透過 Supabase `apply_migration` 套用，已在遠端遷移歷史中。
- 第 5–20 份先前以 Supabase SQL 即時套用，**已真正存在遠端資料庫，但尚未另外登記進 `supabase_migrations.schema_migrations`**。檔案已提交到 GitHub 作為版本化原始資料。請勿在同一正式環境直接重跑全套 SQL；重建應先於隔離的空資料庫依序測試。
- 第 21–47 份以 Supabase migration 或 SQL 套用（具體 SQL 版本已提交 GitHub）；**先遵照順序在隔離資料庫演練，不要在已建立的正式資料庫整套重跑**。
- LINE Edge Function 程式另存於 [../functions/wm-line/index.ts](../functions/wm-line/index.ts)；LINE 排程建立於第 38 份。
- 不執行清空或 TRUNCATE，原預約／叫號和人資 DEMO 資料皆保留。
- 函式及 RLS 的完整正式驗證，必須使用不同權限的真實測試帳號及資料庫交易測試；不能單憑部署判定全案完成。

- **2026-11-17 GPS 驗收：** 第 46 份已套用遠端並在 `BEGIN ... ROLLBACK` 中驗證：超大定位誤差被拒、正常有效定位可打卡、相同冪等鍵重送不重複新增、同鍵改打卡類型被拒。此測試沒有保留打卡資料，也沒有改動其他專案。

- **2026-11-17 NULL 角色權限修正（第 47 份）：** 已於既有 Workforce Supabase 後端正式套用，僅替換 13 個 `public.wm_*` SECURITY DEFINER 函式的角色拒絕判斷；在回滾交易演練及正式交易中，以實際員工／HR 身分確認跨企業薪資、月報、LINE 統計均受拒絕，企業 HR 的本企業薪資統計仍可用。**此變更影響共用 Supabase 後端，但不修改 `release` 前端分支；其他產品 schema 和資料未動。**
