import type { GenerationDiagnostics } from "../types";

export function GenerationDiagnosticDetails({ diagnostics }: { diagnostics?: GenerationDiagnostics }) {
  if (!diagnostics) return null;
  return (
    <section aria-label="生成失败诊断" className="dialog-privacy" style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      <p>诊断信息（可截图反馈）</p>
      <p>请求状态：{diagnostics.httpStatus ?? "未收到有效响应"}</p>
      <p>上游错误信息：{diagnostics.upstreamCode ? "已记录" : "未提供"}</p>
      <p>本次请求信息：{diagnostics.requestId ? "已记录" : "未提供"}</p>
      {diagnostics.responseKind === "non_json" && <p>响应格式不符合预期，可能来自接口或网络代理；仅凭此不能判断模型是否开通。</p>}
      {diagnostics.responseKind === "transport" && <p>连接或等待响应时失败，不代表上游未执行；请先核对账单。</p>}
    </section>
  );
}
