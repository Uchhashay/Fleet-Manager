import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Invoice, Receipt, Student, Organization, Booking, BookingPayment } from '../types';
import { amountToWordsIndian } from './number-utils';

const formatPDFCurrency = (amount: number) => {
  return 'Rs. ' + new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(amount);
};

export const generateDutySlipPDF = (booking: Booking, payments: BookingPayment[], org: Organization) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const primaryColor = [79, 70, 229]; // Indigo #4F46E5

  // 1. Modern Header
  doc.setFillColor(249, 250, 251);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  if (org.logo_url) {
    try {
      doc.addImage(org.logo_url, 'PNG', 15, 10, 25, 25);
    } catch (e) {
      console.error('PDF Logo Error:', e);
    }
  }

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(org.name || 'JAGRITI TOURS & TRAVELS', 45, 20);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  const orgSubtext = [
    org.address_line1 || 'E-10, Gali No-6, Tomar Colony, Burari',
    `${org.address_line2 || 'Delhi'} - ${org.zip_code || '110084'}`,
    `PH: ${org.phone || ''} | EMAIL: ${org.email || ''}`
  ].join(' | ');
  doc.text(orgSubtext, 45, 26);
  doc.text(`WEBSITE: ${org.website || 'www.jagrititoursandtravels.com'}`, 45, 31);

  // DUTY SLIP Badge
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(pageWidth - 55, 12, 40, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DUTY SLIP', pageWidth - 35, 20, { align: 'center' });

  // 2. Slip Metadata
  let currentY = 55;
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`SLIP NUMBER: #${booking.dutySlipNumber}`, 15, currentY);
  
  const formatDate = (ts: any) => {
    if (!ts) return '-';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return format(d, 'dd MMM yyyy');
    } catch(e) { return '-'; }
  };

  const bookingDate = booking.bookingDate || booking.createdAt;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`DATE: ${formatDate(bookingDate)}`, 15, currentY + 6);

  // Status Badge
  const status = (booking.status || 'PENDING').toUpperCase();
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(pageWidth - 50, currentY - 5, 35, 8, 4, 4, 'F');
  doc.setTextColor(75, 85, 99);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(status, pageWidth - 32.5, currentY + 0.5, { align: 'center' });

  // 3. Main Info Sections (Side-by-Side Boxes)
  currentY += 18;
  const boxWidth = (pageWidth - 40) / 2;
  const boxHeight = 75;

  // Hirer Box
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(15, currentY, boxWidth, boxHeight, 2, 2, 'F');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(8);
  doc.text('HIRER DETAILS', 20, currentY + 8);

  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  let ly = currentY + 18;
  
  doc.setFont('helvetica', 'bold');
  doc.text(booking.hirerName || '-', 20, ly);
  ly += 6;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`Contact: ${booking.contactNumber || '-'}`, 20, ly);
  
  if (booking.alternateContactNumber && booking.alternateContactNumber.trim()) {
    ly += 5;
    doc.text(`Alt: ${booking.alternateContactNumber}`, 20, ly);
  }

  ly += 7;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('Address:', 20, ly);
  ly += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  const addrLines = doc.splitTextToSize(booking.address || '-', boxWidth - 10);
  doc.text(addrLines, 20, ly);
  
  // Trip Info Box
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(pageWidth / 2 + 5, currentY, boxWidth, boxHeight, 2, 2, 'F');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(8);
  doc.text('TRIP INFORMATION', pageWidth / 2 + 10, currentY + 8);

  doc.setFontSize(10);
  let ry = currentY + 18;
  
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('DEPARTURE:', pageWidth / 2 + 10, ry);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`${formatDate(booking.departureDate)} @ ${booking.departureTime || '-'}`, pageWidth / 2 + 10, ry + 5);

  ry += 13;
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('ARRIVAL:', pageWidth / 2 + 10, ry);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`${formatDate(booking.arrivalDate)} @ ${booking.arrivalTime || '-'}`, pageWidth / 2 + 10, ry + 5);

  ry += 13;
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('PICKUP POINT:', pageWidth / 2 + 10, ry);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text((booking.pickupPoint || 'N/A').toUpperCase(), pageWidth / 2 + 10, ry + 5);

  ry += 13;
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('DESTINATION:', pageWidth / 2 + 10, ry);
  doc.setFont('helvetica', 'normal');
  doc.text((booking.destination || 'N/A').toUpperCase(), pageWidth / 2 + 10, ry + 5);

  // 4. Vehicle & Payment Banner
  currentY += boxHeight + 10;
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(15, currentY, pageWidth - 30, 25, 2, 2, 'F');
  
  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);
  doc.text('VEHICLE & FLEET', 20, currentY + 8);
  doc.text('FINANCIAL SUMMARY', pageWidth / 2 + 5, currentY + 8);

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Required: ${booking.vehicleRequired || '-'}`, 20, currentY + 16);
  
  if (booking.vehicleName) {
    doc.text(`Assigned: ${booking.vehicleName}`, 20, currentY + 21);
  }

  doc.text(`Total Amt: Rupee ${new Intl.NumberFormat('en-IN').format(booking.finalAmount)}`, pageWidth / 2 + 5, currentY + 16);
  if (booking.balanceDue > 0) {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(22, 163, 74);
  }
  doc.text(`Balance Due: Rupee ${new Intl.NumberFormat('en-IN').format(booking.balanceDue)}`, pageWidth / 2 + 5, currentY + 21);

  // 5. Payment History Table (If any)
  if (payments.length > 0) {
    currentY += 35;
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYMENT HISTORY', 15, currentY);
    
    autoTable(doc, {
      startY: currentY + 4,
      head: [['Date', 'Mode', 'Amount', 'Received By']],
      body: payments.map(p => [
        formatDate(p.paymentDate),
        p.paymentMode,
        `Rs. ${p.amount}`,
        p.receivedBy
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      margin: { left: 15, right: 15 }
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    currentY += 35;
  }

  // 6. Terms & Signatures
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text('TERMS & CONDITIONS:', 15, currentY);
  const terms = [
    '1. Parking, Toll, State Tax to be paid by hirer.',
    '2. Extra Km will be charged after 250km/day.',
    '3. Driver allowance extra as per duty.',
    '4. Full payment required before trip ends.'
  ];
  terms.forEach((t, i) => doc.text(t, 15, currentY + 5 + (i * 4)));

  const sigY = pageHeight - 40;
  doc.line(15, sigY, 70, sigY);
  doc.text('HIRER SIGNATURE', 42.5, sigY + 5, { align: 'center' });

  doc.line(pageWidth - 70, sigY, pageWidth - 15, sigY);
  doc.setFont('helvetica', 'bold');
  doc.text('FOR JAGRITI TOURS & TRAVELS', pageWidth - 42.5, sigY - 10, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('AUTHORIZED SIGNATORY', pageWidth - 42.5, sigY + 5, { align: 'center' });

  // Footer Tag
  doc.setFontSize(6);
  doc.setTextColor(209, 213, 219);
  doc.text(`SLIP V2.1 | GENERATED ON ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

  return doc;
};


export const generateInvoicePDF = (invoice: Invoice, org: Organization) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header
  if (org.logo_url) {
    doc.addImage(org.logo_url, 'PNG', 15, 15, 25, 25);
  }
  
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(org.name || 'Jagriti Tours & Travels', 45, 22);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(org.address_line1 || 'E-10, Gali No-6, Tomar Colony, Burari', 45, 28);
  doc.text(`${org.address_line2 || 'Delhi'} - ${org.zip_code || '110084'}`, 45, 33);
  doc.text(`Phone: ${org.phone || '9811387399'} | Email: ${org.email || ''}`, 45, 38);
  doc.text(`Website: ${org.website || 'www.jagrititoursandtravels.com'}`, 45, 43);

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(124, 58, 237); // Purple accent
  doc.text('INVOICE', pageWidth - 15, 25, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Invoice Details
  doc.setFontSize(10);
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, pageWidth - 15, 35, { align: 'right' });
  doc.text(`Date: ${format(invoice.invoiceDate.toDate(), 'dd MMM yyyy')}`, pageWidth - 15, 40, { align: 'right' });
  doc.text(`Due Date: ${format(invoice.dueDate.toDate(), 'dd MMM yyyy')}`, pageWidth - 15, 45, { align: 'right' });
  doc.text('Terms: Due on Receipt', pageWidth - 15, 50, { align: 'right' });

  // Bill To
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 15, 65);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.studentName, 15, 72);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.address || 'N/A', 15, 77, { maxWidth: 80 });

  // Items Table
  autoTable(doc, {
    startY: 90,
    head: [['#', 'Item & Description', 'Rate', 'Amount']],
    body: [
      [
        '1',
        `${invoice.schoolName} [${invoice.standName}] Transport Fees\nMonth: ${invoice.month}`,
        formatPDFCurrency(invoice.feeAmount),
        formatPDFCurrency(invoice.feeAmount)
      ]
    ],
    styles: { fontSize: 10, cellPadding: 5 },
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 15 },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY;

  // Totals
  doc.setFontSize(10);
  doc.text('Sub Total:', pageWidth - 55, finalY + 15, { align: 'right' });
  doc.text(formatPDFCurrency(invoice.feeAmount), pageWidth - 15, finalY + 15, { align: 'right' });
  
  if (invoice.concession > 0) {
    doc.text('Concession:', pageWidth - 55, finalY + 22, { align: 'right' });
    doc.text(`-${formatPDFCurrency(invoice.concession)}`, pageWidth - 15, finalY + 22, { align: 'right' });
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Total:', pageWidth - 55, finalY + 30, { align: 'right' });
  doc.text(formatPDFCurrency(invoice.totalAmount), pageWidth - 15, finalY + 30, { align: 'right' });
  
  doc.setFillColor(243, 244, 246);
  doc.rect(pageWidth - 70, finalY + 35, 55, 10, 'F');
  doc.text('Balance Due:', pageWidth - 55, finalY + 42, { align: 'right' });
  doc.text(formatPDFCurrency(invoice.balanceDue), pageWidth - 15, finalY + 42, { align: 'right' });

  // Total in Words
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Total In Words:', 15, finalY + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(amountToWordsIndian(invoice.totalAmount), 15, finalY + 20);

  // Notes
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text('Notes: Thanks for your business.', 15, finalY + 40);

  // Signature
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature', pageWidth - 50, finalY + 70, { align: 'center' });
  doc.setDrawColor(200, 200, 200);
  doc.line(pageWidth - 75, finalY + 65, pageWidth - 25, finalY + 65);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Powered by Jagriti Fleet Manager', pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });

  return doc;
};

export const generateReceiptPDF = (receipt: Receipt, invoice: Invoice | undefined, org: Organization) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header
  if (org.logo_url) {
    try {
      doc.addImage(org.logo_url, 'PNG', 15, 15, 25, 25);
    } catch (e) {
      console.error('Error adding logo to PDF:', e);
    }
  }
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(org.name || 'Jagriti Tours & Travels', 45, 22);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${org.address_line1 || 'E-10, Gali No-6, Tomar Colony, Burari'}, ${org.address_line2 || 'Delhi'}`, 45, 27);
  doc.text(`Phone: ${org.phone || '9811387399'}`, 45, 31);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT RECEIPT', pageWidth / 2, 50, { align: 'center' });

  // Receipt Details
  doc.setFontSize(10);
  const rcpDate = receipt.paymentDate?.toDate ? format(receipt.paymentDate.toDate(), 'dd MMM yyyy') : 'N/A';
  doc.text(`Receipt Date: ${rcpDate}`, 15, 65);
  doc.text(`Reference #: ${receipt.receiptNumber || 'N/A'}`, 15, 70);
  doc.text(`Payment Mode: ${receipt.paymentMode || 'N/A'}`, 15, 75);

  // Amount Box
  doc.setFillColor(124, 58, 237);
  doc.rect(pageWidth - 65, 60, 50, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('AMOUNT RECEIVED', pageWidth - 40, 67, { align: 'center' });
  doc.setFontSize(14);
  doc.text(formatPDFCurrency(receipt.amountReceived || 0), pageWidth - 40, 75, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Received From
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Received From:', 15, 90);
  doc.setFontSize(10);
  doc.text(receipt.studentName || 'N/A', 15, 97);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.address || 'N/A', 15, 102, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.text('Amount In Words:', 15, 115);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.amountInWords || amountToWordsIndian(receipt.amountReceived || 0), 15, 120);

  // Description Section
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Description:', 15, 130);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.description || 'Transport Fees', 15, 135);

  // Payment For Table (Linked Invoices)
  if (receipt.linkedInvoices && receipt.linkedInvoices.length > 0) {
    autoTable(doc, {
      startY: 145,
      head: [['Invoice Number', 'Month', 'Amount Applied', 'Status']],
      body: receipt.linkedInvoices.map(li => [
        li.invoiceNumber,
        li.month,
        formatPDFCurrency(li.amountApplied),
        li.status || 'PAID'
      ]),
      headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }
    });
  } else if (invoice) {
    const invDate = invoice.invoiceDate?.toDate ? format(invoice.invoiceDate.toDate(), 'dd MMM yyyy') : 'N/A';
    autoTable(doc, {
      startY: 145,
      head: [['Invoice Number', 'Invoice Date', 'Invoice Amount', 'Payment Amount', 'Status']],
      body: [
        [
          invoice.invoiceNumber || 'N/A',
          invDate,
          formatPDFCurrency(invoice.totalAmount || 0),
          formatPDFCurrency(receipt.amountReceived || 0),
          invoice.status || 'PAID'
        ]
      ],
      headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }
    });
  }

  // Signature
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 160;
  doc.text('Authorized Signature', pageWidth - 50, finalY + 40, { align: 'center' });
  doc.line(pageWidth - 75, finalY + 35, pageWidth - 25, finalY + 35);

  return doc;
};

export const generateStatementPDF = (
  student: Student, 
  invoices: Invoice[], 
  receipts: Receipt[], 
  org: Organization, 
  dateRange: { start: Date, end: Date }
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  const formatRupee = (amount: number) => {
    return 'Rs. ' + new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return format(d, 'dd/MM/yyyy');
    } catch (e) {
      return 'N/A';
    }
  };

  // Header Left
  if (org.logo_url) {
    try {
      doc.addImage(org.logo_url, 'PNG', 15, 15, 25, 25);
    } catch (e) {
      console.error('PDF Logo Error:', e);
    }
  }
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(org.name || 'Jagriti Tours & Travels', 45, 25);

  // Header Right
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const headerInfo = [
    org.address_line1 || '',
    org.address_line2 || '',
    org.zip_code || '',
    'India',
    org.phone ? `Phone: ${org.phone}` : '',
    org.email ? `Email: ${org.email}` : '',
    org.website ? `Website: ${org.website}` : ''
  ].filter(Boolean);
  
  headerInfo.forEach((line, i) => {
    doc.text(line, pageWidth - 15, 15 + (i * 4), { align: 'right' });
  });

  // Recipient Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('To', 15, 55);
  doc.setFontSize(11);
  doc.text(student.studentName || 'Student', 15, 62);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text([
    student.address || '',
    'India'
  ].filter(Boolean), 15, 68, { maxWidth: 80 });

  // Title Section
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Statement of Accounts', pageWidth - 15, 60, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatDate(dateRange.start)} To ${formatDate(dateRange.end)}`, pageWidth - 15, 68, { align: 'right' });

  // Calculations
  const invoicedAmount = (invoices || []).reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const amountReceived = (receipts || []).reduce((sum, rcp) => sum + (rcp.amountReceived || 0), 0);
  const openingBalance = 0; 
  const balanceDue = openingBalance + invoicedAmount - amountReceived;

  // Account Summary Box
  autoTable(doc, {
    startY: 85,
    margin: { left: pageWidth - 85 },
    tableWidth: 70,
    body: [
      ['Opening Balance', formatRupee(openingBalance)],
      ['Invoiced Amount', formatRupee(invoicedAmount)],
      ['Amount Received', formatRupee(amountReceived)],
      ['Balance Due', formatRupee(balanceDue)]
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }
    }
  });

  // Transaction Table Data
  const transactions: any[] = [
    {
      date: dateRange.start,
      type: 'Opening Balance',
      details: '-',
      amount: 0,
      payments: 0,
      balance: 0
    }
  ];

  // Add Invoices
  (invoices || []).forEach(inv => {
    const date = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
    transactions.push({
      date: isNaN(date.getTime()) ? new Date() : date,
      type: 'Invoice',
      details: `${inv.invoiceNumber || 'INV'} (Due: ${formatDate(inv.dueDate)})`,
      amount: inv.totalAmount || 0,
      payments: 0
    });
  });

  // Add Receipts
  (receipts || []).forEach(rcp => {
    const date = rcp.createdAt?.toDate ? rcp.createdAt.toDate() : new Date(rcp.createdAt || 0);
    transactions.push({
      date: isNaN(date.getTime()) ? new Date() : date,
      type: 'Payment Received',
      details: `${rcp.receiptNumber || 'RCP'} (Applied to: ${rcp.invoiceNumber || 'Multiple'})`,
      amount: 0,
      payments: rcp.amountReceived || 0
    });
  });

  // Sort by date
  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate Running Balance
  let currentBalance = 0;
  const tableBody = transactions.map(tx => {
    if (tx.type !== 'Opening Balance') {
      currentBalance += tx.amount - tx.payments;
      tx.balance = currentBalance;
    }
    return [
      formatDate(tx.date),
      tx.type,
      tx.details,
      tx.amount > 0 ? formatRupee(tx.amount) : '-',
      tx.payments > 0 ? formatRupee(tx.payments) : '-',
      formatRupee(tx.balance)
    ];
  });

  // Transaction Table
  const tableStartY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 130;
  autoTable(doc, {
    startY: tableStartY,
    head: [['Date', 'Transactions', 'Details', 'Amount', 'Payments', 'Balance']],
    body: tableBody,
    theme: 'striped',
    headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 8 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : tableStartY + 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Balance Due ${formatRupee(balanceDue)}`, pageWidth - 15, finalY + 10, { align: 'right' });

  return doc;
};
