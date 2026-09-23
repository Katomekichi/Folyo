import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { generateSlug } from '../lib/slug';
import { encryptSecret } from '../lib/crypto';

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

interface EmailSettingsBody {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

settingsRouter.get('/email', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    configured: Boolean(user.smtpHost && user.smtpUser && user.smtpPassEnc),
    host: user.smtpHost,
    port: user.smtpPort,
    user: user.smtpUser,
    from: user.smtpFrom,
  });
});

settingsRouter.post('/email', async (req: AuthedRequest, res) => {
  const body = req.body as EmailSettingsBody;
  if (!body.host?.trim() || !body.port || !body.user?.trim()) {
    return res.status(400).json({ error: 'host, port, and user are required' });
  }
  if (typeof body.port !== 'number' || body.port <= 0) {
    return res.status(400).json({ error: 'port must be a positive number' });
  }

  const existing = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!body.pass?.trim() && !existing?.smtpPassEnc) {
    return res.status(400).json({ error: 'pass is required' });
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      smtpHost: body.host.trim(),
      smtpPort: body.port,
      smtpUser: body.user.trim(),
      ...(body.pass?.trim() && { smtpPassEnc: encryptSecret(body.pass.trim()) }),
      smtpFrom: body.from?.trim() || null,
    },
  });
  res.json({
    configured: true,
    host: user.smtpHost,
    port: user.smtpPort,
    user: user.smtpUser,
    from: user.smtpFrom,
  });
});

settingsRouter.delete('/email', async (req: AuthedRequest, res) => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { smtpHost: null, smtpPort: null, smtpUser: null, smtpPassEnc: null, smtpFrom: null },
  });
  res.status(204).end();
});

// Razorpay is disabled for now — UPI QR is the only payment method in use.
// Left in place (commented) in case it's turned back on later.
//
// interface RazorpaySettingsBody {
//   keyId?: string;
//   keySecret?: string;
//   webhookSecret?: string;
// }
//
// settingsRouter.get('/razorpay', async (req: AuthedRequest, res) => {
//   const setting = await prisma.razorpaySetting.findUnique({ where: { userId: req.userId } });
//   res.json({
//     configured: Boolean(setting?.keyId && setting?.keySecretEnc),
//     keyId: setting?.keyId ?? null,
//     webhookConfigured: Boolean(setting?.webhookSecretEnc),
//     enabled: setting?.enabled ?? false,
//   });
// });
//
// settingsRouter.post('/razorpay', async (req: AuthedRequest, res) => {
//   const body = req.body as RazorpaySettingsBody;
//   if (!body.keyId?.trim()) {
//     return res.status(400).json({ error: 'keyId is required' });
//   }
//
//   const existing = await prisma.razorpaySetting.findUnique({ where: { userId: req.userId } });
//   if (!body.keySecret?.trim() && !existing?.keySecretEnc) {
//     return res.status(400).json({ error: 'keySecret is required' });
//   }
//
//   const setting = await prisma.razorpaySetting.upsert({
//     where: { userId: req.userId },
//     create: {
//       userId: req.userId!,
//       keyId: body.keyId.trim(),
//       keySecretEnc: encryptSecret(body.keySecret!.trim()),
//       webhookSecretEnc: body.webhookSecret?.trim() ? encryptSecret(body.webhookSecret.trim()) : null,
//       enabled: true,
//     },
//     update: {
//       keyId: body.keyId.trim(),
//       ...(body.keySecret?.trim() && { keySecretEnc: encryptSecret(body.keySecret.trim()) }),
//       ...(body.webhookSecret?.trim() && { webhookSecretEnc: encryptSecret(body.webhookSecret.trim()) }),
//       enabled: true,
//     },
//   });
//
//   res.json({
//     configured: true,
//     keyId: setting.keyId,
//     webhookConfigured: Boolean(setting.webhookSecretEnc),
//     enabled: setting.enabled,
//   });
// });
//
// settingsRouter.delete('/razorpay', async (req: AuthedRequest, res) => {
//   await prisma.razorpaySetting.deleteMany({ where: { userId: req.userId } });
//   res.status(204).end();
// });

const UPI_VPA_RE = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;

interface UpiSettingsBody {
  vpa?: string;
}

settingsRouter.get('/upi', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ configured: Boolean(user.upiVpa), vpa: user.upiVpa });
});

settingsRouter.post('/upi', async (req: AuthedRequest, res) => {
  const body = req.body as UpiSettingsBody;
  const vpa = body.vpa?.trim();
  if (!vpa || !UPI_VPA_RE.test(vpa)) {
    return res.status(400).json({ error: 'Enter a valid UPI ID, e.g. name@bank' });
  }

  const user = await prisma.user.update({ where: { id: req.userId }, data: { upiVpa: vpa } });
  res.json({ configured: true, vpa: user.upiVpa });
});

settingsRouter.delete('/upi', async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { upiVpa: null } });
  res.status(204).end();
});
