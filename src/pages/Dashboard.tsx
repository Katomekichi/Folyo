import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Booking, BookingInput, BookingRequest, PaymentStatus } from '../types';
import { BookingForm } from '../components/BookingForm';
import { BookingCalendar } from '../components/BookingCalendar';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  partial: 'Partial',
  paid: 'Paid',
};

type Tab = 'upcoming' | 'done' | 'calendar';
type PeriodMode = 'all' | 'month' | 'quarter' | 'year';

const QUARTER_LABEL: Record<number, string> = {
  1: 'Q1 (Jan–Mar)',
  2: 'Q2 (Apr–Jun)',
  3: 'Q3 (Jul–Sep)',
  4: 'Q4 (Oct–Dec)',
};

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
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [reviewingRequest, setReviewingRequest] = useState<BookingRequest | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSlug, setLinkSlug] = useState<string | null | undefined>(undefined);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const now = new Date();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodQuarter, setPeriodQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());

  useEffect(() => {
    load();
    loadRequests();
  }, []);

  async function loadLink() {
    try {
      const data = await api.get<{ slug: string | null }>('/api/settings/booking-link');
      setLinkSlug(data.slug);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not load your booking link');
    }
  }

  function openLinkModal() {
    setShowLinkModal(true);
    setLinkError(null);
    setLinkCopied(false);
    if (linkSlug === undefined) loadLink();
  }

  async function handleGenerateLink() {
    setLinkSubmitting(true);
    setLinkError(null);
    setLinkCopied(false);
    try {
      const data = await api.post<{ slug: string }>('/api/settings/booking-link/generate');
      setLinkSlug(data.slug);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not create a booking link');
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function handleDisableLink() {
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      await api.delete('/api/settings/booking-link');
      setLinkSlug(null);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not disable your booking link');
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function handleCopyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable — the link is still shown as
      // selectable text, so this is a soft failure.
    }
  }

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

  async function loadRequests() {
    try {
      const { requests } = await api.get<{ requests: BookingRequest[] }>('/api/requests');
      setRequests(requests);
    } catch {
      // Non-critical — the ledger still works without booking requests loading.
    }
  }

  async function handleConfirmRequest(input: BookingInput) {
    if (!reviewingRequest) return;
    const { booking } = await api.post<{ booking: Booking }>(`/api/requests/${reviewingRequest.id}/confirm`, input);
    setBookings((prev) => [...prev, booking].sort((a, b) => a.eventDate.localeCompare(b.eventDate)));
    setRequests((prev) => prev.filter((r) => r.id !== reviewingRequest.id));
    setReviewingRequest(null);
  }

  async function handleDismissRequest(id: string) {
    await api.delete(`/api/requests/${id}`);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (reviewingRequest?.id === id) setReviewingRequest(null);
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

  function isInPeriod(eventDateIso: string): boolean {
    if (periodMode === 'all') return true;
    const [y, m] = eventDateIso.slice(0, 10).split('-').map(Number);
    if (periodMode === 'year') return y === periodYear;
    if (periodMode === 'month') return y === periodYear && m === periodMonth;
    return y === periodYear && Math.ceil(m / 3) === periodQuarter;
  }

  const periodBookings = useMemo(
    () => bookings.filter((b) => isInPeriod(b.eventDate)),
    [bookings, periodMode, periodMonth, periodQuarter, periodYear],
  );

  const upcoming = useMemo(() => periodBookings.filter((b) => !b.completed), [periodBookings]);
  const done = useMemo(() => periodBookings.filter((b) => b.completed), [periodBookings]);

  const summary = useMemo(() => {
    return periodBookings.reduce(
      (acc, b) => {
        acc.total += b.totalAmount;
        acc.collected += b.advanceAmount;
        acc.due += b.totalAmount - b.advanceAmount;
        // Team payouts are assumed settled once a booking is marked done.
        if (!b.completed) {
          acc.teamOwed += b.teamMembers.reduce((sum, m) => sum + m.amount, 0);
        }
        acc.travelExpense += b.travelExpense;
        return acc;
      },
      { total: 0, collected: 0, due: 0, teamOwed: 0, travelExpense: 0 },
    );
  }, [periodBookings]);

  let visible: Booking[] = [];
  if (tab === 'upcoming') visible = upcoming;
  else if (tab === 'done') visible = done;

  function renderContent() {
    if (loading) return <p>Loading…</p>;
    if (tab === 'calendar') return <BookingCalendar bookings={periodBookings} />;
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
              {tab !== 'done' && <th>Advance</th>}
              <th>Balance</th>
              <th>Status</th>
              <th>Travel</th>
              <th>Team members</th>
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
                {tab !== 'done' && <td>{formatMoney(b.advanceAmount)}</td>}
                <td>{formatMoney(b.totalAmount - b.advanceAmount)}</td>
                <td>
                  <span className={`status-badge status-${b.paymentStatus}`}>{STATUS_LABEL[b.paymentStatus]}</span>
                </td>
                <td>{formatMoney(b.travelExpense)}</td>
                <td className="team-members-cell">
                  {b.teamMembers.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="team-members-list">
                      {b.teamMembers.map((m) => (
                        <li key={m.id}>
                          {m.name}: {formatMoney(m.amount)}
                        </li>
                      ))}
                    </ul>
                  )}
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

  function renderLinkModal() {
    const url = linkSlug ? `${window.location.origin}/book/${linkSlug}` : null;
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>Booking request link</h3>
          <p>
            Share this link with customers so they can send you a booking request directly. Requests show up on
            your dashboard for you to price and confirm — nothing is added to your ledger automatically.
          </p>
          {linkError && <p className="form-error">{linkError}</p>}
          {linkSlug === undefined ? (
            <p>Loading…</p>
          ) : url ? (
            <div className="settings-connected">
              <input className="booking-link-field" value={url} readOnly onFocus={(e) => e.target.select()} />
            </div>
          ) : (
            <p className="modal-hint">You don't have a booking link yet.</p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowLinkModal(false)}>
              Close
            </button>
            {url ? (
              <>
                <button type="button" className="btn-ghost btn-danger" onClick={handleDisableLink} disabled={linkSubmitting}>
                  Disable
                </button>
                <button type="button" className="btn-ghost" onClick={handleGenerateLink} disabled={linkSubmitting}>
                  Regenerate
                </button>
                <button type="button" onClick={() => handleCopyLink(url)} disabled={linkSubmitting}>
                  {linkCopied ? 'Copied!' : 'Copy link'}
                </button>
              </>
            ) : (
              <button type="button" onClick={handleGenerateLink} disabled={linkSubmitting}>
                {linkSubmitting ? 'Creating…' : 'Create link'}
              </button>
            )}
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
          <div className="dashboard-header-actions">
            <button type="button" className="btn-ghost" onClick={openLinkModal}>
              Share booking link
            </button>
            <button type="button" onClick={() => setShowForm(true)}>
              + Add booking
            </button>
          </div>
        )}
      </div>

      <div className="period-filter">
        <label>
          Filter by
          <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}>
            <option value="all">All time</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </label>
        {periodMode === 'month' && (
          <label>
            Month
            <input
              type="month"
              value={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                if (!y || !m) return;
                setPeriodYear(y);
                setPeriodMonth(m);
              }}
            />
          </label>
        )}
        {periodMode === 'quarter' && (
          <>
            <label>
              Quarter
              <select value={periodQuarter} onChange={(e) => setPeriodQuarter(Number(e.target.value))}>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {QUARTER_LABEL[q]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input
                type="number"
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value) || periodYear)}
              />
            </label>
          </>
        )}
        {periodMode === 'year' && (
          <label>
            Year
            <input
              type="number"
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value) || periodYear)}
            />
          </label>
        )}
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <span className="summary-label">Total bookings</span>
          <span className="summary-value">{periodBookings.length}</span>
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
        <div className="summary-card">
          <span className="summary-label">Owed to team</span>
          <span className="summary-value warning">{formatMoney(summary.teamOwed)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Travel expense</span>
          <span className="summary-value">{formatMoney(summary.travelExpense)}</span>
        </div>
      </div>

      {requests.length > 0 && !reviewingRequest && (
        <div className="form-panel draft-panel">
          <h2>Booking requests ({requests.length})</h2>
          <ul className="draft-list">
            {requests.map((r) => (
              <li key={r.id} className="draft-item">
                <div className="draft-summary">
                  <strong>{r.clientName}</strong>
                  <span>{r.clientContact}</span>
                  <span>{r.venue ?? 'Venue not given'}</span>
                  <span>{r.eventDate ?? 'Date not given'}</span>
                </div>
                <div className="draft-actions">
                  <button type="button" className="btn-ghost" onClick={() => setReviewingRequest(r)}>
                    Review
                  </button>
                  <button type="button" className="btn-ghost btn-danger" onClick={() => handleDismissRequest(r.id)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewingRequest && (
        <div className="form-panel">
          <h2>Confirm booking request</h2>
          {reviewingRequest.notes && <p className="settings-hint">Customer notes: "{reviewingRequest.notes}"</p>}
          <BookingForm
            initial={reviewingRequest}
            submitLabel="Confirm booking"
            onSubmit={handleConfirmRequest}
            onCancel={() => setReviewingRequest(null)}
          />
        </div>
      )}

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
      {showLinkModal && renderLinkModal()}
    </div>
  );
}
