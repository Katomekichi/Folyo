import { useMemo, useState } from 'react';
import type { Booking } from '../types';

interface BookingCalendarProps {
  bookings: Booking[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bookingDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

export function BookingCalendar({ bookings }: BookingCalendarProps) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(toDateKey(today));

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const key = bookingDateKey(b.eventDate);
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return map;
  }, [bookings]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toDateKey(today);
  const selectedBookings = (bookingsByDate.get(selected) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button type="button" className="btn-ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ‹ Prev
        </button>
        <h2>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="btn-ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          Next ›
        </button>
      </div>

      <div className="calendar-grid calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="calendar-cell calendar-cell-empty" />;
          const key = toDateKey(date);
          const dayBookings = bookingsByDate.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selected;
          return (
            <button
              type="button"
              key={i}
              className={`calendar-cell${isToday ? ' calendar-cell-today' : ''}${
                isSelected ? ' calendar-cell-selected' : ''
              }`}
              onClick={() => setSelected(key)}
            >
              <span className="calendar-day-num">{date.getDate()}</span>
              {dayBookings.length > 0 && <span className="calendar-dot">{dayBookings.length}</span>}
            </button>
          );
        })}
      </div>

      <div className="calendar-detail">
        <h3>
          {(() => {
            const [y, m, d] = selected.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });
          })()}
        </h3>
        {selectedBookings.length === 0 ? (
          <p className="empty-state">No bookings on this date.</p>
        ) : (
          <ul className="calendar-booking-list">
            {selectedBookings.map((b) => (
              <li key={b.id} className="calendar-booking-item">
                <span className="calendar-booking-time">
                  {b.startTime}–{b.endTime}
                </span>
                <span className="calendar-booking-client">{b.clientName}</span>
                <span className="calendar-booking-venue">{b.venue}</span>
                <span className={`status-badge status-${b.paymentStatus}`}>{formatMoney(b.totalAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
