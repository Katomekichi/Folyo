import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
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

type Tab = 'upcoming' | 'done' | 'calendar' | 'balance';

function netEarning(b: Booking): number {
  const teamPayouts = b.teamMembers.reduce((sum, m) => sum + m.amount, 0);
  return b.totalAmount - b.travelExpense - teamPayouts;
}
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

  const [showNetEarningsModal, setShowNetEarningsModal] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | undefined>(undefined);
  const [emailHost, setEmailHost] = useState('');
  const [emailPort, setEmailPort] = useState('587');
  const [emailUser, setEmailUser] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Razorpay is disabled for now — UPI QR is the only payment method in
  // use. State/handlers left in place (commented) in case it's turned back on.
  //
  // const [showRazorpayModal, setShowRazorpayModal] = useState(false);
  // const [razorpayConfigured, setRazorpayConfigured] = useState<boolean | undefined>(undefined);
  // const [razorpayKeyId, setRazorpayKeyId] = useState('');
  // const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  // const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState('');
  // const [razorpayWebhookConfigured, setRazorpayWebhookConfigured] = useState(false);
  // const [razorpaySubmitting, setRazorpaySubmitting] = useState(false);
  // const [razorpayError, setRazorpayError] = useState<string | null>(null);

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiConfigured, setUpiConfigured] = useState<boolean | undefined>(undefined);
  const [upiVpa, setUpiVpa] = useState('');
  const [upiSubmitting, setUpiSubmitting] = useState(false);
  const [upiError, setUpiError] = useState<string | null>(null);
  // const [upiDirectQr, setUpiDirectQr] = useState<string | null>(null);
  const [upiPageQr, setUpiPageQr] = useState<string | null>(null);

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

  interface EmailSettings {
    configured: boolean;
    host: string | null;
    port: number | null;
    user: string | null;
    from: string | null;
  }

  async function loadEmailSettings() {
    try {
      const data = await api.get<EmailSettings>('/api/settings/email');
      setEmailConfigured(data.configured);
      setEmailHost(data.host ?? '');
      setEmailPort(data.port ? String(data.port) : '587');
      setEmailUser(data.user ?? '');
      setEmailFrom(data.from ?? '');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not load your email settings');
    }
  }

  function openEmailModal() {
    setShowEmailModal(true);
    setEmailError(null);
    setEmailPass('');
    if (emailConfigured === undefined) loadEmailSettings();
  }

  async function handleSaveEmail() {
    setEmailSubmitting(true);
    setEmailError(null);
    try {
      const data = await api.post<EmailSettings>('/api/settings/email', {
        host: emailHost.trim(),
        port: Number(emailPort),
        user: emailUser.trim(),
        pass: emailPass.trim() || undefined,
        from: emailFrom.trim() || undefined,
      });
      setEmailConfigured(data.configured);
      setEmailPass('');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not save your email settings');
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handleDisconnectEmail() {
    setEmailSubmitting(true);
    setEmailError(null);
    try {
      await api.delete('/api/settings/email');
      setEmailConfigured(false);
      setEmailHost('');
      setEmailPort('587');
      setEmailUser('');
      setEmailFrom('');
      setEmailPass('');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not disconnect your email account');
    } finally {
      setEmailSubmitting(false);
    }
  }

  // interface RazorpaySettings {
  //   configured: boolean;
  //   keyId: string | null;
  //   webhookConfigured: boolean;
  //   enabled: boolean;
  // }
  //
  // async function loadRazorpaySettings() {
  //   try {
  //     const data = await api.get<RazorpaySettings>('/api/settings/razorpay');
  //     setRazorpayConfigured(data.configured);
  //     setRazorpayKeyId(data.keyId ?? '');
  //     setRazorpayWebhookConfigured(data.webhookConfigured);
  //   } catch (err) {
  //     setRazorpayError(err instanceof Error ? err.message : 'Could not load your Razorpay settings');
  //   }
  // }
  //
  // function openRazorpayModal() {
  //   setShowRazorpayModal(true);
  //   setRazorpayError(null);
  //   setRazorpayKeySecret('');
  //   setRazorpayWebhookSecret('');
  //   if (razorpayConfigured === undefined) loadRazorpaySettings();
  // }
  //
  // async function handleSaveRazorpay() {
  //   setRazorpaySubmitting(true);
  //   setRazorpayError(null);
  //   try {
  //     const data = await api.post<RazorpaySettings>('/api/settings/razorpay', {
  //       keyId: razorpayKeyId.trim(),
  //       keySecret: razorpayKeySecret.trim() || undefined,
  //       webhookSecret: razorpayWebhookSecret.trim() || undefined,
  //     });
  //     setRazorpayConfigured(data.configured);
  //     setRazorpayWebhookConfigured(data.webhookConfigured);
  //     setRazorpayKeySecret('');
  //     setRazorpayWebhookSecret('');
  //   } catch (err) {
  //     setRazorpayError(err instanceof Error ? err.message : 'Could not save your Razorpay settings');
  //   } finally {
  //     setRazorpaySubmitting(false);
  //   }
  // }
  //
  // async function handleDisconnectRazorpay() {
  //   setRazorpaySubmitting(true);
  //   setRazorpayError(null);
  //   try {
  //     await api.delete('/api/settings/razorpay');
  //     setRazorpayConfigured(false);
  //     setRazorpayKeyId('');
  //     setRazorpayKeySecret('');
  //     setRazorpayWebhookSecret('');
  //     setRazorpayWebhookConfigured(false);
  //   } catch (err) {
  //     setRazorpayError(err instanceof Error ? err.message : 'Could not disconnect Razorpay');
  //   } finally {
  //     setRazorpaySubmitting(false);
  //   }
  // }

  interface UpiSettings {
    configured: boolean;
    vpa: string | null;
  }

  async function loadUpiSettings() {
    try {
      const data = await api.get<UpiSettings>('/api/settings/upi');
      setUpiConfigured(data.configured);
      setUpiVpa(data.vpa ?? '');
    } catch (err) {
      setUpiError(err instanceof Error ? err.message : 'Could not load your UPI settings');
    }
  }

  function openUpiModal() {
    setShowUpiModal(true);
    setUpiError(null);
    if (upiConfigured === undefined) loadUpiSettings();
    if (linkSlug === undefined) loadLink();
  }

  useEffect(() => {
    if (!showUpiModal || !upiConfigured || !upiVpa.trim()) {
      // setUpiDirectQr(null);
      setUpiPageQr(null);
      return;
    }
    // const directParams = new URLSearchParams({ pa: upiVpa.trim(), pn: user?.name ?? '', cu: 'INR' });
    // QRCode.toDataURL(`upi://pay?${directParams.toString()}`).then(setUpiDirectQr).catch(() => setUpiDirectQr(null));

    if (linkSlug) {
      QRCode.toDataURL(`${window.location.origin}/pay/${linkSlug}`).then(setUpiPageQr).catch(() => setUpiPageQr(null));
    } else {
      setUpiPageQr(null);
    }
  }, [showUpiModal, upiConfigured, upiVpa, linkSlug, user?.name]);

  async function handleSaveUpi() {
    setUpiSubmitting(true);
    setUpiError(null);
    try {
      const data = await api.post<UpiSettings>('/api/settings/upi', { vpa: upiVpa.trim() });
      setUpiConfigured(data.configured);
      setUpiVpa(data.vpa ?? '');
    } catch (err) {
      setUpiError(err instanceof Error ? err.message : 'Could not save your UPI ID');
    } finally {
      setUpiSubmitting(false);
    }
  }

  async function handleDisconnectUpi() {
    setUpiSubmitting(true);
    setUpiError(null);
    try {
      await api.delete('/api/settings/upi');
      setUpiConfigured(false);
      setUpiVpa('');
    } catch (err) {
      setUpiError(err instanceof Error ? err.message : 'Could not remove your UPI ID');
    } finally {
      setUpiSubmitting(false);
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
        if (b.completed) {
          acc.netEarnings += netEarning(b);
        }
        return acc;
      },
      { total: 0, collected: 0, due: 0, teamOwed: 0, travelExpense: 0, netEarnings: 0 },
    );
  }, [periodBookings]);

  let visible: Booking[] = [];
  if (tab === 'upcoming') visible = upcoming;
  else if (tab === 'done') visible = done;

  function renderBalanceSheet() {
    if (periodBookings.length === 0) {
      return <p className="empty-state">No bookings in this period yet.</p>;
    }
    return (
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Venue</th>
              <th>Total</th>
              <th>Travel expense</th>
              <th>Team payouts</th>
              <th>Net earning</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {periodBookings.map((b) => {
              const teamPayouts = b.teamMembers.reduce((sum, m) => sum + m.amount, 0);
              return (
                <tr key={b.id}>
                  <td>{formatDate(b.eventDate)}</td>
                  <td>{b.clientName}</td>
                  <td>{b.venue}</td>
                  <td>{formatMoney(b.totalAmount)}</td>
                  <td>{formatMoney(b.travelExpense)}</td>
                  <td>{formatMoney(teamPayouts)}</td>
                  <td>{formatMoney(netEarning(b))}</td>
                  <td>{b.completed ? 'Done' : 'Upcoming'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td>{formatMoney(summary.total)}</td>
              <td>{formatMoney(summary.travelExpense)}</td>
              <td>{formatMoney(periodBookings.reduce((sum, b) => sum + b.teamMembers.reduce((s, m) => s + m.amount, 0), 0))}</td>
              <td>{formatMoney(summary.netEarnings)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  function renderContent() {
    if (loading) return <p>Loading…</p>;
    if (tab === 'calendar') return <BookingCalendar bookings={periodBookings} />;
    if (tab === 'balance') return renderBalanceSheet();
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

  // Razorpay is disabled for now — UPI QR is the only payment method in
  // use. Left in place (commented) in case it's turned back on later.
  //
  // function renderRazorpayModal() {
  //   const webhookUrl = `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/webhooks/razorpay/${user?.id}`;
  //   return (
  //     <div className="modal-overlay" style={{ display: 'none' }}>
  //       <div className="modal">
  //         <h3>Connect Razorpay</h3>
  //         <p>
  //           Connect your own{' '}
  //           <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer">
  //             Razorpay account
  //           </a>{' '}
  //           so customers can pay you directly from your booking link. Payments settle straight into your account —
  //           Folyo never touches the money.
  //         </p>
  //         {razorpayError && <p className="form-error">{razorpayError}</p>}
  //         {razorpayConfigured === undefined ? (
  //           <p>Loading…</p>
  //         ) : (
  //           <form
  //             className="booking-form"
  //             onSubmit={(e) => {
  //               e.preventDefault();
  //               handleSaveRazorpay();
  //             }}
  //           >
  //             {razorpayConfigured && <p className="settings-hint">Connected — Key ID {razorpayKeyId}.</p>}
  //             <label>
  //               Key ID
  //               <input value={razorpayKeyId} onChange={(e) => setRazorpayKeyId(e.target.value)} required />
  //             </label>
  //             <label>
  //               Key secret
  //               <input
  //                 type="password"
  //                 value={razorpayKeySecret}
  //                 onChange={(e) => setRazorpayKeySecret(e.target.value)}
  //                 placeholder={razorpayConfigured ? 'Leave blank to keep current secret' : ''}
  //                 required={!razorpayConfigured}
  //               />
  //             </label>
  //             <label>
  //               Webhook secret
  //               <input
  //                 type="password"
  //                 value={razorpayWebhookSecret}
  //                 onChange={(e) => setRazorpayWebhookSecret(e.target.value)}
  //                 placeholder={razorpayWebhookConfigured ? 'Leave blank to keep current secret' : ''}
  //               />
  //             </label>
  //             <p className="settings-hint">
  //               In your Razorpay dashboard, add a webhook pointing at <code>{webhookUrl}</code> for the{' '}
  //               <code>payment.captured</code> and <code>payment.failed</code> events, and paste the secret it gives
  //               you above.
  //             </p>
  //             <div className="modal-actions">
  //               <button type="button" className="btn-ghost" onClick={() => setShowRazorpayModal(false)}>
  //                 Close
  //               </button>
  //               {razorpayConfigured && (
  //                 <button
  //                   type="button"
  //                   className="btn-ghost btn-danger"
  //                   onClick={handleDisconnectRazorpay}
  //                   disabled={razorpaySubmitting}
  //                 >
  //                   Disconnect
  //                 </button>
  //               )}
  //               <button type="submit" disabled={razorpaySubmitting}>
  //                 {razorpaySubmitting ? 'Saving…' : 'Save'}
  //               </button>
  //             </div>
  //           </form>
  //         )}
  //       </div>
  //     </div>
  //   );
  // }

  function renderUpiModal() {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>UPI QR payment</h3>
          <p>
            Add your own UPI ID and customers on your payment page get a QR code they can scan with any UPI app
            (Google Pay, PhonePe, Paytm, etc.) to pay you directly. No gateway account needed — but since there's no
            confirmation webhook, you'll need to mark the booking paid yourself once you see the money land.
          </p>
          {upiError && <p className="form-error">{upiError}</p>}
          {upiConfigured === undefined ? (
            <p>Loading…</p>
          ) : (
            <form
              className="booking-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveUpi();
              }}
            >
              {upiConfigured && <p className="settings-hint">Connected — {upiVpa}.</p>}
              <label>
                UPI ID (VPA)
                <input
                  value={upiVpa}
                  onChange={(e) => setUpiVpa(e.target.value)}
                  placeholder="yourname@okhdfcbank"
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowUpiModal(false)}>
                  Close
                </button>
                {upiConfigured && (
                  <button
                    type="button"
                    className="btn-ghost btn-danger"
                    onClick={handleDisconnectUpi}
                    disabled={upiSubmitting}
                  >
                    Remove
                  </button>
                )}
                <button type="submit" disabled={upiSubmitting}>
                  {upiSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {/* {upiConfigured && upiDirectQr && (
            <div className="upi-qr-section">
              <p className="settings-hint">Share this QR — scanning it opens the customer's UPI app directly.</p>
              <img src={upiDirectQr} alt="Your UPI QR code" width={200} height={200} />
              <a href={upiDirectQr} download="upi-qr.png">
                Download QR
              </a>
            </div>
          )} */}

          {upiConfigured && upiPageQr && linkSlug && (
            <div className="upi-qr-section">
              <p className="settings-hint">
                Or share your payment page — customers can pay any amount via UPI, whether or not it's tied to a
                booking.
              </p>
              <img src={upiPageQr} alt="Your payment page QR code" width={200} height={200} />
              <div className="settings-connected">
                <input
                  className="booking-link-field"
                  value={`${window.location.origin}/pay/${linkSlug}`}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" onClick={() => handleCopyLink(`${window.location.origin}/pay/${linkSlug}`)}>
                  {linkCopied ? 'Copied!' : 'Copy link'}
                </button>
              </div>
              {/* <a href={upiPageQr} download="payment-page-qr.png">
                Download QR
              </a> */}
            </div>
          )}

          {upiConfigured && !linkSlug && (
            <p className="settings-hint">
              Create a booking link first (Share booking link) to also get a shareable payment-page QR.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderEmailModal() {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>Connect Email</h3>
          <p>
            Connect your own email account so booking-confirmation emails go out from your address. For Gmail, use
            an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">app password</a>{' '}
            (not your regular password) — host <code>smtp.gmail.com</code>, port <code>587</code>.
          </p>
          {emailError && <p className="form-error">{emailError}</p>}
          {emailConfigured === undefined ? (
            <p>Loading…</p>
          ) : (
            <form
              className="booking-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEmail();
              }}
            >
              {emailConfigured && <p className="settings-hint">Connected as {emailUser}.</p>}
              <label>
                SMTP host
                <input value={emailHost} onChange={(e) => setEmailHost(e.target.value)} required />
              </label>
              <div className="form-row">
                <label>
                  Port
                  <input
                    type="number"
                    value={emailPort}
                    onChange={(e) => setEmailPort(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Email address
                  <input
                    type="email"
                    value={emailUser}
                    onChange={(e) => setEmailUser(e.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                App password
                <input
                  type="password"
                  value={emailPass}
                  onChange={(e) => setEmailPass(e.target.value)}
                  placeholder={emailConfigured ? 'Leave blank to keep current password' : ''}
                  required={!emailConfigured}
                />
              </label>
              <label>
                From name (optional)
                <input
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder={emailUser || 'your@email.com'}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowEmailModal(false)}>
                  Close
                </button>
                {emailConfigured && (
                  <button
                    type="button"
                    className="btn-ghost btn-danger"
                    onClick={handleDisconnectEmail}
                    disabled={emailSubmitting}
                  >
                    Disconnect
                  </button>
                )}
                <button type="submit" disabled={emailSubmitting}>
                  {emailSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  function renderNetEarningsModal() {
    const sorted = [...done].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return (
      <div className="modal-overlay">
        <div className="modal modal-wide">
          <h3>Net earnings breakdown</h3>
          <p className="modal-hint">
            How {formatMoney(summary.netEarnings)} in net earnings was arrived at, from bookings marked done.
          </p>
          {sorted.length === 0 ? (
            <p className="empty-state">No completed bookings in this period yet.</p>
          ) : (
            <ul className="earnings-tree">
              {sorted.map((b) => {
                const teamPayouts = b.teamMembers.reduce((sum, m) => sum + m.amount, 0);
                return (
                  <li key={b.id} className="earnings-tree-booking">
                    <div className="earnings-tree-node earnings-tree-root">
                      <span>
                        {formatDate(b.eventDate)} · {b.clientName} — {b.venue}
                      </span>
                      <span>{formatMoney(b.totalAmount)}</span>
                    </div>
                    <ul className="earnings-tree-children">
                      <li className="earnings-tree-node">
                        <span>− Travel expense</span>
                        <span>{formatMoney(b.travelExpense)}</span>
                      </li>
                      {b.teamMembers.length === 0 ? (
                        <li className="earnings-tree-node earnings-tree-muted">
                          <span>No team payouts</span>
                          <span>{formatMoney(0)}</span>
                        </li>
                      ) : (
                        b.teamMembers.map((m) => (
                          <li key={m.id} className="earnings-tree-node">
                            <span>− Paid to {m.name}</span>
                            <span>{formatMoney(m.amount)}</span>
                          </li>
                        ))
                      )}
                      <li className="earnings-tree-node earnings-tree-net">
                        <span>= Net from this booking</span>
                        <span>{formatMoney(b.totalAmount - b.travelExpense - teamPayouts)}</span>
                      </li>
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="earnings-tree-total">
            <span>Total net earnings</span>
            <span>{formatMoney(summary.netEarnings)}</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowNetEarningsModal(false)}>
              Close
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
          <div className="dashboard-header-actions">
            <button type="button" className="btn-ghost" onClick={openLinkModal}>
              Share booking link
            </button>
            <button type="button" className="btn-ghost" onClick={openEmailModal}>
              Connect Email
            </button>
            {/* Razorpay disabled for now — UPI QR is the only payment method in use.
            <button type="button" className="btn-ghost" onClick={openRazorpayModal}>
              Connect Razorpay
            </button>
            */}
            <button type="button" className="btn-ghost" onClick={openUpiModal}>
              Share QR
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
        <button type="button" className="summary-card summary-card-clickable" onClick={() => setShowNetEarningsModal(true)}>
          <span className="summary-label">Net earnings</span>
          <span className="summary-value success">{formatMoney(summary.netEarnings)}</span>
        </button>
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
        <button type="button" className={tab === 'balance' ? 'tab active' : 'tab'} onClick={() => setTab('balance')}>
          Balance Sheet
        </button>
      </div>

      {renderContent()}

      {pendingSave && renderConflictModal(pendingSave)}
      {actionTarget && renderActionModal(actionTarget)}
      {showLinkModal && renderLinkModal()}
      {showEmailModal && renderEmailModal()}
      {showUpiModal && renderUpiModal()}
      {showNetEarningsModal && renderNetEarningsModal()}
    </div>
  );
}
