import { useState, type FormEvent } from 'react';
import type { Booking, BookingInput } from '../types';

interface BookingFormProps {
  initial?: Booking;
  onSubmit: (input: BookingInput) => Promise<void>;
  onCancel: () => void;
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const total = (h * 60 + m + hours * 60) % (24 * 60);
  const normalized = total < 0 ? total + 24 * 60 : total;
  const nh = Math.floor(normalized / 60);
  const nm = normalized % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function BookingForm({ initial, onSubmit, onCancel }: BookingFormProps) {
  const [clientName, setClientName] = useState(initial?.clientName ?? '');
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [eventDate, setEventDate] = useState(initial?.eventDate?.slice(0, 10) ?? '');
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '');
  const [endTimeTouched, setEndTimeTouched] = useState(Boolean(initial));
  const [totalAmount, setTotalAmount] = useState(initial ? String(initial.totalAmount) : '');
  const [advanceAmount, setAdvanceAmount] = useState(initial ? String(initial.advanceAmount) : '0');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    if (!endTimeTouched && value) {
      setEndTime(addHours(value, 3));
    }
  }

  function handleEndTimeChange(value: string) {
    setEndTime(value);
    setEndTimeTouched(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const total = Number(totalAmount);
    const advance = Number(advanceAmount || 0);

    if (!clientName.trim() || !venue.trim() || !eventDate) {
      setError('Client name, venue, and date are required');
      return;
    }
    if (!startTime || !endTime) {
      setError('Start time and end time are required');
      return;
    }
    if (Number.isNaN(total) || total < 0) {
      setError('Total amount must be a valid positive number');
      return;
    }
    if (Number.isNaN(advance) || advance < 0) {
      setError('Advance amount must be a valid positive number');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        clientName: clientName.trim(),
        venue: venue.trim(),
        eventDate,
        startTime,
        endTime,
        totalAmount: total,
        advanceAmount: advance,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <label>
        Client name
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
      </label>
      <label>
        Venue
        <input value={venue} onChange={(e) => setVenue(e.target.value)} required />
      </label>
      <div className="form-row">
        <label>
          Event date
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
        </label>
        <label>
          Start time
          <input
            type="time"
            value={startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            required
          />
        </label>
        <label>
          End time
          <input type="time" value={endTime} onChange={(e) => handleEndTimeChange(e.target.value)} required />
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
          Advance received
          <input
            type="number"
            min="0"
            step="0.01"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Add booking'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
