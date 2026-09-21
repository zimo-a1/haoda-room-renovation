export type Style = { id: string; name: string };
export type Element = { id: string; name: string; room: string };
export type FurnitureOption = { id: string; name: string; image: string; panel: number };
export type FurnitureChoice = { element: Element; option: FurnitureOption };
export type Resource<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };
export type Photo = { file: File; url: string; photoId: string | null; status: "ready" | "uploading" | "success" | "error"; message?: string };

export type GenerationDiagnostics = {
  httpStatus: number | null;
  upstreamCode: string | null;
  requestId: string | null;
  responseKind: "json" | "non_json" | "transport";
};

export type GeneratedTask = {
  taskId: string;
  status: string;
  styleId: string;
  elementIds: string[];
  resultImageUrl: string;
  cost: number | null;
  furnitureChoices: FurnitureChoice[];
  errorCode?: string;
  diagnostics?: GenerationDiagnostics;
};

export type GenerationOptions = {
  provider: string;
  providerLabel: string;
  model: string;
  configured: boolean;
  maxProductImages: number;
  individualReferences: boolean;
  estimatedCost: number;
};

export type ProductLink = { title: string; clickUrl: string; imageUrl: string | null; price: string | null };
export type ElementProducts = { elementId: string; elementName: string; items: ProductLink[] };
export type TaskProducts = { configured: boolean; message: string; products: ElementProducts[] };
