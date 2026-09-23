import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { buildUpiLink } from '../lib/razorpay';

interface CreatorInfo {
  creatorName: string;
  razorpayEnabled: boolean;
  upiVpa: string | null;
}

// A booking-independent payment page — the artist shares this link/QR on its
// own (bio link, business card, etc.) and the customer types in whatever
// amount they're paying.
export function PublicPayment() {
  const { slug } = useParams<{ slug: string }>();
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amount, setAmount] = useState('');
  const [upiQr, setUpiQr] = useState<string | null>(null);
  // const [paid, setPaid] = useState(false); // only ever set by the (disabled) Razorpay handler

  useEffect(() => {
    if (!slug) return;
    api
      .get<CreatorInfo>(`/api/public/${slug}`)
      .then(setCreator)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!creator?.upiVpa) return;
    const numericAmount = Number(amount) || 0;
    QRCode.toDataURL(buildUpiLink(creator.upiVpa, creator.creatorName, numericAmount, `Payment to ${creator.creatorName}`))
      .then(setUpiQr)
      .catch(() => setUpiQr(null));
  }, [creator, amount]);

  // Razorpay checkout is disabled for now — UPI QR is the only payment
  // method in use. Left in place (commented) in case it's turned back on.
  //
  // async function handlePay() {
  //   if (!slug) return;
  //   const numericAmount = Number(amount);
  //   if (!numericAmount || numericAmount <= 0) {
  //     setError('Enter an amount to pay');
  //     return;
  //   }
  //   setError(null);
  //   setPaying(true);
  //   try {
  //     await loadRazorpayScript();
  //     const order = await api.post<RazorpayOrderResponse>(`/api/public/${slug}/pay`, { amount: numericAmount });
  //
  //     const razorpay = new window.Razorpay({
  //       key: order.keyId,
  //       order_id: order.orderId,
  //       amount: order.amount,
  //       currency: order.currency,
  //       name: creator?.creatorName,
  //       description: `Payment to ${creator?.creatorName}`,
  //       handler: () => setPaid(true),
  //       modal: { ondismiss: () => setPaying(false) },
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

  if (!creator) return null;

  if (!creator.upiVpa) {
    return (
      <div className="auth-page">
        <h1>Pay {creator.creatorName}</h1>
        <p>Online payment isn't set up yet — please contact {creator.creatorName} directly.</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Pay {creator.creatorName}</h1>
      <div className="booking-form">
        <label>
          Amount (Rs.)
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
          />
        </label>

        {/* Razorpay checkout button disabled for now — UPI QR is the only payment method in use.
        {creator.razorpayEnabled && (
          <div className="form-actions">
            <button type="button" onClick={handlePay} disabled={paying}>
              {paying ? 'Opening payment…' : 'Pay now'}
            </button>
          </div>
        )}
        */}

        {creator.upiVpa && upiQr && (
          <div className="upi-qr-section">
            <p className="settings-hint">Scan to pay via any UPI app</p>
            <img src={upiQr} alt="Scan to pay via UPI" width={200} height={200} />
            <p className="settings-hint">
              <a href={buildUpiLink(creator.upiVpa, creator.creatorName, Number(amount) || 0, `Payment to ${creator.creatorName}`)}>
                Open in a UPI app
              </a>{' '}
              — GPay, PhonePe, Paytm, etc.
            </p>
            <p className="settings-hint">
              This payment isn't tracked automatically — let {creator.creatorName} know once you've paid.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
