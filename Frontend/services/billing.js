export const getInvoiceOutstanding = (invoiceAmount, payments = []) => {
  const received = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const total = Number(invoiceAmount);
  return Math.max((Number.isFinite(total) && total > 0 ? total : 0) - received, 0);
};

export const getPaymentValidationError = (invoice, paymentAmount, payments = []) => {
  if (!invoice || invoice.kind !== 'Invoice') {
    return 'Select a valid invoice to record payment against.';
  }
  const amount = Number(paymentAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Payment amount must be greater than zero.';
  }
  if (amount > getInvoiceOutstanding(invoice.amount, payments)) {
    return 'Payment exceeds the outstanding balance.';
  }
  return '';
};
