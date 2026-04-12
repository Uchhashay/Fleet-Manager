import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Invoice, Receipt, Student, Organization } from '../types';
import { amountToWordsIndian } from './number-utils';

const formatPDFCurrency = (amount: number) => {
  return 'Rs. ' + new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(amount);
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

export const generateReceiptPDF = (receipt: Receipt, invoice: Invoice, org: Organization) => {
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

  // Payment For Table
  const invDate = invoice.invoiceDate?.toDate ? format(invoice.invoiceDate.toDate(), 'dd MMM yyyy') : 'N/A';
  autoTable(doc, {
    startY: 130,
    head: [['Invoice Number', 'Invoice Date', 'Invoice Amount', 'Payment Amount']],
    body: [
      [
        invoice.invoiceNumber || 'N/A',
        invDate,
        formatPDFCurrency(invoice.totalAmount || 0),
        formatPDFCurrency(receipt.amountReceived || 0)
      ]
    ],
    headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }
  });

  // Signature
  const finalY = (doc as any).lastAutoTable.finalY;
  doc.text('Authorized Signature', pageWidth - 50, finalY + 40, { align: 'center' });
  doc.line(pageWidth - 75, finalY + 35, pageWidth - 25, finalY + 35);

  return doc;
};

export const generateStatementPDF = (student: Student, invoices: Invoice[], org: Organization, dateRange: { start: Date, end: Date }) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header (Same as invoice)
  if (org.logo_url) {
    doc.addImage(org.logo_url, 'PNG', 15, 15, 25, 25);
  }
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(org.name || 'Jagriti Tours & Travels', 45, 22);
  
  doc.setFontSize(20);
  doc.text('ACCOUNT STATEMENT', pageWidth - 15, 25, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Statement Period: ${format(dateRange.start, 'dd MMM yyyy')} - ${format(dateRange.end, 'dd MMM yyyy')}`, pageWidth - 15, 35, { align: 'right' });

  // Student Details
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('STATEMENT FOR:', 15, 60);
  doc.setFontSize(10);
  doc.text(`Student: ${student.studentName}`, 15, 67);
  doc.setFont('helvetica', 'normal');
  doc.text(student.address || 'N/A', 15, 72, { maxWidth: 80 });

  // Statement Table
  autoTable(doc, {
    startY: 90,
    head: [['Invoice No', 'Month', 'Amount', 'Paid', 'Balance', 'Status']],
    body: invoices.map(inv => [
      inv.invoiceNumber,
      inv.month,
      formatPDFCurrency(inv.totalAmount),
      formatPDFCurrency(inv.paidAmount),
      formatPDFCurrency(inv.balanceDue),
      inv.status
    ]),
    headStyles: { fillColor: [124, 58, 237] }
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

  doc.setFont('helvetica', 'bold');
  doc.text('Summary:', pageWidth - 80, finalY + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Invoiced: ${formatPDFCurrency(totalInvoiced)}`, pageWidth - 80, finalY + 22);
  doc.text(`Total Paid: ${formatPDFCurrency(totalPaid)}`, pageWidth - 80, finalY + 27);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Outstanding: ${formatPDFCurrency(totalOutstanding)}`, pageWidth - 80, finalY + 35);

  doc.text('Notes: Please clear all dues at earliest. Thank you.', 15, finalY + 50);

  return doc;
};
