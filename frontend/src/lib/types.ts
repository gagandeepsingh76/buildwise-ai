export type Language = "en" | "hi";

export type Authority = {
  id: string;
  name: string;
  short_name: string;
  city: string;
  state: string;
  country: string;
  aliases: string[];
  jurisdiction_notes?: string | null;
  official_website?: string | null;
  permit_portal?: string | null;
  forms_url?: string | null;
  bylaws_url?: string | null;
  contact?: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  tags: string[];
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
  chunk_id?: string | null;
  document_id: string;
  document_title: string;
  authority_name: string;
  city: string;
  state: string;
  page_start?: number | null;
  page_end?: number | null;
  official_url?: string | null;
  score: number;
  excerpt: string;
  metadata: Record<string, unknown>;
};

export type GroundedAnswer = {
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

export type AskResponse = {
  query_id: string;
  session_id: string;
  language: Language;
  needs_clarification: boolean;
  clarification_question?: string | null;
  jurisdiction?: Authority | null;
  detected: Record<string, string | number | null>;
  answer: GroundedAnswer;
  sources: SourceReference[];
  suggested_questions: string[];
};

export type DocumentRecord = {
  id: string;
  authority_id: string;
  title: string;
  document_type: string;
  city: string;
  state: string;
  country: string;
  issuing_department?: string | null;
  effective_date?: string | null;
  official_url?: string | null;
  tags: string[];
  status: string;
  file_name?: string | null;
  file_size?: number | null;
  storage_path?: string | null;
  chunk_count: number;
  indexed_at?: string | null;
  created_at?: string | null;
};

export type HistoryItem = {
  id: string;
  session_id?: string | null;
  query: string;
  language: Language;
  detected: Record<string, unknown>;
  answer: Partial<GroundedAnswer>;
  sources: SourceReference[];
  confidence?: number | null;
  created_at?: string | null;
};
