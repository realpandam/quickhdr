import axios from 'axios';

const GOPAY_API_URL = process.env.GOPAY_API_URL || 'https://gw.gopay.cz/api';
const CLIENT_ID = process.env.GOPAY_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOPAY_CLIENT_SECRET!;
const GOID = process.env.GOPAY_GOID!;

interface CreatePaymentParams {
  orderId: string;
  amount: number;
  currency?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  description?: string;
  returnUrl: string;
  notifyUrl: string;
}

interface GoPayPayment {
  id: number;
  gw_url: string;
  state: 'CREATED' | 'PAID' | 'CANCELED' | 'TIMEOUTED' | 'REFUNDED';
  amount: number;
  currency: string;
  order_number: string;
  payer?: {
    contact?: {
      email?: string;
    };
  };
}

// Token cache — GoPay token platí 30 minut, cachujeme na 25
let cachedToken: { token: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }

  const response = await axios.post(
    `${GOPAY_API_URL}/oauth2/token`,
    'grant_type=client_credentials&scope=payment-create',
    {
      auth: {
        username: CLIENT_ID,
        password: CLIENT_SECRET,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
    }
  );

  cachedToken = {
    token: response.data.access_token,
    expires: Date.now() + 25 * 60 * 1000, // 25 minut
  };

  return cachedToken.token;
}

export async function createPayment(params: CreatePaymentParams): Promise<GoPayPayment> {
  const token = await getAccessToken();

  const response = await axios.post(
    `${GOPAY_API_URL}/payments/payment`,
    {
      payer: {
        allowed_payment_instruments: ['PAYMENT_CARD'],
        contact: {
          email: params.email || '',
          first_name: params.firstName || '',
          last_name: params.lastName || '',
        },
      },
      target: {
        type: 'ACCOUNT',
        goid: GOID,
      },
      amount: Math.round(params.amount * 100), // haléře
      currency: params.currency || 'CZK',
      order_number: params.orderId,
      order_description: params.description || 'FASTHDR platba',
      callback: {
        return_url: params.returnUrl,
        notification_url: params.notifyUrl,
      },
      lang: 'CS',
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }
  );

  return response.data;
}

export async function getPaymentStatus(paymentId: string): Promise<GoPayPayment> {
  const token = await getAccessToken();

  const response = await axios.get(
    `${GOPAY_API_URL}/payments/payment/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept': 'application/json',
      },
    }
  );

  return response.data;
}