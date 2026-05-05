import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  WriteBatch, 
  doc, 
  getDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { Invoice, InvoiceStatus } from '../types';
import { parse, isValid } from 'date-fns';

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
): Promise<{ 
  invoiceId: string; 
  invoiceNumber: string; 
  amountApplied: number; 
  month: string; 
  status: string;
  totalAmount: number;
  balanceDue: number;
}[]> {
  const invoicesRef = collection(db, 'invoices');
  const q = query(
    invoicesRef,
    where('studentId', '==', studentId),
    where('status', 'in', ['UNPAID', 'PARTIAL', 'SENT', 'OVERDUE'])
  );

  const querySnapshot = await getDocs(q);
  const pendingInvoices = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));

  // Sort by month temporally to ensure FIFO regardless of creation time
  pendingInvoices.sort((a, b) => {
    const getSortableTime = (inv: Invoice) => {
      if (inv.monthDate) {
        const d = inv.monthDate.toDate ? inv.monthDate.toDate() : new Date(inv.monthDate);
        return d.getTime();
      }
      try {
        const parsed = parse(inv.month, 'MMMM yyyy', new Date());
        return isValid(parsed) ? parsed.getTime() : 0;
      } catch (e) {
        return 0;
      }
    };

    const timeA = getSortableTime(a) || 0;
    const timeB = getSortableTime(b) || 0;

    if (timeA !== timeB) return timeA - timeB;
    
    // Secondary sort by invoice number to handle same-month invoices
    return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
  });

  let remainingPayment = paymentAmount;
  const linkedInvoices: any[] = [];

  for (const invoice of pendingInvoices) {
    if (remainingPayment <= 0) break;

    const amountToApply = Math.min(remainingPayment, invoice.balanceDue);
    if (amountToApply <= 0) continue;

    const newPaidAmount = invoice.paidAmount + amountToApply;
    const newBalanceDue = Math.max(0, invoice.totalAmount - newPaidAmount);
    const newStatus: InvoiceStatus = newBalanceDue <= 0 ? 'PAID' : 'PARTIAL';

    batch.update(doc(db, 'invoices', invoice.id), {
      paidAmount: newPaidAmount,
      balanceDue: newBalanceDue,
      status: newStatus,
      updatedAt
    });

    linkedInvoices.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountApplied: amountToApply,
      month: invoice.month,
      status: newStatus,
      totalAmount: invoice.totalAmount,
      balanceDue: newBalanceDue
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
      status: 'ADVANCE',
      totalAmount: 0,
      balanceDue: -remainingPayment
    });
  }

  return linkedInvoices;
}

/**
 * Reverts a previously applied payment from invoices.
 * Useful for editing or deleting payment records.
 */
export async function revertPaymentFromInvoices(
  batch: WriteBatch,
  linkedInvoices: { invoiceId: string; amountApplied: number }[],
  updatedAt: any = serverTimestamp()
) {
  for (const linked of linkedInvoices) {
    if (linked.invoiceId === 'ADVANCE') continue;

    const invRef = doc(db, 'invoices', linked.invoiceId);
    const invSnap = await getDoc(invRef);
    
    if (invSnap.exists()) {
      const invData = invSnap.data() as Invoice;
      const newPaidAmount = Math.max(0, invData.paidAmount - linked.amountApplied);
      const newBalanceDue = invData.totalAmount - newPaidAmount;
      
      let newStatus: InvoiceStatus = 'UNPAID';
      if (newPaidAmount > 0 && newBalanceDue > 0) {
        newStatus = 'PARTIAL';
      } else if (newPaidAmount >= invData.totalAmount) {
        newStatus = 'PAID';
      }

      batch.update(invRef, {
        paidAmount: newPaidAmount,
        balanceDue: newBalanceDue,
        status: newStatus,
        updatedAt
      });
    }
  }
}

/**
 * Advanced Reallocation: Handles edits by fetching all invoices and recalculating FIFO.
 * This prevents stale data issues when using WriteBatch.
 */
export async function reallocatePayment(
  batch: WriteBatch,
  studentId: string,
  oldLinkedInvoices: { invoiceId: string; amountApplied: number }[],
  newPaymentAmount: number,
  updatedAt: any = serverTimestamp()
) {
  // 1. Fetch current state of ALL student invoices (to ensure we have the ones being reverted)
  const invoicesSnap = await getDocs(query(
    collection(db, 'invoices'),
    where('studentId', '==', studentId)
  ));
  
  const allInvoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
  
  // 2. REVERT: Adjust the local copy of invoices in-memory
  for (const linked of oldLinkedInvoices) {
    if (linked.invoiceId === 'ADVANCE') continue;
    const inv = allInvoices.find(i => i.id === linked.invoiceId);
    if (inv) {
      inv.paidAmount = Math.max(0, inv.paidAmount - linked.amountApplied);
      inv.balanceDue = inv.totalAmount - inv.paidAmount;
      // Status will be recalculated in the final loop
    }
  }
  
  // 3. SORT & FILTER: Get pending invoices and sort for FIFO
  const pendingInvoices = allInvoices.filter(inv => inv.balanceDue > 0);
  pendingInvoices.sort((a, b) => {
    const getSortableTime = (inv: Invoice) => {
      if (inv.monthDate) {
        const d = inv.monthDate.toDate ? inv.monthDate.toDate() : new Date(inv.monthDate);
        return d.getTime();
      }
      try {
        const parsed = parse(inv.month, 'MMMM yyyy', new Date());
        return isValid(parsed) ? parsed.getTime() : 0;
      } catch (e) {
        return 0;
      }
    };
    const timeA = getSortableTime(a) || 0;
    const timeB = getSortableTime(b) || 0;
    if (timeA !== timeB) return timeA - timeB;
    return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
  });
  
  // 4. APPLY: Calculate new allocation
  let remainingPayment = newPaymentAmount;
  const newLinkedInvoices: any[] = [];
  
  // Track which invoices were actually modified to update them in the batch
  const touchedInvoiceIds = new Set<string>(oldLinkedInvoices.map(li => li.invoiceId));
  
  for (const invoice of pendingInvoices) {
    if (remainingPayment <= 0) break;
    
    const amountToApply = Math.min(remainingPayment, invoice.balanceDue);
    if (amountToApply <= 0) continue;
    
    invoice.paidAmount += amountToApply;
    invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount);
    touchedInvoiceIds.add(invoice.id);
    
    newLinkedInvoices.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountApplied: amountToApply,
      month: invoice.month,
      status: invoice.balanceDue <= 0 ? 'PAID' : 'PARTIAL',
      totalAmount: invoice.totalAmount,
      balanceDue: invoice.balanceDue
    });
    
    remainingPayment -= amountToApply;
  }
  
  // Advance payment handling
  if (remainingPayment > 0) {
    newLinkedInvoices.push({
      invoiceId: 'ADVANCE',
      invoiceNumber: 'ADVANCE',
      amountApplied: remainingPayment,
      month: 'Future Adjustments',
      status: 'ADVANCE',
      totalAmount: 0,
      balanceDue: -remainingPayment
    });
  }
  
  // 5. BATCH UPDATES: Sync adjusted state back to Firestore
  for (const id of touchedInvoiceIds) {
    if (id === 'ADVANCE') continue;
    const inv = allInvoices.find(i => i.id === id);
    if (inv) {
      let finalStatus: InvoiceStatus = 'UNPAID';
      if (inv.paidAmount > 0 && inv.balanceDue > 0) {
        finalStatus = 'PARTIAL';
      } else if (inv.paidAmount >= inv.totalAmount) {
        finalStatus = 'PAID';
      }
      
      batch.update(doc(db, 'invoices', inv.id), {
        paidAmount: inv.paidAmount,
        balanceDue: inv.balanceDue,
        status: finalStatus,
        updatedAt
      });
    }
  }
  
  return newLinkedInvoices;
}
