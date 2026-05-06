-- Supabase Schema for Financial App

-- 1. Transactions Table
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type TEXT CHECK (type IN ('income', 'expense')) NOT NULL,
  expense_type TEXT CHECK (expense_type IN ('fixed', 'flexible', 'random', 'none')),
  category TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL
);

-- 2. Goals Table
CREATE TABLE goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  target_amount DECIMAL(12,2) NOT NULL,
  current_amount DECIMAL(12,2) DEFAULT 0 NOT NULL,
  deadline TIMESTAMPTZ,
  type TEXT CHECK (type IN ('shortTerm', 'longTerm')) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL
);

-- 3. RLS (Row Level Security)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own transactions" 
ON transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own transactions" 
ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own transactions" 
ON transactions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own goals" 
ON goals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own goals" 
ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
