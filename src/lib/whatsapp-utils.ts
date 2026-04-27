import { Booking } from '../types';

export function sendBookingWhatsApp(booking: Booking, companyName: string) {
  const message = `Dear *${booking.hirerName}*,
Your booking for *${booking.destination}* is confirmed.

*Duty Slip No:* ${booking.dutySlipNumber}
*Date:* ${booking.departureDate ? (booking.departureDate.toDate ? booking.departureDate.toDate().toLocaleDateString() : booking.departureDate) : '-'} at ${booking.departureTime}
*Vehicle:* ${booking.vehicleName || booking.vehicleRequired}
*Final Amount:* ₹${booking.finalAmount}
*Paid:* ₹${booking.totalPaid}
*Balance:* ₹${booking.balanceDue}

Thank you for choosing *${companyName}*!`;

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${booking.contactNumber.replace(/\D/g, '')}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
}
