-- Revert the queue-board-only Broadcast experiment. The public board now
-- calls its existing privacy-safe RPC every five seconds in the browser.
-- Leave unrelated Supabase Realtime publications, triggers and functions intact.
drop trigger if exists so_queue_board_realtime_change on public.so_tickets;
drop function if exists private.so_notify_queue_board_realtime();
