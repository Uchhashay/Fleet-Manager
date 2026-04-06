export const EXPENSE_CATEGORIES = {
  BUS: [
    {
      label: 'Fuel (CNG, Petrol)',
      value: 'fuel',
      subcategories: ['CNG', 'Petrol', 'Diesel']
    },
    {
      label: 'Maintenance and Repairs',
      value: 'maintenance_repairs',
      subcategories: [
        'Engine oil',
        'Steering oil',
        'Tyres',
        'Body work',
        'CNG cylinder testing',
        'Internal Mechanical Work (Engine repair, axil etc)',
        'Internal Technical Work (Speed testing, wires)'
      ]
    },
    {
      label: 'Delhi Traffic Police',
      value: 'traffic_police',
      subcategories: ['Entry', 'Challan', 'Crane']
    },
    {
      label: 'Licensing and Registrations Cost',
      value: 'licensing_registration',
      subcategories: ['CNG cylinder testing', 'Permit', 'Fitness', 'Vehicle Tax']
    },
    {
      label: 'Inter-state Regulatory Expenses',
      value: 'interstate_regulatory',
      subcategories: ['TP', 'Tolls', 'Border Tax']
    },
    {
      label: 'Loan Payments',
      value: 'loan_payments',
      subcategories: ['Monthly EMI', 'Down Payment', 'Processing Fee']
    },
    {
      label: 'Insurance',
      value: 'insurance',
      subcategories: ['Comprehensive', 'Third Party', 'Renewal']
    }
  ],
  COMPANY: [
    {
      label: 'Overhead Expenses',
      value: 'overhead',
      subcategories: ['Office expenses', 'Stationary', 'Rent', 'Utilities', 'Misc']
    },
    {
      label: 'Loan Payments',
      value: 'loan_payments',
      subcategories: ['Business Loan', 'Equipment Loan']
    },
    {
      label: 'Insurance',
      value: 'insurance',
      subcategories: ['Office Insurance', 'General Liability']
    }
  ]
};

export const FUEL_TYPES = ['CNG', 'Petrol', 'Diesel'] as const;
