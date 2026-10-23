import { Text } from "../../components";
import { useLocale } from "../../i18n";
import type { MessageKey } from "../../i18n";
export const applicationSections = [
  { id: "application-summary", key: "summary" },
  { id: "application-financial", key: "financial" },
  { id: "application-documents", key: "documents" },
  { id: "application-review", key: "review" },
  { id: "application-decision", key: "decision" },
  { id: "application-fulfillment", key: "fulfillment" },
] as const;


export function ApplicationNavigation({selectedSection, setSelectedSection, completedSections}: {selectedSection:string;setSelectedSection:(section:string)=>void;completedSections:Set<string>}) {
 const {t}=useLocale(); return (      <nav className="application-section-nav" aria-label={t("application.workflowTitle")}>
        <div className="application-section-nav__heading">
          <div>
            <Text muted>{t("application.workflowTitle")}</Text>
            <p>{t("application.workflowDescription")}</p>
          </div>
          <span className="application-section-nav__hint">{t("application.workflowHint")}</span>
        </div>
        <ol role="tablist" aria-label={t("application.workflowTitle")}>
          {applicationSections.map((section, index) => (
            <li key={section.id}>
              <button type="button" role="tab" id={`${section.id}-tab`}
                className={completedSections.has(section.id) ? "is-complete" : undefined}
                aria-selected={selectedSection === section.id} aria-controls={`${section.id}-panel`}
                tabIndex={selectedSection === section.id ? 0 : -1}
                onKeyDown={(event) => {
                  const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  const target = event.key === "Home" ? applicationSections[0] : event.key === "End" ? applicationSections[applicationSections.length - 1] : offset ? applicationSections[(index + offset + applicationSections.length) % applicationSections.length] : null;
                  if (!target) return;
                  event.preventDefault();
                  setSelectedSection(target.id);
                  window.document.getElementById(`${target.id}-tab`)?.focus();
                }}
                onClick={() => setSelectedSection(section.id)}>
                <span aria-hidden="true">{completedSections.has(section.id) ? "✓" : index + 1}</span>
                {t(`application.workflow.${section.key}` as MessageKey)}
              </button>
            </li>
          ))}
        </ol>
      </nav>);
}
