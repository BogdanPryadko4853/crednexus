import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Icon,
  Modal,
  SelectField,
  TextareaField,
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
import type { CompanyOption } from "../../api/creditApplicationApi";
import "./CreditRequestForm.css";

type CreditRequestFormProps = {
  availableCompanies?: CompanyOption[];
  hasCreditProducts?: boolean;
  onConfirm?: (values: CreditRequest) => Promise<void>;
};

export function CreditRequestForm({ availableCompanies, hasCreditProducts, onConfirm }: CreditRequestFormProps = {}) {
  const { t } = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(createEmptyCreditRequest);
  const [errors, setErrors] = useState<CreditRequestErrors>({});
  const [confirmation, setConfirmation] = useState<CreditRequest | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const messageValues = {
    legalDigits: CREDIT_INPUT_LIMITS.legalInnDigits,
    soleDigits: CREDIT_INPUT_LIMITS.soleInnDigits,
    fractionDigits: CREDIT_INPUT_LIMITS.amountFractionDigits,
  };
  const fieldError = (field: keyof CreditRequest) =>
    errors[field] ? t(errors[field], messageValues) : undefined;

  function change(field: keyof CreditRequest, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setConfirmed(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateCreditRequest(values);
    setErrors(nextErrors);
    setConfirmed(false);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const field = formRef.current?.elements.namedItem(firstError);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setConfirmation({ ...values });
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
        <TextField
          name="company"
          label={t("application.fields.company")}
          value={values.company}
          onChange={(event) => change("company", event.target.value)}
          required
          maxLength={CREDIT_INPUT_LIMITS.company}
          error={fieldError("company")}
          autoComplete="off"
        />
        <div className="credit-form__row">
          <TextField
            name="inn"
            label={t("application.fields.inn")}
            value={values.inn}
            onChange={(event) => change("inn", event.target.value)}
            required
            maxLength={Math.max(
              CREDIT_INPUT_LIMITS.legalInnDigits,
              CREDIT_INPUT_LIMITS.soleInnDigits,
            )}
            inputMode="numeric"
            error={fieldError("inn")}
            autoComplete="off"
          />
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
        </div>
        <SelectField
          name="purpose"
          label={t("application.fields.purpose")}
          value={values.purpose}
          onChange={(event) => change("purpose", event.target.value)}
          required
          error={fieldError("purpose")}
        >
          <option value="">{t("application.purposes.placeholder")}</option>
          <option value="working-capital">{t("application.purposes.workingCapital")}</option>
          <option value="equipment">{t("application.purposes.equipment")}</option>
        </SelectField>
        <TextareaField
          name="comment"
          label={t("application.fields.comment")}
          placeholder={t("application.placeholders.comment")}
          hint={t("application.hints.comment", {
            maxLength: CREDIT_INPUT_LIMITS.comment,
          })}
          maxLength={CREDIT_INPUT_LIMITS.comment}
          value={values.comment}
          onChange={(event) => change("comment", event.target.value)}
        />
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
              disabled={(availableCompanies !== undefined && availableCompanies.length === 0) || hasCreditProducts === false}
              onClick={() => {
                if (!confirmation) return;
                setSubmitting(true);
                setSubmitError(false);
                void (onConfirm ? onConfirm(confirmation) : Promise.resolve()).then(() => {
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
