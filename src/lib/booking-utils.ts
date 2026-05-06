import { 
  runTransaction,
  doc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

export async function generateNextDutySlipNumber(): Promise<string> {
  const counterRef = doc(db, 'counters', 'bookings');
  
  const nextNumber = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let lastNumber = 0;
    
    if (counterDoc.exists()) {
      lastNumber = counterDoc.data().lastDutySlipNumber || 0;
    }
    
    const next = lastNumber + 1;
    transaction.set(counterRef, { lastDutySlipNumber: next }, { merge: true });
    return next;
  });

  return `DS-${nextNumber.toString().padStart(6, '0')}`;
}

export const BOOKING_TERMS = [
  "Toll Tax and Parking will be Paid by the Hirer.",
  "Kms. & Time to be charged from Garage to Garage.",
  "Minimum Charge 250 Kms. Per Day.",
  "Hill area AC & Stereo Not allowed.",
  "UP, Rajasthan, J&K Punjab Tax will Paid by HIRER.",
  "Driver Charges will be Applicable 150/- Perday.",
  "Duty Must be OK",
  "TERMS: CASH"
];
