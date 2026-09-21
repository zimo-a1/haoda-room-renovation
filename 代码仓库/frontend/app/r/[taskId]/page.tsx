"use client";

import { useParams } from "next/navigation";
import { ResultView } from "@/features/renovation/components/result-view";

export default function ResultPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = typeof params?.taskId === "string" ? params.taskId : "";
  return <ResultView taskId={taskId} />;
}
