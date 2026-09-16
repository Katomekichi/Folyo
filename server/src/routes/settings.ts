import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { generateSlug } from '../lib/slug';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/booking-link', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ slug: user.publicSlug });
});

settingsRouter.post('/booking-link/generate', async (req: AuthedRequest, res) => {
  let slug = generateSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.user.findUnique({ where: { publicSlug: slug } });
    if (!existing) break;
    slug = generateSlug();
  }

  const user = await prisma.user.update({ where: { id: req.userId }, data: { publicSlug: slug } });
  res.json({ slug: user.publicSlug });
});

settingsRouter.delete('/booking-link', async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { publicSlug: null } });
  res.status(204).end();
});
