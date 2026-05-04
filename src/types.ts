export type UserRole = 'admin' | 'accountant' | 'driver' | 'helper' | 'developer';

export interface UserPermissions {
  payroll: { view: boolean; edit: boolean };
  cashbook: { view: boolean; edit: boolean };
  fleet: { view: boolean; edit: boolean };
  fees: { view: boolean; edit: boolean };
  settings: { view: boolean; edit: boolean };
}

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  permissions?: UserPermissions;
}

export interface Bus {
  id: string;
  registration_number: string;
  model: string;
  capacity: number;
  bus_type?: 'School Bus' | 'Coach' | 'Mini Bus' | 'Tempo';
  ac_type?: 'AC' | 'Non-AC';
  is_active: boolean;
  purchase_date?: string;
  insurance_expiry?: string;
  fitness_expiry?: string;
  permit_expiry?: string;
  vehicle_tax_due?: string;
  puc_expiry?: string;
  cng_testing_due?: string;
  speed_governor_expiry?: string;
  fire_extinguisher_expiry?: string;
  notes?: string;
}

export interface BusMaintenanceRecord {
  id: string;
  date: string;
  type: 'Service' | 'Repair' | 'Tyre Change' | 'Oil Change' | 'Other';
  description: string;
  cost: number;
  workshop?: string;
  odometer?: number;
  next_service_date?: string;
  added_by: string;
  created_at: any;
}

export interface BusComment {
  id: string;
  text: string;
  created_by: string;
  created_by_role: string;
  created_at: any;
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
  phone?: string;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  home_address?: string;
  identity_type?: 'Aadhaar Card' | 'PAN Card' | 'Driving License' | 'Voter ID' | 'Passport';
  identity_number?: string;
  date_of_birth?: string;
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
  school_morning_name?: string;
  school_evening_name?: string;
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
  created_at: any;
  has_edit_history?: boolean;
  last_edited_by?: string;
  last_edited_at?: string;
}

export interface School {
  id: string;
  name: string;
  created_at: any;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  action_type: 'Created' | 'Edited' | 'Deleted';
  module: string;
  details: string;
  timestamp: any;
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
  created_at: any;
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
  created_at: any;
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

export interface Student {
  id: string;
  studentName: string;
  fatherName: string;
  phoneNumber: string;
  schoolName: string;
  standName: string;
  class: string;
  address: string;
  dateOfJoining: any; // Timestamp
  feeAmount: number;
  concession: number;
  oldBalance: number;
  totalBalance: number;
  isActive: boolean;
  session: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface StudentComment {
  id: string;
  text: string;
  createdBy: string;
  createdAt: any;
}

export interface StudentTimelineEvent {
  id: string;
  event: string;
  description: string;
  createdBy: string;
  createdAt: any;
}

export interface StudentTransaction {
  id: string;
  invoiceNo: string;
  month: string;
  amount: number;
  status: 'paid' | 'unpaid' | 'partial';
  type: 'invoice' | 'receipt' | 'skip';
  reason?: string;
  createdAt: any;
  createdBy: string;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export type BookingStatus = 'CONFIRMED' | 'ADVANCE PAID' | 'VEHICLE ASSIGNED' | 'DUTY DONE' | 'SETTLED' | 'CANCELLED';

export interface Hirer {
  id: string;
  hirerName: string;
  contactNumber: string;
  alternateNumber?: string;
  address: string;
  refBy?: string;
  totalBookings: number;
  totalRevenue: number;
  notes?: string;
  createdAt: any;
}

export interface Booking {
  id: string;
  dutySlipNumber: string;
  bookingDate: any;
  departureDate: any;
  arrivalDate: any;
  departureTime: string;
  arrivalTime: string;
  hirerId: string;
  hirerName: string;
  contactNumber: string;
  alternateContactNumber?: string;
  address: string;
  pickupPoint: string;
  destination: string;
  vehicleRequired: string;
  vehicleId?: string;
  vehicleName?: string;
  driverId?: string;
  driverName?: string;
  driverAllowance: number;
  refBy?: string;
  settlementAmount: number;
  extraCharges: number;
  extraChargesReason?: string;
  finalAmount: number;
  totalPaid: number;
  balanceDue: number;
  status: BookingStatus;
  cancellationReason?: string;
  refundAmount?: number;
  refundDate?: any;
  notes?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  calendarEventId?: string;
}

export interface BookingPayment {
  id: string;
  amount: number;
  paymentDate: any;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  receivedBy: string;
  notes?: string;
  createdAt: any;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  fatherName: string;
  schoolName: string;
  standName: string;
  address: string;
  phoneNumber: string;
  invoiceDate: any;
  dueDate: any;
  month: string;
  feeAmount: number;
  profileConcession: number;
  invoiceConcession: number;
  concession: number; // Total concession (profile + invoice)
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  itemDescription?: string;
  notes?: string;
  terms?: string;
  editHistory?: { editedBy: string; editedAt: any; userName: string }[];
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  fatherName: string;
  address: string;
  phoneNumber: string;
  paymentDate: any;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  feeType: 'Sunday Doorstep' | 'Regular via Driver';
  receivedBy: string;
  amountReceived: number;
  amountInWords: string;
  linkedInvoices?: { invoiceId: string; invoiceNumber: string; amountApplied: number; month: string; status: string }[];
  description?: string;
  notes?: string;
  createdAt: any;
}

export interface SkippedMonth {
  id: string;
  month: string;
  reason: string;
  skippedBy: string;
  skippedAt: any;
}

export type BillStatus = 'DRAFT' | 'SENT' | 'PAID' | 'UNPAID';

export interface B2BClient {
  id: string;
  clientName: string;
  contactPerson: string;
  contactNumber: string;
  address: string;
  clientType: 'School' | 'Corporate' | 'Event' | 'Other';
  gstNumber?: string;
  totalBills: number;
  totalRevenue: number;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface BillLineItem {
  description: string;
  amount: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  billDate: any;
  clientId: string;
  clientName: string;
  clientType: string;
  contactPerson: string;
  contactNumber: string;
  address: string;
  lineItems: BillLineItem[];
  subTotal: number;
  advancePaid: number;
  advanceDate?: any;
  advanceMode?: string;
  totalAmount: number;
  balanceDue: number;
  status: BillStatus;
  notes?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface BillTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: any;
}

export interface Organization {
  name: string;
  industry?: string;
  location?: string;
  address_line1?: string;
  address_line2?: string;
  zip_code?: string;
  phone?: string;
  fax?: string;
  website?: string;
  email?: string;
  logo_url?: string;
  updated_at?: any;
  updated_by?: string;
}
