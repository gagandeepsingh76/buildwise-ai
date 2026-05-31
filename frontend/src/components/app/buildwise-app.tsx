"use client";

import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bookmark,
  Building2,
  ChevronDown,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  FileSearch,
  FileText,
  Filter,
  Globe2,
  History,
  Layers3,
  Link2,
  Loader2,
  Menu as MenuIcon,
  MapPinned,
  MessageSquareText,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { LanguageToggle } from "@/components/app/language-toggle";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  askBuildWise,
  deleteAdminDocument,
  getAdminDocument,
  getAdminDocumentFile,
  getAdminDocuments,
  getAuthorities,
  getDocuments,
  getHistory,
  reindexAdminDocument,
  searchDocuments,
  sendFeedback,
  uploadDocument,
} from "@/lib/api";
import { t, translations } from "@/lib/i18n";
import type { AdminDocumentDetail, AskResponse, Authority, DocumentRecord, HistoryItem, Language, SourceReference, WizardContext } from "@/lib/types";
import { cn, decisionLabel, formatConfidence, formatDate, formatDecision, formatFileSize, truncateMiddle } from "@/lib/utils";

const NONE = "__none";

const fallbackAuthorities: Authority[] = [
  {
    id: "kda-kanpur",
    name: "Kanpur Development Authority",
    short_name: "KDA",
    city: "Kanpur",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["kanpur", "kda"],
    jurisdiction_notes: "Kanpur Development Authority planning area.",
    official_website: "https://www.kdaindia.co.in/",
    permit_portal: "https://erpkda.in/",
    forms_url: "https://www.kdaindia.co.in/",
    bylaws_url: "https://www.kdaindia.co.in/",
    tags: ["building-plan", "uttar-pradesh"],
  },
  {
    id: "lda-lucknow",
    name: "Lucknow Development Authority",
    short_name: "LDA",
    city: "Lucknow",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["lucknow", "lda"],
    jurisdiction_notes: "Lucknow Development Authority planning area.",
    official_website: "https://www.ldalucknow.in/",
    permit_portal: "https://map.up.gov.in/",
    forms_url: "https://www.ldalucknow.in/downloads-order/",
    bylaws_url: "https://www.ldalucknow.in/downloads-order/",
    tags: ["building-plan", "uttar-pradesh"],
  },
  {
    id: "dda-delhi",
    name: "Delhi Development Authority / Municipal Corporation of Delhi",
    short_name: "DDA/MCD",
    city: "Delhi",
    state: "Delhi",
    country: "India",
    aliases: ["delhi", "dda", "mcd"],
    jurisdiction_notes: "DDA planning context with MCD approval workflows.",
    official_website: "https://dda.gov.in/",
    permit_portal: "https://eodb.mcd.gov.in/",
    forms_url: "https://dda.gov.in/building-laws",
    bylaws_url: "https://dda.gov.in/building-laws",
    tags: ["ubbl", "building-bye-laws"],
  },
  {
    id: "bbmp-bengaluru",
    name: "Greater Bengaluru Authority / BBMP with BDA context",
    short_name: "BBMP/BDA",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    aliases: ["bengaluru", "bangalore", "bbmp", "bda"],
    jurisdiction_notes: "Bengaluru municipal approval context.",
    official_website: "https://bbmp.gov.in/",
    permit_portal: "https://bpas.bbmpgov.in/",
    forms_url: "https://bbmp.gov.in/",
    bylaws_url: "https://bbmp.gov.in/",
    tags: ["bpas", "building-plan"],
  },
  {
    id: "bmc-mumbai",
    name: "Brihanmumbai Municipal Corporation",
    short_name: "BMC/MCGM",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    aliases: ["mumbai", "bmc", "mcgm"],
    jurisdiction_notes: "Mumbai building proposal approval context.",
    official_website: "https://www.mcgm.gov.in/",
    permit_portal: "https://www.mcgm.gov.in/irj/portal/anonymous/qlcedeveplan",
    forms_url: "https://www.mcgm.gov.in/",
    bylaws_url: "https://www.mcgm.gov.in/",
    tags: ["building-proposal", "maharashtra"],
  },
  {
    id: "gda-ghaziabad",
    name: "Ghaziabad Development Authority",
    short_name: "GDA",
    city: "Ghaziabad",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["ghaziabad", "gda"],
    jurisdiction_notes: "Ghaziabad Development Authority planning area.",
    official_website: "https://gdaghaziabad.in/",
    permit_portal: "https://gdaghaziabad.in/",
    forms_url: "https://gdaghaziabad.in/",
    bylaws_url: "https://gdaghaziabad.in/",
    tags: ["layout", "building-plan"],
  },
  {
    id: "noida-authority",
    name: "New Okhla Industrial Development Authority",
    short_name: "NOIDA Authority",
    city: "Noida",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["noida", "noida authority"],
    jurisdiction_notes: "Noida Authority sectors and notified areas.",
    official_website: "https://noidaauthorityonline.in/",
    permit_portal: "https://buildingcell.noidaauthorityonline.com/",
    forms_url: "https://noidaauthorityonline.in/",
    bylaws_url: "https://noidaauthorityonline.in/",
    tags: ["building-cell", "obpas"],
  },
];

const sampleQueries = {
  en: [
    "Can I build a roof garden in Kanpur?",
    "What approvals are needed for a G+2 residential building in Lucknow?",
    "Can I convert residential property into commercial use in Delhi?",
  ],
  hi: [
    "क्या मैं कानपुर में अपने घर की छत पर गार्डन बना सकता हूं?",
    "लखनऊ में G+2 आवासीय भवन के लिए कौन सी स्वीकृतियां चाहिए?",
    "दिल्ली में आवासीय संपत्ति को व्यावसायिक उपयोग में बदल सकते हैं?",
  ],
};

type TranslationKey = keyof typeof translations.en;

const answerSections: Array<{ key: keyof AskResponse["answer"]; label: TranslationKey; icon: typeof CheckCircle2 }> = [
  { key: "required_approvals", label: "approvals", icon: ClipboardCheck },
  { key: "required_documents", label: "documents", icon: FileText },
  { key: "relevant_restrictions", label: "restrictions", icon: AlertTriangle },
  { key: "far_height_setback_notes", label: "far", icon: Scale },
  { key: "inspection_requirements", label: "inspections", icon: ShieldCheck },
  { key: "risks_common_mistakes", label: "risks", icon: AlertTriangle },
  { key: "suggested_next_steps", label: "nextSteps", icon: ArrowRight },
  { key: "assumptions_uncertainty_notes", label: "uncertainty", icon: FileSearch },
];

function usePersistedLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem("buildwise-language") as Language | null;
    return stored === "en" || stored === "hi" ? stored : "en";
  });

  const updateLanguage = (next: Language) => {
    setLanguage(next);
    window.localStorage.setItem("buildwise-language", next);
    document.documentElement.lang = next === "hi" ? "hi" : "en";
  };

  return [language, updateLanguage] as const;
}

function cleanWizardContext(wizard: WizardContext) {
  return Object.fromEntries(
    Object.entries(wizard).filter(([, value]) => value !== undefined && value !== "" && value !== NONE),
  ) as WizardContext;
}

export function BuildWiseApp() {
  const [language, setLanguage] = usePersistedLanguage();
  const [authorities, setAuthorities] = useState<Authority[]>(fallbackAuthorities);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<AskResponse[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem("buildwise-bookmarks");
    if (!stored) return [];
    try {
      return JSON.parse(stored) as AskResponse[];
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState(sampleQueries.en[0]);
  const [wizard, setWizard] = useState<WizardContext>({ city: "Kanpur", state: "Uttar Pradesh", authority_id: "kda-kanpur" });
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentAuthorityFilter, setDocumentAuthorityFilter] = useState(NONE);
  const [documentTypeFilter, setDocumentTypeFilter] = useState(NONE);
  const [documentStatusFilter, setDocumentStatusFilter] = useState(NONE);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentDetail, setDocumentDetail] = useState<AdminDocumentDetail | null>(null);
  const [documentDetailLoading, setDocumentDetailLoading] = useState(false);
  const [documentActionLoading, setDocumentActionLoading] = useState<string | null>(null);
  const [deleteCandidateIds, setDeleteCandidateIds] = useState<string[]>([]);
  const [previewDocument, setPreviewDocument] = useState<DocumentRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState("roof garden structural approval");
  const [docSearchResults, setDocSearchResults] = useState<SourceReference[]>([]);
  const [docSearching, setDocSearching] = useState(false);
  const [compareA, setCompareA] = useState("kda-kanpur");
  const [compareB, setCompareB] = useState("dda-delhi");
  const [activeSection, setActiveSection] = useState("assistant");
  const [shouldScrollToResult, setShouldScrollToResult] = useState(false);
  const [resultHighlighted, setResultHighlighted] = useState(false);
  const [resultInView, setResultInView] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultSectionRef = useRef<HTMLDivElement>(null);

  const copy = (key: TranslationKey) => t(language, key);

  useEffect(() => {
    Promise.allSettled([getAuthorities(), getDocuments(), getHistory()]).then(([authorityResult, docsResult, historyResult]) => {
      if (authorityResult.status === "fulfilled" && authorityResult.value.length) setAuthorities(authorityResult.value);
      if (docsResult.status === "fulfilled") setDocuments(docsResult.value);
      if (historyResult.status === "fulfilled") setHistory(historyResult.value);
      if ([authorityResult, docsResult, historyResult].some((result) => result.status === "rejected")) {
        setSystemNotice("Live backend data could not fully load. Showing available local data until the API responds.");
      }
      setInitializing(false);
    });
  }, []);

  useEffect(() => {
    const sectionIds = ["assistant", "authorities", "admin"];
    const updateActiveSection = () => {
      let currentSection = sectionIds[0];
      sectionIds.forEach((sectionId) => {
        const section = document.getElementById(sectionId);
        if (section && section.getBoundingClientRect().top <= 120) {
          currentSection = sectionId;
        }
      });
      setActiveSection(currentSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    window.addEventListener("hashchange", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, []);

  useEffect(() => {
    const resultSection = resultSectionRef.current;
    if (!resultSection) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setResultInView(entry.isIntersecting);
      },
      { rootMargin: "-72px 0px -35% 0px", threshold: 0.2 },
    );

    observer.observe(resultSection);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldScrollToResult || loading || !answer) return;

    const timeout = window.setTimeout(() => {
      const resultSection = resultSectionRef.current;
      if (!resultSection) return;

      resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
      resultSection.focus({ preventScroll: true });
      setResultHighlighted(true);
      setShouldScrollToResult(false);

      window.setTimeout(() => setResultHighlighted(false), 1800);
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [answer, loading, shouldScrollToResult]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedAuthority = authorities.find((item) => item.id === wizard.authority_id);
  const compareLeft = authorities.find((item) => item.id === compareA);
  const compareRight = authorities.find((item) => item.id === compareB);
  const authorityNameById = useMemo(
    () => Object.fromEntries(authorities.map((authority) => [authority.id, authority.short_name || authority.name])),
    [authorities],
  );
  const documentTypes = useMemo(
    () => Array.from(new Set(documents.map((document) => document.document_type).filter(Boolean))).sort(),
    [documents],
  );
  const documentStatuses = useMemo(
    () => Array.from(new Set(documents.map((document) => document.status).filter(Boolean))).sort(),
    [documents],
  );
  const filteredDocuments = useMemo(() => {
    const needle = documentSearch.trim().toLowerCase();
    return documents.filter((document) => {
      const authorityName = authorityNameById[document.authority_id] || document.authority_id;
      const matchesSearch = !needle
        || document.title.toLowerCase().includes(needle)
        || authorityName.toLowerCase().includes(needle)
        || document.authority_id.toLowerCase().includes(needle)
        || document.city.toLowerCase().includes(needle)
        || document.tags.join(" ").toLowerCase().includes(needle);
      const matchesAuthority = documentAuthorityFilter === NONE || document.authority_id === documentAuthorityFilter;
      const matchesType = documentTypeFilter === NONE || document.document_type === documentTypeFilter;
      const matchesStatus = documentStatusFilter === NONE || document.status === documentStatusFilter;
      return matchesSearch && matchesAuthority && matchesType && matchesStatus;
    });
  }, [authorityNameById, documentAuthorityFilter, documentSearch, documentStatusFilter, documentTypeFilter, documents]);

  const checklist = useMemo(() => {
    const base = [
      selectedAuthority ? `Authority: ${selectedAuthority.short_name} (${selectedAuthority.city})` : "Confirm authority",
      wizard.project_type ? `Project: ${wizard.project_type}` : "Confirm project type",
      wizard.property_type ? `Property: ${wizard.property_type}` : "Confirm property type",
      wizard.plot_size_sqm ? `Plot size: ${wizard.plot_size_sqm} sqm` : "Add plot size",
      wizard.road_width_m ? `Road width: ${wizard.road_width_m} m` : "Add road width",
    ];
    const answerItems = answer?.answer.suggested_next_steps ?? [];
    return [...base, ...answerItems].slice(0, 10);
  }, [answer, selectedAuthority, wizard]);

  async function handleAsk(event?: FormEvent) {
    event?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const response = await askBuildWise({
        query,
        language,
        session_id: sessionId,
        context: cleanWizardContext(wizard),
      });
      setAnswer(response);
      setSessionId(response.session_id);
      setHistory((current) => [
        {
          id: response.query_id,
          session_id: response.session_id,
          query,
          language,
          detected: response.detected,
          answer: response.answer,
          sources: response.sources,
          confidence: response.answer.confidence_indicator === "High" ? 0.85 : response.answer.confidence_indicator === "Medium" ? 0.55 : 0.2,
          created_at: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 12));
      setShouldScrollToResult(true);
      toast.success(copy("analysisComplete"));
    } catch (error) {
      setShouldScrollToResult(false);
      toast.error(error instanceof Error ? error.message : "Unable to reach the compliance API.");
    } finally {
      setLoading(false);
    }
  }

  function updateWizard<K extends keyof WizardContext>(key: K, value: WizardContext[K] | typeof NONE) {
    if (key === "authority_id") {
      const authority = authorities.find((item) => item.id === value);
      setWizard((current) => ({
        ...current,
        authority_id: value === NONE ? undefined : (value as string),
        city: authority?.city ?? current.city,
        state: authority?.state ?? current.state,
      }));
      return;
    }
    setWizard((current) => ({
      ...current,
      [key]: value === NONE ? undefined : value,
    }));
  }

  function bookmarkAnswer() {
    if (!answer) return;
    const next = [answer, ...bookmarks.filter((item) => item.query_id !== answer.query_id)].slice(0, 8);
    setBookmarks(next);
    window.localStorage.setItem("buildwise-bookmarks", JSON.stringify(next));
    toast.success("Saved");
  }

  async function copyShareLink() {
    if (!answer) return;
    const text = `${answer.answer.quick_summary}\n\n${answer.answer.official_authority_links.join("\n")}`;
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  async function downloadReport() {
    if (!answer) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const lines = [
      "BuildWise AI Compliance Report",
      `Authority: ${answer.answer.applicable_authority}`,
      `Allowed: ${answer.answer.is_allowed}`,
      `Confidence: ${answer.answer.confidence_indicator}`,
      "",
      answer.answer.quick_summary,
      "",
      "Checklist:",
      ...checklist.map((item) => `- ${item}`),
      "",
      "Sources:",
      ...answer.sources.map((source) => `- ${source.document_title} (${source.official_url || "no URL"})`),
      "",
      "Uncertainty:",
      ...answer.answer.assumptions_uncertainty_notes.map((item) => `- ${item}`),
    ];
    doc.setFont("helvetica", "bold");
    doc.text("BuildWise AI", 14, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(lines.join("\n"), 180), 14, 28);
    doc.save("buildwise-compliance-report.pdf");
  }

  async function handleFeedback(label: "helpful" | "unclear" | "incorrect" | "missing_source") {
    if (!answer) return;
    try {
      await sendFeedback({ query_id: answer.query_id, label, rating: label === "helpful" ? 5 : 2 });
      toast.success("Feedback saved");
    } catch {
      toast.error("Feedback could not be saved");
    }
  }

  async function handleDocumentSearch(event: FormEvent) {
    event.preventDefault();
    if (!docSearchQuery.trim()) return;
    setDocSearching(true);
    try {
      const response = await searchDocuments({
        query: docSearchQuery,
        authority_id: wizard.authority_id,
        city: wizard.city,
        state: wizard.state,
        top_k: 5,
      });
      setDocSearchResults(response.results);
      if (!response.results.length) {
        toast.info("No matching uploaded evidence found for that search.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document search failed");
    } finally {
      setDocSearching(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Select a PDF");
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      toast.error("Only PDF uploads are supported.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("PDF must be 25 MB or smaller.");
      return;
    }
    if (!adminKey.trim()) {
      toast.error("Admin key required");
      return;
    }
    setUploading(true);
    const formData = new FormData(form);
    try {
      const response = await uploadDocument(formData, adminKey);
      setDocuments((current) => [response.document, ...current.filter((document) => document.id !== response.document.id)]);
      toast.success(`${copy("uploadSuccess")} ${response.chunks_indexed} chunks indexed.`);
      form.reset();
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function refreshAdminDocuments() {
    if (!adminKey.trim()) {
      toast.error("Admin key required");
      return;
    }
    setDocumentsLoading(true);
    try {
      const response = await getAdminDocuments(adminKey, {
        search: documentSearch || undefined,
        authority_id: documentAuthorityFilter === NONE ? undefined : documentAuthorityFilter,
        document_type: documentTypeFilter === NONE ? undefined : documentTypeFilter,
        status: documentStatusFilter === NONE ? undefined : documentStatusFilter,
      });
      setDocuments(response);
      setSelectedDocumentIds((current) => current.filter((id) => response.some((document) => document.id === id)));
      toast.success("Documents refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load admin documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function openDocumentDetail(documentId: string) {
    if (!adminKey.trim()) {
      toast.error("Admin key required to view chunks.");
      return;
    }
    setDocumentDetailLoading(true);
    try {
      const detail = await getAdminDocument(documentId, adminKey);
      setDocumentDetail(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load document details.");
    } finally {
      setDocumentDetailLoading(false);
    }
  }

  async function openPdfPreview(document: DocumentRecord) {
    if (!adminKey.trim()) {
      toast.error("Admin key required to preview PDFs.");
      return;
    }
    setPreviewDocument(document);
    setPreviewLoading(true);
    try {
      const blob = await getAdminDocumentFile(document.id, adminKey);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      setPreviewDocument(null);
      toast.error(error instanceof Error ? error.message : "Could not preview the original PDF.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function downloadOriginalPdf(document: DocumentRecord) {
    if (!adminKey.trim()) {
      toast.error("Admin key required to download PDFs.");
      return;
    }
    try {
      const blob = await getAdminDocumentFile(document.id, adminKey);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.file_name || `${document.title}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the original PDF.");
    }
  }

  function toggleDocumentSelection(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId],
    );
  }

  function toggleAllFilteredDocuments() {
    const filteredIds = filteredDocuments.map((document) => document.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedDocumentIds.includes(id));
    setSelectedDocumentIds(allSelected ? selectedDocumentIds.filter((id) => !filteredIds.includes(id)) : Array.from(new Set([...selectedDocumentIds, ...filteredIds])));
  }

  async function confirmDeleteDocuments() {
    if (!adminKey.trim()) {
      toast.error("Admin key required");
      return;
    }
    const ids = deleteCandidateIds;
    if (!ids.length) return;
    setDocumentActionLoading("delete");
    try {
      await Promise.all(ids.map((documentId) => deleteAdminDocument(documentId, adminKey)));
      setDocuments((current) => current.filter((document) => !ids.includes(document.id)));
      setSelectedDocumentIds((current) => current.filter((documentId) => !ids.includes(documentId)));
      if (documentDetail && ids.includes(documentDetail.document.id)) setDocumentDetail(null);
      setDeleteCandidateIds([]);
      toast.success(ids.length === 1 ? "Document deleted" : `${ids.length} documents deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDocumentActionLoading(null);
    }
  }

  async function reindexDocuments(documentIds: string[]) {
    if (!adminKey.trim()) {
      toast.error("Admin key required");
      return;
    }
    if (!documentIds.length) return;
    setDocumentActionLoading("reindex");
    try {
      const responses = await Promise.all(documentIds.map((documentId) => reindexAdminDocument(documentId, adminKey)));
      const updatedDocuments = responses.map((response) => response.document);
      setDocuments((current) =>
        current.map((document) => updatedDocuments.find((updated) => updated.id === document.id) || document),
      );
      if (documentDetail) {
        const updated = updatedDocuments.find((document) => document.id === documentDetail.document.id);
        if (updated) void openDocumentDetail(updated.id);
      }
      toast.success(documentIds.length === 1 ? "Document reindexed" : `${documentIds.length} documents reindexed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reindex failed.");
    } finally {
      setDocumentActionLoading(null);
    }
  }

  const confidenceValue = answer?.answer.confidence_indicator === "High" ? 88 : answer?.answer.confidence_indicator === "Medium" ? 58 : 24;
  const DecisionIcon = answer?.answer.is_allowed === "Yes" ? CheckCircle2 : answer?.answer.is_allowed === "No" ? Ban : answer?.answer.is_allowed === "Conditional" ? AlertTriangle : CircleHelp;
  const navItems = [
    { id: "assistant", label: copy("navProduct") },
    { id: "authorities", label: copy("navAuthorities") },
    { id: "admin", label: copy("navAdmin") },
  ];

  return (
    <div className="min-h-screen overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#assistant" className="bw-text-primary flex items-center gap-3" aria-label="BuildWise AI">
            <span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-300 via-emerald-300 to-amber-300 text-slate-950">
              <Building2 className="size-5" />
            </span>
            <span className="hidden text-base font-semibold min-[420px]:inline">BuildWise AI</span>
          </a>
          <div className="flex items-center gap-2">
            <LanguageToggle language={language} onChange={setLanguage} label={copy("language")} />
            <NavDropdown
              items={navItems}
              activeSection={activeSection}
              label={copy("menu")}
              onNavigate={setActiveSection}
            />
            <ThemeToggle label={copy("theme")} />
          </div>
        </div>
      </header>

      <main>
        {systemNotice && (
          <div className="fixed inset-x-0 top-16 z-30 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
            <div className="mx-auto flex max-w-7xl items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{systemNotice}</span>
            </div>
          </div>
        )}
        <section id="assistant" className="hero-visual relative pt-24 text-white">
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />
          <div className="relative mx-auto grid min-h-[760px] max-w-7xl gap-8 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="flex flex-col justify-center"
            >
              <Badge className="w-fit bg-white/12 text-teal-100 ring-white/15">
                <Sparkles className="mr-1 size-3.5" />
                {copy("heroEyebrow")}
              </Badge>
              <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-tight sm:text-6xl">
                {copy("heroTitle")}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-200 sm:text-lg">{copy("heroSubtitle")}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                {sampleQueries[language].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuery(item)}
                    className="rounded-lg border border-white/14 bg-white/10 px-3 py-2 text-left text-sm text-white transition hover:bg-white/16"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.7 }}
              className="glass-panel bw-text-primary self-end rounded-lg p-4 lg:self-center"
            >
              <form onSubmit={handleAsk} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="bw-text-primary text-sm font-semibold">{copy("wizardTitle")}</p>
                    <p className="bw-text-muted text-xs">
                      {selectedAuthority?.short_name || "Authority"} · {wizard.city || "City"}
                    </p>
                  </div>
                  <Badge className="bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">
                    <Database className="mr-1 size-3.5" />
                    RAG
                  </Badge>
                </div>

                <Textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy("askPlaceholder")}
                  aria-label={copy("askPlaceholder")}
                  className="min-h-32 resize-none text-base"
                />

                <WizardGrid
                  language={language}
                  authorities={authorities}
                  wizard={wizard}
                  updateWizard={updateWizard}
                />

                <div className="sticky bottom-3 z-20 space-y-2 rounded-lg border border-slate-300 bg-white p-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-950/75 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="submit" variant="premium" size="lg" className="flex-1" disabled={loading}>
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      {loading ? copy("analyzing") : copy("askButton")}
                    </Button>
                    <Button type="button" variant="secondary" size="lg" onClick={() => setQuery(sampleQueries[language][1])}>
                      <Search className="size-4" />
                      {language === "hi" ? "उदाहरण" : "Example"}
                    </Button>
                  </div>
                  {loading && (
                    <div className="flex items-center gap-2 rounded-md border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-xs font-medium text-teal-800 dark:text-teal-100">
                      <Loader2 className="size-3.5 animate-spin" />
                      {copy("checkingRules")}
                    </div>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        </section>

        <section className="mesh-band border-y border-slate-200/80 py-10 dark:border-white/10">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            <Metric icon={MapPinned} label="Jurisdictions" value={initializing ? "..." : `${authorities.length}`} />
            <Metric icon={FileText} label="Indexed docs" value={initializing ? "..." : `${documents.length}`} />
            <Metric icon={ShieldCheck} label="Grounding" value="Source-only" />
            <Metric icon={Globe2} label="Languages" value="EN + हिंदी" />
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <div className="space-y-6">
            <div
              id="grounded-answer"
              ref={resultSectionRef}
              tabIndex={-1}
              className={cn(
                "glass-panel scroll-mt-24 rounded-lg p-5 outline-none transition-[border-color,box-shadow,transform] duration-300 focus-visible:ring-2 focus-visible:ring-teal-400/70",
                resultHighlighted && "answer-glow",
              )}
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="bw-text-primary text-xl font-semibold">{copy("answerTitle")}</h2>
                  <p className="bw-text-muted text-sm">
                    {answer?.jurisdiction ? `${answer.jurisdiction.short_name} · ${answer.jurisdiction.city}` : copy("emptyAnswer")}
                  </p>
                </div>
                {answer && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={bookmarkAnswer}>
                      <Bookmark className="size-4" />
                      {copy("saveBookmark")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={downloadReport}>
                      <Download className="size-4" />
                      {copy("downloadPdf")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={copyShareLink}>
                      <Link2 className="size-4" />
                      {copy("share")}
                    </Button>
                  </div>
                )}
              </div>

              {loading && <LoadingAnswer copy={copy("checkingRules")} />}

              {!loading && !answer && (
                <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-white/15">
                  <MessageSquareText className="mx-auto size-10 text-teal-500" />
                  <p className="bw-text-muted mt-3 text-sm">{copy("emptyAnswer")}</p>
                </div>
              )}

              {!loading && answer && (
                <div className="space-y-5">
                  <div className={cn("rounded-lg border p-4", formatDecision(answer.answer.is_allowed))}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-3">
                        <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/70 shadow-sm dark:bg-white/10">
                          <DecisionIcon className="size-5" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold uppercase text-current/70">{copy("isAllowed")}</p>
                          <h3 className="mt-1 text-2xl font-semibold">{decisionLabel(answer.answer.is_allowed)}</h3>
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-current/80">{answer.answer.quick_summary}</p>
                        </div>
                      </div>
                      <div className="min-w-48 rounded-lg border border-current/10 bg-white/70 p-3 dark:bg-white/[0.08]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase text-current/70">{copy("confidence")}</span>
                          <Badge className={cn("ring-1", formatConfidence(answer.answer.confidence_indicator))}>
                            {answer.answer.confidence_indicator}
                          </Badge>
                        </div>
                        <Progress value={confidenceValue} className="mt-3" />
                        <p className="mt-2 text-xs leading-5 text-current/70">
                          {answer.answer.confidence_indicator === "High"
                            ? "Multiple relevant authority excerpts support this answer."
                            : answer.answer.confidence_indicator === "Medium"
                              ? "Some relevant evidence was found; verify plot-specific details."
                              : "Evidence is limited or the authority context needs confirmation."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {answerSections.map((section) => {
                      const Icon = section.icon;
                      const items = (answer.answer[section.key] as string[]).filter(Boolean);
                      return (
                        <div key={section.key} className="bw-card rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-teal-600 dark:text-teal-300" />
                            <h3 className="bw-text-primary text-sm font-semibold">{copy(section.label)}</h3>
                          </div>
                          <ul className="bw-text-secondary mt-3 space-y-2 text-sm leading-6">
                            {(items.length ? items : ["No explicit authority-backed item was returned for this section."]).map((item, index) => (
                              <li key={`${section.key}-${index}`} className="flex gap-2">
                                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bw-card rounded-lg p-4">
                    <h3 className="bw-text-primary text-sm font-semibold">{copy("links")}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answer.answer.official_authority_links.length ? answer.answer.official_authority_links.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:border-teal-400 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          {truncateMiddle(link, 42)}
                          <ExternalLink className="size-3.5" />
                        </a>
                      )) : (
                        <p className="bw-text-muted text-sm">No official link was attached to the retrieved evidence.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleFeedback("helpful")}>
                      <ThumbsUp className="size-4" />
                      {copy("feedbackHelpful")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleFeedback("missing_source")}>
                      <ThumbsDown className="size-4" />
                      {copy("feedbackIssue")}
                    </Button>
                  </div>

                  <div className="bw-card rounded-lg p-4">
                    <h3 className="bw-text-primary text-sm font-semibold">
                      {language === "hi" ? "अगले प्रश्न" : "Suggested next questions"}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answer.suggested_questions.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => setQuery(question)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm hover:border-teal-400 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-lg p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="bw-text-primary text-xl font-semibold">{copy("sourcesTitle")}</h2>
                <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                  {answer?.sources.length || 0} items
                </Badge>
              </div>
              <div className="grid gap-3">
                {(answer?.sources || []).map((source) => (
                  <SourceCard key={`${source.document_id}-${source.chunk_id}`} source={source} />
                ))}
                {answer && answer.sources.length === 0 && (
                  <p className="bw-text-muted rounded-lg border border-dashed border-slate-300 p-6 text-sm dark:border-white/15">
                    No evidence cards were returned because the assistant needs jurisdiction details first.
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <SidePanel title={copy("checklist")} icon={ClipboardCheck}>
              <ol className="bw-text-secondary space-y-3 text-sm">
                {checklist.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-700 dark:text-teal-200">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </SidePanel>

            <SidePanel title={copy("recent")} icon={History}>
              <div className="space-y-2">
                {history.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setQuery(item.query)}
                    className="bw-card-soft w-full rounded-lg p-3 text-left text-sm text-slate-800 transition hover:border-teal-400 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    {item.query}
                  </button>
                ))}
                {history.length === 0 && <p className="bw-text-muted text-sm">No recent searches.</p>}
              </div>
            </SidePanel>

            <SidePanel title={copy("documentSearch")} icon={Search}>
              <form onSubmit={handleDocumentSearch} className="space-y-3">
                <Input
                  value={docSearchQuery}
                  onChange={(event) => setDocSearchQuery(event.target.value)}
                  placeholder="FAR, setback, roof garden..."
                  aria-label={copy("documentSearch")}
                />
                <Button type="submit" variant="secondary" size="sm" className="w-full" disabled={docSearching}>
                  {docSearching ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
                  {copy("documentSearch")}
                </Button>
              </form>
              <div className="mt-3 space-y-2">
                {docSearching && (
                  <>
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                  </>
                )}
                {docSearchResults.map((result) => (
                  <button
                    key={`${result.document_id}-${result.chunk_id}`}
                    type="button"
                    onClick={() => setQuery(result.excerpt)}
                    className="bw-card-soft w-full rounded-lg p-3 text-left text-xs leading-5 text-slate-800 transition hover:border-teal-400 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <span className="bw-text-primary block font-semibold">{result.document_title}</span>
                    {result.excerpt.slice(0, 180)}
                  </button>
                ))}
                {!docSearching && docSearchResults.length === 0 && (
                  <p className="bw-text-muted rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-white/15">
                    Search uploaded PDFs for clauses before asking a report question.
                  </p>
                )}
              </div>
            </SidePanel>

            <SidePanel title={copy("bookmarks")} icon={Bookmark}>
              <div className="space-y-2">
                {bookmarks.map((item) => (
                  <button
                    key={item.query_id}
                    type="button"
                    onClick={() => setAnswer(item)}
                    className="bw-card-soft w-full rounded-lg p-3 text-left text-sm text-slate-800 transition hover:border-amber-400 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    {item.answer.quick_summary.slice(0, 120)}
                  </button>
                ))}
                {bookmarks.length === 0 && <p className="bw-text-muted text-sm">No bookmarks.</p>}
              </div>
            </SidePanel>
          </aside>
        </section>

        <section id="authorities" className="border-y border-slate-200/80 bg-slate-50/90 py-12 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="bw-text-primary text-2xl font-semibold">{copy("navAuthorities")}</h2>
                <p className="bw-text-muted mt-1 text-sm">
                  KDA, LDA, DDA/MCD, BBMP/BDA, BMC, GDA, and NOIDA Authority are preconfigured.
                </p>
              </div>
              <Badge className="w-fit bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-200">
                Official links only
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {authorities.map((authority) => (
                <AuthorityCard key={authority.id} authority={authority} onSelect={() => updateWizard("authority_id", authority.id)} />
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="glass-panel rounded-lg p-5">
            <h2 className="bw-text-primary text-xl font-semibold">{copy("compare")}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AuthoritySelect value={compareA} authorities={authorities} onValueChange={setCompareA} />
              <AuthoritySelect value={compareB} authorities={authorities} onValueChange={setCompareB} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[compareLeft, compareRight].map((authority) =>
                authority ? (
                  <div key={authority.id} className="bw-card rounded-lg p-4">
                    <p className="bw-text-primary text-sm font-semibold">{authority.short_name}</p>
                    <p className="bw-text-muted mt-1 text-sm">{authority.city}, {authority.state}</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <LinkRow href={authority.official_website} label="Website" />
                      <LinkRow href={authority.permit_portal} label="Permit" />
                      <LinkRow href={authority.bylaws_url} label="Bylaws" />
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </div>

          <div className="glass-panel rounded-lg p-5">
            <h2 className="bw-text-primary text-xl font-semibold">{copy("faq")}</h2>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-white/10">
              <FaqItem
                question="Does BuildWise AI answer without documents?"
                answer="It can identify configured authorities and official portals, but it will not confirm exact rules unless retrieved official source text supports the answer."
              />
              <FaqItem
                question="Can admins add a new city?"
                answer="Yes. Add an authority in the catalog, upload official PDFs with jurisdiction details, then reindex. Retrieval filters by authority, city, state, and document type."
              />
              <FaqItem
                question="Which embedding model is used?"
                answer="The backend defaults to sentence-transformers/all-MiniLM-L6-v2, a CPU-friendly local embedding model with pgvector storage."
              />
            </div>
          </div>
        </section>

        <section id="admin" className="border-t border-slate-200/80 bg-slate-50 py-12 text-slate-950 dark:border-white/10 dark:bg-slate-950 dark:text-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <Badge className="bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:bg-white/10 dark:text-teal-100 dark:ring-white/15">
                <UploadCloud className="mr-1 size-3.5" />
                {copy("upload")}
              </Badge>
              <h2 className="mt-4 text-3xl font-semibold">Document intelligence console</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Upload real PDFs, tag jurisdiction details, and index chunks into Supabase pgvector. Uploaded authority documents are prioritized over seeded authority profiles.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {initializing && Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
                {documents.slice(0, 4).map((document) => (
                  <div key={document.id} className="bw-card-soft rounded-lg p-3">
                    <p className="text-sm font-semibold">{document.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge className="bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">
                        {document.chunk_count} chunks
                      </Badge>
                      <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200">
                        {document.status}
                      </Badge>
                    </div>
                    <p className="bw-text-muted mt-2 text-xs">{formatFileSize(document.file_size)}</p>
                  </div>
                ))}
                {!initializing && documents.length === 0 && (
                  <p className="bw-text-muted rounded-lg border border-dashed border-slate-300 p-4 text-sm dark:border-white/15 sm:col-span-2">
                    No uploaded PDFs yet. Add an authority document to enable stronger evidence-backed answers.
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleUpload} className="bw-card rounded-lg p-5 backdrop-blur-xl">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="bw-text-primary text-base font-semibold">Index a new authority PDF</h3>
                  <p className="bw-text-muted mt-1 text-sm">Add clean jurisdiction details so retrieval can rank this PDF above seeded authority profiles.</p>
                </div>
                <Badge className="w-fit bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-200">
                  {uploading ? "Indexing" : "Admin"}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="title" placeholder="Document title" required />
                <Input name="document_type" placeholder="bylaws / permit-manual" required />
                <select
                  name="authority_id"
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:ring-teal-500/30"
                  required
                >
                  {authorities.map((authority) => (
                    <option key={authority.id} value={authority.id}>
                      {authority.short_name} · {authority.city}
                    </option>
                  ))}
                </select>
                <Input name="issuing_department" placeholder="Issuing department" />
                <Input name="city" placeholder="City" required defaultValue="Kanpur" />
                <Input name="state" placeholder="State" required defaultValue="Uttar Pradesh" />
                <Input name="official_url" placeholder="Official URL" className="sm:col-span-2" />
                <Input name="tags" placeholder="tags, comma, separated" className="sm:col-span-2" />
                <Input
                  type="password"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Admin API key"
                  autoComplete="off"
                  className="sm:col-span-2"
                />
                <Input ref={fileRef} name="file" type="file" accept="application/pdf" required className="sm:col-span-2" />
              </div>
              <Button type="submit" variant="premium" size="lg" className="mt-4 w-full" disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                {copy("upload")}
              </Button>
              <div className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                {["Extract PDF text", "Create chunks", "Index embeddings"].map((step, index) => (
                  <div key={step} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold", uploading ? "bg-teal-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200")}>
                      {index + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </form>

            <div className="glass-panel rounded-lg p-5 lg:col-span-2">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200">
                    <Layers3 className="mr-1 size-3.5" />
                    Documents
                  </Badge>
                  <h3 className="mt-3 text-2xl font-semibold">Uploaded documents</h3>
                  <p className="bw-text-muted mt-2 max-w-2xl text-sm leading-6">
                    Review indexed PDFs, inspect chunks, preview originals, and safely manage reindexing or deletion.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={refreshAdminDocuments} disabled={documentsLoading}>
                    {documentsLoading ? <Loader2 className="size-4 animate-spin" /> : <Filter className="size-4" />}
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!selectedDocumentIds.length || documentActionLoading === "reindex"}
                    onClick={() => reindexDocuments(selectedDocumentIds)}
                  >
                    {documentActionLoading === "reindex" ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                    Reindex selected
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={!selectedDocumentIds.length || documentActionLoading === "delete"}
                    onClick={() => setDeleteCandidateIds(selectedDocumentIds)}
                  >
                    <Trash2 className="size-4" />
                    Delete selected
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_.9fr_.7fr_.7fr]">
                <Input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Search title, authority, city, or tags" />
                <Select value={documentAuthorityFilter} onValueChange={setDocumentAuthorityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Authority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All authorities</SelectItem>
                    {authorities.map((authority) => (
                      <SelectItem key={authority.id} value={authority.id}>
                        {authority.short_name} / {authority.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All types</SelectItem>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={documentStatusFilter} onValueChange={setDocumentStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All status</SelectItem>
                    {documentStatuses.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
                <div className="grid min-w-[980px] grid-cols-[44px_1.4fr_.85fr_.75fr_.85fr_.75fr_.65fr_.7fr_.8fr_180px] gap-3 border-b border-slate-200 px-3 py-3 text-xs font-semibold uppercase text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <input
                    type="checkbox"
                    aria-label="Select all documents"
                    checked={filteredDocuments.length > 0 && filteredDocuments.every((document) => selectedDocumentIds.includes(document.id))}
                    onChange={toggleAllFilteredDocuments}
                    className="size-4 rounded border-slate-300"
                  />
                  <span>Title</span>
                  <span>Authority</span>
                  <span>City</span>
                  <span>State</span>
                  <span>Type</span>
                  <span>Uploaded</span>
                  <span>Chunks</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                <div className="max-h-[560px] min-w-[980px] overflow-y-auto">
                  {documentsLoading && Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="m-3 h-16" />)}
                  {!documentsLoading && filteredDocuments.map((document) => (
                    <div key={document.id} className="grid grid-cols-[44px_1.4fr_.85fr_.75fr_.85fr_.75fr_.65fr_.7fr_.8fr_180px] items-center gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 dark:border-white/10">
                      <input
                        type="checkbox"
                        aria-label={`Select ${document.title}`}
                        checked={selectedDocumentIds.includes(document.id)}
                        onChange={() => toggleDocumentSelection(document.id)}
                        className="size-4 rounded border-slate-300"
                      />
                      <button type="button" onClick={() => openDocumentDetail(document.id)} className="text-left font-semibold text-slate-950 hover:text-teal-700 dark:text-white dark:hover:text-teal-200">
                        {document.title}
                        <span className="bw-text-muted mt-1 block text-xs font-normal">{document.file_name || "PDF"}</span>
                      </button>
                      <span className="bw-text-secondary">{authorityNameById[document.authority_id] || document.authority_id}</span>
                      <span className="bw-text-secondary">{document.city}</span>
                      <span className="bw-text-secondary">{document.state}</span>
                      <span className="bw-text-secondary">{document.document_type}</span>
                      <span className="bw-text-muted text-xs">{formatDate(document.created_at)}</span>
                      <Badge className="w-fit bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">{document.chunk_count}</Badge>
                      <DocumentStatusBadge status={document.status} />
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" title="View details" onClick={() => openDocumentDetail(document.id)}>
                          <Eye className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Preview PDF" onClick={() => openPdfPreview(document)}>
                          <FileSearch className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Download PDF" onClick={() => downloadOriginalPdf(document)}>
                          <FileDown className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Reindex" onClick={() => reindexDocuments([document.id])}>
                          <Database className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Delete" onClick={() => setDeleteCandidateIds([document.id])}>
                          <Trash2 className="size-4 text-rose-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!documentsLoading && filteredDocuments.length === 0 && (
                    <div className="p-8 text-center">
                      <FileText className="mx-auto size-10 text-teal-500" />
                      <p className="bw-text-primary mt-3 text-sm font-semibold">No documents match the current filters.</p>
                      <p className="bw-text-muted mt-1 text-sm">Upload a PDF or clear search filters to see indexed authority documents.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {loading && !resultInView && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={() => resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="fixed bottom-5 right-4 z-50 inline-flex items-center gap-2 rounded-lg border border-teal-200/70 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-teal-950/25 transition hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 sm:right-6"
          >
            <Eye className="size-4" />
            {copy("viewResult")}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(documentDetail || documentDetailLoading) && (
          <motion.div
            className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.aside
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/10">
                <div>
                  <p className="bw-text-muted text-xs font-semibold uppercase">Document details</p>
                  <h3 className="bw-text-primary mt-1 text-xl font-semibold">{documentDetail?.document.title || "Loading document"}</h3>
                  {documentDetail?.document && (
                    <p className="bw-text-muted mt-1 text-sm">
                      {authorityNameById[documentDetail.document.authority_id] || documentDetail.document.authority_id} / {documentDetail.document.city}, {documentDetail.document.state}
                    </p>
                  )}
                </div>
                <Button type="button" variant="secondary" size="icon" onClick={() => setDocumentDetail(null)} aria-label="Close document details">
                  <X className="size-4" />
                </Button>
              </div>

              {documentDetailLoading && (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                </div>
              )}

              {!documentDetailLoading && documentDetail && (
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <DetailMetric label="Chunks" value={`${documentDetail.document.chunk_count}`} />
                    <DetailMetric label="Status" value={documentDetail.document.status} />
                    <DetailMetric label="File size" value={formatFileSize(documentDetail.document.file_size)} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MetadataRow label="Document type" value={documentDetail.document.document_type} />
                    <MetadataRow label="Upload date" value={formatDate(documentDetail.document.created_at)} />
                    <MetadataRow label="Issuing department" value={documentDetail.document.issuing_department || "Not provided"} />
                    <MetadataRow label="Original file" value={documentDetail.document.file_name || "Not available"} />
                  </div>
                  <div className="mt-4 bw-card-soft rounded-lg p-4">
                    <p className="bw-text-primary text-sm font-semibold">Tags</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {documentDetail.document.tags.length ? documentDetail.document.tags.map((tag) => (
                        <Badge key={tag} className="bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">{tag}</Badge>
                      )) : <span className="bw-text-muted text-sm">No tags</span>}
                    </div>
                    {documentDetail.document.official_url && (
                      <a href={documentDetail.document.official_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300">
                        Source URL
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => openPdfPreview(documentDetail.document)} disabled={!documentDetail.preview_available}>
                      <FileSearch className="size-4" />
                      Preview PDF
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => downloadOriginalPdf(documentDetail.document)} disabled={!documentDetail.download_available}>
                      <FileDown className="size-4" />
                      Download
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => reindexDocuments([documentDetail.document.id])}>
                      <Database className="size-4" />
                      Reindex
                    </Button>
                    <Button type="button" variant="danger" size="sm" onClick={() => setDeleteCandidateIds([documentDetail.document.id])}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="bw-text-primary text-base font-semibold">Indexed chunks</h4>
                      <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200">
                        {documentDetail.chunks.length} chunks
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {documentDetail.chunks.map((chunk) => (
                        <details key={chunk.id} className="bw-card-soft rounded-lg p-4">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                            <span className="bw-text-primary text-sm font-semibold">
                              Chunk {chunk.chunk_index + 1}
                              {chunk.page_start ? ` / page ${chunk.page_start}${chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ""}` : ""}
                            </span>
                            <span className="bw-text-muted text-xs">{chunk.token_count} tokens</span>
                          </summary>
                          <p className="bw-text-secondary mt-3 whitespace-pre-wrap text-sm leading-6">{chunk.content}</p>
                        </details>
                      ))}
                      {!documentDetail.chunks.length && (
                        <p className="bw-text-muted rounded-lg border border-dashed border-slate-300 p-6 text-sm dark:border-white/15">
                          No chunks are indexed for this document.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(previewDocument || previewLoading) && (
          <motion.div className="fixed inset-0 z-50 bg-slate-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-2xl dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
                <div>
                  <h3 className="bw-text-primary text-base font-semibold">{previewDocument?.title || "PDF preview"}</h3>
                  <p className="bw-text-muted text-sm">{previewDocument?.file_name || "Original uploaded PDF"}</p>
                </div>
                <Button type="button" variant="secondary" size="icon" onClick={() => { setPreviewDocument(null); setPreviewUrl(null); }} aria-label="Close PDF preview">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-slate-900">
                {previewLoading && <div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-teal-500" /></div>}
                {!previewLoading && previewUrl && <iframe title="PDF preview" src={previewUrl} className="h-full w-full" />}
              </div>
              {previewDocument && (
                <div className="flex justify-end gap-2 border-t border-slate-200 p-3 dark:border-white/10">
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadOriginalPdf(previewDocument)}>
                    <FileDown className="size-4" />
                    Download PDF
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteCandidateIds.length > 0 && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, scale: 0.98 }} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300">
                  <Trash2 className="size-5" />
                </span>
                <div>
                  <h3 className="bw-text-primary text-base font-semibold">Delete document{deleteCandidateIds.length > 1 ? "s" : ""}?</h3>
                  <p className="bw-text-muted mt-2 text-sm leading-6">
                    Are you sure you want to permanently delete this document and all indexed chunks?
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setDeleteCandidateIds([])} disabled={documentActionLoading === "delete"}>
                  Cancel
                </Button>
                <Button type="button" variant="danger" onClick={confirmDeleteDocuments} disabled={documentActionLoading === "delete"}>
                  {documentActionLoading === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Delete permanently
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bg-slate-950 px-4 py-8 text-sm text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span>{copy("footer")}</span>
          <span>Vercel · Render · Supabase · pgvector</span>
        </div>
      </footer>
    </div>
  );
}

function NavDropdown({
  items,
  activeSection,
  label,
  onNavigate,
}: {
  items: Array<{ id: string; label: string }>;
  activeSection: string;
  label: string;
  onNavigate: (sectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon className="size-4" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-lg border border-slate-300 bg-white p-1.5 shadow-2xl shadow-slate-950/15 backdrop-blur-xl dark:border-white/12 dark:bg-slate-950/95 dark:shadow-slate-950/30"
            role="menu"
          >
            {items.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    onNavigate(item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:bg-slate-100 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:bg-white/10",
                    active && "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200 dark:bg-teal-400/15 dark:text-teal-100 dark:ring-teal-300/25",
                  )}
                >
                  <span>{item.label}</span>
                  {active && <CheckCircle2 className="size-4 text-teal-700 dark:text-teal-200" />}
                </a>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WizardGrid({
  language,
  authorities,
  wizard,
  updateWizard,
}: {
  language: Language;
  authorities: Authority[];
  wizard: WizardContext;
  updateWizard: <K extends keyof WizardContext>(key: K, value: WizardContext[K] | typeof NONE) => void;
}) {
  const label = (key: TranslationKey) => t(language, key);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <FieldLabel>{label("authorityField")}</FieldLabel>
        <AuthoritySelect
          value={wizard.authority_id || NONE}
          authorities={authorities}
          onValueChange={(value) => updateWizard("authority_id", value)}
        />
      </div>
      <Field name={label("projectType")} value={wizard.project_type || ""} onChange={(value) => updateWizard("project_type", value)} placeholder="roof-garden" />
      <Field name={label("propertyType")} value={wizard.property_type || ""} onChange={(value) => updateWizard("property_type", value)} placeholder="residential" />
      <Field name={label("occupancy")} value={wizard.occupancy_type || ""} onChange={(value) => updateWizard("occupancy_type", value)} placeholder="residential" />
      <Field name={label("plotSize")} type="number" value={wizard.plot_size_sqm?.toString() || ""} onChange={(value) => updateWizard("plot_size_sqm", value ? Number(value) : undefined)} />
      <Field name={label("floors")} value={wizard.floors || ""} onChange={(value) => updateWizard("floors", value)} placeholder="G+2" />
      <Field name={label("roadWidth")} type="number" value={wizard.road_width_m?.toString() || ""} onChange={(value) => updateWizard("road_width_m", value ? Number(value) : undefined)} />
      <Field name={label("budget")} type="number" value={wizard.budget_inr?.toString() || ""} onChange={(value) => updateWizard("budget_inr", value ? Number(value) : undefined)} />
      <div className="sm:col-span-2">
        <Field name={label("notes")} value={wizard.notes || ""} onChange={(value) => updateWizard("notes", value)} placeholder="scheme, ward, plot notes" />
      </div>
    </div>
  );
}

function AuthoritySelect({
  value,
  authorities,
  onValueChange,
}: {
  value: string;
  authorities: Authority[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value || NONE} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Authority" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Auto detect</SelectItem>
        {authorities.map((authority) => (
          <SelectItem key={authority.id} value={authority.id}>
            {authority.short_name} · {authority.city}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({
  name,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{name}</FieldLabel>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="bw-text-muted mb-1.5 block text-xs font-semibold">{children}</span>;
}

function LoadingAnswer({ copy }: { copy: string }) {
  return (
    <div className="space-y-4">
      <div className="bw-card-soft rounded-lg p-4">
        <div className="bw-text-muted mb-3 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-teal-500" />
          {copy}
        </div>
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: AskResponse["sources"][number] }) {
  return (
    <div className="bw-card rounded-lg p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="bw-text-primary font-semibold">{source.document_title}</p>
          <p className="bw-text-muted mt-1 text-sm">
            {source.authority_name} / {source.city}, {source.state}
            {source.page_start ? ` / p.${source.page_start}${source.page_end && source.page_end !== source.page_start ? `-${source.page_end}` : ""}` : ""}
          </p>
        </div>
        <Badge className="w-fit bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">
          Evidence
        </Badge>
      </div>
      <p className="bw-text-secondary mt-3 text-sm leading-6">{source.excerpt}</p>
      {source.official_url && (
        <a
          href={source.official_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-300"
        >
          {truncateMiddle(source.official_url, 54)}
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function SidePanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ClipboardCheck;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-teal-600 dark:text-teal-300" />
        <h2 className="bw-text-primary text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="bw-card rounded-lg p-4">
      <Icon className="size-5 text-teal-600 dark:text-teal-300" />
      <p className="bw-text-primary mt-3 text-2xl font-semibold">{value}</p>
      <p className="bw-text-muted text-sm">{label}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bw-card-soft rounded-lg p-4">
      <p className="bw-text-muted text-xs font-semibold uppercase">{label}</p>
      <p className="bw-text-primary mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="bw-text-muted text-xs font-semibold uppercase">{label}</p>
      <p className="bw-text-primary mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

function DocumentStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className = normalized === "indexed"
    ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"
    : normalized === "processing"
      ? "bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300"
      : normalized === "failed"
        ? "bg-rose-500/15 text-rose-700 ring-rose-500/20 dark:text-rose-300"
        : "bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200";
  return <Badge className={cn("w-fit ring-1", className)}>{status}</Badge>;
}

function AuthorityCard({ authority, onSelect }: { authority: Authority; onSelect: () => void }) {
  return (
    <Card className="transition hover:-translate-y-0.5 hover:border-teal-300/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{authority.short_name}</CardTitle>
            <p className="bw-text-muted mt-1 text-sm">{authority.name}</p>
          </div>
          <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
            {authority.city}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="bw-text-muted text-sm leading-6">{authority.jurisdiction_notes}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {authority.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} className="bg-teal-500/10 text-teal-700 ring-teal-500/20 dark:text-teal-200">
              {tag}
            </Badge>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={onSelect}>
            <MapPinned className="size-4" />
            Select
          </Button>
          <a
            href={authority.official_website || authority.permit_portal || "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-300"
          >
            Official
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function LinkRow({ href, label }: { href?: string | null; label: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md bg-slate-100 px-3 py-2 text-slate-800 hover:bg-teal-500/10 dark:bg-white/5 dark:text-slate-300">
      <span>{label}</span>
      <ExternalLink className="size-3.5" />
    </a>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group py-4">
      <summary className="bw-text-primary flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
        {question}
        <ArrowRight className="size-4 transition group-open:rotate-90" />
      </summary>
      <p className="bw-text-muted mt-3 text-sm leading-6">{answer}</p>
    </details>
  );
}
