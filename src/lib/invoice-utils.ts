import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  WriteBatch, 
  doc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { Invoice, InvoiceStatus } from '../types';

/**
 * Applies a payment amount to a student's pending invoices using FIFO (First-In, First-Out).
 * Updates the provided WriteBatch with the necessary invoice updates.
 * Returns an array of linked invoice info for receipt tracking.
 */
export async function applyPaymentToInvoices(
  batch: WriteBatch,
  studentId: string,
  paymentAmount: number,
  updatedAt: any = serverTimestamp()
): Promise<{ invoiceId: string; invoiceNumber: string; amountApplied: number; month: string; status: string }[]> {
  const invoicesRef = collection(db, 'invoices');
  const q = query(
    invoicesRef,
    where('studentId', '==', studentId),
    where('status', 'in', ['UNPAID', 'PARTIAL']),
    orderBy('invoiceDate', 'asc')
  );

  const querySnapshot = await getDocs(q);
  const pendingInvoices = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));

  let remainingPayment = paymentAmount;
  const linkedInvoices: { invoiceId: string; invoiceNumber: string; amountApplied: number; month: string; status: string }[] = [];

  for (const invoice of pendingInvoices) {
    if (remainingPayment <= 0) break;

    const amountToApply = Math.min(remainingPayment, invoice.balanceDue);
    const newPaidAmount = invoice.paidAmount + amountToApply;
    const newBalanceDue = invoice.totalAmount - newPaidAmount;
    const newStatus: InvoiceStatus = newBalanceDue <= 0 ? 'PAID' : 'PARTIAL';

    batch.update(doc(db, 'invoices', invoice.id), {
      paidAmount: newPaidAmount,
      balanceDue: Math.max(0, newBalanceDue),
      status: newStatus,
      updatedAt
    });

    linkedInvoices.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountApplied: amountToApply,
      month: invoice.month,
      status: newStatus
    });

    remainingPayment -= amountToApply;
  }

  // If there's still remaining payment, it's an advance
  if (remainingPayment > 0) {
    linkedInvoices.push({
      invoiceId: 'ADVANCE',
      invoiceNumber: 'ADVANCE',
      amountApplied: remainingPayment,
      month: 'Future Adjustments',
      status: 'ADVANCE'
    });
  }

  return linkedInvoices;
}
