import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from?: string | null;
}

export interface BookingConfirmationDetails {
  clientName: string;
  clientEmail: string;
  venue: string;
  eventDate: string;
  startTime: string;
  totalAmount: number;
  advanceAmount: number;
}

export async function sendBookingConfirmationEmail(
  smtp: SmtpConfig,
  details: BookingConfirmationDetails,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const balance = details.totalAmount - details.advanceAmount;

  await transporter.sendMail({
    from: smtp.from || smtp.user,
    to: details.clientEmail,
    subject: `Booking confirmed — ${details.venue} on ${details.eventDate}`,
    text: [
      `Hi ${details.clientName},`,
      '',
      `Your booking at ${details.venue} on ${details.eventDate} (${details.startTime}) is confirmed.`,
      `Total amount: Rs.${details.totalAmount}`,
      `Advance received: Rs.${details.advanceAmount}`,
      `Balance due: Rs.${balance}`,
      '',
      'Thank you for choosing us!',
    ].join('\n'),
  });
}
