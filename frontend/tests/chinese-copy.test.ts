import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const visibleCopyFiles = [
  "app/page.tsx",
  "app/design/page.tsx",
  "components/site-header.tsx",
  "components/site-footer.tsx",
  "components/before-after-showcase.tsx",
  "features/renovation/components/workspace.tsx",
  "features/renovation/components/photo-uploader.tsx",
  "features/renovation/components/style-picker.tsx",
  "features/renovation/components/element-picker.tsx",
  "features/renovation/components/confirmation-dialog.tsx",
  "features/renovation/components/result-view.tsx",
  "features/renovation/components/generation-diagnostics.tsx",
  "features/renovation/components/furniture-image.tsx",
  "features/renovation/utils.ts",
  "lib/api/client.ts",
];

describe("面向用户的页面文案", () => {
  it("移除原有英文标签、重复英文描述和英文模型编号", () => {
    const source = visibleCopyFiles.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    for (const copy of [
      "Room, renewed.", "Explore", "Good to know", "Make it yours", "Your room, as it is.",
      "Your room comes first.", "Original perspective", "Before you begin", "Your new room",
      "The next chapter", "A new perspective", "Nordic living", "Japanese calm", "Soft cream",
      "French feeling", "Mid-century mood", "AI 款式", "AI 创作", "AI 生成", "ARK_API_KEY",
      "doubao-seedream-5-0-260128", "photo.file.name", "diagnostics.upstreamCode}", "diagnostics.requestId}",
      "10MB", "JPG、PNG", "WebP", "ModelNotOpen", "ModelNotFound", "HTTP 404",
    ]) expect(source).not.toContain(copy);
  });

  it("保留中文说明和必要的生成边界", () => {
    const source = visibleCopyFiles.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    for (const copy of ["智能款式示意", "图像生成服务", "常见图片格式", "请求状态", "原图仅用于本次设计"]) expect(source).toContain(copy);
  });
});
