import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { buildUpiLink } from '../lib/razorpay';

interface CreatorInfo {
  creatorName: string;
  razorpayEnabled: boolean;
  upiVpa: string | null;
}

export function PublicBookingRequest() {
  const { slug } = useParams<{ slug: string }>();
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [requestId, setRequestId] = useState<string | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceQr, setAdvanceQr] = useState<string | null>(null);
  const [advancePaid] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — left blank by real people
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!slug) return;
    api
      .get<CreatorInfo>(`/api/public/${slug}`)
      .then(setCreator)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!creator?.upiVpa) return;
    const numericAmount = Number(advanceAmount) || 0;
    QRCode.toDataURL(buildUpiLink(creator.upiVpa, creator.creatorName, numericAmount, `Advance - ${creator.creatorName}`))
      .then(setAdvanceQr)
      .catch(() => setAdvanceQr(null));
  }, [creator, advanceAmount]);

  // Razorpay checkout is disabled for now — UPI QR is the only payment
  // method in use. Left in place (commented) in case it's turned back on.
  //
  // async function handlePayAdvance() {
  //   if (!slug || !requestId) return;
  //   const numericAmount = Number(advanceAmount);
  //   if (!numericAmount || numericAmount <= 0) {
  //     setAdvanceError('Enter an amount to pay');
  //     return;
  //   }
  //   setAdvanceError(null);
  //   setPaying(true);
  //   try {
  //     await loadRazorpayScript();
  //     const order = await api.post<RazorpayOrderResponse>(`/api/public/${slug}/requests/${requestId}/pay`, {
  //       amount: numericAmount,
  //     });
  //
  //     const razorpay = new window.Razorpay({
  //       key: order.keyId,
  //       order_id: order.orderId,
  //       amount: order.amount,
  //       currency: order.currency,
  //       name: creator?.creatorName,
  //       description: `Advance for ${creator?.creatorName}`,
  //       prefill: { name: clientName },
  //       handler: () => setAdvancePaid(true),
  //       modal: { ondismiss: () => setPaying(false) },
  //     });
  //     razorpay.open();
  //   } catch (err) {
  //     setAdvanceError(err instanceof Error ? err.message : 'Could not start the payment');
  //   } finally {
  //     setPaying(false);
  //   }
  // }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setError(null);

    if (!clientName.trim() || !clientContact.trim() || !clientEmail.trim() || !venue.trim() || !eventDate || !startTime) {
      setError('Please fill in all fields (notes are optional)');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
      setError('Enter a valid email address');
      return;
    }
    if (!/^\d{10}$/.test(clientContact.trim())) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    if (eventDate < todayStr) {
      setError('Event date cannot be in the past');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<{ ok: true; requestId: string }>(`/api/public/${slug}/requests`, {
        clientName: clientName.trim(),
        clientContact: clientContact.trim(),
        clientEmail: clientEmail.trim(),
        venue: venue.trim(),
        eventDate,
        startTime,
        notes: notes.trim() || undefined,
        website: website || undefined,
      });
      setRequestId(result.requestId);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request');
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="auth-page">
        <h1>Link not found</h1>
        <p>This booking link isn't valid. Please check the link with the person who shared it.</p>
      </div>
    );
  }

  if (submitted) {
    const canPayAdvance = requestId && !advancePaid && creator?.upiVpa;
    return (
      <div className="auth-page">
        <h1>Thanks!</h1>
        <p>
          Your request has been sent{creator ? ` to ${creator.creatorName}` : ''}. They'll follow up with you soon.
        </p>

        {advancePaid && <p>Your advance payment has been received — thanks!</p>}

        {canPayAdvance && (
          <div className="booking-form">
            <h2>Pay an advance now (optional)</h2>
            <label>
              Advance amount (Rs.)
              <input
                type="number"
                min="1"
                step="1"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </label>

            {/* Razorpay checkout button disabled for now — UPI QR is the only payment method in use.
            {creator?.razorpayEnabled && (
              <div className="form-actions">
                <button type="button" onClick={handlePayAdvance} disabled={paying}>
                  {paying ? 'Opening payment…' : 'Pay advance'}
                </button>
              </div>
            )}
            */}

            {creator?.upiVpa && advanceQr && (
              <div className="upi-qr-section">
                <p className="settings-hint">Scan to pay via any UPI app</p>
                <img src={advanceQr} alt="Scan to pay via UPI" width={200} height={200} />
                <p className="settings-hint">
                  <a
                    href={buildUpiLink(
                      creator.upiVpa,
                      creator.creatorName,
                      Number(advanceAmount) || 0,
                      `Advance - ${creator.creatorName}`,
                    )}
                  >
                    Open in a UPI app
                  </a>{' '}
                  — GPay, PhonePe, Paytm, etc.
                </p>
                <p className="settings-hint">
                  This payment isn't tracked automatically — mention it to {creator.creatorName} so they know.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>{creator ? `Request a booking with ${creator.creatorName}` : 'Request a booking'}</h1>
      <form className="booking-form" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}
        <label>
          Your name
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
        </label>
        <label>
          Phone
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            pattern="\d{10}"
            value={clientContact}
            onChange={(e) => setClientContact(e.target.value.replace(/\D/g, '').slice(0, 10))}
            required
          />
        </label>
        <label>
          Email
          <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
        </label>
        <label>
          Venue
          <input value={venue} onChange={(e) => setVenue(e.target.value)} required />
        </label>
        <div className="form-row">
          <label>
            Event date
            <input
              type="date"
              min={todayStr}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </label>
          <label>
            Ready Time
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
        </div>
        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything else they should know" />
        </label>
        <label className="honeypot-field" aria-hidden="true">
          Website
          <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  );
}
