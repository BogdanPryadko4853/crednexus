import { Card, Heading, Text } from "../../../../components";
import { useAuth } from "../../../../auth";
import { useLocale } from "../../../../i18n";
import type { MessageKey } from "../../../../i18n";
import "./ProfilePage.css";

const roleKeys: Record<string, MessageKey | undefined> = {
  ADMIN: "profile.roles.admin",
  BANK_EMPLOYEE: "profile.roles.employee",
  CLIENT: "profile.roles.client",
};

export function ProfilePage() {
  const { state } = useAuth();
  const { t } = useLocale();
  if (state.status !== "authenticated") return null;
  const { user } = state;
  return (
    <section className="cabinet-page">
      <div className="cabinet-page__heading">
        <Heading level={1}>{t("profile.title")}</Heading>
        <Text muted>{t("profile.description")}</Text>
      </div>
      <Card>
        <dl className="profile-details">
          <div>
            <dt>{t("profile.fullName")}</dt>
            <dd>{user.fullName}</dd>
          </div>
          <div>
            <dt>{t("profile.email")}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{t("profile.roles")}</dt>
            <dd>
              {user.roles.length > 0
                ? user.roles
                    .map((role) => (roleKeys[role] ? t(roleKeys[role]) : role))
                    .join(", ")
                : t("profile.noRoles")}
            </dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}
