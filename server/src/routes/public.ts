import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { isRateLimited } from '../lib/rateLimit';
// Razorpay is disabled for now — UPI QR is the only payment method in use.
// import { decryptSecret } from '../lib/crypto';
// import { createRazorpayClient } from '../lib/razorpay';

export const publicRouter = Router();

function amountDue(booking: { totalAmount: number; advanceAmount: number }): number {
  return Math.max(Math.round((booking.totalAmount - booking.advanceAmount) * 100) / 100, 0);
}

// const MAX_ADVANCE_PAYMENT = 500_000; // INR — sanity cap on a customer-entered amount, used by the (disabled) Razorpay routes below

// async function createRazorpayOrder(userId: string, amount: number, receiptPrefix: string) {
//   const setting = await prisma.razorpaySetting.findUnique({ where: { userId } });
//   if (!setting?.enabled || !setting.keyId || !setting.keySecretEnc) return null;
//
//   const razorpay = createRazorpayClient(setting.keyId, decryptSecret(setting.keySecretEnc));
//   const amountPaise = Math.round(amount * 100);
//   const order = await razorpay.orders.create({
//     amount: amountPaise,
//     currency: 'INR',
//     receipt: `${receiptPrefix}_${Date.now()}`,
//     notes: { userId },
//   });
//   return { orderId: order.id, amountPaise, keyId: setting.keyId };
// }

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

publicRouter.get('/:slug', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
  if (!user) return res.status(404).json({ error: 'This booking link is not valid' });
  // Razorpay is disabled for now — UPI QR is the only payment method in use.
  // const razorpaySetting = await prisma.razorpaySetting.findUnique({ where: { userId: user.id } });
  res.json({
    creatorName: user.name,
    razorpayEnabled: false,
    upiVpa: user.upiVpa,
  });
});

interface RequestBody {
  clientName?: string;
  clientContact?: string;
  clientEmail?: string;
  venue?: string;
  eventDate?: string;
  startTime?: string;
  notes?: string;
  // Honeypot field — real users never fill this in; bots that fill every
  // input do, so treat it as a signal without telling them why it failed.
  website?: string;
}

publicRouter.post('/:slug/requests', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (isRateLimited(`${ip}:${req.params.slug}`, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
  if (!user) return res.status(404).json({ error: 'This booking link is not valid' });

  const body = req.body as RequestBody;
  if (body.website) {
    // Silently accept for bots, but don't actually create anything.
    return res.status(201).json({ ok: true });
  }

  if (
    !body.clientName?.trim() ||
    !body.clientContact?.trim() ||
    !body.clientEmail?.trim() ||
    !body.venue?.trim() ||
    !body.eventDate ||
    !body.startTime
  ) {
    return res.status(400).json({ error: 'All fields are required except notes' });
  }
  if (!EMAIL_RE.test(body.clientEmail.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (Number.isNaN(Date.parse(body.eventDate))) {
    return res.status(400).json({ error: 'eventDate must be a valid date' });
  }
  if (!TIME_RE.test(body.startTime)) {
    return res.status(400).json({ error: 'startTime must be in HH:MM format' });
  }

  const created = await prisma.bookingRequest.create({
    data: {
      userId: user.id,
      clientName: body.clientName.trim(),
      clientContact: body.clientContact.trim(),
      clientEmail: body.clientEmail.trim(),
      venue: body.venue.trim(),
      eventDate: body.eventDate,
      startTime: body.startTime,
      notes: body.notes?.trim() || null,
    },
  });

  res.status(201).json({ ok: true, requestId: created.id });
});

publicRouter.get('/:slug/bookings/:bookingId', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
  if (!user) return res.status(404).json({ error: 'This booking link is not valid' });

  const booking = await prisma.booking.findFirst({ where: { id: req.params.bookingId, userId: user.id } });
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Razorpay is disabled for now — UPI QR is the only payment method in use.
  // const razorpaySetting = await prisma.razorpaySetting.findUnique({ where: { userId: user.id } });

  res.json({
    creatorName: user.name,
    clientName: booking.clientName,
    venue: booking.venue,
    eventDate: booking.eventDate.toISOString().slice(0, 10),
    startTime: booking.startTime,
    totalAmount: booking.totalAmount,
    advanceAmount: booking.advanceAmount,
    amountDue: amountDue(booking),
    paymentStatus: booking.paymentStatus,
    razorpayEnabled: false,
    upiVpa: user.upiVpa,
  });
});

// Razorpay checkout is disabled for now — UPI QR is the only payment method
// in use, and it needs no server-side order to be created. Left in place
// (commented) in case Razorpay is turned back on later.
//
// publicRouter.post('/:slug/bookings/:bookingId/pay', async (req, res) => {
//   const ip = req.ip ?? 'unknown';
//   if (isRateLimited(`pay:${ip}:${req.params.bookingId}`, 10, 10 * 60 * 1000)) {
//     return res.status(429).json({ error: 'Too many requests. Please try again later.' });
//   }
//
//   const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
//   if (!user) return res.status(404).json({ error: 'This booking link is not valid' });
//
//   const booking = await prisma.booking.findFirst({ where: { id: req.params.bookingId, userId: user.id } });
//   if (!booking) return res.status(404).json({ error: 'Booking not found' });
//
//   const due = amountDue(booking);
//   if (due <= 0) return res.status(400).json({ error: 'This booking has no balance due' });
//
//   const created = await createRazorpayOrder(user.id, due, `booking_${booking.id}`);
//   if (!created) return res.status(400).json({ error: 'This creator has not enabled online payments yet' });
//
//   await prisma.payment.create({
//     data: {
//       userId: user.id,
//       bookingId: booking.id,
//       razorpayOrderId: created.orderId,
//       amount: due,
//       currency: 'INR',
//       status: 'created',
//     },
//   });
//
//   res.status(201).json({ orderId: created.orderId, amount: created.amountPaise, currency: 'INR', keyId: created.keyId });
// });
//
// interface GenericPayBody {
//   amount?: number;
// }
//
// // A booking-independent payment: the artist shares this link/QR on its own
// // (business card, Instagram bio, etc.) and the customer types in whatever
// // amount they're paying — there's no Booking to read the amount from.
// publicRouter.post('/:slug/pay', async (req, res) => {
//   const ip = req.ip ?? 'unknown';
//   if (isRateLimited(`pay:${ip}:${req.params.slug}`, 10, 10 * 60 * 1000)) {
//     return res.status(429).json({ error: 'Too many requests. Please try again later.' });
//   }
//
//   const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
//   if (!user) return res.status(404).json({ error: 'This payment link is not valid' });
//
//   const body = req.body as GenericPayBody;
//   const amount = body.amount;
//   if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_ADVANCE_PAYMENT) {
//     return res.status(400).json({ error: `Enter an amount between 1 and ${MAX_ADVANCE_PAYMENT}` });
//   }
//
//   const created = await createRazorpayOrder(user.id, amount, `direct_${user.id}`);
//   if (!created) return res.status(400).json({ error: 'This creator has not enabled online payments yet' });
//
//   await prisma.payment.create({
//     data: {
//       userId: user.id,
//       razorpayOrderId: created.orderId,
//       amount,
//       currency: 'INR',
//       status: 'created',
//     },
//   });
//
//   res.status(201).json({ orderId: created.orderId, amount: created.amountPaise, currency: 'INR', keyId: created.keyId });
// });
//
// interface RequestAdvancePayBody {
//   amount?: number;
// }
//
// // Lets a customer pay an advance while their BookingRequest is still pending
// // artist review — there's no priced Booking yet, so they choose the amount
// // themselves. On payment.captured, the webhook adds it to
// // BookingRequest.advanceAmount so it's pre-filled when the artist reviews it.
// publicRouter.post('/:slug/requests/:requestId/pay', async (req, res) => {
//   const ip = req.ip ?? 'unknown';
//   if (isRateLimited(`pay:${ip}:${req.params.requestId}`, 10, 10 * 60 * 1000)) {
//     return res.status(429).json({ error: 'Too many requests. Please try again later.' });
//   }
//
//   const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
//   if (!user) return res.status(404).json({ error: 'This booking link is not valid' });
//
//   const request = await prisma.bookingRequest.findFirst({ where: { id: req.params.requestId, userId: user.id } });
//   if (!request) return res.status(404).json({ error: 'Booking request not found' });
//   if (request.status !== 'pending') {
//     return res.status(409).json({ error: 'This request has already been handled' });
//   }
//
//   const body = req.body as RequestAdvancePayBody;
//   const amount = body.amount;
//   if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_ADVANCE_PAYMENT) {
//     return res.status(400).json({ error: `Enter an amount between 1 and ${MAX_ADVANCE_PAYMENT}` });
//   }
//
//   const created = await createRazorpayOrder(user.id, amount, `request_${request.id}`);
//   if (!created) return res.status(400).json({ error: 'This creator has not enabled online payments yet' });
//
//   await prisma.payment.create({
//     data: {
//       userId: user.id,
//       bookingRequestId: request.id,
//       razorpayOrderId: created.orderId,
//       amount,
//       currency: 'INR',
//       status: 'created',
//     },
//   });
//
//   res.status(201).json({ orderId: created.orderId, amount: created.amountPaise, currency: 'INR', keyId: created.keyId });
// });
