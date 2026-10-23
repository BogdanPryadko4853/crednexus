import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth";
import { ApiError } from "../../api/httpClient";
import { validateResource } from "./validateResource";
import type { ApplicationHistory, CreditDecision, DocumentResponse, FinancialSnapshot, Fulfillment, InformationRequest, LoanApplicationResponse, VerificationResult } from "../../features/credit-application/api/creditApplicationApi";

type Resources = {
  application: LoanApplicationResponse | null;
  requests: InformationRequest[];
  documents: DocumentResponse[];
  decision: CreditDecision | null;
  fulfillment: Fulfillment | null;
  verifications: VerificationResult[];
  financial: FinancialSnapshot | null;
  history: ApplicationHistory[];
};
type Resource = keyof Resources;
const initial: Resources = { application: null, requests: [], documents: [], decision: null, fulfillment: null, verifications: [], financial: null, history: [] };
const paths: Record<Resource, string> = { application: "", requests: "/information-requests", documents: "/documents", decision: "/decision", fulfillment: "/fulfillment", verifications: "/verifications", financial: "/financial-snapshot", history: "/history" };

export function useApplicationData(id: string | undefined, section: string, paused: boolean) {
  const { api } = useAuth();
  const [data, setData] = useState<Resources>(initial);
  const [errors, setErrors] = useState<Partial<Record<Resource, number>>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const pending = useRef<Resource[] | null>(null);
  const activeRequest = useRef(false);
  const reload = useCallback((resources?: Resource[]) => {
    pending.current = resources ?? null;
    setRevision((value) => value + 1);
  }, []);
  const setResource = useCallback(<K extends Resource>(key: K, value: Resources[K] | ((current: Resources[K]) => Resources[K])) => {
    setData((current) => ({ ...current, [key]: typeof value === "function" ? (value as (current: Resources[K]) => Resources[K])(current[key]) : value }));
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true;
    activeRequest.current = true;
    setRefreshing(true);
    const targets = pending.current ?? Object.keys(paths) as Resource[];
    pending.current = null;
    async function fetchResource(key: Resource) {
      try {
        const value = await api.request<Resources[typeof key]>(`/loan-applications/${id}${paths[key]}`, { signal: controller.signal });
        validateResource(key, value);
        if (!active) return;
        setData((current) => ({ ...current, [key]: value }));
        setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
      } catch (error) {
        if (!active) return;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 404 && ["decision", "financial", "fulfillment"].includes(key)) {
          setData((current) => ({ ...current, [key]: null }));
          setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
        } else setErrors((current) => ({ ...current, [key]: status }));
      }
    }
    void Promise.all(targets.map(fetchResource)).finally(() => {
      if (active) { setLoaded(true); setRefreshing(false); activeRequest.current = false; }
    });
    return () => { active = false; activeRequest.current = false; controller.abort(); };
  }, [api, id, revision]);

  useEffect(() => {
    const status = data.application?.status;
    if (!loaded || !status || ["DRAFT", "DISBURSED", "DECLINED", "REJECTED", "EXPIRED"].includes(status)) return;
    const timer = window.setInterval(() => {
      if (paused || document.hidden || activeRequest.current) return;
      const resources: Resource[] = ["application"];
      if (status === "NEEDS_INFO" || section === "application-documents") resources.push("requests", "documents");
      if (["OFFERED", "SCORING", "MANUAL_REVIEW"].includes(status) || section === "application-decision") resources.push("decision");
      if (section === "application-review") resources.push("verifications", "history");
      if (["ACCEPTED", "AGREEMENT_PENDING"].includes(status)) resources.push("fulfillment");
      reload(resources.filter((key) => errors[key] === undefined));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [data.application?.status, loaded, section, paused, reload, errors]);

  return { data, setResource, errors, loaded, refreshing, reload };
}
