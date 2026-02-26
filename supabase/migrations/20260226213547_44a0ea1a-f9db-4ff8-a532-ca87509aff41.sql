
-- Add trust_score to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score integer NOT NULL DEFAULT 60;

-- Add accepted_by_counterparty to exchanges
ALTER TABLE public.exchanges ADD COLUMN IF NOT EXISTS accepted_by_counterparty boolean NOT NULL DEFAULT false;

-- Add reminder settings to exchanges
ALTER TABLE public.exchanges ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.exchanges ADD COLUMN IF NOT EXISTS reminder_interval_days integer DEFAULT null;
ALTER TABLE public.exchanges ADD COLUMN IF NOT EXISTS last_penalty_applied_at timestamp with time zone DEFAULT null;

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  exchange_id uuid REFERENCES public.exchanges(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications (via triggers/functions)
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Function to update trust score when exchange is settled
CREATE OR REPLACE FUNCTION public.update_trust_score_on_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
  score_change integer;
BEGIN
  -- Only trigger when status changes to 'settled'
  IF NEW.status = 'settled' AND OLD.status != 'settled' THEN
    -- The counterparty (borrower) gets the score change
    target_user_id := NEW.counterparty_id;
    
    -- Check if settled on time
    IF NEW.due_date IS NULL OR NEW.due_date >= now() THEN
      score_change := 6; -- On time or no due date
    ELSE
      score_change := -10; -- Past due date
    END IF;
    
    UPDATE public.profiles 
    SET trust_score = GREATEST(0, LEAST(100, trust_score + score_change))
    WHERE user_id = target_user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for trust score
DROP TRIGGER IF EXISTS on_exchange_settled ON public.exchanges;
CREATE TRIGGER on_exchange_settled
  AFTER UPDATE ON public.exchanges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_trust_score_on_settle();

-- Function to apply overdue penalties (called by cron)
CREATE OR REPLACE FUNCTION public.apply_overdue_penalties()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  days_overdue integer;
  penalty_periods integer;
  last_penalty timestamp with time zone;
BEGIN
  FOR r IN 
    SELECT * FROM public.exchanges 
    WHERE status IN ('pending', 'active') 
    AND due_date IS NOT NULL 
    AND due_date < now() - interval '3 days'
  LOOP
    last_penalty := COALESCE(r.last_penalty_applied_at, r.due_date + interval '3 days');
    
    -- Calculate how many 3-day periods have passed since last penalty
    IF now() >= last_penalty + interval '3 days' THEN
      penalty_periods := FLOOR(EXTRACT(EPOCH FROM (now() - last_penalty)) / (3 * 86400));
      
      IF penalty_periods > 0 THEN
        UPDATE public.profiles 
        SET trust_score = GREATEST(0, trust_score - penalty_periods)
        WHERE user_id = r.counterparty_id;
        
        UPDATE public.exchanges 
        SET last_penalty_applied_at = now()
        WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Function to create notification when exchange is created
CREATE OR REPLACE FUNCTION public.notify_on_exchange_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, exchange_id)
  VALUES (
    NEW.counterparty_id,
    'exchange_request',
    'New Exchange Request',
    'You have a new exchange request: ' || NEW.title || '. Please review the terms.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_exchange_created ON public.exchanges;
CREATE TRIGGER on_exchange_created
  AFTER INSERT ON public.exchanges
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_exchange_created();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
