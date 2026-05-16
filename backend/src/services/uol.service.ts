import axios, { AxiosInstance, AxiosError } from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UolContactInput {
  name: string;
  email: string;
  /** IČO — jen B2B, 8 číslic */
  company_number?: string;
  /** DIČ — jen B2B plátci DPH */
  vatin?: string;
  street?: string;
  city?: string;
  postal_code?: string;
  country_id?: string;
  external_id: string;
}

export interface UolInvoiceInput {
  buyer_id: string;
  order_id: string;
  gopay_payment_id: string;
  amount_czk: number;
  customer_email: string;
  issue_date: string; // "YYYY-MM-DD"
}

export interface UolInvoiceResult {
  invoice_id: string;
  gid: number;
  public_id: string;
  status: string;
}

// ─── Retry ────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  label = 'UOL'
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as AxiosError).response?.status ?? 0;
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt === maxAttempts) break;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      console.warn(`[UOL] ${label} pokus ${attempt} selhal (HTTP ${status}), retry za ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class UolService {
  private readonly http: AxiosInstance;
  private readonly productId: string;
  private readonly isVatPayer: boolean;
  private readonly vatRate: number;
  private readonly externalIdPrefix: string;

  constructor() {
    const apiUrl = process.env.UOL_API_URL;
    const email  = process.env.UOL_API_EMAIL;
    const token  = process.env.UOL_API_TOKEN;

    if (!apiUrl || !email || !token) {
      throw new Error('[UOL] Chybí ENV: UOL_API_URL / UOL_API_EMAIL / UOL_API_TOKEN');
    }

    this.http = axios.create({
      baseURL: apiUrl,
      auth: { username: email, password: token },
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 15_000,
    });

    this.productId        = process.env.UOL_DEFAULT_PRODUCT_ID ?? 'uprava_fotek';
    this.isVatPayer       = process.env.UOL_IS_VAT_PAYER === 'true';
    this.vatRate          = Number(process.env.UOL_VAT_RATE ?? '0');
    this.externalIdPrefix = process.env.UOL_EXTERNAL_ID_PREFIX ?? 'fh_';
  }

  // ── Ping ──────────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      const res = await this.http.get('/v1/ping');
      return res.data?.ping === 'pong';
    } catch {
      return false;
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async findContactByIco(ico: string): Promise<string | null> {
    try {
      const res = await withRetry(
        () => this.http.get('/v1/contacts', { params: { company_number: ico, per_page: 1 } }),
        3, `findContactByIco(${ico})`
      );
      const items: Array<{ contact_id: string }> = res.data?.items ?? [];
      return items[0]?.contact_id ?? null;
    } catch (err) {
      console.error('[UOL] findContactByIco error:', this.extractError(err));
      return null;
    }
  }

  async findContactByExternalId(externalId: string): Promise<string | null> {
    try {
      const res = await withRetry(
        () => this.http.get('/v1/contacts', { params: { external_id: externalId, per_page: 1 } }),
        3, `findContactByExternalId(${externalId})`
      );
      const items: Array<{ contact_id: string }> = res.data?.items ?? [];
      return items[0]?.contact_id ?? null;
    } catch (err) {
      console.error('[UOL] findContactByExternalId error:', this.extractError(err));
      return null;
    }
  }

  async createContact(input: UolContactInput): Promise<string> {
    const isB2B = Boolean(input.company_number);

    const body: Record<string, unknown> = {
      name:        input.name,
      external_id: input.external_id,
      country_id:  input.country_id ?? 'CZ',
      ...(isB2B && {
        company_number:  input.company_number,
        business_entity: 'true',
        ...(input.vatin && { vatin: input.vatin, vat_payer: 'true' }),
      }),
      addresses: [{
        name:      input.name,
        country_id: input.country_id ?? 'CZ',
        email:     input.email,
        ...(input.street      && { street:      input.street }),
        ...(input.city        && { city:        input.city }),
        ...(input.postal_code && { postal_code: input.postal_code }),
        address_types: ['accounting', 'document_recipient'],
      }],
    };

    const res = await withRetry(
      () => this.http.post('/v1/contacts', body),
      5, `createContact(${input.name})`
    );

    const contactId: string = res.data?.contact_id;
    if (!contactId) throw new Error('[UOL] createContact: chybí contact_id v response');
    console.log(`[UOL] Kontakt vytvořen: ${contactId} (${input.name})`);
    return contactId;
  }

  async findOrCreateContact(input: UolContactInput): Promise<string> {
    // B2B — hledej primárně podle IČO
    if (input.company_number) {
      const byIco = await this.findContactByIco(input.company_number);
      if (byIco) {
        console.log(`[UOL] Kontakt nalezen (IČO ${input.company_number}): ${byIco}`);
        return byIco;
      }
    }

    // B2C i B2B fallback — hledej podle external_id
    const byExtId = await this.findContactByExternalId(input.external_id);
    if (byExtId) {
      console.log(`[UOL] Kontakt nalezen (ext_id ${input.external_id}): ${byExtId}`);
      return byExtId;
    }

    return this.createContact(input);
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async createInvoice(input: UolInvoiceInput): Promise<UolInvoiceResult> {
    const today      = input.issue_date;
    const orderIdClean = input.order_id.replace(/-/g, ''); const externalId = `${this.externalIdPrefix}${orderIdClean}`;

    const invoiceItem: Record<string, unknown> = {
      product_id:  this.productId,
      description: 'Úprava fotografie přes FastHDR (HDR enhancement)',
      quantity:    1,
    };

    // Neplátce DPH (aktuální stav) — unit_price = celá cena
    if (!this.isVatPayer || this.vatRate === 0) {
      invoiceItem.unit_price = input.amount_czk;
    } else {
      // Plátce DPH, cena s DPH (from_above) — připraveno pro budoucí použití
      invoiceItem.unit_price_vat_inclusive = input.amount_czk;
      invoiceItem.vat_calculation_method   = 'from_above';
      invoiceItem.vat_rate                 = this.vatRate;
    }

    const body = {
      buyer_id:         input.buyer_id,
      status:           'confirmed',    // okamžitě vystavit a zafixovat
      send_by_email:    'true',         // UOL pošle PDF emailem (musí být string, ne boolean)
      type:             'standard',
      payment_method:   'credit_card',
      currency_id:      'CZK',
      issue_date:       today,
      tax_payment_date: today,
      due_date:         today,
      external_id:      externalId,
      text:             'Děkujeme za nákup na FastHDR.cz',
      note:             `Platba kartou přes GoPay, transakce ${input.gopay_payment_id}`,
      items:            [invoiceItem],
    };

    const res = await withRetry(
      () => this.http.post('/v1/sales_invoices', body),
      5, `createInvoice(order=${input.order_id})`
    );

    const data = res.data as UolInvoiceResult;
    if (!data?.invoice_id) throw new Error('[UOL] createInvoice: chybí invoice_id v response');
    console.log(`[UOL] Faktura vystavena: ${data.invoice_id} (order ${input.order_id})`);
    return data;
  }

  /** Idempotence check — hledá fakturu podle external_id v UOL */
  async findInvoiceByExternalId(orderId: string): Promise<string | null> {
    const orderIdClean = orderId.replace(/-/g, ''); const externalId = `${this.externalIdPrefix}${orderIdClean}`;
    try {
      const res = await withRetry(
        () => this.http.get('/v1/sales_invoices', { params: { external_id: externalId, per_page: 1 } }),
        3, `findInvoice(${externalId})`
      );
      const items: Array<{ invoice_id: string }> = res.data?.items ?? [];
      return items[0]?.invoice_id ?? null;
    } catch (err) {
      console.error('[UOL] findInvoiceByExternalId error:', this.extractError(err));
      return null;
    }
  }

  async downloadInvoicePdf(invoiceId: string): Promise<Buffer> {
    const res = await withRetry(
      () => this.http.get(`/v1/sales_invoices/${invoiceId}`, {
        headers: { Accept: 'application/pdf' },
        responseType: 'arraybuffer',
      }),
      3, `downloadPdf(${invoiceId})`
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private extractError(err: unknown): string {
    const axiosErr = err as AxiosError<{ message?: string }>;
    if (axiosErr.response?.data) return JSON.stringify(axiosErr.response.data);
    return (err as Error).message ?? String(err);
  }
}

// Singleton
let _instance: UolService | null = null;
export function getUolService(): UolService {
  if (!_instance) _instance = new UolService();
  return _instance;
}