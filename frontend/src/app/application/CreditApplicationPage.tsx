import { Card, Heading, Icon, Text } from "../../components";
import { CreditRequestForm } from "./CreditRequestForm";
import "./application.css";

export function CreditApplicationPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <header className="credit-header">
        <div className="credit-header__inner">
          <a
            className="credit-brand"
            href="#main"
            aria-label="CredNexus, к началу"
          >
            <span className="credit-brand__mark" aria-hidden="true">
              C
            </span>
            CredNexus
          </a>
          <span className="credit-header__label">Кредитный кабинет</span>
        </div>
      </header>
      <main className="credit-page" id="main">
        <div className="credit-page__heading">
          <p className="credit-eyebrow">Кредитование бизнеса</p>
          <Heading level={1} size="xl">
            Заявка на финансирование
          </Heading>
          <Text size="lg" muted>
            Укажите сведения о компании и параметры кредита.
          </Text>
        </div>
        <div className="credit-page__columns">
          <Card
            title="Компания и параметры кредита"
            subtitle="Обязательные поля отмечены *"
          >
            <CreditRequestForm />
          </Card>
          <aside
            className="credit-page__aside"
            aria-label="Информация о заявке"
          >
            <Card title="Сведения для заявки">
              <ul className="credit-requirements">
                <li>
                  <Icon name="company" />
                  <div>
                    <strong>Компания</strong>
                    <Text size="sm" muted>
                      Название и ИНН юридического лица или ИП.
                    </Text>
                  </div>
                </li>
                <li>
                  <Icon name="file" />
                  <div>
                    <strong>Финансирование</strong>
                    <Text size="sm" muted>
                      Запрашиваемая сумма и цель использования средств.
                    </Text>
                  </div>
                </li>
                <li>
                  <Icon name="check" />
                  <div>
                    <strong>Проверка заполнения</strong>
                    <Text size="sm" muted>
                      Проверьте введённые сведения перед подтверждением.
                    </Text>
                  </div>
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </main>
      <footer className="credit-footer">
        <span>CredNexus</span>
        <span>Кредитный кабинет предпринимателя</span>
      </footer>
    </>
  );
}
