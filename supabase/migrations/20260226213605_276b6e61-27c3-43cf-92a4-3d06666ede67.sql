
-- Fix: restrict notification inserts to authenticated users only for their own notifications
-- or via security definer functions
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Users can receive notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);
