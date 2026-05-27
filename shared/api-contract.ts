export type Language = "en" | "hi";

export type Jurisdiction = {
  id: string;
  name: string;
  short_name: string;
  city: string;
  state: string;
  country: string;
  official_website: string;
  permit_portal: string;
  forms_url: string;
  bylaws_url: string;
};

export type WizardContext = {
  city?: string;
  state?: string;
  authority_id?: string;
  project_type?: string;
  property_type?: string;
  occupancy_type?: string;
  plot_size_sqm?: number;
  floors?: string;
  road_width_m?: number;
  budget_inr?: number;
  notes?: string;
};

export type SourceReference = {
  document_id: string;
  document_title: string;
  authority_name: string;
  city: string;
  page_start?: number | null;
  page_end?: number | null;
  official_url?: string | null;
  score: number;
  excerpt: string;
};

export type AskRequest = {
  query: string;
  language: Language;
  session_id?: string;
  context?: WizardContext;
};

export type AskResponse = {
  query_id: string;
  session_id: string;
  language: Language;
  needs_clarification: boolean;
  clarification_question?: string | null;
  jurisdiction?: Jurisdiction | null;
  detected: Record<string, string | number | null>;
  answer: {
    quick_summary: string;
    is_allowed: "Yes" | "Conditional" | "No" | "Unknown";
    applicable_authority: string;
    required_approvals: string[];
    required_documents: string[];
    relevant_restrictions: string[];
    far_height_setback_notes: string[];
    inspection_requirements: string[];
    risks_common_mistakes: string[];
    suggested_next_steps: string[];
    official_authority_links: string[];
    confidence_indicator: "High" | "Medium" | "Low";
    assumptions_uncertainty_notes: string[];
  };
  sources: SourceReference[];
  suggested_questions: string[];
};
