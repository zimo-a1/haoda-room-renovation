export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="alert"><span>{message}</span>{retry && <button type="button" onClick={retry}>重试</button>}</div>;
}

export function LoadingCards({ label, count = 5 }: { label: string; count?: number }) {
  return <div className="loading-cards" role="status" aria-label={label}>{Array.from({ length: count }, (_, i) => <span className="skeleton" key={i} />)}<span className="sr-only">{label}</span></div>;
}
