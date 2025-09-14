/*
  # Pricing Tier Update

  1. Table Modifications
    - Add `plan` column to `users` table with default 'free'
    - Add `plan_updated_at` column to track when plan was last changed

  2. Plan Types
    - free: Default plan with basic limits
    - starter: Paid plan with increased limits  
    - pro: Premium plan with highest limits

  3. Indexes
    - Add index on plan column for efficient queries
*/

-- Add plan column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'plan'
  ) THEN
    ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro'));
  END IF;
END $$;

-- Add plan_updated_at column to track plan changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'plan_updated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN plan_updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create index on plan column for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- Update existing users to have free plan if null
UPDATE users SET plan = 'free' WHERE plan IS NULL;

-- Create trigger to update plan_updated_at when plan changes
CREATE OR REPLACE FUNCTION update_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.plan IS DISTINCT FROM NEW.plan THEN
    NEW.plan_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_plan_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_plan_updated_at();