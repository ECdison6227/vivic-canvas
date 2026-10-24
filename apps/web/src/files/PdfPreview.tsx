import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";

export function PdfPreview({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null), [page, setPage] = useState(1), [error, setError] = useState("");
  const [renderedPage, setRenderedPage] = useState(0);
  useEffect(() => {
    let active = true;
    let destroy: (() => void) | undefined;
    setDocument(null); setPage(1); setError(""); setRenderedPage(0);
    void (async () => {
      try {
        const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }, bytes] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"), blob.arrayBuffer()]);
        if (!active) return;
        GlobalWorkerOptions.workerSrc = workerUrl;
        const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, useWasm: false, maxImageSize: 16_000_000, verbosity: 0 });
        const timer = setTimeout(() => { void task.destroy().catch(() => {}); }, 20_000);
        destroy = () => { clearTimeout(timer); void task.destroy().catch(() => {}); };
        task.onPassword = () => { destroy?.(); if (active) setError("加密 PDF 请下载后在本机打开"); };
        const pdf = await task.promise; clearTimeout(timer);
        if (active) setDocument(pdf);
      } catch { if (active) setError("PDF 预览不可用，仍可下载原文件"); }
    })();
    return () => { active = false; destroy?.(); };
  }, [blob]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let cancel: (() => void) | undefined;
    const node = canvas.current;
    void document.getPage(page).then(pdfPage => {
      if (!active) return;
      const initial = pdfPage.getViewport({ scale: 1 }), scale = Math.min(1.4, 900 / Math.max(initial.width, initial.height));
      const viewport = pdfPage.getViewport({ scale });
      node.width = Math.ceil(viewport.width); node.height = Math.ceil(viewport.height);
      const task = pdfPage.render({ canvas: node, viewport }); cancel = () => task.cancel();
      return task.promise.then(() => { if (active) setRenderedPage(page); });
    }).catch(() => { if (active) setError("这一页暂时无法预览"); });
    return () => { active = false; cancel?.(); };
  }, [document, page]);
  const changePage = (delta: number) => {
    setPage(value => value + delta);
    const scroll = container.current?.closest<HTMLElement>(".vivic-file-reading-scroll,.mobile-file-reader-content");
    if (scroll) scroll.scrollTop = 0;
  };
  return <div className="vivic-file-pdf" ref={container}>
    {document && <div className="vivic-file-pages"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => changePage(-1)}>上一页</Button><span>{page} / {document.numPages}</span><Button variant="ghost" size="sm" disabled={page >= document.numPages} onClick={() => changePage(1)}>下一页</Button></div>}
    {!document && !error && <p className="vivic-file-loading" role="status">正在打开 PDF…</p>}
    {error ? <p role="status">{error}</p> : <canvas ref={canvas} aria-label={`PDF 第 ${page} 页`} data-pdf-ready={renderedPage === page || undefined} />}
  </div>;
}
