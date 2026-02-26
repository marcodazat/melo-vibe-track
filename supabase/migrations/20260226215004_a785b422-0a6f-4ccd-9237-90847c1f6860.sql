
-- Create push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update notification trigger to also call the push edge function
CREATE OR REPLACE FUNCTION public.notify_on_exchange_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  service_role_key text;
  supabase_url text;
BEGIN
  -- Insert in-app notification
  INSERT INTO public.notifications (user_id, type, title, message, exchange_id)
  VALUES (
    NEW.counterparty_id,
    'exchange_request',
    'New Exchange Request',
    'You have a new exchange request: ' || NEW.title || '. Please review the terms.',
    NEW.id
  );

  -- Call edge function to send push notification
  SELECT decrypted_secret INTO supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO service_role_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    PERFORM extensions.http_post(
      url := supabase_url || '/functions/v1/send-push',
      body := json_build_object(
        'user_id', NEW.counterparty_id,
        'title', 'New Exchange Request',
        'body', 'You have a new exchange request: ' || NEW.title,
        'data', json_build_object('exchange_id', NEW.id)
      )::jsonb,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      )::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;
