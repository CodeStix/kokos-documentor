import { useEffect, useRef, useState } from "react";
import * as pdf from "pdfjs-dist";
import { PDFDocumentProxy, PDFPageProxy, RefProxy } from "pdfjs-dist/types/src/display/api";
import createState from "zustand";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

function PdfPage(props: { document: PDFDocumentProxy; pageNumber: number }) {
    const textLayerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    async function loadPage() {
        let page = await props.document.getPage(props.pageNumber);
        let canvas = canvasRef.current!;

        let viewport = page.getViewport({ scale: 1.2 });
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
            <canvas width={600} height={800} ref={canvasRef}></canvas>
            <div className="text-layer" ref={textLayerRef}></div>
        </div>
    );
}

interface TreeItem {
    items: TreeItem[];
    title: string;
    dest: string | null | any[];
}

function PdfChildTree(props: { item: TreeItem; level: number; document: PDFDocumentProxy; onClick: (item: TreeItem) => void }) {
    const [shown, setShown] = useState(false);
    const [pageNumber, setPageNumber] = useState<number>();

    async function getPageInfo() {
        let destination = (await props.document.getDestination(String(props.item.dest))) as RefProxy[];
        if (!destination || destination.length <= 0) return;
        let pageIndex = await props.document.getPageIndex(destination[0]);
        setPageNumber(pageIndex + 1);
    }

    useEffect(() => {
        getPageInfo();
    }, []);

    return (
        <div>
            <p
                className="flex flex-row flex-wrap text-white cursor-pointer hover:bg-blue-500 hover:border-transparent px-2 py-0.5 border-b border-gray-900 border-dotted hover:rounded-md rounded-none"
                onClick={() => {
                    setShown(!shown);
                    props.onClick(props.item);
                }}
                style={{ fontWeight: props.level === 0 ? "bold" : undefined, marginLeft: props.level * 10 + "px" }}>
                <span className="w-5">
                    {props.item.items.length > 0 && (
                        <FontAwesomeIcon icon={faChevronDown} style={{ transform: shown ? "rotate(0deg)" : "rotate(-90deg)", transition: "100ms" }} />
                    )}
                </span>
                <span className="max-w-xs mr-1">{props.item.title}</span>
                {pageNumber != undefined && <span className="ml-auto">{pageNumber}</span>}
            </p>
            {shown &&
                props.item.items.length > 0 &&
                props.item.items.map((item, i) => (
                    <PdfChildTree document={props.document} onClick={props.onClick} key={i} level={props.level + 1} item={item} />
                ))}
        </div>
    );
}

function PdfTree(props: { document: PDFDocumentProxy; onClick: (item: TreeItem) => void }) {
    const [items, setItems] = useState<TreeItem[]>([]);

    async function loadTree() {
        let root = await props.document.getOutline();
        setItems(root);
    }

    useEffect(() => {
        loadTree();
    }, []);

    return (
        <div className="sticky top-0 p-3 max-h-screen overflow-y-auto">
            {items.map((item, i) => (
                <PdfChildTree document={props.document} onClick={props.onClick} key={i} level={0} item={item} />
            ))}
        </div>
    );
}

export default function App() {
    const [document, setDocument] = useState<PDFDocumentProxy>();
    const [pageIndex, setPageIndex] = useState(0);

    async function loadPdf() {
        // https://mozilla.github.io/pdf.js/examples/
        // https://stackoverflow.com/questions/33063213/pdf-js-with-text-selection
        let res = await pdf.getDocument("/amd64volume2.pdf").promise;
        setDocument(res);
    }

    useEffect(() => {
        loadPdf();
    }, []);

    if (!document) {
        return <p>loading document...</p>;
    }

    return (
        <div className="flex flex-row items-start justify-start bg-gray-700 min-h-full relative">
            <PdfTree
                document={document}
                onClick={async (item) => {
                    let destination = (await document.getDestination(String(item.dest))) as RefProxy[];
                    if (!destination || destination.length <= 0) return;
                    let newPageIndex = await document.getPageIndex(destination[0]);
                    console.log("change index", destination);
                    setPageIndex(newPageIndex);
                }}
            />
            <div className="max-w-5xl bg-white flex-grow-0 flex-shrink">
                {new Array(Math.min(document.numPages, 2)).fill(0).map((_, i) => (
                    <PdfPage key={pageIndex + i + 1} document={document} pageNumber={pageIndex + i + 1} />
                ))}
            </div>
        </div>
    );
}
