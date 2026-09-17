import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { isRateLimited } from '../lib/rateLimit';

export const publicRouter = Router();

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

publicRouter.get('/:slug', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
  if (!user) return res.status(404).json({ error: 'This booking link is not valid' });
  res.json({ creatorName: user.name });
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

  await prisma.bookingRequest.create({
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

  res.status(201).json({ ok: true });
});
