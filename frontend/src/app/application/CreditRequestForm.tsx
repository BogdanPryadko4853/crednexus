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
} from "../../components";

type RequestValues = {
  company: string;
  inn: string;
  amount: string;
  purpose: string;
  comment: string;
};
type RequestErrors = Partial<Record<keyof RequestValues, string>>;

export function CreditRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<RequestValues>({
    company: "",
    inn: "",
    amount: "",
    purpose: "",
    comment: "",
  });
  const [errors, setErrors] = useState<RequestErrors>({});
  const [preview, setPreview] = useState<RequestValues | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: RequestErrors = {};
    if (!values.company.trim())
      nextErrors.company = "Укажите название компании";
    if (!/^\d{10}(\d{2})?$/.test(values.inn))
      nextErrors.inn = "Введите 10 или 12 цифр ИНН";
    const amount = values.amount.replace(/\s/g, "");
    if (!/^\d{1,17}([.,]\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount))
      nextErrors.amount =
        "Введите сумму больше нуля, не более двух знаков после запятой";
    if (!values.purpose) nextErrors.purpose = "Выберите цель финансирования";
    setErrors(nextErrors);
    setConfirmed(false);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const field = formRef.current?.elements.namedItem(firstError);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setPreview({ ...values });
  }

  return (
    <>
      <form
        ref={formRef}
        className="credit-form"
        aria-label="Параметры финансирования"
        onSubmit={submit}
        noValidate
      >
        {Object.keys(errors).length > 0 && (
          <Alert
            tone="negative"
            title="Проверьте заполнение полей"
            role="alert"
          >
            Исправьте отмеченные значения и повторите проверку.
          </Alert>
        )}
        {confirmed && (
          <Alert tone="positive" title="Данные подтверждены" role="status">
            Проверка заполнения формы завершена.
          </Alert>
        )}
        <TextField
          name="company"
          label="Название компании"
          value={values.company}
          onChange={(event) =>
            setValues({ ...values, company: event.target.value })
          }
          required
          maxLength={255}
          error={errors.company}
          autoComplete="off"
        />
        <div className="credit-form__row">
          <TextField
            name="inn"
            label="ИНН компании"
            value={values.inn}
            onChange={(event) =>
              setValues({ ...values, inn: event.target.value })
            }
            required
            maxLength={12}
            inputMode="numeric"
            hint="10 цифр для юридического лица или 12 цифр для ИП"
            error={errors.inn}
            autoComplete="off"
          />
          <TextField
            name="amount"
            label="Сумма кредита, ₽"
            value={values.amount}
            onChange={(event) =>
              setValues({ ...values, amount: event.target.value })
            }
            required
            inputMode="decimal"
            error={errors.amount}
            autoComplete="off"
          />
        </div>
        <SelectField
          name="purpose"
          label="Цель финансирования"
          required
          value={values.purpose}
          onChange={(event) =>
            setValues({ ...values, purpose: event.target.value })
          }
          error={errors.purpose}
        >
          <option value="">Выберите цель</option>
          <option value="working-capital">Пополнение оборотных средств</option>
          <option value="equipment">Покупка оборудования</option>
        </SelectField>
        <TextareaField
          name="comment"
          label="Комментарий"
          placeholder="Например, закупка материалов к новому сезону"
          hint="Необязательное поле · до 500 символов"
          maxLength={500}
          value={values.comment}
          onChange={(event) =>
            setValues({ ...values, comment: event.target.value })
          }
        />
        <div className="credit-form__footer">
          <Button type="submit" icon={<Icon name="arrow" />}>
            Проверить данные
          </Button>
        </div>
      </form>
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title="Подтверждение данных"
        description="Проверьте сведения перед подтверждением."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Вернуться
            </Button>
            <Button
              onClick={() => {
                setPreview(null);
                setConfirmed(true);
              }}
            >
              Подтвердить
            </Button>
          </>
        }
      >
        {preview && (
          <dl className="credit-summary">
            <div>
              <dt>Компания</dt>
              <dd>{preview.company}</dd>
            </div>
            <div>
              <dt>Сумма, ₽</dt>
              <dd>{preview.amount}</dd>
            </div>
            <div>
              <dt>ИНН</dt>
              <dd>{preview.inn}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </>
  );
}
