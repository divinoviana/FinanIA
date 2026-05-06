import { Timestamp } from 'firebase/firestore';

export type TransactionType = 'income' | 'expense';
export type ExpenseType = 'fixed' | 'flexible' | 'random' | 'none';
export type GoalRange = 'shortTerm' | 'longTerm';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  expenseType: ExpenseType;
  category: string;
  date: Date | Timestamp;
  userId: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date | Timestamp;
  type: GoalRange;
  userId: string;
}

export interface Budget {
  category: string;
  limit: number;
  spent: number;
}
