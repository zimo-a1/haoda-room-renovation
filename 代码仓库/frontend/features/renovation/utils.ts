export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function validatePhoto(file: File): string | null {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return "请选择常见图片格式的文件。";
  if (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "图片格式不受支持，请选择常见图片格式。";
  if (file.size === 0) return "这张图片是空文件，请重新选择。";
  if (file.size > MAX_PHOTO_BYTES) return "图片超过 10 兆字节，请选择小一些的图片。";
  return null;
}

export const styleMood: Record<string, { description: string; photo: string }> = {
  nordic: { description: "浅木 · 灰白布艺", photo: "/images/style-nordic-v3.png" },
  japanese: { description: "低矮原木 · 障子", photo: "/images/style-japanese-v3.png" },
  cream: { description: "奶白曲面 · 软包", photo: "/images/style-cream-v3.png" },
  french: { description: "石膏线 · 雕花家具", photo: "/images/style-french-v3.png" },
  "mid-century": { description: "胡桃木 · 复古皮革", photo: "/images/style-mid-century-v3.png" },
};
