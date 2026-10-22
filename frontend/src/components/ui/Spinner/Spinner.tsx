import { useLocale } from "../../../i18n";
import "./Spinner.css";
export function Spinner({ label }: { label?: string }) {
  const { t } = useLocale();
  return (
    <span className="ui-spinner" role="status">
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </span>
  );
}
