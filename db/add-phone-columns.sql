-- Add phone number columns for payment challenges
ALTER TABLE public.challenges 
ADD COLUMN challenger_phone VARCHAR(20),
ADD COLUMN opponent_phone VARCHAR(20);

-- Add comments for clarity
COMMENT ON COLUMN public.challenges.challenger_phone IS 'Phone number of the challenger for payment processing';
COMMENT ON COLUMN public.challenges.opponent_phone IS 'Phone number of the opponent for payment processing';

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'challenges' 
AND table_schema = 'public'
AND column_name IN ('challenger_phone', 'opponent_phone');
