import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import type { PaymentStatus } from '@prisma/client';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

function computeStatus(totalAmount: number, advanceAmount: number): PaymentStatus {
  if (advanceAmount <= 0) return 'pending';
  if (advanceAmount >= totalAmount) return 'paid';
  return 'partial';
}

interface TeamMemberInput {
  name?: string;
  amount?: number;
}

interface BookingInput {
  clientName?: string;
  venue?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  totalAmount?: number;
  advanceAmount?: number;
  travelExpense?: number;
  notes?: string;
  completed?: boolean;
  teamMembers?: TeamMemberInput[];
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validate(body: BookingInput, requireAll: boolean) {
  const { clientName, venue, eventDate, startTime, endTime, totalAmount, advanceAmount, travelExpense, teamMembers } = body;

  if (requireAll && (!clientName || !venue || !eventDate || !startTime || !endTime || totalAmount === undefined)) {
    return 'clientName, venue, eventDate, startTime, endTime, and totalAmount are required';
  }
  if (totalAmount !== undefined && (typeof totalAmount !== 'number' || totalAmount < 0)) {
    return 'totalAmount must be a positive number';
  }
  if (advanceAmount !== undefined && (typeof advanceAmount !== 'number' || advanceAmount < 0)) {
    return 'advanceAmount must be a positive number';
  }
  if (travelExpense !== undefined && (typeof travelExpense !== 'number' || travelExpense < 0)) {
    return 'travelExpense must be a positive number';
  }
  if (eventDate !== undefined && Number.isNaN(Date.parse(eventDate))) {
    return 'eventDate must be a valid date';
  }
  if (startTime !== undefined && !TIME_RE.test(startTime)) {
    return 'startTime must be in HH:MM format';
  }
  if (endTime !== undefined && !TIME_RE.test(endTime)) {
    return 'endTime must be in HH:MM format';
  }
  if (body.completed !== undefined && typeof body.completed !== 'boolean') {
    return 'completed must be a boolean';
  }
  if (teamMembers !== undefined) {
    if (!Array.isArray(teamMembers)) return 'teamMembers must be an array';
    for (const member of teamMembers) {
      if (!member.name?.trim()) return 'Each team member needs a name';
      if (typeof member.amount !== 'number' || member.amount < 0) return 'Each team member amount must be a positive number';
    }
  }
  return null;
}

bookingsRouter.get('/', async (req: AuthedRequest, res) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: req.userId },
    orderBy: { eventDate: 'asc' },
    include: { teamMembers: true },
  });
  res.json({ bookings });
});

bookingsRouter.post('/', async (req: AuthedRequest, res) => {
  const body = req.body as BookingInput;
  const error = validate(body, true);
  if (error) return res.status(400).json({ error });

  const totalAmount = body.totalAmount!;
  const advanceAmount = body.advanceAmount ?? 0;
  const travelExpense = body.travelExpense ?? 0;

  const booking = await prisma.booking.create({
    data: {
      userId: req.userId!,
      clientName: body.clientName!.trim(),
      venue: body.venue!.trim(),
      eventDate: new Date(body.eventDate!),
      startTime: body.startTime!,
      endTime: body.endTime!,
      totalAmount,
      advanceAmount,
      travelExpense,
      paymentStatus: computeStatus(totalAmount, advanceAmount),
      notes: body.notes?.trim() || null,
      teamMembers: {
        create: (body.teamMembers ?? []).map((m) => ({ name: m.name!.trim(), amount: m.amount! })),
      },
    },
    include: { teamMembers: true },
  });
  res.status(201).json({ booking });
});

bookingsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const body = req.body as BookingInput;
  const error = validate(body, false);
  if (error) return res.status(400).json({ error });

  const totalAmount = body.totalAmount ?? existing.totalAmount;
  const advanceAmount = body.advanceAmount ?? existing.advanceAmount;
  const travelExpense = body.travelExpense ?? existing.travelExpense;

  const booking = await prisma.booking.update({
    where: { id: existing.id },
    data: {
      clientName: body.clientName?.trim() ?? existing.clientName,
      venue: body.venue?.trim() ?? existing.venue,
      eventDate: body.eventDate ? new Date(body.eventDate) : existing.eventDate,
      startTime: body.startTime ?? existing.startTime,
      endTime: body.endTime ?? existing.endTime,
      totalAmount,
      advanceAmount,
      travelExpense,
      paymentStatus: computeStatus(totalAmount, advanceAmount),
      notes: body.notes !== undefined ? body.notes.trim() || null : existing.notes,
      completed: body.completed ?? existing.completed,
      ...(body.teamMembers !== undefined && {
        teamMembers: {
          deleteMany: {},
          create: body.teamMembers.map((m) => ({ name: m.name!.trim(), amount: m.amount! })),
        },
      }),
    },
    include: { teamMembers: true },
  });
  res.json({ booking });
});

bookingsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.booking.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  await prisma.booking.delete({ where: { id: existing.id } });
  res.status(204).end();
});
