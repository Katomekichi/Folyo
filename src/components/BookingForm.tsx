import { useState, type FormEvent } from 'react';
import type { BookingInput, TeamMember } from '../types';

export interface BookingFormInitial {
  clientName?: string | null;
  venue?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  totalAmount?: number | null;
  advanceAmount?: number | null;
  travelExpense?: number | null;
  notes?: string | null;
  teamMembers?: TeamMember[];
}

interface TeamMemberRow {
  id: string;
  name: string;
  amount: string;
}

let teamMemberRowSeq = 0;
function newTeamMemberRow(): TeamMemberRow {
  teamMemberRowSeq += 1;
  return { id: `row-${teamMemberRowSeq}`, name: '', amount: '' };
}

interface BookingFormProps {
  initial?: BookingFormInitial;
  submitLabel?: string;
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

export function BookingForm({ initial, submitLabel, onSubmit, onCancel }: BookingFormProps) {
  const [clientName, setClientName] = useState(initial?.clientName ?? '');
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [eventDate, setEventDate] = useState(initial?.eventDate?.slice(0, 10) ?? '');
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount != null ? String(initial.totalAmount) : '');
  const [advanceAmount, setAdvanceAmount] = useState(
    initial?.advanceAmount != null ? String(initial.advanceAmount) : '0',
  );
  const [travelExpense, setTravelExpense] = useState(
    initial?.travelExpense != null ? String(initial.travelExpense) : '0',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>(
    initial?.teamMembers?.map((m) => ({ ...newTeamMemberRow(), name: m.name, amount: String(m.amount) })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  function addTeamMember() {
    setTeamMembers((prev) => [...prev, newTeamMemberRow()]);
  }

  function updateTeamMember(id: string, patch: Partial<TeamMemberRow>) {
    setTeamMembers((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeTeamMember(id: string) {
    setTeamMembers((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const total = Number(totalAmount);
    const advance = Number(advanceAmount || 0);
    const travel = Number(travelExpense || 0);

    if (!clientName.trim() || !venue.trim() || !eventDate) {
      setError('Client name, venue, and date are required');
      return;
    }
    if (!initial && eventDate < todayStr) {
      setError('Event date cannot be in the past');
      return;
    }
    if (!startTime) {
      setError('Start time is required');
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
    if (advance > total) {
      setError('Advance amount cannot be greater than total amount');
      return;
    }
    if (Number.isNaN(travel) || travel < 0) {
      setError('Travel expense must be a valid positive number');
      return;
    }
    for (const member of teamMembers) {
      if (!member.name.trim()) {
        setError('Each team member needs a name');
        return;
      }
      const amount = Number(member.amount);
      if (Number.isNaN(amount) || amount < 0) {
        setError('Each team member amount must be a valid positive number');
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        clientName: clientName.trim(),
        venue: venue.trim(),
        eventDate,
        startTime,
        endTime: addHours(startTime, 3),
        totalAmount: total,
        advanceAmount: advance,
        travelExpense: travel,
        notes: notes.trim() || undefined,
        teamMembers: teamMembers.map((m) => ({ name: m.name.trim(), amount: Number(m.amount) })),
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
          <input
            type="date"
            min={initial ? undefined : todayStr}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
        </label>
        <label>
          Ready Time
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
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
        <label>
          Travel expense
          <input
            type="number"
            min="0"
            step="0.01"
            value={travelExpense}
            onChange={(e) => setTravelExpense(e.target.value)}
          />
        </label>
      </div>
      <div className="team-members-section">
        <div className="team-members-header">
          <span>Supporting / team members</span>
          <button type="button" className="btn-ghost" onClick={addTeamMember}>
            + Add member
          </button>
        </div>
        {teamMembers.map((member) => (
          <div className="form-row team-member-row" key={member.id}>
            <label>
              Name
              <input
                value={member.name}
                onChange={(e) => updateTeamMember(member.id, { name: e.target.value })}
                required
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={member.amount}
                onChange={(e) => updateTeamMember(member.id, { amount: e.target.value })}
                required
              />
            </label>
            <button type="button" className="btn-ghost btn-danger" onClick={() => removeTeamMember(member.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel ?? (initial ? 'Save changes' : 'Add booking')}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
