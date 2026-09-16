import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

export function PublicBookingRequest() {
  const { slug } = useParams<{ slug: string }>();
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — left blank by real people
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!slug) return;
    api
      .get<{ creatorName: string }>(`/api/public/${slug}`)
      .then(({ creatorName }) => setCreatorName(creatorName))
      .catch(() => setNotFound(true));
  }, [slug]);

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
    if (Number.isNaN(Number(totalAmount)) || Number(totalAmount) < 0) {
      setError('Total amount must be a valid positive number');
      return;
    }
    if (Number.isNaN(Number(advanceAmount)) || Number(advanceAmount) < 0) {
      setError('Advance amount must be a valid positive number');
      return;
    }
    if (Number(advanceAmount) > Number(totalAmount)) {
      setError('Advance amount cannot be greater than total amount');
      return;
    }
    if (eventDate < todayStr) {
      setError('Event date cannot be in the past');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/public/${slug}/requests`, {
        clientName: clientName.trim(),
        clientContact: clientContact.trim(),
        clientEmail: clientEmail.trim(),
        venue: venue.trim(),
        eventDate,
        startTime,
        totalAmount: Number(totalAmount),
        advanceAmount: Number(advanceAmount),
        notes: notes.trim() || undefined,
        website: website || undefined,
      });
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
    return (
      <div className="auth-page">
        <h1>Thanks!</h1>
        <p>Your request has been sent{creatorName ? ` to ${creatorName}` : ''}. They'll follow up with you soon.</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>{creatorName ? `Request a booking with ${creatorName}` : 'Request a booking'}</h1>
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
        <div className="form-row">
          <label>
            Total amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              required
            />
          </label>
          <label>
            Advance you're paying
            <input
              type="number"
              min="0"
              step="0.01"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
              required
            />
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
