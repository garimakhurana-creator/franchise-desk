export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-[640px] content-center gap-4 px-4">
      <p className="text-[13px] text-muted">404 · page not found</p>
      <h1 className="serif text-[40px] leading-tight">
        This pin has no store, <em>and no page either.</em>
      </h1>
      <p className="text-[16px] text-ink-2">The desk lives on one page. Go back and upload the workbook or try the sample data.</p>
      <a href="/" className="w-fit rounded-full px-4 py-2 text-[14px] font-semibold" style={{ background: "var(--neon)", color: "var(--on-neon)" }}>
        Open the desk
      </a>
    </main>
  );
}
