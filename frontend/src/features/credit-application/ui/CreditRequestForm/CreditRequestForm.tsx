import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Icon,
  Modal,
  SelectField,
  TextField,
} from "../../../../components";
import { useLocale } from "../../../../i18n";
import {
  CREDIT_INPUT_LIMITS,
  createEmptyCreditRequest,
  validateCreditRequest,
} from "../../model/creditRequest";
import type {
  CreditRequest,
  CreditRequestErrors,
} from "../../model/creditRequest";
import type {
  CompanyOption,
  CreditProductOption,
} from "../../api/creditApplicationApi";
import "./CreditRequestForm.css";

type CreditRequestFormProps = {
  availableCompanies?: CompanyOption[];
  availableProducts?: CreditProductOption[];
  hasCreditProducts?: boolean;
  onConfirm?: (values: CreditRequest, productId?: string) => Promise<void>;
};

export function CreditRequestForm({
  availableCompanies,
  availableProducts,
  hasCreditProducts,
  onConfirm,
}: CreditRequestFormProps = {}) {
  const { t } = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(createEmptyCreditRequest);
  const [errors, setErrors] = useState<CreditRequestErrors>({});
  const [confirmation, setConfirmation] = useState<CreditRequest | null>(null);
  const [customPurpose, setCustomPurpose] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(availableProducts?.[0]?.id ?? "");
  const selectedProduct = availableProducts?.find((product) => product.id === selectedProductId);
  const messageValues = {
    legalDigits: CREDIT_INPUT_LIMITS.legalInnDigits,
    soleDigits: CREDIT_INPUT_LIMITS.soleInnDigits,
    fractionDigits: CREDIT_INPUT_LIMITS.amountFractionDigits,
  };
  const fieldError = (field: keyof CreditRequest) =>
    errors[field] ? t(errors[field], messageValues) : undefined;
  const purposeError = fieldError("purpose");

  function change(field: keyof CreditRequest, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setConfirmed(false);
  }

  function selectPurpose(value: string) {
    change("purpose", value);
    if (value !== "other") setCustomPurpose("");
  }

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setValues((previous) => ({ ...previous, termMonths: "" }));
    setErrors({});
    setConfirmed(false);
  }

  function selectCompany(companyId: string) {
    const company = availableCompanies?.find((item) => item.id === companyId);
    if (!company) return;
    setValues((previous) => ({ ...previous, company: company.name, inn: company.inn }));
    setErrors({});
    setConfirmed(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateCreditRequest(values);
    if (availableCompanies && !availableCompanies.some((item) => item.inn === values.inn)) nextErrors.company = "application.validation.companySelection";
    if (selectedProduct) {
      const amount = Number(values.amount.replace(/\s/g, "").replace(",", "."));
      const term = Number(values.termMonths);
      if (!Number.isFinite(amount) || amount < Number(selectedProduct.minAmount ?? 0) || (selectedProduct.maxAmount !== undefined && amount > selectedProduct.maxAmount)) nextErrors.amount = "application.validation.productAmount";
      if (!Number.isInteger(term) || term < selectedProduct.minTermMonths || (selectedProduct.maxTermMonths !== undefined && term > selectedProduct.maxTermMonths)) nextErrors.termMonths = "application.validation.productTerm";
    }
    if (values.purpose === "other" && !customPurpose.trim()) {
      nextErrors.purpose = "application.validation.customPurpose";
    }
    setErrors(nextErrors);
    setConfirmed(false);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const field = formRef.current?.elements.namedItem(firstError);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setConfirmation({
      ...values,
      purpose: values.purpose === "other" ? customPurpose.trim() : values.purpose,
    });
  }

  return (
    <>
      <form
        ref={formRef}
        className="credit-form"
        aria-label={t("application.formLabel")}
        onSubmit={submit}
        noValidate
      >
        {Object.keys(errors).length > 0 && (
          <Alert
            tone="negative"
            title={t("application.validation.title")}
            role="alert"
          >
            {t("application.validation.description")}
          </Alert>
        )}
        {confirmed && (
          <Alert
            tone="positive"
            title={t("application.confirmed.title")}
            role="status"
          >
            {t("application.confirmed.description")}
          </Alert>
        )}
        {submitError && <Alert tone="negative" title={t("application.apiErrorTitle")} role="alert">{t("application.apiErrorDescription")}</Alert>}
        {availableCompanies && availableCompanies.length === 0 && <Alert tone="attention" title={t("application.companyUnavailableTitle")}>{t("application.companyUnavailableDescription")}</Alert>}
        {hasCreditProducts === false && <Alert tone="attention" title={t("application.productUnavailableTitle")}>{t("application.productUnavailableDescription")}</Alert>}
        {availableCompanies ? <SelectField
          name="company"
          label={t("application.fields.company")}
          value={availableCompanies.find((item) => item.inn === values.inn)?.id ?? ""}
          onChange={(event) => selectCompany(event.target.value)}
          required
          error={fieldError("company")}
        >
          <option value="">{t("application.companySelectPlaceholder")}</option>
          {availableCompanies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.inn}</option>)}
        </SelectField> : <TextField
          name="company"
          label={t("application.fields.company")}
          value={values.company}
          onChange={(event) => change("company", event.target.value)}
          required
          maxLength={CREDIT_INPUT_LIMITS.company}
          error={fieldError("company")}
          autoComplete="off"
        />}
        {!availableCompanies && <TextField
          name="inn"
          label={t("application.fields.inn")}
          value={values.inn}
          onChange={(event) => change("inn", event.target.value)}
          required
          maxLength={Math.max(CREDIT_INPUT_LIMITS.legalInnDigits, CREDIT_INPUT_LIMITS.soleInnDigits)}
          inputMode="numeric"
          error={fieldError("inn")}
          autoComplete="off"
        />}
        <div className="credit-form__row">
          <TextField
            name="amount"
            label={t("application.fields.amount")}
            value={values.amount}
            onChange={(event) => change("amount", event.target.value)}
            required
            inputMode="decimal"
            error={fieldError("amount")}
            autoComplete="off"
          />
          {selectedProduct && <TextField
            name="termMonths"
            label={t("application.fields.termMonths")}
            hint={t("application.hints.termMonths", { min: selectedProduct.minTermMonths, max: selectedProduct.maxTermMonths ?? selectedProduct.minTermMonths })}
            value={values.termMonths ?? ""}
            onChange={(event) => change("termMonths", event.target.value)}
            required
            inputMode="numeric"
            error={fieldError("termMonths")}
          />}
        </div>
        {availableProducts && availableProducts.length > 0 && (
          <SelectField
            name="product"
            label={t("application.fields.product")}
            value={selectedProductId}
            onChange={(event) => selectProduct(event.target.value)}
            required
          >
            {availableProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </SelectField>
        )}
        {onConfirm ? (
          <SelectField
            name="purpose"
            label={t("application.fields.purpose")}
            required
            value={values.purpose}
            onChange={(event) => selectPurpose(event.target.value)}
            error={values.purpose === "other" ? undefined : purposeError}
          >
            <option value="">{t("application.purposes.placeholder")}</option>
            <option value="working_capital">
              {t("application.purposes.workingCapital")}
            </option>
            <option value="equipment">
              {t("application.purposes.equipment")}
            </option>
            <option value="refinance">
              {t("application.purposes.refinance")}
            </option>
            <option value="other">{t("application.purposes.other")}</option>
          </SelectField>
        ) : (
          <TextField
            name="purpose"
            label={t("application.fields.purpose")}
            value={values.purpose}
            onChange={(event) => change("purpose", event.target.value)}
            required
            error={purposeError}
            autoComplete="off"
          />
        )}
        {onConfirm && values.purpose === "other" && (
          <TextField
            name="customPurpose"
            label={t("application.fields.customPurpose")}
            value={customPurpose}
            onChange={(event) => {
              setCustomPurpose(event.target.value);
              setConfirmed(false);
            }}
            required
            maxLength={255}
            error={fieldError("purpose")}
            autoComplete="off"
          />
        )}
        <div className="credit-form__footer">
          <Button type="submit" icon={<Icon name="arrow" />}>
            {t("application.actions.check")}
          </Button>
        </div>
      </form>
      <Modal
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={t("application.confirm.title")}
        description={t("application.confirm.description")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              {t("application.actions.back")}
            </Button>
            <Button
              loading={submitting}
              disabled={!onConfirm || (availableCompanies !== undefined && availableCompanies.length === 0) || hasCreditProducts === false}
              onClick={() => {
                if (!confirmation) return;
                setSubmitting(true);
                setSubmitError(false);
                if (!onConfirm) return;
                void onConfirm(confirmation, selectedProductId || undefined).then(() => {
                  setConfirmation(null);
                  setConfirmed(true);
                }).catch(() => setSubmitError(true)).finally(() => setSubmitting(false));
              }}
            >
              {t("application.actions.confirm")}
            </Button>
          </>
        }
      >
        {confirmation && (
          <dl className="credit-summary">
            <div>
              <dt>{t("application.summary.company")}</dt>
              <dd>{confirmation.company}</dd>
            </div>
            <div>
              <dt>{t("application.summary.amount")}</dt>
              <dd>{confirmation.amount}</dd>
            </div>
            <div>
              <dt>{t("application.summary.inn")}</dt>
              <dd>{confirmation.inn}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </>
  );
}
