// Razorpay is disabled for now — UPI QR is the only payment method in use.
// Left in place (commented) in case it's turned back on later.
//
// import { Router } from 'express';
// import crypto from 'crypto';
// import { prisma } from '../lib/prisma';
// import { decryptSecret } from '../lib/crypto';
//
// export const webhooksRouter = Router();
//
// function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
//   const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
//   const expectedBuf = Buffer.from(expected, 'utf8');
//   const signatureBuf = Buffer.from(signature, 'utf8');
//   return expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);
// }
//
// // Registered per-artist in their own Razorpay dashboard as
// // https://<api-host>/api/webhooks/razorpay/:userId — the path segment only
// // identifies whose webhook secret to check against; the signature is what
// // actually authenticates the request.
// webhooksRouter.post('/razorpay/:userId', async (req, res) => {
//   const signature = req.headers['x-razorpay-signature'];
//   if (typeof signature !== 'string') return res.status(400).json({ error: 'Missing signature' });
//   if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Malformed payload' });
//
//   const setting = await prisma.razorpaySetting.findUnique({ where: { userId: req.params.userId } });
//   if (!setting?.webhookSecretEnc) return res.status(404).json({ error: 'Webhook not configured' });
//
//   const webhookSecret = decryptSecret(setting.webhookSecretEnc);
//   if (!verifySignature(req.body, signature, webhookSecret)) {
//     return res.status(400).json({ error: 'Invalid signature' });
//   }
//
//   const event = JSON.parse(req.body.toString('utf8'));
//
//   if (event.event === 'payment.captured') {
//     const payment = event.payload?.payment?.entity;
//     const orderId: string | undefined = payment?.order_id;
//     const razorpayPaymentId: string | undefined = payment?.id;
//     if (orderId) await markPaid(orderId, razorpayPaymentId);
//   } else if (event.event === 'payment.failed') {
//     const orderId: string | undefined = event.payload?.payment?.entity?.order_id;
//     if (orderId) {
//       await prisma.payment.updateMany({
//         where: { razorpayOrderId: orderId, status: 'created' },
//         data: { status: 'failed' },
//       });
//     }
//   }
//
//   res.json({ ok: true });
// });
//
// async function markPaid(orderId: string, razorpayPaymentId?: string): Promise<void> {
//   const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } });
//   if (!payment || payment.status === 'paid') return; // already applied — webhook delivery isn't exactly-once
//
//   await prisma.payment.update({
//     where: { razorpayOrderId: orderId },
//     data: { status: 'paid', razorpayPaymentId: razorpayPaymentId ?? null },
//   });
//
//   if (payment.bookingId) {
//     const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
//     if (!booking) return;
//
//     const advanceAmount = Math.min(booking.advanceAmount + payment.amount, booking.totalAmount);
//     await prisma.booking.update({
//       where: { id: booking.id },
//       data: {
//         advanceAmount,
//         paymentStatus: advanceAmount >= booking.totalAmount ? 'paid' : advanceAmount > 0 ? 'partial' : 'pending',
//       },
//     });
//     return;
//   }
//
//   if (payment.bookingRequestId) {
//     const request = await prisma.bookingRequest.findUnique({ where: { id: payment.bookingRequestId } });
//     // Once the request is confirmed/rejected it no longer owns an advanceAmount
//     // the artist will see — a Booking already exists with its own Payment trail.
//     if (!request || request.status !== 'pending') return;
//
//     await prisma.bookingRequest.update({
//       where: { id: request.id },
//       data: { advanceAmount: (request.advanceAmount ?? 0) + payment.amount },
//     });
//   }
// }
