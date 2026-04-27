import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

export async function generateNextDutySlipNumber(): Promise<string> {
  const bookingsRef = collection(db, 'bookings');
  const q = query(bookingsRef, orderBy('dutySlipNumber', 'desc'), limit(1));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return 'DS-000001';
  }

  const lastBooking = querySnapshot.docs[0].data();
  const lastNumberStr = lastBooking.dutySlipNumber.split('-')[1];
  const nextNumber = parseInt(lastNumberStr) + 1;
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
