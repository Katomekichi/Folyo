import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { buildUpiLink } from '../lib/razorpay';

interface BookingSummary {
  creatorName: string;
  clientName: string;
  venue: string;
  eventDate: string;
  startTime: string;
  totalAmount: number;
  advanceAmount: number;
  amountDue: number;
  paymentStatus: 'pending' | 'partial' | 'paid';
  razorpayEnabled: boolean;
  upiVpa: string | null;
}

export function PublicBookingPayment() {
  const { slug, bookingId } = useParams<{ slug: string; bookingId: string }>();
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paid, setPaid] = useState(false);
  const [upiQr, setUpiQr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !bookingId) return;
    api
      .get<BookingSummary>(`/api/public/${slug}/bookings/${bookingId}`)
      .then((data) => {
        setBooking(data);
        if (data.paymentStatus === 'paid') setPaid(true);
        if (data.upiVpa && data.amountDue > 0) {
          QRCode.toDataURL(buildUpiLink(data.upiVpa, data.creatorName, data.amountDue, `Booking payment - ${data.venue}`))
            .then(setUpiQr)
            .catch(() => setUpiQr(null));
        }
      })
      .catch(() => setNotFound(true));
  }, [slug, bookingId]);

  // Razorpay checkout is disabled for now — UPI QR is the only payment
  // method in use. Left in place (commented) in case it's turned back on.
  //
  // async function handlePay() {
  //   if (!slug || !bookingId) return;
  //   setError(null);
  //   setPaying(true);
  //   try {
  //     await loadRazorpayScript();
  //     const order = await api.post<RazorpayOrderResponse>(`/api/public/${slug}/bookings/${bookingId}/pay`);
  //
  //     const razorpay = new window.Razorpay({
  //       key: order.keyId,
  //       order_id: order.orderId,
  //       amount: order.amount,
  //       currency: order.currency,
  //       name: booking?.creatorName,
  //       description: `Payment for ${booking?.venue ?? 'booking'}`,
  //       prefill: { name: booking?.clientName },
  //       handler: () => {
  //         setPaid(true);
  //       },
  //       modal: {
  //         ondismiss: () => setPaying(false),
  //       },
  //     });
  //     razorpay.open();
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : 'Could not start the payment');
  //   } finally {
  //     setPaying(false);
  //   }
  // }

  if (notFound) {
    return (
      <div className="auth-page">
        <h1>Link not found</h1>
        <p>This payment link isn't valid. Please check the link with the person who shared it.</p>
      </div>
    );
  }

  if (!booking) return null;

  if (paid || booking.paymentStatus === 'paid') {
    return (
      <div className="auth-page">
        <h1>Payment received</h1>
        <p>Thanks {booking.clientName} — your payment for {booking.venue} has been received.</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Pay {booking.creatorName}</h1>
      <div className="booking-form">
        <p>
          {booking.venue} on {booking.eventDate} ({booking.startTime})
        </p>
        <p>Total amount: Rs.{booking.totalAmount}</p>
        <p>Already paid: Rs.{booking.advanceAmount}</p>
        <p>
          <strong>Amount due: Rs.{booking.amountDue}</strong>
        </p>

        {/* Razorpay checkout button disabled for now — UPI QR is the only payment method in use.
        {booking.amountDue > 0 && booking.razorpayEnabled && (
          <div className="form-actions">
            <button type="button" onClick={handlePay} disabled={paying}>
              {paying ? 'Opening payment…' : `Pay Rs.${booking.amountDue}`}
            </button>
          </div>
        )}
        */}

        {booking.amountDue > 0 && upiQr && (
          <div className="upi-qr-section">
            <p className="settings-hint">Scan to pay via any UPI app</p>
            <img src={upiQr} alt="Scan to pay via UPI" width={200} height={200} />
            <p className="settings-hint">
              <a href={buildUpiLink(booking.upiVpa!, booking.creatorName, booking.amountDue, `Booking payment - ${booking.venue}`)}>
                Open in a UPI app
              </a>{' '}
              — GPay, PhonePe, Paytm, etc.
            </p>
            <p className="settings-hint">
              This payment isn't tracked automatically — let {booking.creatorName} know once you've paid.
            </p>
          </div>
        )}

        {booking.amountDue > 0 && !upiQr && (
          <p className="settings-hint">Online payment isn't set up for this booking yet — please pay {booking.creatorName} directly.</p>
        )}
      </div>
    </div>
  );
}
