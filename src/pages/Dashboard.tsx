import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Booking, BookingInput, PaymentStatus } from '../types';
import { BookingForm } from '../components/BookingForm';
import { BookingCalendar } from '../components/BookingCalendar';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  partial: 'Partial',
  paid: 'Paid',
};

type Tab = 'upcoming' | 'done' | 'calendar';

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function findConflict(list: Booking[], input: BookingInput, excludeId?: string): Booking | undefined {
  return list.find(
    (b) =>
      b.id !== excludeId &&
      b.eventDate.slice(0, 10) === input.eventDate &&
      timesOverlap(input.startTime, input.endTime, b.startTime, b.endTime),
  );
}

interface PendingSave {
  input: BookingInput;
  mode: 'create' | 'update';
  conflict: Booking;
}

export function Dashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [actionTarget, setActionTarget] = useState<Booking | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { bookings } = await api.get<{ bookings: Booking[] }>('/api/bookings');
      setBookings(bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load bookings');
    } finally {
      setLoading(false);
    }
  }

  async function saveCreate(input: BookingInput) {
    const { booking } = await api.post<{ booking: Booking }>('/api/bookings', input);
    setBookings((prev) => [...prev, booking].sort((a, b) => a.eventDate.localeCompare(b.eventDate)));
    setShowForm(false);
  }

  async function saveUpdate(input: BookingInput) {
    if (!editing) return;
    const { booking } = await api.patch<{ booking: Booking }>(`/api/bookings/${editing.id}`, input);
    setBookings((prev) =>
      prev.map((b) => (b.id === booking.id ? booking : b)).sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    );
    setEditing(null);
  }

  async function handleFormSubmit(input: BookingInput) {
    const mode: 'create' | 'update' = editing ? 'update' : 'create';
    const conflict = findConflict(bookings, input, editing?.id);
    if (conflict) {
      setPendingSave({ input, mode, conflict });
      return;
    }
    if (mode === 'update') {
      await saveUpdate(input);
    } else {
      await saveCreate(input);
    }
  }

  async function confirmPendingSave() {
    if (!pendingSave) return;
    if (pendingSave.mode === 'update') {
      await saveUpdate(pendingSave.input);
    } else {
      await saveCreate(pendingSave.input);
    }
    setPendingSave(null);
  }

  async function handleMarkCompleted(target: Booking) {
    const { booking } = await api.patch<{ booking: Booking }>(`/api/bookings/${target.id}`, {
      completed: true,
      advanceAmount: target.totalAmount,
    });
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? booking : b)));
    setActionTarget(null);
  }

  async function handleConfirmDelete(id: string) {
    await api.delete(`/api/bookings/${id}`);
    setBookings((prev) => prev.filter((b) => b.id !== id));
    setActionTarget(null);
  }

  const upcoming = useMemo(() => bookings.filter((b) => !b.completed), [bookings]);
  const done = useMemo(() => bookings.filter((b) => b.completed), [bookings]);

  const summary = useMemo(() => {
    return bookings.reduce(
      (acc, b) => {
        acc.total += b.totalAmount;
        acc.collected += b.advanceAmount;
        acc.due += b.totalAmount - b.advanceAmount;
        return acc;
      },
      { total: 0, collected: 0, due: 0 },
    );
  }, [bookings]);

  let visible: Booking[] = [];
  if (tab === 'upcoming') visible = upcoming;
  else if (tab === 'done') visible = done;

  function renderContent() {
    if (loading) return <p>Loading…</p>;
    if (tab === 'calendar') return <BookingCalendar bookings={bookings} />;
    if (visible.length === 0) {
      return (
        <p className="empty-state">
          {tab === 'upcoming' ? 'No upcoming bookings. Add one to get started.' : 'No completed bookings yet.'}
        </p>
      );
    }
    return (
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Client</th>
              <th>Venue</th>
              <th>Total</th>
              <th>Advance</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.id}>
                <td>{formatDate(b.eventDate)}</td>
                <td>
                  {b.startTime}–{b.endTime}
                </td>
                <td>{b.clientName}</td>
                <td>{b.venue}</td>
                <td>{formatMoney(b.totalAmount)}</td>
                <td>{formatMoney(b.advanceAmount)}</td>
                <td>{formatMoney(b.totalAmount - b.advanceAmount)}</td>
                <td>
                  <span className={`status-badge status-${b.paymentStatus}`}>{STATUS_LABEL[b.paymentStatus]}</span>
                </td>
                <td className="notes-cell">{b.notes ?? '—'}</td>
                <td className="ledger-actions">
                  {!b.completed && (
                    <>
                      <button type="button" className="btn-ghost" onClick={() => setEditing(b)}>
                        Edit
                      </button>
                      <button type="button" className="btn-ghost btn-danger" onClick={() => setActionTarget(b)}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderConflictModal(conflictSave: PendingSave) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>Booking already exists at this time</h3>
          <p>
            {conflictSave.conflict.clientName} already has a booking at {conflictSave.conflict.venue} on{' '}
            {formatDate(conflictSave.conflict.eventDate)} from {conflictSave.conflict.startTime} to{' '}
            {conflictSave.conflict.endTime}. Would you like to add this booking anyway?
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setPendingSave(null)}>
              Cancel
            </button>
            <button type="button" onClick={confirmPendingSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderActionModal(target: Booking) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>{target.clientName}'s booking</h3>
          <p>
            {target.venue} on {formatDate(target.eventDate)} ({target.startTime}–{target.endTime}). What would you
            like to do with this booking?
          </p>
          {target.advanceAmount < target.totalAmount && (
            <p className="modal-hint">
              Marking as done settles the full amount ({formatMoney(target.totalAmount)}) as collected.
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setActionTarget(null)}>
              Cancel
            </button>
            <button type="button" className="btn-ghost" onClick={() => handleMarkCompleted(target)}>
              Done / Completed
            </button>
            <button type="button" className="btn-danger-solid" onClick={() => handleConfirmDelete(target.id)}>
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome, {user?.name}</h1>
        {!showForm && !editing && (
          <button type="button" onClick={() => setShowForm(true)}>
            + Add booking
          </button>
        )}
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <span className="summary-label">Total bookings</span>
          <span className="summary-value">{bookings.length}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Total value</span>
          <span className="summary-value">{formatMoney(summary.total)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Collected</span>
          <span className="summary-value success">{formatMoney(summary.collected)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Balance due</span>
          <span className="summary-value warning">{formatMoney(summary.due)}</span>
        </div>
      </div>

      {showForm && (
        <div className="form-panel">
          <h2>New booking</h2>
          <BookingForm onSubmit={handleFormSubmit} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {editing && (
        <div className="form-panel">
          <h2>Edit booking</h2>
          <BookingForm initial={editing} onSubmit={handleFormSubmit} onCancel={() => setEditing(null)} />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="tab-bar">
        <button type="button" className={tab === 'upcoming' ? 'tab active' : 'tab'} onClick={() => setTab('upcoming')}>
          Upcoming / Pending ({upcoming.length})
        </button>
        <button type="button" className={tab === 'done' ? 'tab active' : 'tab'} onClick={() => setTab('done')}>
          Done ({done.length})
        </button>
        <button type="button" className={tab === 'calendar' ? 'tab active' : 'tab'} onClick={() => setTab('calendar')}>
          Calendar
        </button>
      </div>

      {renderContent()}

      {pendingSave && renderConflictModal(pendingSave)}
      {actionTarget && renderActionModal(actionTarget)}
    </div>
  );
}
