// Real HTTPS / OIDC (PKCE) / API smoke. Creates labelled synthetic data only.
// Usage: PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs \
//   CREDNEXUS_CREDENTIALS=/secure/production.env node infrastructure/deploy/smoke.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const credentials = Object.fromEntries((await readFile(process.env.CREDNEXUS_CREDENTIALS, 'utf8'))
  .split('\n').filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const origin = 'https://app.155.212.216.26.sslip.io';
const browser = await chromium.launch({ headless: true });
const contexts = [];

async function login(username, passwordKey) {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const tokenResponse = page.waitForResponse(response =>
    response.url().includes('/protocol/openid-connect/token') && response.status() === 200,
    { timeout: 90000 });
  // A failed initial navigation must not leave an unhandled token-wait rejection.
  tokenResponse.catch(() => {});
  await page.goto(origin);
  if (!page.url().includes('auth.155.212.216.26.sslip.io')) {
    const loginLink = page.getByRole('button', { name: /войти/i }).or(page.getByRole('link', { name: /войти/i }));
    await loginLink.first().click();
  }
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(credentials[passwordKey]);
  await page.locator('#kc-login').click();
  const tokens = await (await tokenResponse).json();
  assert.ok(tokens.access_token, 'Keycloak must return an access token');
  await page.waitForURL(url => url.origin === origin, { timeout: 60000 });
  const api = async (path, method = 'GET', body, expected = 200) => {
    const response = await context.request.fetch(`${origin}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { data: body }),
    });
    const text = await response.text();
    assert.equal(response.status(), expected, `${method} ${path}: ${response.status()} ${text}`);
    return text ? JSON.parse(text) : undefined;
  };
  const documentRoundTrip = async applicationId => {
    const bytes = Buffer.from('%PDF-1.7\n% Synthetic CredNexus deployment smoke\n');
    const upload = await context.request.post(`${origin}/api/loan-applications/${applicationId}/documents`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      multipart: {
        type: 'SUPPORTING_DOCUMENT',
        file: { name: 'synthetic-vps-proof.pdf', mimeType: 'application/pdf', buffer: bytes },
      },
    });
    assert.equal(upload.status(), 200, `Document upload: ${upload.status()}`);
    const document = await upload.json();
    const download = await context.request.get(`${origin}/api/documents/${document.id}/download`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    assert.equal(download.status(), 200);
    assert.deepEqual(await download.body(), bytes);
    console.log(`MinIO upload/download OK: ${document.id}`);
  };
  const downloadDocument = async documentId => {
    const response = await context.request.get(`${origin}/api/documents/${documentId}/download`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    assert.equal(response.status(), 200);
    assert.ok((await response.body()).subarray(0, 5).equals(Buffer.from('%PDF-')));
  };
  const me = await api('/users/me');
  console.log(`OIDC login + user sync OK: ${username}`);
  return { page, api, me, documentRoundTrip, downloadDocument };
}

async function waitStatus(api, id, accepted) {
  const deadline = Date.now() + 180000;
  let status;
  do {
    const application = await api(`/loan-applications/${id}`);
    if (application.status !== status) {
      status = application.status;
      console.log(`Application ${id}: ${status}`);
    }
    if (accepted.includes(status)) return application;
    assert.ok(!['REJECTED', 'NEEDS_INFO', 'DECLINED', 'EXPIRED'].includes(status), `Unexpected status ${status}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } while (Date.now() < deadline);
  throw new Error(`Workflow timeout for ${id}: ${status}`);
}

function profile() {
  const now = new Date();
  const month = offset => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 + offset, 1)).toISOString().slice(0, 10);
  return {
    as_of_month: month(0),
    company: { sector: 'retail', business_age_months: 60 },
    history: Array.from({ length: 12 }, (_, index) => ({
      month: month(index - 11), sales: 2000000, cash_inflow: 2000000,
      operating_cash_outflow: 1000000, cash_balance: 5000000, operating_expense: 1000000,
    })),
    financial_snapshot: {
      month: month(0), legal_form: 'OOO', business_state: 'active',
      largest_customer_share: 0.15, largest_channel_share: 0.25,
      accounts_receivable: 100000, accounts_payable: 100000, overdue_payables: 0,
      debt_outstanding: 0, loan_arrears: 0, inventory: 100000,
      existing_monthly_debt_service: 0,
    },
  };
}

try {
  const employee = await login('demo-employee', 'KEYCLOAK_DEMO_EMPLOYEE_PASSWORD');
  const client = await login('demo-client', 'KEYCLOAK_DEMO_CLIENT_PASSWORD');
  if (process.env.CREDNEXUS_EXISTING_APPLICATION) {
    const persisted = await client.api(`/loan-applications/${process.env.CREDNEXUS_EXISTING_APPLICATION}`);
    assert.equal(persisted.status, 'DISBURSED');
    await client.api(`/loan-applications/${persisted.id}/fulfillment`);
    console.log(`Existing application preserved after restart: ${persisted.id}`);
  }
  if (process.env.CREDNEXUS_EXISTING_DOCUMENT) {
    await client.downloadDocument(process.env.CREDNEXUS_EXISTING_DOCUMENT);
    console.log('Existing document preserved after restart');
  }
  await client.api('/manual-review/loan-applications', 'GET', undefined, 403);
  await client.api('/credit-products', 'POST', {}, 403);
  const run = Date.now().toString();
  const product = await employee.api('/credit-products', 'POST', {
    name: `Синтетический VPS smoke ${run}`, minAmount: 10000, maxAmount: 5000000,
    minTermMonths: 6, maxTermMonths: 60, baseRate: 15, active: true,
  }, 201);

  async function submit(suffix) {
    const company = await client.api('/companies', 'POST', {
      inn: `77${run.slice(-6)}${suffix}`, ogrnOrOgrnip: (BigInt(run) + BigInt(suffix)).toString().padStart(13, '1'),
      name: `Синтетическая VPS компания ${run}-${suffix}`, legalForm: 'OOO', status: 'ACTIVE',
    }, 201);
    const application = await client.api(`/companies/${company.id}/loan-applications`, 'POST', {
      productId: product.id, requestedAmount: 100000, termMonths: 12, purpose: 'working-capital',
    }, 201);
    await client.api(`/loan-applications/${application.id}/financial-snapshot`, 'PUT', {
      annualRevenue: 24000000, annualExpenses: 12000000, existingDebt: 0,
      monthlyPayments: 0, employeeCount: 0, period: 'Синтетические данные, последние 12 месяцев',
    });
    await client.api(`/loan-applications/${application.id}/ml-scoring-profile`, 'PUT', { profile: profile() });
    await client.api(`/loan-applications/${application.id}/submit`, 'POST');
    return application.id;
  }

  const automatic = await submit('00');
  await waitStatus(client.api, automatic, ['OFFERED']);
  const { scoring } = await employee.api(`/manual-review/loan-applications/${automatic}/details`);
  assert.ok(scoring.modelVersion && !scoring.modelVersion.startsWith('rule-based'), 'Actual ML version required');
  console.log(`Actual ML scoring: ${scoring.modelVersion}, score=${scoring.score}`);
  await client.api(`/loan-applications/${automatic}/offer/accept`, 'POST');
  await waitStatus(client.api, automatic, ['DISBURSED']);
  const history = await client.api(`/loan-applications/${automatic}/history`);
  for (const status of ['VERIFYING', 'SCORING', 'OFFERED', 'ACCEPTED', 'AGREEMENT_PENDING', 'DISBURSED']) {
    assert.ok(history.some(entry => entry.toStatus === status), `History must contain ${status}`);
  }
  await client.api(`/loan-applications/${automatic}/fulfillment`);
  await client.documentRoundTrip(automatic);

  // FNS mock outcome ERROR => bounded retries => MANUAL_REVIEW, independent of ML risk.
  const manual = await submit('08');
  await waitStatus(client.api, manual, ['MANUAL_REVIEW']);
  const details = await employee.api(`/manual-review/loan-applications/${manual}/details`);
  assert.ok(details, 'Employee details must be accessible');
  await employee.api(`/manual-review/loan-applications/${manual}/decision`, 'POST', {
    action: 'REJECT', reason: 'Синтетическая проверка ручного решения на VPS',
  });
  const rejected = await client.api(`/loan-applications/${manual}`);
  assert.equal(rejected.status, 'REJECTED');
  console.log(`Manual review and employee decision OK: ${manual}`);

  await client.page.getByRole('button', { name: /выйти/i }).click();
  await client.page.waitForURL(url => url.origin === origin && url.pathname === '/login', { timeout: 30000 });
  console.log('Logout completed');
  console.log(JSON.stringify({ automatic, manual, product: product.id, checkedAt: new Date().toISOString() }));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
