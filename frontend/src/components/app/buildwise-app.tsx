"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Building2,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileSearch,
  FileText,
  Globe2,
  History,
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
  UploadCloud,
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
            <Metric icon={MapPinned} label="Jurisdictions" value={`${authorities.length}`} />
            <Metric icon={FileText} label="Indexed docs" value={`${documents.length}`} />
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
                  <div className="grid gap-4 md:grid-cols-[1.4fr_.6fr]">
                    <div className="bw-card rounded-lg p-4">
                      <p className="bw-text-muted text-xs font-semibold uppercase">{copy("quickSummary")}</p>
                      <p className="bw-text-primary mt-2 text-base leading-7">{answer.answer.quick_summary}</p>
                    </div>
                    <div className="bw-card rounded-lg p-4">
                      <p className="bw-text-muted text-xs font-semibold uppercase">{copy("isAllowed")}</p>
                      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="bw-text-primary text-2xl font-semibold">{answer.answer.is_allowed}</span>
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
                        <div key={section.key} className="bw-card rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-teal-600 dark:text-teal-300" />
                            <h3 className="bw-text-primary text-sm font-semibold">{copy(section.label)}</h3>
                          </div>
                          <ul className="bw-text-secondary mt-3 space-y-2 text-sm leading-6">
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

                  <div className="bw-card rounded-lg p-4">
                    <h3 className="bw-text-primary text-sm font-semibold">{copy("links")}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answer.answer.official_authority_links.map((link) => (
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
                  {answer?.sources.length || 0} sources
                </Badge>
              </div>
              <div className="grid gap-3">
                {(answer?.sources || []).map((source) => (
                  <SourceCard key={`${source.document_id}-${source.chunk_id}`} source={source} />
                ))}
                {answer && answer.sources.length === 0 && (
                  <p className="bw-text-muted rounded-lg border border-dashed border-slate-300 p-6 text-sm dark:border-white/15">
                    No source cards were returned because the assistant requested clarification first.
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
                answer="Yes. Add an authority in the catalog/database, upload official PDFs with metadata, then reindex. Retrieval filters by authority, city, state, document type, and source metadata."
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
                Upload real PDFs, tag jurisdiction metadata, and index chunks into Supabase pgvector. Uploaded authority documents are prioritized over seeded authority profiles.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {documents.slice(0, 4).map((document) => (
                  <div key={document.id} className="bw-card-soft rounded-lg p-3">
                    <p className="text-sm font-semibold">{document.title}</p>
                    <p className="bw-text-muted mt-1 text-xs">
                      {document.status} · {document.chunk_count} chunks
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleUpload} className="bw-card rounded-lg p-5 backdrop-blur-xl">
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
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Admin API key"
                  className="sm:col-span-2"
                />
                <Input ref={fileRef} name="file" type="file" accept="application/pdf" required className="sm:col-span-2" />
              </div>
              <Button type="submit" variant="premium" size="lg" className="mt-4 w-full" disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                {copy("upload")}
              </Button>
            </form>
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
            {source.authority_name} · {source.city}, {source.state}
            {source.page_start ? ` · p.${source.page_start}${source.page_end && source.page_end !== source.page_start ? `-${source.page_end}` : ""}` : ""}
          </p>
        </div>
        <Badge className="w-fit bg-teal-500/15 text-teal-700 ring-teal-500/20 dark:text-teal-200">
          {Math.round(source.score * 100)}%
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
