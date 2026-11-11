-- Add covering indexes for foreign keys reported by the Supabase performance advisor.
-- Existing booking, queue, membership and LINE data is preserved.
-- Supabase's shared database hosts other products: only QueueMonster so_* tables are touched.
CREATE INDEX IF NOT EXISTS so_audit_actor_fk_idx ON public.so_audit (actor);
CREATE INDEX IF NOT EXISTS so_audit_tenant_fk_idx ON public.so_audit (tenant_id);
CREATE INDEX IF NOT EXISTS so_reminder_jobs_tenant_fk_idx ON public.so_booking_reminder_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS so_invites_accepted_by_fk_idx ON public.so_invites (accepted_by);
CREATE INDEX IF NOT EXISTS so_invites_invited_by_fk_idx ON public.so_invites (invited_by);
CREATE INDEX IF NOT EXISTS so_line_links_user_fk_idx ON public.so_line_links (user_id);
CREATE INDEX IF NOT EXISTS so_members_user_fk_idx ON public.so_members (user_id);
CREATE INDEX IF NOT EXISTS so_membership_exits_user_fk_idx ON public.so_membership_exits (user_id);
CREATE INDEX IF NOT EXISTS so_merchant_requests_reviewed_by_fk_idx ON public.so_merchant_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS so_reservations_tenant_unit_fk_idx ON public.so_reservations (tenant_id, service_unit_id);
CREATE INDEX IF NOT EXISTS so_service_rules_tenant_item_fk_idx ON public.so_service_rules (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS so_service_rules_tenant_resource_fk_idx ON public.so_service_rules (tenant_id, resource_id);
CREATE INDEX IF NOT EXISTS so_tenants_created_by_fk_idx ON public.so_tenants (created_by);
CREATE INDEX IF NOT EXISTS so_tickets_tenant_unit_fk_idx ON public.so_tickets (tenant_id, service_unit_id);
CREATE INDEX IF NOT EXISTS so_tickets_user_fk_idx ON public.so_tickets (user_id);

-- Avoid evaluating auth.uid() separately per row in this public display policy.
-- Authorization behavior is unchanged: only authenticated users and ACTIVE tenants.
ALTER POLICY so_queue_displays_active_read ON public.so_queue_displays
 TO authenticated
 USING (((SELECT auth.uid()) IS NOT NULL) AND EXISTS (
   SELECT 1 FROM public.so_tenants t
   WHERE t.id=so_queue_displays.tenant_id AND t.status='ACTIVE'
 ));
