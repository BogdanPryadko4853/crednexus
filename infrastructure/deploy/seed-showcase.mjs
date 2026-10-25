// Operator-only showcase seed. All companies and figures are fictional.
// Never use real personal data or put credentials in this file.
// Required: PLAYWRIGHT_MODULE, CREDNEXUS_CREDENTIALS (production env),
// CREDNEXUS_SHOWCASE_PASSWORD_FILE (0600). Optional: CREDNEXUS_SHOWCASE_USER.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env = Object.fromEntries((await readFile(process.env.CREDNEXUS_CREDENTIALS, 'utf8'))
  .split('\n').filter(line => line.includes('=')).map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
const password = (await readFile(process.env.CREDNEXUS_SHOWCASE_PASSWORD_FILE, 'utf8')).trim();
const username = process.env.CREDNEXUS_SHOWCASE_USER || 'alexey.volkov';
const origin = 'https://app.155.212.216.26.sslip.io';
const browser = await chromium.launch({ headless: true });
const contexts = [];

async function login(user, secret) {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const tokenResponse = page.waitForResponse(response =>
    response.url().includes('/protocol/openid-connect/token') && response.status() === 200,
  { timeout: 90000 });
  tokenResponse.catch(() => {});
  await page.goto(origin);
  if (!page.url().includes('auth.155.212.216.26.sslip.io')) {
    await page.getByRole('button', { name: /войти/i })
      .or(page.getByRole('link', { name: /войти/i })).first().click();
  }
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(secret);
  await page.locator('#kc-login').click();
  const { access_token: token } = await (await tokenResponse).json();
  assert.ok(token);
  await page.waitForURL(url => url.origin === origin);
  return async (path, method = 'GET', body, expected = 200) => {
    const response = await context.request.fetch(`${origin}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { data: body }),
    });
    const text = await response.text();
    assert.equal(response.status(), expected, `${method} ${path}: ${text}`);
    return text ? JSON.parse(text) : undefined;
  };
}

function mlProfile(revenue, expenses, age, sector) {
  const now = new Date();
  const month = offset => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 + offset, 1))
    .toISOString().slice(0, 10);
  return {
    as_of_month: month(0),
    company: { sector, business_age_months: age },
    history: Array.from({ length: 12 }, (_, index) => ({
      month: month(index - 11), sales: Math.round(revenue * (0.92 + index * 0.014)),
      cash_inflow: Math.round(revenue * (0.9 + index * 0.015)),
      operating_cash_outflow: expenses, operating_expense: expenses,
      cash_balance: revenue * 2,
    })),
    financial_snapshot: {
      month: month(0), legal_form: 'OOO', business_state: 'active',
      largest_customer_share: 0.18, largest_channel_share: 0.3,
      accounts_receivable: revenue * 0.2, accounts_payable: expenses * 0.15,
      overdue_payables: 0, debt_outstanding: 0, loan_arrears: 0,
      inventory: revenue * 0.3, existing_monthly_debt_service: 0,
    },
  };
}

async function waitFor(api, id, statuses) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const app = await api(`/loan-applications/${id}`);
    if (statuses.includes(app.status)) return app;
    assert.ok(!['REJECTED', 'MANUAL_REVIEW', 'NEEDS_INFO', 'EXPIRED'].includes(app.status),
      `Unexpected ${app.status}: ${id}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Workflow timeout: ${id}`);
}

try {
  const bank = await login('demo-employee', env.KEYCLOAK_DEMO_EMPLOYEE_PASSWORD);
  const api = await login(username, password);
  await api('/users/me');
  await api('/manual-review/loan-applications', 'GET', undefined, 403);
  const products = await bank('/credit-products');
  async function product(name, rate, max) {
    return products.find(item => item.name === name) || bank('/credit-products', 'POST', {
      name, minAmount: 100000, maxAmount: max, minTermMonths: 6,
      maxTermMonths: 60, baseRate: rate, active: true,
    }, 201);
  }
  const working = await product('Оборотный капитал', 16.5, 10000000);
  const equipment = await product('Оборудование для роста', 15.9, 15000000);
  const companies = await api('/companies');
  // Reserved fixture identifiers; never looked up in real registries.
  const fixtures = [
    { name: 'ООО «Северная обжарка»', inn: '9900000100', ogrn: '1990000000101',
      revenue: 3200000, expenses: 2050000, age: 62, employees: 12 },
    { name: 'ООО «Городская пекарня»', inn: '9900000200', ogrn: '1990000000202',
      revenue: 1850000, expenses: 1190000, age: 45, employees: 8 },
  ];
  const owned = [];
  for (const fixture of fixtures) {
    const company = companies.find(item => item.inn === fixture.inn)
      || await api('/companies', 'POST', {
        name: fixture.name, inn: fixture.inn, ogrnOrOgrnip: fixture.ogrn,
        legalForm: 'OOO', status: 'ACTIVE',
      }, 201);
    owned.push({ ...fixture, id: company.id });
  }
  const existing = await api('/loan-applications');
  const scenarios = [
    { company: owned[0], product: working, amount: 1200000, term: 18, purpose: 'working-capital', target: 'DISBURSED' },
    { company: owned[1], product: equipment, amount: 850000, term: 24, purpose: 'equipment', target: 'OFFERED' },
    { company: owned[0], product: equipment, amount: 2200000, term: 36, purpose: 'equipment', target: 'DRAFT' },
  ];
  const result = [];
  for (const scenario of scenarios) {
    let application = existing.find(item => item.companyId === scenario.company.id
      && item.productId === scenario.product.id && item.requestedAmount === scenario.amount
      && item.termMonths === scenario.term && item.purpose === scenario.purpose);
    if (!application) {
      application = await api(`/companies/${scenario.company.id}/loan-applications`, 'POST', {
        productId: scenario.product.id, requestedAmount: scenario.amount,
        termMonths: scenario.term, purpose: scenario.purpose,
      }, 201);
    }
    if (application.status === 'DRAFT') {
      await api(`/loan-applications/${application.id}/financial-snapshot`, 'PUT', {
        annualRevenue: scenario.company.revenue * 12, annualExpenses: scenario.company.expenses * 12,
        existingDebt: 0, monthlyPayments: 0, employeeCount: scenario.company.employees,
        period: 'Последние 12 завершённых месяцев',
      });
      await api(`/loan-applications/${application.id}/ml-scoring-profile`, 'PUT', {
        profile: mlProfile(scenario.company.revenue, scenario.company.expenses, scenario.company.age, 'retail'),
      });
      if (scenario.target !== 'DRAFT') await api(`/loan-applications/${application.id}/submit`, 'POST');
    }
    if (scenario.target !== 'DRAFT' && application.status !== 'DISBURSED') {
      application = await waitFor(api, application.id, ['OFFERED', 'DISBURSED']);
      if (scenario.target === 'DISBURSED' && application.status === 'OFFERED') {
        await api(`/loan-applications/${application.id}/offer/accept`, 'POST');
        application = await waitFor(api, application.id, ['DISBURSED']);
      }
    }
    result.push({ company: scenario.company.name, id: application.id, status: application.status });
  }
  console.log(JSON.stringify({ username, companies: owned.map(item => item.name), applications: result }, null, 2));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
