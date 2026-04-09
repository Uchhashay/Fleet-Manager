export type UserRole = 'admin' | 'accountant' | 'driver' | 'helper';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface Bus {
  id: string;
  registration_number: string;
  model: string;
  capacity: number;
}

export interface Staff {
  id: string;
  full_name: string;
  role: 'admin' | 'accountant' | 'driver' | 'helper';
  bus_id?: string;
  fixed_salary: number;
  duty_rate?: number;
  join_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface DailyRecord {
  id: string;
  date: string;
  bus_id: string;
  driver_id: string;
  helper_id: string;
  is_holiday: boolean;
  school_morning: number;
  school_evening: number;
  charter_morning: number;
  charter_evening: number;
  private_booking: number;
  booking_details?: string;
  fuel_amount: number;
  fuel_type: 'CNG' | 'Petrol' | 'Diesel';
  driver_duty_payable: number;
  driver_duty_paid: number;
  helper_duty_payable: number;
  helper_duty_paid: number;
  notes?: string;
  paid_by?: 'owner' | 'accountant';
  created_by: string;
  created_at: string;
}

export interface BusExpense {
  id: string;
  bus_id: string;
  date: string;
  category: string;
  subcategory: string;
  amount: number;
  description: string;
  receipt_ref?: string;
  paid_by?: 'owner' | 'accountant';
  created_by: string;
  created_at: string;
}

export interface CompanyExpense {
  id: string;
  date: string;
  category: string;
  subcategory: string;
  bus_id?: string;
  amount: number;
  description: string;
  receipt_ref?: string;
  paid_by?: 'owner' | 'accountant';
  created_by: string;
  created_at: string;
}

export interface CashTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'in' | 'out';
  category: 'owner_transfer' | 'salary' | 'salary_advance' | 'duty_payment' | 'bus_expense' | 'office_expense' | 'fee_collection' | 'daily_collection' | 'misc';
  amount: number;
  description: string;
  linked_id?: string; // ID of salary_record or bus_expense
  staff_id?: string; // ID of staff member for salary payments
  paid_by?: 'owner' | 'accountant';
  created_by?: string;
  created_at: any;
}

export interface SalaryRecord {
  id: string;
  staff_id: string;
  month: string; // YYYY-MM
  working_days: number;
  duty_amount: number;
  fixed_salary: number;
  adjustments: number;
  allowances: number;
  deductions: number;
  net_payable: number; // Total amount due for the month (Earnings - Deductions)
  status: 'unpaid' | 'partial' | 'paid';
  notes?: string;
  created_at: any;
}

export interface AccountantTransaction {
  id: string;
  date: any; // Firestore Timestamp
  type: 'Cash In' | 'Cash Out';
  category: string;
  amount: number;
  related_party: string;
  notes?: string;
  recorded_by: string;
  created_at: any;
}

export interface FeeCollection {
  id: string;
  date: any; // Firestore Timestamp
  student_name: string;
  receipt_no?: string;
  school_name: string;
  received_by: string;
  data_entry_by: string;
  amount: number;
  parchi_photo_url?: string;
  payment_mode: 'Cash' | 'Online' | 'Cheque';
  fee_type: string;
  notes?: string;
  paid_by?: 'owner' | 'accountant';
  recorded_by: string;
  created_at: any;
}
