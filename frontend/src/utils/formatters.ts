// Utility functions for formatting data
// Replaces the need for mockData.ts imports

export const formatPrice = (price: number): string => {
  return 'R ' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

export const getTimeRemaining = (endDate: string | Date): string => {
  const end = new Date(endDate).getTime();
  const now = new Date().getTime();
  const diff = end - now;

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (date: string | Date): string => {
  return new Date(date).toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getPaymentTimeRemaining = (deadline: string | Date): {
  text: string;
  urgency: 'safe' | 'warning' | 'danger' | 'expired';
  hoursLeft: number;
} => {
  const end = new Date(deadline).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) {
    return { text: 'Expired', urgency: 'expired', hoursLeft: 0 };
  }

  const hoursLeft = diff / (1000 * 60 * 60);
  const days = Math.floor(hoursLeft / 24);
  const hours = Math.floor(hoursLeft % 24);
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let text: string;
  if (days > 0) {
    text = `${days}d ${hours}h remaining`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m remaining`;
  } else {
    text = `${minutes}m remaining`;
  }

  let urgency: 'safe' | 'warning' | 'danger' | 'expired';
  if (hoursLeft > 72) {
    urgency = 'safe';
  } else if (hoursLeft > 24) {
    urgency = 'warning';
  } else {
    urgency = 'danger';
  }

  return { text, urgency, hoursLeft };
};