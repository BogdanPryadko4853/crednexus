"""Monthly structural SME economy with dated receivables/payables and life cycle."""
import numpy as np
import pandas as pd

from .config import MEASURES, SECTORS, cohorts, annuity, service_fifo


def economy(cfg, part, first, n, macro, loan_amount_multiplier=1.):
    rng = np.random.default_rng(np.random.SeedSequence([cfg.seed, part, 10]))
    m = cfg.months
    ids = np.array([f"SYN2-{i:08d}" for i in range(first, first+n)])
    sector = rng.choice(len(SECTORS), n, p=[s[1] for s in SECTORS])
    p = np.array([s[2:] for s in SECTORS], dtype=float)[sector]
    base = np.clip(rng.lognormal(np.log(p[:, 0]), .85), 60_000, 24_000_000)
    phase = p[:, 4]+rng.normal(0, 1.6, n)
    phase += np.where(rng.random(n)<.10, 6, 0)
    amplitude = np.clip(p[:, 3]*rng.lognormal(-.12, .45, n), 0, .85)
    phi = rng.uniform(.15, .75, n)
    sigma = rng.uniform(.065, .23, n)
    variable_share = np.clip(p[:, 1]+rng.normal(0, .045, n), .1, .88)
    fixed_share = np.clip(p[:, 2]+rng.normal(0, .055, n), .04, .76)
    base_growth = np.clip(rng.normal(.0005, .003, n), -.009, .010)
    regime = rng.choice(5, n, p=[.43, .22, .15, .10, .10])
    initial_regime = regime.copy()
    # Stable, thin-margin, growing, seasonal, declining. Latent, never ML features.
    regime_fixed = np.array([0, .065, .035, .025, .075])
    regime_growth = np.array([0, -.001, .005, 0, -.004])
    credit_sales = np.clip(p[:, 5]+rng.normal(0, .07, n), 0, .98)
    b2c = np.isin(sector, [0, 2, 7])
    concentration = np.where(b2c, rng.beta(1, 35, n), rng.beta(2, 5, n))
    channel_concentration = rng.beta(2, 6, n)
    effective_concentration = np.where(b2c, channel_concentration, concentration)
    # Contractual payment terms per company, with invoices spread over adjacent cohorts.
    customer_term = rng.choice([1, 2, 3], n, p=[.32, .48, .20])
    supplier_term = rng.choice([1, 2, 3], n, p=[.55, .35, .10])
    supplier_credit = np.clip(rng.beta(4, 3, n), .05, .95)
    stock_months = p[:, 6]*rng.uniform(.5, 1.8, n)
    reserve_months = np.clip(rng.lognormal(-.8, .7, n), .03, 2.0)
    owner_available = base*rng.lognormal(-.6, .8, n)
    payment_delay_prob = rng.uniform(.005, .045, n)
    buffer_days = rng.uniform(1, 7, n)
    buffer_discipline = rng.beta(4, 2, n)
    monthly_tax = rng.random(n)<.45
    debt_priority = rng.uniform(.65, .95, n)
    legal_form = rng.choice(["IP", "OOO"], n, p=[.47, .53])
    split = rng.choice(["train", "validation", "test"], n, p=[7/9, 1/9, 1/9])
    split = np.where(rng.random(n)<cfg.stress_share, "stress_test", split)
    world = np.select([split=="train", split=="validation", split=="test"], [0, 1, 2], default=3)
    ranges = cohorts(m)
    origin = np.array([rng.integers(ranges[s][0], ranges[s][1]+1) for s in split])
    age_at_application = np.where(rng.random(n)<.22, rng.integers(6, 31, n),
                                   np.clip(rng.lognormal(np.log(65), .65, n), 18, 240).astype(int))
    birth = np.maximum(origin-age_at_application+1, 0)
    age0 = np.maximum(age_at_application-origin-1, 0)
    term = rng.choice([12, 18, 24, 36], n, p=[.20, .18, .36, .26])
    purpose = rng.choice(["working_capital", "equipment", "refinance"], n, p=[.62, .27, .11])
    request_factor = np.clip(rng.lognormal(.15, .6, n), .15, 4.)
    product_limit = rng.choice([5e6, 10e6, 20e6, 30e6], n, p=[.25, .35, .25, .15])
    term_old = rng.integers(12, 61, n)
    initial_debt = base*np.clip(rng.lognormal(.2, .8, n), .1, 5.)*(rng.random(n)<.61)
    old_rate = rng.uniform(.13, .30, n)
    old_payment = annuity(initial_debt, old_rate, term_old)
    old_sched, new_sched = np.zeros(n), np.zeros(n)
    amount, rate, new_payment = np.zeros(n), np.zeros(n), np.zeros(n)
    eligible_origin = np.zeros(n, dtype=bool)
    funded = np.zeros(n, dtype=bool)
    loan_queue = np.zeros((n, m+4))
    ar_queue, ap_queue = np.zeros((n, m+6)), np.zeros((n, m+6))
    cash, inventory = np.zeros(n), np.zeros(n)
    opening_equity = base*reserve_months
    initial_inventory = base*variable_share*stock_months
    tax_pool, ar_noise, cost_noise, demand_level = (np.zeros(n) for _ in range(4))
    state = np.full(n, 4, dtype=np.int8)
    distress_run = np.zeros(n, dtype=int)
    holiday = np.zeros(n, dtype=int)
    temporary_end = np.zeros(n, dtype=int)
    temporary = np.ones(n)
    prior_dpd = np.zeros(n)
    payment_incident_left = np.zeros(n, dtype=int)
    prior_trade_overdue = np.zeros(n)
    productivity = np.zeros(n)
    # A range of deployment success; cannot be inferred from purpose alone.
    equipment_gain = np.clip(rng.normal(.08, .13, n), -.25, .4)
    deployment_delay = rng.integers(3, 10, n)
    equipment_spend_share = rng.uniform(.65, .95, n)
    invoice_lateness = rng.uniform(.015, .08, n)
    fields = ["sales", "cash_inflow", "operating_expense", "operating_due", "operating_cash_outflow",
              "cash_balance", "opening_balance", "loan_disbursement", "background_financing", "investment_outflow",
              "owner_injection", "owner_draw", "debt_payment", "scheduled_debt_payment", "accounts_receivable",
              "accounts_payable", "overdue_payables", "debt_outstanding", "loan_arrears", "dpd", "refunds",
              "receivable_writeoff", "new_credit_sales", "new_supplier_invoices", "purchases", "cost_of_sales",
              "inventory", "opening_inventory", "inventory_disposals", "asset_sale_inflow", "capitalized_interest",
              "distressed_restructure", "closure_with_debt", "economic_event_mask", "business_state", "operating"]
    out = {k: np.zeros((n, m)) for k in fields}
    macro_arrays = {c: macro[c].to_numpy().reshape(4, m) for c in
                    ("demand_index", "price_index", "input_cost_index", "wage_cost_index", "reference_rate")}
    row = np.arange(n)
    for t in range(m):
        entering = birth==t
        state[entering] = 0
        cash += np.where(entering, opening_equity, 0)
        inventory += np.where(entering, initial_inventory, 0)
        old_sched += np.where(entering, initial_debt, 0)
        # Opening equity funds opening stock separately; no free goods after birth.
        if entering.any():
            for lag in (1, 2, 3):
                ar_queue[:, t+lag] += np.where(entering & (birth==0), base*credit_sales*.35, 0)
                ap_queue[:, t+lag] += np.where(entering & (birth==0), base*variable_share*supplier_credit*.22, 0)
        operating_start = (state<3)
        opening = cash.copy()
        opening_stock = inventory.copy()
        # Recovery, restructuring and closure use only information already available.
        wants_restructure = operating_start & (prior_dpd>=60) & (loan_queue.sum(axis=1)>base*.02) & (holiday==0) & (rng.random(n)<.10)
        old_sched += np.where(wants_restructure, new_sched+loan_queue.sum(axis=1), 0)
        new_sched = np.where(wants_restructure, 0, new_sched)
        loan_queue[wants_restructure] = 0
        old_payment = np.where(wants_restructure, annuity(old_sched, old_rate, rng.integers(24, 49, n)), old_payment)
        holiday = np.where(wants_restructure, rng.integers(1, 4, n), holiday)
        close_probability = np.where(state==1, .006+.004*np.minimum(distress_run, 12), .0005)
        closing = operating_start & ((rng.random(n)<close_probability) | (prior_dpd>=360) | (distress_run>=24)) & (t!=origin+1)
        closure_debt = closing & ((old_sched+new_sched+loan_queue.sum(axis=1))>1000)
        state[closing] = 3
        state[wants_restructure & ~closing] = 2
        operating = state<3
        inventory_disposals = np.where(closing, inventory, 0)
        asset_sales = inventory_disposals*rng.uniform(.35, .75, n)
        inventory -= inventory_disposals
        # Exogenous regime changes create future uncertainty without random label flips.
        switching = operating & (rng.random(n)<np.where(world==3, .035, .020))
        proposed_regime = rng.choice(5, n, p=[.43, .22, .15, .10, .10])
        regime = np.where(switching, proposed_regime, regime)
        ar_noise = phi*ar_noise+rng.standard_t(5, n)*sigma
        cost_noise = .75*cost_noise+rng.normal(0, .012, n)
        demand_level = np.clip(demand_level+base_growth+regime_growth[regime]+rng.normal(0, .003, n), -1.1, .85)
        temporary = np.where(t>=temporary_end, 1., temporary)
        hazard = np.where(world==3, 1.65, 1.)
        u = rng.random(n)
        outage = (u<.009*hazard)&operating
        big_order = (u>=.009*hazard)&(u<.018*hazard)&operating
        lost_customer = (u>=.018*hazard)&(u<.022*hazard)&operating
        temporary = np.where(outage, rng.uniform(.15, .65, n), temporary)
        temporary_end = np.where(outage, t+rng.integers(1, 5, n), temporary_end)
        demand_level -= np.where(lost_customer, effective_concentration*rng.uniform(.2, .7, n), 0)
        month = t%12+1
        season = np.exp(amplitude*np.cos(2*np.pi*(month-phase)/12))/np.i0(amplitude)
        season *= np.where(regime==3, np.exp(.20*np.cos(2*np.pi*(month-phase)/12)), 1.)
        macro_demand = macro_arrays["demand_index"][world, t]
        sell_price = macro_arrays["price_index"][world, t]
        inputs = macro_arrays["input_cost_index"][world, t]
        wage = macro_arrays["wage_cost_index"][world, t]
        productivity = np.where((t==origin+deployment_delay)&funded&(purpose=="equipment"), equipment_gain, productivity)
        desired_sales = base*np.exp(demand_level+np.clip(ar_noise, -.9, .9))*season*macro_demand*sell_price
        desired_sales *= temporary*(1+productivity)*np.where(big_order, rng.uniform(1.5, 3.5, n), 1.)*operating
        # Bound the scale smoothly, not with a common hard revenue cut-off.
        ceiling = 42e6*rng.uniform(.95, 1.05, n)
        desired_sales = ceiling*np.tanh(desired_sales/ceiling)
        unit_cost_share = np.clip(variable_share*(inputs/sell_price)**.55*np.exp(cost_noise), .08, .94)
        desired_cogs = desired_sales*unit_cost_share
        expected_stock = base*unit_cost_share*stock_months*sell_price
        expanded_stock = np.where(funded&(purpose=="working_capital")&(stock_months>.15)&(t>=origin+1)&(t<=origin+4), amount*.10, 0)
        purchase_plan = np.maximum(desired_cogs+expected_stock+expanded_stock-inventory, 0)*operating
        supplier_restriction = np.clip(1-prior_trade_overdue/np.maximum(base*3, 1), .15, 1.)
        purchases = purchase_plan*supplier_restriction
        inventory += purchases
        cogs = np.minimum(inventory, desired_cogs)
        sales = desired_sales*np.divide(cogs, desired_cogs, out=np.ones(n), where=desired_cogs>0)
        inventory -= cogs
        # Date individual invoice cohorts; 30/60/90-day terms plus late payments.
        credit = sales*credit_sales
        for lag in (1, 2, 3, 4):
            weight = np.where(customer_term==lag, .75, np.where(customer_term+1==lag, .25, 0))
            ar_queue[:, t+lag] += credit*weight
        writeoff = ar_queue.sum(axis=1)*np.where(lost_customer, effective_concentration*.12, .0002)
        ar_total = ar_queue.sum(axis=1)
        ar_queue *= np.maximum(1-np.divide(writeoff, ar_total, out=np.zeros(n), where=ar_total>0), 0)[:, None]
        late = (rng.random(n)<invoice_lateness*hazard)&(ar_queue[:, :t+1].sum(axis=1)>0)
        recover = np.where(late, rng.uniform(.05, .45, n), rng.uniform(.70, 1., n))
        collections = service_fifo(ar_queue[:, :t+1], ar_queue[:, :t+1].sum(axis=1)*recover)
        receipts = sales-credit+collections
        refunds = sales*rng.beta(1, 120, n)*b2c
        fixed = base*(fixed_share+regime_fixed[regime])*wage*np.exp(cost_noise*.3)*operating
        fixed *= np.where(state==1, .92, 1.)
        repair = (rng.random(n)<.007*hazard)&operating
        extra = np.where(repair, base*rng.uniform(.15, 1., n), 0)
        tax_pool += np.maximum(sales-cogs-fixed-extra, 0)*.12
        tax_month = monthly_tax | (month%3==1)
        tax = np.where(tax_month, tax_pool, 0)
        tax_pool -= tax
        expense = cogs+fixed+extra+tax+refunds
        supplier_invoice = purchases
        for lag in (0, 1, 2, 3):
            weight = np.where(lag==0, 1-supplier_credit, np.where(supplier_term==lag, supplier_credit, 0))
            ap_queue[:, t+lag] += supplier_invoice*weight
        ap_queue[:, t] += fixed+extra+tax+refunds
        operating_due = ap_queue[:, t].copy()
        # Loan quote is based on information available at application, not latent quality.
        granting = (t==origin+1)&eligible_origin
        if granting.any():
            historical = out["sales"][:, max(0, t-12):t]
            available_months = np.minimum(t-birth, 12)
            historical_mean = historical.sum(axis=1)/np.maximum(available_months, 1)
            requested = np.maximum(historical_mean*request_factor, 50_000)
            # Product-specific limit is explicit; random quoted amount avoids one universal pile-up.
            proposed = np.minimum(requested, product_limit*rng.uniform(.90, 1., n))
            amount = np.where(granting, np.clip(proposed*loan_amount_multiplier, 50_000, product_limit), amount)
            quote = macro_arrays["reference_rate"][world, max(t-1, 0)]+rng.uniform(.04, .10, n)+.012*np.log1p(prior_dpd/30)
            rate = np.where(granting, quote, rate)
            new_payment = np.where(granting, annuity(amount, np.maximum(rate, .01), term), new_payment)
        funded |= granting
        disbursement = np.where(granting, amount, 0)
        new_sched += disbursement
        investment = np.where(granting&(purpose=="equipment"), amount*equipment_spend_share, 0)
        refinance_budget = np.where(granting&(purpose=="refinance"), disbursement*.85, 0)
        refinanced_arrears = service_fifo(loan_queue[:, :t+1], refinance_budget)
        refinance_principal = np.minimum(np.maximum(refinance_budget-refinanced_arrears, 0), old_sched)
        old_sched -= refinance_principal
        refinance = refinanced_arrears+refinance_principal
        # Occasional independent borrowing prevents all old debt originating at calendar start.
        bridge = operating&(t>birth+6)&(rng.random(n)<.004)&~granting
        background = np.where(bridge, base*rng.uniform(.15, .8, n), 0)
        old_sched += background
        old_payment = np.where(bridge|(refinance_principal>0), annuity(old_sched, old_rate, rng.integers(12, 37, n)), old_payment)
        rescue = operating&(cash<base*.25)&(rng.random(n)<.06)
        injection = np.minimum(np.where(rescue, base*rng.uniform(.05, .4, n), 0), owner_available)
        owner_available -= injection
        available = np.maximum(cash+receipts+disbursement+background+injection+asset_sales-investment-refinance, 0)
        old_interest = old_sched*old_rate/12
        new_interest = new_sched*rate/12
        old_due = np.where(holiday>0, 0, np.minimum(old_payment, old_sched+old_interest))
        new_due = np.where((t>origin+1)&(holiday==0), np.minimum(new_payment, new_sched+new_interest), 0)
        old_sched = np.maximum(old_sched-np.maximum(old_due-old_interest, 0), 0)
        new_sched = np.maximum(new_sched-np.where(t>origin+1, np.maximum(new_due-new_interest, 0), 0), 0)
        capitalized = np.where(holiday>0, old_interest+new_interest, 0)
        old_sched += np.where(holiday>0, old_interest, 0)
        new_sched += np.where(holiday>0, new_interest, 0)
        loan_queue[:, t] += old_due+new_due
        delayed_payment = (rng.random(n)<payment_delay_prob)&operating
        payment_incident = operating & ((old_sched+new_sched)>0) & (rng.random(n)<.004*hazard)
        payment_incident_left = np.where(payment_incident, 2, payment_incident_left)
        holdback = np.where(delayed_payment, available*rng.uniform(.2, .65, n), 0)
        # A management action, funded from actual cash: preserve near-term payroll /
        # supplier liquidity instead of mechanically spending every ruble on arrears.
        keeps_buffer = operating & (rng.random(n)<buffer_discipline)
        buffer_target = (fixed+.2*purchases)*buffer_days/30
        liquidity_buffer = np.where(keeps_buffer, np.minimum(available-holdback, buffer_target), 0)
        spendable = available-holdback-liquidity_buffer
        trade_paid1 = service_fifo(ap_queue[:, :t+1], spendable*debt_priority)
        spendable -= trade_paid1
        loan_paid = service_fifo(loan_queue[:, :t+1], np.where(payment_incident_left>0, 0, spendable))
        spendable -= loan_paid
        trade_paid2 = service_fifo(ap_queue[:, :t+1], spendable)
        spendable -= trade_paid2
        trade_paid = trade_paid1+trade_paid2
        surplus = spendable+holdback+liquidity_buffer
        owner_draw = np.maximum(surplus-base*reserve_months, 0)*rng.uniform(.12, .55, n)*operating
        cash = np.maximum(surplus-owner_draw, 0)
        arrears = loan_queue.sum(axis=1)
        # An owner exit with enough cash/collectible receivables is not a credit default.
        closure_debt = closing & ((old_sched+new_sched+arrears)>np.maximum(1000, cash+ar_queue.sum(axis=1)*.6))
        unpaid = loan_queue[:, :t+1]>10
        oldest = np.argmax(unpaid, axis=1)
        dpd = np.where(unpaid.any(axis=1), (t-oldest)*30, 0)
        trade_overdue = ap_queue[:, :t+1].sum(axis=1)
        distressed = (dpd>=30)|(trade_overdue>base*.25)
        distress_run = np.where(distressed&operating, distress_run+1, 0)
        state = np.where(operating & (holiday==0), np.where(distressed, 1, 0), state).astype(np.int8)
        holiday = np.maximum(holiday-1, 0)
        eligible_now = operating&(state!=2)&(dpd<90)&(t-birth>=5)
        eligible_origin = np.where(t==origin, eligible_now, eligible_origin)
        event = (outage.astype(int)+2*big_order+4*lost_customer+8*late+16*repair+32*switching+64*payment_incident).astype(np.int16)
        vals = [sales, receipts, expense, operating_due, trade_paid, cash, opening, disbursement, background, investment,
                injection, owner_draw, loan_paid+refinance, old_due+new_due, ar_queue.sum(axis=1), ap_queue.sum(axis=1),
                trade_overdue, old_sched+new_sched+arrears, arrears, dpd, refunds, writeoff, credit, supplier_invoice,
                purchases, cogs, inventory, opening_stock, inventory_disposals, asset_sales, capitalized,
                wants_restructure&~closing, closure_debt, event, state, operating]
        for key, value in zip(fields, vals, strict=True):
            out[key][:, t] = value
        prior_dpd, prior_trade_overdue = dpd, trade_overdue
        payment_incident_left = np.maximum(payment_incident_left-1, 0)
    companies = pd.DataFrame({"company_id": ids, "name": [f"Синтетическая компания {i}" for i in range(first, first+n)],
                 "sector": np.array([s[0] for s in SECTORS])[sector], "legal_form": legal_form,
                 "age_at_start_months": age0, "birth_month_idx": birth, "largest_customer_share": concentration,
                 "largest_channel_share": channel_concentration, "split": split})
    parameters = pd.DataFrame({"company_id": ids, "initial_regime": initial_regime, "world": world,
                              "customer_term_months": customer_term, "supplier_term_months": supplier_term,
                              "supplier_credit_fraction": supplier_credit, "reserve_months": reserve_months})
    contract = {"origin": origin, "amount": amount, "rate": rate, "term": term, "purpose": purpose,
                "funded": funded, "eligible": eligible_origin, "product_limit": product_limit}
    return companies, parameters, out, contract


def observations(cfg, part, out, birth):
    rng = np.random.default_rng(np.random.SeedSequence([cfg.seed, part, 20]))
    n, m = out["sales"].shape
    exists = np.arange(m)[None, :]>=birth[:, None]
    clean = {k: np.where(exists, out[k], np.nan) for k in MEASURES}
    normal = {k: v.copy() for k, v in clean.items()}
    normal_mask = np.zeros((n, m), dtype=np.int16)
    # Missing source blocks, and more incomplete reporting for young businesses.
    outages = rng.random((n, m))<cfg.missing_rate
    outages[:, 1:] |= outages[:, :-1]&(rng.random((n, m-1))<.3)
    age = np.arange(m)[None, :]-birth[:, None]
    for bit, key in enumerate(MEASURES):
        missing = (outages | (rng.random((n, m))<cfg.missing_rate*np.where(age<12, 2., .3)))&exists
        normal[key][missing] = np.nan
        normal_mask |= missing.astype(np.int16)*(1<<bit)
        if key in ("sales", "operating_expense"):
            revision = (rng.random((n, m))<.06)&exists&~missing
            normal[key][revision] *= np.clip(1+rng.normal(0, .012, revision.sum()), .95, 1.05)
            normal_mask |= revision.astype(np.int16)*(1<<(bit+5))
    corrupted = {k: v.copy() for k, v in normal.items()}
    corrupt_mask = np.zeros((n, m), dtype=np.int16)
    for bit, key in enumerate(MEASURES):
        bad = (rng.random((n, m))<cfg.error_rate)&exists&np.isfinite(normal[key])
        corrupted[key][bad] *= rng.choice([.01, 100.], bad.sum())
        corrupt_mask |= bad.astype(np.int16)*(1<<(bit+5))
    # A document-wide unit error, and export duplicates, in the dedicated stress view.
    bad_document = rng.random(n)<min(1., cfg.error_rate*7.5)
    for i in np.flatnonzero(bad_document):
        start = int(rng.integers(0, m-3))
        for bit, key in enumerate(MEASURES):
            corrupted[key][i, start:start+3] *= 100
            corrupt_mask[i, start:start+3] |= 1<<(bit+5)
    duplicate = (rng.random((n, m))<cfg.error_rate)&exists
    corrupted["cash_inflow"][duplicate] *= 2
    corrupt_mask |= duplicate.astype(np.int16)*1024
    return clean, normal, corrupted, normal_mask, corrupt_mask
