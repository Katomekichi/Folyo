import { Router } from 'express';
import type { PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { sendBookingConfirmationEmail } from '../lib/email';
import { decryptSecret } from '../lib/crypto';

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

function computeStatus(totalAmount: number, advanceAmount: number): PaymentStatus {
  if (advanceAmount <= 0) return 'pending';
  if (advanceAmount >= totalAmount) return 'paid';
  return 'partial';
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

requestsRouter.get('/', async (req: AuthedRequest, res) => {
  const requests = await prisma.bookingRequest.findMany({
    where: { userId: req.userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ requests });
});

interface TeamMemberInput {
  name?: string;
  amount?: number;
}

interface ConfirmBody {
  clientName?: string;
  venue?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  totalAmount?: number;
  advanceAmount?: number;
  travelExpense?: number;
  notes?: string;
  teamMembers?: TeamMemberInput[];
}

requestsRouter.post('/:id/confirm', async (req: AuthedRequest, res) => {
  const request = await prisma.bookingRequest.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'Request was already handled' });

  const body = req.body as ConfirmBody;
  const clientName = body.clientName ?? request.clientName;
  const venue = body.venue ?? request.venue ?? undefined;
  const eventDate = body.eventDate ?? request.eventDate ?? undefined;
  const startTime = body.startTime ?? request.startTime ?? undefined;
  const endTime = body.endTime ?? request.endTime ?? undefined;
  const totalAmount = body.totalAmount ?? request.totalAmount ?? undefined;
  const advanceAmount = body.advanceAmount ?? request.advanceAmount ?? 0;
  const travelExpense = body.travelExpense ?? 0;
  const notes = body.notes ?? request.notes ?? undefined;

  if (!clientName || !venue || !eventDate || !startTime || !endTime || totalAmount === undefined) {
    return res.status(400).json({ error: 'clientName, venue, eventDate, startTime, endTime, and totalAmount are required' });
  }
  if (Number.isNaN(Date.parse(eventDate))) return res.status(400).json({ error: 'eventDate must be a valid date' });
  if (!TIME_RE.test(startTime)) return res.status(400).json({ error: 'startTime must be in HH:MM format' });
  if (!TIME_RE.test(endTime)) return res.status(400).json({ error: 'endTime must be in HH:MM format' });
  if (typeof totalAmount !== 'number' || totalAmount < 0) return res.status(400).json({ error: 'totalAmount must be a positive number' });
  if (typeof advanceAmount !== 'number' || advanceAmount < 0) return res.status(400).json({ error: 'advanceAmount must be a positive number' });
  if (typeof travelExpense !== 'number' || travelExpense < 0) return res.status(400).json({ error: 'travelExpense must be a positive number' });
  const teamMembers = body.teamMembers ?? [];
  if (!Array.isArray(teamMembers)) return res.status(400).json({ error: 'teamMembers must be an array' });
  for (const member of teamMembers) {
    if (!member.name?.trim()) return res.status(400).json({ error: 'Each team member needs a name' });
    if (typeof member.amount !== 'number' || member.amount < 0) {
      return res.status(400).json({ error: 'Each team member amount must be a positive number' });
    }
  }

  const booking = await prisma.booking.create({
    data: {
      userId: req.userId!,
      clientName: clientName.trim(),
      venue: venue.trim(),
      eventDate: new Date(eventDate),
      startTime,
      endTime,
      totalAmount,
      advanceAmount,
      travelExpense,
      paymentStatus: computeStatus(totalAmount, advanceAmount),
      notes: notes?.trim() || null,
      teamMembers: {
        create: teamMembers.map((m) => ({ name: m.name!.trim(), amount: m.amount! })),
      },
    },
    include: { teamMembers: true },
  });

  await prisma.bookingRequest.update({
    where: { id: request.id },
    data: { status: 'confirmed', resultBookingId: booking.id },
  });

  if (request.clientEmail) {
    try {
      const artist = await prisma.user.findUnique({ where: { id: req.userId } });
      if (artist?.smtpHost && artist.smtpPort && artist.smtpUser && artist.smtpPassEnc) {
        const payUrl =
          artist.upiVpa && artist.publicSlug
            ? `${process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'}/pay/${artist.publicSlug}/${booking.id}`
            : null;

        await sendBookingConfirmationEmail(
          {
            host: artist.smtpHost,
            port: artist.smtpPort,
            user: artist.smtpUser,
            pass: decryptSecret(artist.smtpPassEnc),
            from: artist.smtpFrom,
          },
          {
            clientName: booking.clientName,
            clientEmail: request.clientEmail,
            venue: booking.venue,
            eventDate: booking.eventDate.toISOString().slice(0, 10),
            startTime: booking.startTime,
            totalAmount: booking.totalAmount,
            advanceAmount: booking.advanceAmount,
            travelExpense: '',
            payUrl,
          },
        );
      } else {
        console.warn('Artist has no email settings configured — skipping confirmation email');
      }
    } catch (err) {
      // Booking is already confirmed — an email delivery failure shouldn't roll that back.
      console.error('Failed to send booking confirmation email', err);
    }
  }

  res.status(201).json({ booking });
});

requestsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const request = await prisma.bookingRequest.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!request) return res.status(404).json({ error: 'Request not found' });

  await prisma.bookingRequest.update({ where: { id: request.id }, data: { status: 'rejected' } });
  res.status(204).end();
});
