import { AppError, isRecord, request } from "@/lib/api/client";
import type { Element, FurnitureChoice, GeneratedTask, GenerationDiagnostics, GenerationOptions, ProductLink, Style, TaskProducts } from "../types";

function invalid(): never { throw new AppError("INVALID_RESPONSE", "收到的数据暂时无法使用，请重试。", true); }

export function parseStyles(value: unknown): Style[] {
  if (!isRecord(value) || !Array.isArray(value.styles)) return invalid();
  const items = value.styles.map((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name) return invalid();
    return { id: item.id, name: item.name };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalid();
  return items;
}

export function parseElements(value: unknown, styleId: string): Element[] {
  if (!isRecord(value) || value.style_id !== styleId || !Array.isArray(value.elements)) return invalid();
  const items = value.elements.map((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name || typeof item.room !== "string" || !item.room) return invalid();
    return { id: item.id, name: item.name, room: item.room };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalid();
  return items;
}

export async function getStyles(signal?: AbortSignal) { return parseStyles(await request("/styles", { signal })); }
export async function getElements(styleId: string, signal?: AbortSignal) { return parseElements(await request(`/styles/${encodeURIComponent(styleId)}/elements`, { signal }), styleId); }
export async function uploadPhoto(file: File, signal?: AbortSignal): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const data = await request("/photos", { method: "POST", body, signal }, 30_000);
  if (!isRecord(data) || typeof data.photo_id !== "string" || !data.photo_id) return invalid();
  return data.photo_id;
}

function parseDiagnostics(value: unknown): GenerationDiagnostics | undefined {
  if (value == null) return undefined; // 历史任务没有原始诊断，不伪造。
  if (!isRecord(value)) return invalid();
  const status = value.http_status ?? null;
  if (status !== null && (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599)) return invalid();
  function identifier(value: unknown, limit: number, pattern: RegExp): string | null {
    if (value == null) return null;
    if (typeof value !== "string" || value.length < 1 || value.length > limit || !pattern.test(value) || /\s/.test(value) || /^(sk-|bearer|data:|https?:)/i.test(value)) return invalid();
    return value;
  }
  if (value.response_kind !== "json" && value.response_kind !== "non_json" && value.response_kind !== "transport") return invalid();
  return {
    httpStatus: status,
    upstreamCode: identifier(value.upstream_code, 96, /^[A-Za-z][A-Za-z0-9_.-]*$/),
    requestId: identifier(value.request_id, 128, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    responseKind: value.response_kind,
  };
}

export function parseTask(value: unknown): GeneratedTask {
  if (
    !isRecord(value) ||
    typeof value.task_id !== "string" ||
    typeof value.status !== "string" ||
    typeof value.style_id !== "string" ||
    !Array.isArray(value.element_ids) ||
    !value.element_ids.every((id) => typeof id === "string")
  )
    return invalid();
  const resultImageUrl = typeof value.result_image_url === "string" ? value.result_image_url : "";
  const selections = value.furniture_selections ?? [];
  if (!Array.isArray(selections)) return invalid();
  const furnitureChoices: FurnitureChoice[] = selections.map((item: unknown) => {
    if (!isRecord(item) ||
      ![item.element_id, item.element_name, item.room, item.option_id, item.option_name, item.image].every((field) => typeof field === "string" && field.length > 0) ||
      typeof item.panel !== "number" || ![0, 1, 2].includes(item.panel) ||
      typeof item.image !== "string" || !/^\/images\/furniture\/[a-z0-9-]+\.png$/.test(item.image)
    ) return invalid();
    return {
      element: { id: item.element_id as string, name: item.element_name as string, room: item.room as string },
      option: { id: item.option_id as string, name: item.option_name as string, image: item.image, panel: item.panel },
    };
  });
  if (new Set(furnitureChoices.map((item) => item.element.id)).size !== furnitureChoices.length ||
    furnitureChoices.some((item) => !(value.element_ids as string[]).includes(item.element.id))) return invalid();
  if (value.error != null && (!isRecord(value.error) || typeof value.error.code !== "string")) return invalid();
  return {
    taskId: value.task_id,
    status: value.status,
    styleId: value.style_id,
    elementIds: value.element_ids as string[],
    resultImageUrl,
    cost: typeof value.cost === "number" ? value.cost : null,
    furnitureChoices,
    errorCode: isRecord(value.error) ? value.error.code as string : undefined,
    diagnostics: parseDiagnostics(value.diagnostics),
  };
}

export async function getGenerationOptions(signal?: AbortSignal): Promise<GenerationOptions> {
  const data = await request("/generation-options", { signal });
  if (!isRecord(data) || typeof data.provider !== "string" || typeof data.provider_label !== "string" || typeof data.model !== "string" ||
    typeof data.configured !== "boolean" || typeof data.individual_references !== "boolean" ||
    typeof data.max_product_images !== "number" || !Number.isInteger(data.max_product_images) || data.max_product_images < 1 || data.max_product_images > 24 ||
    typeof data.estimated_cost !== "number" || !Number.isFinite(data.estimated_cost) || data.estimated_cost < 0) return invalid();
  return { provider: data.provider, providerLabel: data.provider_label, model: data.model, configured: data.configured,
    maxProductImages: data.max_product_images, individualReferences: data.individual_references, estimatedCost: data.estimated_cost };
}

const GENERATE_TIMEOUT = 180_000;

export async function createTask(
  photoId: string,
  styleId: string,
  choices: FurnitureChoice[],
  signal?: AbortSignal,
): Promise<GeneratedTask> {
  const data = await request(
    "/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_id: photoId,
        style_id: styleId,
        element_ids: choices.map(({ element }) => element.id),
        furniture_selections: choices.map(({ element, option }) => ({ element_id: element.id, option_id: option.id })),
      }),
      signal,
    },
    GENERATE_TIMEOUT,
  );
  return parseTask(data);
}

export async function getTask(taskId: string, signal?: AbortSignal): Promise<GeneratedTask> {
  return parseTask(await request(`/tasks/${encodeURIComponent(taskId)}`, { signal }, 15_000));
}

export function parseProducts(value: unknown): TaskProducts {
  if (!isRecord(value) || typeof value.configured !== "boolean" || typeof value.message !== "string" || !Array.isArray(value.products))
    return invalid();
  const products = value.products.map((group: unknown) => {
    if (!isRecord(group) || typeof group.element_id !== "string" || typeof group.element_name !== "string" || !Array.isArray(group.items))
      return invalid();
    const items = group.items.map((item: unknown): ProductLink => {
      if (!isRecord(item) || typeof item.title !== "string" || typeof item.click_url !== "string") return invalid();
      return {
        title: item.title,
        clickUrl: item.click_url,
        imageUrl: typeof item.image_url === "string" ? item.image_url : null,
        price: typeof item.price === "string" ? item.price : null,
      };
    });
    return { elementId: group.element_id, elementName: group.element_name, items };
  });
  return { configured: value.configured, message: value.message, products };
}

export async function getTaskProducts(taskId: string, signal?: AbortSignal): Promise<TaskProducts> {
  return parseProducts(await request(`/tasks/${encodeURIComponent(taskId)}/products`, { method: "POST", signal }, 15_000));
}
