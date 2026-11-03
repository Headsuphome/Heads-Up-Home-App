// Shared shapes used across the backend. Kept dependency-free so they run in
// Supabase Edge Functions (Deno) and in local tests (Node).

export type Source = 'fsa' | 'opss' | 'mhra' | 'fss' | 'vmd';

export type AlertType = 'recall' | 'allergy' | 'safety-report' | 'safety-alert' | 'action';

export type RiskLevel = 'serious' | 'high' | 'medium' | 'low' | null;

export interface RecallProduct {
  name: string;
  barcode: string | null;
  packSize: string | null;
  batchCodes: string[];
  bestBefore: string | null;
  useBy: string | null;
  batchNotes: string | null;
}

/** One recall in our own format, whichever agency it came from. */
export interface Recall {
  id: string;            // "fsa:FSA-PRIN-45-2026" / "opss:2609-0076"
  source: Source;
  sourceRef: string;
  alertType: AlertType;
  title: string;
  summary: string | null;
  advice: string | null;
  riskLevel: RiskLevel;
  categories: string[];
  allergens: string[];
  businesses: string[];
  sourceUrl: string;
  /** The notice's attached PDF, which usually contains the product photos. */
  documentUrl: string | null;
  /** A photo published directly as an image (rare); otherwise filled in later from the PDF. */
  imageUrl: string | null;
  publishedAt: string;   // ISO 8601
  updatedAt: string;     // ISO 8601
  products: RecallProduct[];
}

export interface UserProfile {
  userId: string;
  categories: string[];
  allergens: string[];
  alertTiming: 'instant' | 'daily';
}

export interface CupboardItem {
  id: number;
  userId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  dismissedRecalls: string[];
}

export type MatchReason = 'cupboard' | 'allergen' | 'category';
export type MatchConfidence = 'barcode' | 'likely' | 'possible' | null;

export interface Match {
  userId: string;
  recallId: string;
  reason: MatchReason;
  confidence: MatchConfidence;
  cupboardItemId: number | null;
}
