import { useEffect, useRef, useState } from "react";
import * as pdf from "pdfjs-dist";
import { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";

pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

function PdfPage(props: { document: PDFDocumentProxy; pageNumber: number }) {
    const textLayerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    async function loadPage() {
        let page = await props.document.getPage(props.pageNumber);
        let canvas = canvasRef.current!;

        let viewport = page.getViewport({ scale: 1 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
            viewport,
            canvasContext: canvas.getContext("2d")!,
        }).promise;

        let textContent = await page.getTextContent();
        let textLayer = textLayerRef.current!;

        textLayer.style.left = canvas.offsetLeft + "px";
        textLayer.style.top = canvas.offsetTop - 2 + "px";
        textLayer.style.height = canvas.offsetHeight + "px";
        textLayer.style.width = canvas.offsetWidth + "px";

        pdf.renderTextLayer({
            viewport: viewport,
            textContent,
            container: textLayer,
            textDivs: [],
        });
    }

    useEffect(() => {
        loadPage();
    }, []);

    return (
        <div className="relative border">
            <canvas ref={canvasRef}></canvas>
            <div className="text-layer" ref={textLayerRef}></div>
        </div>
    );
}

export default function App() {
    const [document, setDocument] = useState<PDFDocumentProxy>();

    async function loadPdf() {
        // https://mozilla.github.io/pdf.js/examples/
        // https://stackoverflow.com/questions/33063213/pdf-js-with-text-selection
        let res = await pdf.getDocument("/multiboot.pdf").promise;
        setDocument(res);
    }

    useEffect(() => {
        loadPdf();
    }, []);

    if (!document) {
        return <p>loading document...</p>;
    }

    return (
        <div className="flex flex-row justify-center bg-gray-600 min-h-full">
            <div className="max-w-5xl bg-white w-full">
                <PdfPage document={document} pageNumber={1} />
                <PdfPage document={document} pageNumber={2} />
                <PdfPage document={document} pageNumber={3} />
                <PdfPage document={document} pageNumber={4} />
                <pre>page count = {document.numPages}</pre>
            </div>
        </div>
    );
}
