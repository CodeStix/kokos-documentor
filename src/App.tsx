import { useEffect, useRef, useState } from "react";
import * as pdf from "pdfjs-dist";
import { PDFDocumentProxy, PDFPageProxy, RefProxy } from "pdfjs-dist/types/src/display/api";
import createState from "zustand";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

function PdfPage(props: {
    document: PDFDocumentProxy;
    pageNumber: number;
    scale: number;
    onExitTop: () => void;
    onExitBottom: () => void;
    onEnterTop: () => void;
    onEnterBottom: () => void;
}) {
    const [visible, setVisible] = useState(props.pageNumber < 4);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tasks = useRef<{ renderTask: any; renderTextTask: any }>({ renderTask: null, renderTextTask: null });

    async function renderPage() {
        let page = await props.document.getPage(props.pageNumber);
        let canvas = canvasRef.current!;

        let viewport = page.getViewport({ scale: props.scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        let renderTask = page.render({
            viewport,
            canvasContext: canvas.getContext("2d")!,
        });

        tasks.current.renderTask = renderTask;
        await renderTask.promise;
        tasks.current.renderTask = null;

        let textContent = await page.getTextContent();
        let textLayer = textLayerRef.current!;

        textLayer.style.left = canvas.offsetLeft + "px";
        textLayer.style.top = canvas.offsetTop - 2 + "px";
        textLayer.style.height = canvas.offsetHeight + "px";
        textLayer.style.width = canvas.offsetWidth + "px";

        while (textLayer.firstChild) {
            textLayer.removeChild(textLayer.firstChild);
        }

        let renderTextTask = pdf.renderTextLayer({
            viewport: viewport,
            textContent,
            container: textLayer,
            textDivs: [],
        });

        tasks.current.renderTextTask = renderTextTask;
        await renderTextTask.promise;
        tasks.current.renderTextTask = null;
    }

    useEffect(() => {
        let wasVisible = props.pageNumber < 4;
        function onGlobalScroll() {
            let canvas = canvasRef.current!;
            let rect = canvas.getBoundingClientRect();
            let screenHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
            if (rect.bottom < 0 || rect.top >= screenHeight) {
                // Not visible
                if (wasVisible) {
                    if (rect.bottom < 0) {
                        props.onExitTop();
                    } else {
                        props.onExitBottom();
                    }
                    wasVisible = false;
                    setVisible(false);
                }
            } else {
                // Visible on screen
                if (!wasVisible) {
                    if (rect.top < 0) {
                        props.onEnterTop();
                    } else {
                        props.onEnterBottom();
                    }
                    wasVisible = true;
                    setVisible(true);
                }
            }
        }

        window.addEventListener("scroll", onGlobalScroll);
        onGlobalScroll();

        return () => {
            window.removeEventListener("scroll", onGlobalScroll);
        };
    }, []);

    useEffect(() => {
        if (visible) renderPage();

        return () => {
            if (tasks.current.renderTask) {
                tasks.current.renderTask.cancel();
            }
            if (tasks.current.renderTextTask) {
                tasks.current.renderTextTask.cancel();
            }
        };
    }, [props.scale, visible]);

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
        <div className="p-3  overflow-y-auto">
            {items.map((item, i) => (
                <PdfChildTree document={props.document} onClick={props.onClick} key={i} level={0} item={item} />
            ))}
        </div>
    );
}

export default function App() {
    const [document, setDocument] = useState<PDFDocumentProxy>();
    const [pageIndex, setPageIndex] = useState(0);
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    async function loadPdf() {
        // https://mozilla.github.io/pdf.js/examples/
        // https://stackoverflow.com/questions/33063213/pdf-js-with-text-selection
        let res = await pdf.getDocument("/amd64volume2.pdf").promise;
        setDocument(res);
    }

    useEffect(() => {
        loadPdf();

        function onScroll(ev: WheelEvent) {
            if (ev.ctrlKey) {
                ev.preventDefault();
                if (ev.deltaY < 0) {
                    setScale((scale) => scale * 1.05);
                } else {
                    setScale((scale) => scale * 0.95);
                }
            }
        }

        window.addEventListener("wheel", onScroll, { passive: false });

        return () => {
            window.removeEventListener("wheel", onScroll);
        };
    }, []);

    if (!document) {
        return <p>loading document...</p>;
    }

    let pages = [];
    for (let i = 0; i < document.numPages; i++) {
        pages.push(
            <PdfPage
                onExitBottom={() => {
                    // console.log("page", pageIndex + i + 1, "exited bottom");
                }}
                onExitTop={() => {
                    setPageIndex((pageIndex) => pageIndex + 1);
                    // console.log("page", pageIndex + i + 1, "exited top");
                }}
                onEnterBottom={() => {
                    // console.log("page", pageIndex + i + 1, "entered bottom");
                }}
                onEnterTop={() => {
                    setPageIndex((pageIndex) => pageIndex - 1);
                    // console.log("page", pageIndex + i + 1, "entered top");
                }}
                scale={scale}
                key={i}
                document={document}
                pageNumber={i + 1}
            />
        );
    }

    return (
        <div>
            <div className="flex flex-row items-start justify-start bg-gray-700 min-h-full relative">
                <div className="sticky top-0 max-h-screen flex flex-col">
                    <nav className="shadow-md">
                        <div className="px-3 py-3 ">
                            <div className="text-xl leading-4 text-green-300 font-bold font-mono">kokos</div>
                            <div className="text-xs text-green-500">
                                documentor ({pageIndex}/{document.numPages} pages)
                            </div>
                        </div>
                    </nav>
                    <div className=" overflow-y-auto pb-10">
                        <PdfTree
                            document={document}
                            onClick={async (item) => {
                                let destination = (await document.getDestination(String(item.dest))) as RefProxy[];
                                if (!destination || destination.length <= 0) return;
                                let newPageIndex = await document.getPageIndex(destination[0]);
                                console.log("change index", destination);
                                setPageIndex(newPageIndex);
                                containerRef.current!.children[newPageIndex].scrollIntoView({});
                            }}
                        />
                    </div>
                </div>
                <div className="max-w-5xl bg-white flex-grow-0 flex-shrink" ref={containerRef}>
                    {pages}
                </div>
            </div>
        </div>
    );
}
