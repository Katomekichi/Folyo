// Razorpay is disabled for now — UPI QR is the only payment method in use.
// Left in place (commented) in case it's turned back on later.
//
// export interface RazorpayOrderResponse {
//   orderId: string;
//   amount: number;
//   currency: string;
//   keyId: string;
// }
//
// declare global {
//   interface Window {
//     Razorpay: new (options: Record<string, unknown>) => { open: () => void };
//   }
// }
//
// export function loadRazorpayScript(): Promise<void> {
//   if (window.Razorpay) return Promise.resolve();
//   return new Promise((resolve, reject) => {
//     const script = document.createElement('script');
//     script.src = 'https://checkout.razorpay.com/v1/checkout.js';
//     script.onload = () => resolve();
//     script.onerror = () => reject(new Error('Could not load the payment widget. Check your connection.'));
//     document.body.appendChild(script);
//   });
// }

export function buildUpiLink(vpa: string, payeeName: string, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: vpa, pn: payeeName, cu: 'INR', tn: note });
  if (amount > 0) params.set('am', amount.toFixed(2));
  return `upi://pay?${params.toString()}`;
}
