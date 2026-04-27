import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Bill, Organization } from '../types';
import { format } from 'date-fns';
import { formatCurrency } from './utils';

export async function generateBillPDF(bill: Bill, org: Organization, withLetterhead: boolean) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;

  if (withLetterhead) {
    // Header Decor (Subtle dark triangle/shape)
    doc.setFillColor(31, 41, 55); // dark gray/slate
    doc.triangle(pageWidth, 0, pageWidth - 40, 0, pageWidth, 40, 'F');

    // Logo
    if (org.logo_url) {
       try {
         doc.addImage(org.logo_url, 'PNG', margin, 10, 30, 30);
       } catch (e) {
         console.error("Error adding logo to PDF", e);
       }
    }

    // Company Details
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("Jagriti Tours & Travels", pageWidth - margin, 15, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("PROVIDE TRANSPORT SERVICE", pageWidth - margin, 21, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const services = "FOR: Schools, Yatras, Group Tours, Offices, Factories, Marriage, Parties & All Occasion ROUND THE CLOCK SERVICE";
    const splitServices = doc.splitTextToSize(services, 100);
    doc.text(splitServices, pageWidth - margin, 26, { align: 'right' });

    doc.setFontSize(8);
    const contactInfo = [
      org.phone && `Phones: ${org.phone}`,
      org.email && `Email: ${org.email}`,
      org.address_line1 && `Address: ${org.address_line1}${org.address_line2 ? ', ' + org.address_line2 : ''}`
    ].filter(Boolean).join(' | ');
    doc.text(contactInfo, pageWidth - margin, 38, { align: 'right' });
    
    doc.setDrawColor(200);
    doc.line(margin, 45, pageWidth - margin, 45);
  }

  const startY = withLetterhead ? 55 : 30;

  // Bill No & Date
  doc.setTextColor(100);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`No. ${bill.billNumber}`, margin, startY);
  
  doc.text(`Date: ${format(bill.billDate.toDate(), 'dd/MM/yyyy')}`, pageWidth - margin, startY, { align: 'right' });

  // Invoice To
  doc.setTextColor(100);
  doc.setFontSize(8);
  doc.text("Invoice To:", margin, startY + 8);

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  const clientName = bill.clientName.toUpperCase();
  doc.text(clientName, margin, startY + 22);

  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(1);
  doc.line(margin, startY + 26, margin + 40, startY + 26);

  // Table
  autoTable(doc, {
    startY: startY + 35,
    margin: { left: margin, right: margin },
    head: [['#', 'DESCRIPTION', 'AMOUNT']],
    body: bill.lineItems.map((item, index) => [
      index + 1,
      item.description,
      `${formatCurrency(item.amount)}/-`
    ]),
    theme: 'striped',
    headStyles: { 
      fillColor: [31, 41, 55], 
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 40, halign: 'right' }
    },
    styles: {
      fontSize: 10,
      cellPadding: 6,
      lineColor: [240, 240, 240],
      lineWidth: 0.1,
    },
    didDrawPage: (data) => {
        // Footer if needed per page
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text("Total", pageWidth - 55, finalY, { align: 'right' });
  doc.text(`${formatCurrency(bill.totalAmount)}/-`, pageWidth - margin, finalY, { align: 'right' });

  let nextY = finalY;

  if (bill.advancePaid > 0) {
    nextY += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Advance Received (${format(bill.advanceDate?.toDate(), 'dd/MM/yyyy')}, ${bill.advanceMode})`, pageWidth - 55, nextY, { align: 'right' });
    doc.text(`${formatCurrency(bill.advancePaid)}/-`, pageWidth - margin, nextY, { align: 'right' });

    nextY += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("Balance Due", pageWidth - 55, nextY, { align: 'right' });
    doc.text(`${formatCurrency(bill.balanceDue)}/-`, pageWidth - margin, nextY, { align: 'right' });
  }

  // Footer
  const footerY = doc.internal.pageSize.height - 40;
  doc.setTextColor(150);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text("Thank you", margin, footerY);

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("JAGRITI TOURS & TRAVELS", pageWidth - margin, footerY + 10, { align: 'right' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  doc.line(pageWidth - 70, footerY + 25, pageWidth - margin, footerY + 25);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text("Authorized Signature", pageWidth - margin, footerY + 30, { align: 'right' });

  if (withLetterhead) {
     const bottomBarHeight = 15;
     doc.setFillColor(31, 41, 55);
     doc.rect(0, doc.internal.pageSize.height - bottomBarHeight, pageWidth, bottomBarHeight, 'F');
     
     doc.setTextColor(255);
     doc.setFontSize(8);
     const footerInfo = [
        org.phone && `Phone: ${org.phone}`,
        org.email && `Email: ${org.email}`,
        org.website && `Web: ${org.website}`,
        org.address_line1 && `Addr: ${org.address_line1}`
     ].filter(Boolean).join('  |  ');
     doc.text(footerInfo, pageWidth / 2, doc.internal.pageSize.height - (bottomBarHeight / 2) + 1, { align: 'center' });
  }

  doc.save(`${bill.billNumber}.pdf`);
}
