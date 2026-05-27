"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Globe2,
  History,
  Link2,
  Loader2,
  MapPinned,
  MessageSquareText,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UploadCloud,
} from "lucide-react";
import { motion } from "framer-motion";
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
import { askBuildWise, getAuthorities, getDocuments, getHistory, searchDocuments, sendFeedback, uploadDocument } from "@/lib/api";
import { t, translations } from "@/lib/i18n";
import type { AskResponse, Authority, DocumentRecord, HistoryItem, Language, SourceReference, WizardContext } from "@/lib/types";
import { cn, formatConfidence, truncateMiddle } from "@/lib/utils";

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
  const [adminKey, setAdminKey] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("buildwise-admin-key") || "";
  });
  const [uploading, setUploading] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState("roof garden structural approval");
  const [docSearchResults, setDocSearchResults] = useState<SourceReference[]>([]);
  const [docSearching, setDocSearching] = useState(false);
  const [compareA, setCompareA] = useState("kda-kanpur");
  const [compareB, setCompareB] = useState("dda-delhi");
  const fileRef = useRef<HTMLInputElement>(null);

  const copy = (key: TranslationKey) => t(language, key);

  useEffect(() => {
    Promise.allSettled([getAuthorities(), getDocuments(), getHistory()]).then(([authorityResult, docsResult, historyResult]) => {
      if (authorityResult.status === "fulfilled" && authorityResult.value.length) setAuthorities(authorityResult.value);
      if (docsResult.status === "fulfilled") setDocuments(docsResult.value);
      if (historyResult.status === "fulfilled") setHistory(historyResult.value);
    });
  }, []);

  const selectedAuthority = authorities.find((item) => item.id === wizard.authority_id);
  const compareLeft = authorities.find((item) => item.id === compareA);
  const compareRight = authorities.find((item) => item.id === compareB);

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
    if (!query.trim()) return;
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
    } catch (error) {
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
    if (!adminKey.trim()) {
      toast.error("Admin key required");
      return;
    }
    setUploading(true);
    window.localStorage.setItem("buildwise-admin-key", adminKey);
    const formData = new FormData(form);
    try {
      const response = await uploadDocument(formData, adminKey);
      setDocuments((current) => [response.document, ...current]);
      toast.success(copy("uploadSuccess"));
      form.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const confidenceValue = answer?.answer.confidence_indicator === "High" ? 88 : answer?.answer.confidence_indicator === "Medium" ? 58 : 24;

  return (
    <div className="min-h-screen overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#assistant" className="flex items-center gap-3 text-white" aria-label="BuildWise AI">
            <span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-300 via-emerald-300 to-amber-300 text-slate-950">
              <Building2 className="size-5" />
            </span>
            <span className="text-base font-semibold">BuildWise AI</span>
          </a>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary navigation">
            <a className="rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/10" href="#assistant">
              {copy("navProduct")}
            </a>
            <a className="rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/10" href="#authorities">
              {copy("navAuthorities")}
            </a>
            <a className="rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/10" href="#admin">
              {copy("navAdmin")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle language={language} onChange={setLanguage} label={copy("language")} />
            <ThemeToggle label={copy("theme")} />
          </div>
        </div>
      </header>

      <main>
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
                    className="rounded-lg border border-white/14 bg-white/10 px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/16"
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
              className="glass-panel self-end rounded-lg p-4 text-slate-950 dark:text-white lg:self-center"
            >
              <form onSubmit={handleAsk} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{copy("wizardTitle")}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
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

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="submit" variant="premium" size="lg" className="flex-1" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {copy("askButton")}
                  </Button>
                  <Button type="button" variant="secondary" size="lg" onClick={() => setQuery(sampleQueries[language][1])}>
                    <Search className="size-4" />
                    {language === "hi" ? "उदाहरण" : "Example"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </section>

        <section className="mesh-band border-y border-slate-200/70 py-10 dark:border-white/10">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            <Metric icon={MapPinned} label="Jurisdictions" value={`${authorities.length}`} />
            <Metric icon={FileText} label="Indexed docs" value={`${documents.length}`} />
            <Metric icon={ShieldCheck} label="Grounding" value="Source-only" />
            <Metric icon={Globe2} label="Languages" value="EN + हिंदी" />
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <div className="space-y-6">
            <div className="glass-panel rounded-lg p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{copy("answerTitle")}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
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

              {loading && <LoadingAnswer copy={copy("loading")} />}

              {!loading && !answer && (
                <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-white/15">
                  <MessageSquareText className="mx-auto size-10 text-teal-500" />
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{copy("emptyAnswer")}</p>
                </div>
              )}

              {!loading && answer && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-[1.4fr_.6fr]">
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{copy("quickSummary")}</p>
                      <p className="mt-2 text-base leading-7 text-slate-800 dark:text-slate-100">{answer.answer.quick_summary}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{copy("isAllowed")}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-2xl font-semibold text-slate-950 dark:text-white">{answer.answer.is_allowed}</span>
                        <Badge className={cn("ring-1", formatConfidence(answer.answer.confidence_indicator))}>
                          {copy("confidence")}: {answer.answer.confidence_indicator}
                        </Badge>
                      </div>
                      <Progress value={confidenceValue} className="mt-4" />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {answerSections.map((section) => {
                      const Icon = section.icon;
                      const items = answer.answer[section.key] as string[];
                      return (
                        <div key={section.key} className="rounded-lg border border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-white/5">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-teal-600 dark:text-teal-300" />
                            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy(section.label)}</h3>
                          </div>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                            {items.map((item, index) => (
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

                  <div className="rounded-lg border border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-white/5">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy("links")}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answer.answer.official_authority_links.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-teal-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                          {truncateMiddle(link, 42)}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ))}
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

                  <div className="rounded-lg border border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-white/5">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                      {language === "hi" ? "अगले प्रश्न" : "Suggested next questions"}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answer.suggested_questions.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => setQuery(question)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-teal-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
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
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{copy("sourcesTitle")}</h2>
                <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                  {answer?.sources.length || 0} sources
                </Badge>
              </div>
              <div className="grid gap-3">
                {(answer?.sources || []).map((source) => (
                  <SourceCard key={`${source.document_id}-${source.chunk_id}`} source={source} />
                ))}
                {answer && answer.sources.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-white/15 dark:text-slate-400">
                    No source cards were returned because the assistant requested clarification first.
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <SidePanel title={copy("checklist")} icon={ClipboardCheck}>
              <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
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
                    className="w-full rounded-lg border border-slate-200 bg-white/60 p-3 text-left text-sm text-slate-700 hover:border-teal-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    {item.query}
                  </button>
                ))}
                {history.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No recent searches.</p>}
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
                {docSearchResults.map((result) => (
                  <button
                    key={`${result.document_id}-${result.chunk_id}`}
                    type="button"
                    onClick={() => setQuery(result.excerpt)}
                    className="w-full rounded-lg border border-slate-200 bg-white/60 p-3 text-left text-xs leading-5 text-slate-700 hover:border-teal-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    <span className="block font-semibold text-slate-900 dark:text-white">{result.document_title}</span>
                    {result.excerpt.slice(0, 180)}
                  </button>
                ))}
              </div>
            </SidePanel>

            <SidePanel title={copy("bookmarks")} icon={Bookmark}>
              <div className="space-y-2">
                {bookmarks.map((item) => (
                  <button
                    key={item.query_id}
                    type="button"
                    onClick={() => setAnswer(item)}
                    className="w-full rounded-lg border border-slate-200 bg-white/60 p-3 text-left text-sm text-slate-700 hover:border-amber-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    {item.answer.quick_summary.slice(0, 120)}
                  </button>
                ))}
                {bookmarks.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No bookmarks.</p>}
              </div>
            </SidePanel>
          </aside>
        </section>

        <section id="authorities" className="border-y border-slate-200/70 bg-white/45 py-12 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">{copy("navAuthorities")}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
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
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{copy("compare")}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AuthoritySelect value={compareA} authorities={authorities} onValueChange={setCompareA} />
              <AuthoritySelect value={compareB} authorities={authorities} onValueChange={setCompareB} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[compareLeft, compareRight].map((authority) =>
                authority ? (
                  <div key={authority.id} className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{authority.short_name}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{authority.city}, {authority.state}</p>
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
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{copy("faq")}</h2>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-white/10">
              <FaqItem
                question="Does BuildWise AI answer without documents?"
                answer="It can identify configured authorities and official portals, but it will not confirm exact rules unless retrieved official source text supports the answer."
              />
              <FaqItem
                question="Can admins add a new city?"
                answer="Yes. Add an authority in the catalog/database, upload official PDFs with metadata, then reindex. Retrieval filters by authority, city, state, document type, and source metadata."
              />
              <FaqItem
                question="Which embedding model is used?"
                answer="The backend defaults to sentence-transformers/all-MiniLM-L6-v2, a CPU-friendly local embedding model with pgvector storage."
              />
            </div>
          </div>
        </section>

        <section id="admin" className="border-t border-slate-200/70 bg-slate-950 py-12 text-white dark:border-white/10">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <Badge className="bg-white/10 text-teal-100 ring-white/15">
                <UploadCloud className="mr-1 size-3.5" />
                {copy("upload")}
              </Badge>
              <h2 className="mt-4 text-3xl font-semibold">Document intelligence console</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                Upload real PDFs, tag jurisdiction metadata, and index chunks into Supabase pgvector. Uploaded authority documents are prioritized over seeded authority profiles.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {documents.slice(0, 4).map((document) => (
                  <div key={document.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-sm font-semibold">{document.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {document.status} · {document.chunk_count} chunks
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleUpload} className="rounded-lg border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="title" placeholder="Document title" required className="border-white/10 bg-white/10 text-white placeholder:text-slate-400" />
                <Input name="document_type" placeholder="bylaws / permit-manual" required className="border-white/10 bg-white/10 text-white placeholder:text-slate-400" />
                <select
                  name="authority_id"
                  className="h-11 rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-teal-500/30"
                  required
                >
                  {authorities.map((authority) => (
                    <option key={authority.id} value={authority.id}>
                      {authority.short_name} · {authority.city}
                    </option>
                  ))}
                </select>
                <Input name="issuing_department" placeholder="Issuing department" className="border-white/10 bg-white/10 text-white placeholder:text-slate-400" />
                <Input name="city" placeholder="City" required defaultValue="Kanpur" className="border-white/10 bg-white/10 text-white placeholder:text-slate-400" />
                <Input name="state" placeholder="State" required defaultValue="Uttar Pradesh" className="border-white/10 bg-white/10 text-white placeholder:text-slate-400" />
                <Input name="official_url" placeholder="Official URL" className="border-white/10 bg-white/10 text-white placeholder:text-slate-400 sm:col-span-2" />
                <Input name="tags" placeholder="tags, comma, separated" className="border-white/10 bg-white/10 text-white placeholder:text-slate-400 sm:col-span-2" />
                <Input
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Admin API key"
                  className="border-white/10 bg-white/10 text-white placeholder:text-slate-400 sm:col-span-2"
                />
                <Input ref={fileRef} name="file" type="file" accept="application/pdf" required className="border-white/10 bg-white/10 text-white sm:col-span-2" />
              </div>
              <Button type="submit" variant="premium" size="lg" className="mt-4 w-full" disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                {copy("upload")}
              </Button>
            </form>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 px-4 py-8 text-sm text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span>{copy("footer")}</span>
          <span>Vercel · Render · Supabase · pgvector</span>
        </div>
      </footer>
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
  return <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">{children}</span>;
}

function LoadingAnswer({ copy }: { copy: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
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
    <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-950 dark:text-white">{source.document_title}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {source.authority_name} · {source.city}, {source.state}
            {source.page_start ? ` · p.${source.page_start}${source.page_end && source.page_end !== source.page_start ? `-${source.page_end}` : ""}` : ""}
          </p>
        </div>
        <Badge className="w-fit bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">
          {Math.round(source.score * 100)}%
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">{source.excerpt}</p>
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
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
      <Icon className="size-5 text-teal-600 dark:text-teal-300" />
      <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}

function AuthorityCard({ authority, onSelect }: { authority: Authority; onSelect: () => void }) {
  return (
    <Card className="transition hover:-translate-y-0.5 hover:border-teal-300/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{authority.short_name}</CardTitle>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{authority.name}</p>
          </div>
          <Badge className="bg-slate-900/5 text-slate-700 ring-slate-900/10 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
            {authority.city}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{authority.jurisdiction_notes}</p>
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
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md bg-slate-950/5 px-3 py-2 text-slate-700 hover:bg-teal-500/10 dark:bg-white/5 dark:text-slate-300">
      <span>{label}</span>
      <ExternalLink className="size-3.5" />
    </a>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-950 dark:text-white">
        {question}
        <ArrowRight className="size-4 transition group-open:rotate-90" />
      </summary>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{answer}</p>
    </details>
  );
}
