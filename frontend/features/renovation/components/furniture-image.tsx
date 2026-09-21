import Image from "next/image";
import { useState } from "react";
import type { FurnitureOption } from "../types";

export function FurnitureImage({ option, small = false }: { option: FurnitureOption; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className="furniture-image">
    {failed ? <span className="furniture-image-error">图片暂未加载<br />{option.name}</span> : <Image
      src={option.image}
      alt={`${option.name}，智能款式示意图`}
      fill
      // Each square displays one third of a 3:1 photo atlas. Fetch enough pixels
      // for the full atlas, not only the visible third; the three cards share it.
      sizes={small ? "240px" : "(max-width: 679px) 150vw, (max-width: 1199px) 100vw, 1200px"}
      style={{ objectFit: "cover", objectPosition: `${option.panel * 50}% center` }}
      onError={() => setFailed(true)}
    />}
  </span>;
}
