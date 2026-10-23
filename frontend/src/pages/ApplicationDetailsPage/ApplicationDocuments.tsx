import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Alert, Button, Card, SelectField, StatusBadge, Text, TextField } from "../../components";
import {useLocale} from "../../i18n";
import type {MessageKey} from "../../i18n";
import { workflowText } from "../../features/credit-application/ui/workflowText";
import type {InformationRequest,DocumentResponse} from "../../features/credit-application/api/creditApplicationApi";
type Props={informationRequests:InformationRequest[];documents:DocumentResponse[];answer:Record<string,string>;setAnswer:Dispatch<SetStateAction<Record<string,string>>>;busy:boolean;requestDocumentId:string;setRequestDocumentId:(id:string)=>void;loaded:boolean;resourceErrors:string[];answerRequest:(request:InformationRequest)=>Promise<void>;download:(document:DocumentResponse)=>Promise<void>;upload:(file:File)=>Promise<void>};
export function ApplicationDocuments({informationRequests,documents,answer,setAnswer,busy,requestDocumentId,setRequestDocumentId,loaded,resourceErrors,answerRequest,download,upload}:Props){
const {t,locale}=useLocale(); const text=workflowText[locale]; const [fileError,setFileError]=useState(false);
return <>      {informationRequests.length > 0 && (
        <Card id="application-documents" title={t("application.requestsTitle")}>
          <div className="application-requests">
            {informationRequests.map((request) => (
              <div className="application-request" key={request.id}>
                <strong>{request.question}</strong>
                {request.answer && <Text>{request.answer}</Text>}
                {request.status === "OPEN" &&
                  (request.requiresDocument ? (
                    <>
                      <Text muted>{text.documentRequired}</Text>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRequestDocumentId(request.id);
                          window.document
                            .getElementById("document-upload")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                        }}
                      >
                        {t("application.documentsTitle")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <TextField
                        name={`answer-${request.id}`}
                        label={t("application.answerLabel")}
                        value={answer[request.id] ?? ""}
                        onChange={(event) =>
                          setAnswer((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        size="sm"
                        loading={busy}
                        disabled={!answer[request.id]?.trim()}
                        onClick={() => void answerRequest(request)}
                      >
                        {t("application.answerAction")}
                      </Button>
                    </>
                  ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title={t("application.documentsTitle")}>
        <SelectField
          name="informationRequestDocument"
          label={t("application.documentRequest")}
          value={requestDocumentId}
          onChange={(event) => setRequestDocumentId(event.target.value)}
        >
          <option value="">{t("application.documentGeneral")}</option>
          {informationRequests
            .filter((item) => item.status === "OPEN" && item.requiresDocument)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.question}
              </option>
            ))}
        </SelectField>
        <Text muted>{text.fileHint}</Text>
        {fileError && <Alert tone="negative" title={text.fileError} />}
        <div className="application-document-upload" id="document-upload">
          <input
            aria-label={t("application.documentsTitle")}
            disabled={busy}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (
                !["application/pdf", "image/png", "image/jpeg"].includes(
                  file.type,
                ) ||
                file.size <= 0 ||
                file.size > 10 * 1024 * 1024
              ) {
                setFileError(true);
                return;
              }
              setFileError(false);
              void upload(file);
            }}
          />
        </div>
        {loaded &&
          !resourceErrors.includes("documents") &&
          documents.length === 0 && (
            <Text muted>{t("application.documentsEmpty")}</Text>
          )}
        {documents.length > 0 && (
          <ul className="application-document-list">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  className="application-document-link"
                  type="button"
                  onClick={() => void download(document)}
                >
                  {document.fileName}
                </button>
                <StatusBadge tone="neutral">
                  {t(
                    `application.documentStatus.${document.status}` as MessageKey,
                  )}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>
</>;
}
