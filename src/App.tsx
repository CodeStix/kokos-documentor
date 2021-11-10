import { useEffect, useRef, useState } from "react";
import * as pdf from "pdfjs-dist";
import { PDFDocumentProxy, PDFPageProxy, RefProxy } from "pdfjs-dist/types/src/display/api";
import createState from "zustand";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

type MarkedSelection = [startPage: number, startIndex: number, endPage: number, endIndex: number];

function PdfPage(props: {
    document: PDFDocumentProxy;
    pageIndex: number;
    scale: number;
    selection?: MarkedSelection;
    onExitTop: () => void;
    onExitBottom: () => void;
    onEnterTop: () => void;
    onEnterBottom: () => void;
}) {
    const [visible, setVisible] = useState(props.pageIndex < 4);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tasks = useRef<{ page: PDFPageProxy | null; renderTask: any; renderTextTask: any }>({ page: null, renderTask: null, renderTextTask: null });

    async function renderPage() {
        if (!tasks.current!.page) {
            tasks.current!.page = await props.document.getPage(props.pageIndex + 1);
        }

        let page = tasks.current.page!;
        let canvas = canvasRef.current!;
        let textLayer = textLayerRef.current!;

        let viewport = page.getViewport({ scale: props.scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        textLayer.style.left = canvas.offsetLeft + "px";
        textLayer.style.top = canvas.offsetTop - 2 + "px";
        textLayer.style.height = canvas.offsetHeight + "px";
        textLayer.style.width = canvas.offsetWidth + "px";

        let renderTask = page.render({
            viewport,
            canvasContext: canvas.getContext("2d")!,
        });

        tasks.current.renderTask = renderTask;
        await renderTask.promise;
        tasks.current.renderTask = null;
    }

    async function renderText() {
        if (!tasks.current!.page) {
            tasks.current!.page = await props.document.getPage(props.pageIndex + 1);
        }

        let page = tasks.current.page!;
        let textContent = await page.getTextContent();
        let textLayer = textLayerRef.current!;
        let viewport = page.getViewport({ scale: props.scale });

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

        if (props.selection) {
            let [startPage, startIndex, endPage, endIndex] = props.selection;
            if (startPage == props.pageIndex || endIndex == props.pageIndex) {
                let start = 0;
                let end = 0;

                if (startPage == props.pageIndex) {
                    start = startIndex;
                } else {
                    start = 0;
                }

                if (endPage == props.pageIndex) {
                    end = endIndex;
                } else {
                    end = 99999;
                }

                for (let i = start; i <= end && i < textLayer.childNodes.length; i++) {
                    let element = textLayer.children[i] as HTMLElement;
                    element.classList.add("marked");
                }
            }
        }
    }

    useEffect(() => {
        let wasVisible = props.pageIndex < 4;
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
        };
    }, [props.scale, visible]);

    useEffect(() => {
        if (visible) renderText();

        return () => {
            if (tasks.current.renderTextTask) {
                tasks.current.renderTextTask.cancel();
            }
        };
    }, [props.selection, props.scale, visible]);

    return (
        <div className="relative border bg-white">
            <canvas width={740} height={957} ref={canvasRef}></canvas>
            <div className="text-layer" ref={textLayerRef}></div>
        </div>
    );
}

interface TreeItem {
    items: TreeItem[];
    title: string;
    dest: string | null | any[];
}

function PdfChildTree(props: {
    item: TreeItem;
    level: number;
    document: PDFDocumentProxy;
    onClick: (item: TreeItem, path: string[]) => void;
    path: string[];
}) {
    const [shown, setShown] = useState(false);
    const [pageNumber, setPageNumber] = useState<number>();

    async function getPageInfo() {
        let destination = (await props.document.getDestination(String(props.item.dest))) as RefProxy[];
        if (!destination || destination.length <= 0) return;
        await new Promise((res) => requestAnimationFrame(res));
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
                    props.onClick(props.item, props.path);
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
                    <PdfChildTree
                        document={props.document}
                        onClick={props.onClick}
                        key={i}
                        level={props.level + 1}
                        item={item}
                        path={[...props.path, item.title]}
                    />
                ))}
        </div>
    );
}

function PdfTree(props: { document: PDFDocumentProxy; onClick: (item: TreeItem, path: string[]) => void }) {
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
                <PdfChildTree document={props.document} onClick={props.onClick} key={i} level={0} item={item} path={[item.title]} />
            ))}
        </div>
    );
}

// https://mozilla.github.io/pdf.js/examples/
// https://stackoverflow.com/questions/33063213/pdf-js-with-text-selection

export default function App() {
    let hash = location.hash.slice(1);
    let version = null,
        documentName = "amd64volume2.pdf",
        pageIndex = 0,
        selection = null;
    if (hash) {
        try {
            [version, documentName, pageIndex, selection] = JSON.parse(atob(hash));
        } catch (ex) {
            console.error("could not decode hash", hash);
        }
    }

    console.log({ pageIndex });

    return <AppContainer initialDocument={documentName} initialPageIndex={pageIndex} selection={selection} />;
}

interface DocumentIndex {
    items: {
        path: string;
        name: string;
    }[];
}

// See http://localhost:3000/amd64volume2.pdf/4.10.2_Accessing_Stack_Segments
function AppContainer(props: { initialDocument: string; initialPageIndex?: number; selection?: MarkedSelection }) {
    const [documents, setDocuments] = useState<DocumentIndex>();
    const [documentName, setDocumentName] = useState(props.initialDocument);
    const [document, setDocument] = useState<PDFDocumentProxy>();
    const [pageIndex, setPageIndex] = useState(props.initialPageIndex || 0);
    const [scale, setScale] = useState(1.2);
    const [selection, setSelection] = useState<MarkedSelection | undefined>(props.selection);
    const containerRef = useRef<HTMLDivElement>(null);

    async function loadPdf(documentName: string) {
        document?.cleanup();
        setDocument(undefined);

        let path = "/documents/" + documentName;
        let res = await pdf.getDocument(path).promise;
        console.log("loaded pdf from", documentName);
        setDocument(res);

        requestAnimationFrame(() => containerRef.current!.children[pageIndex].scrollIntoView({}));
    }

    useEffect(() => {
        if (documentName) loadPdf(documentName);
    }, [documentName]);

    useEffect(() => {
        location.hash = btoa(JSON.stringify(selection ? [0, documentName, pageIndex, selection] : [0, documentName, pageIndex]));
    }, [pageIndex, selection]);

    useEffect(() => {
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

        function onMouseUp() {
            let selection = window.getSelection();
            if (!selection || !selection.anchorNode || !selection.focusNode) {
                return;
            }

            if (selection.focusOffset! - selection.anchorOffset! < 2) {
                // Selection too short
                setSelection(undefined);
                return;
            }

            let anchor = selection.anchorNode.parentElement!;
            let focus = selection.focusNode.parentElement!;

            let anchorTextLayer = anchor.parentElement!;
            let focusTextLayer = focus.parentElement!;

            if (!anchorTextLayer.classList.contains("text-layer") || !focusTextLayer.classList.contains("text-layer")) {
                // Selection is not in text layer
                return;
            }

            let anchorPageIndex = Array.from(containerRef.current!.children).indexOf(anchorTextLayer.parentElement!);
            let focusPageIndex = Array.from(containerRef.current!.children).indexOf(focusTextLayer.parentElement!);

            let anchorIndex = Array.from(anchorTextLayer.children).indexOf(anchor);
            let focusIndex = Array.from(focusTextLayer.children).indexOf(focus);

            setSelection([anchorPageIndex, anchorIndex, focusPageIndex, focusIndex]);
        }

        async function fetchDocuments() {
            let res = await fetch("/documents/index.json", {
                method: "GET",
            });
            if (!res.ok) return;
            setDocuments(await res.json());
        }

        fetchDocuments();

        window.addEventListener("wheel", onScroll, { passive: false });
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            window.removeEventListener("wheel", onScroll);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    let pages = [];
    if (document) {
        for (let i = 0; i < document.numPages; i++) {
            pages.push(
                <PdfPage
                    onExitBottom={() => {
                        // console.log("page", pageIndex + i + 1, "exited bottom");
                    }}
                    onExitTop={() => {
                        setPageIndex(i + 1);
                        // console.log("page", pageIndex + i + 1, "exited top");
                    }}
                    onEnterBottom={() => {
                        // console.log("page", pageIndex + i + 1, "entered bottom");
                    }}
                    onEnterTop={() => {
                        setPageIndex(i);
                        // console.log("page", pageIndex + i + 1, "entered top");
                    }}
                    scale={scale}
                    key={i}
                    document={document}
                    selection={selection}
                    pageIndex={i}
                />
            );
        }
    }

    return (
        <div className="flex flex-row items-start justify-start bg-gray-700 min-h-full relative">
            <div className="sticky top-0 max-h-screen flex flex-col">
                <nav className="shadow-md flex p-3">
                    <div>
                        <div className="text-xl leading-4 text-green-300 font-bold font-mono">kokos</div>
                        <div className="text-xs text-green-500">
                            {document ? (
                                <span>
                                    documentor (page {pageIndex + 1}/{document.numPages})
                                </span>
                            ) : (
                                <span>
                                    Loading <code>{documentName}</code>
                                </span>
                            )}
                        </div>
                    </div>
                    <select
                        className="flex-grow ml-6 bg-transparent text-white border-green-500 border"
                        value={documentName}
                        onChange={(ev) => {
                            setPageIndex(0);
                            setDocumentName(ev.target.value);
                        }}>
                        {documents?.items.map((item, index) => (
                            <option className="text-black" value={item.path} key={item.path}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </nav>
                {document && (
                    <div className=" overflow-y-auto pb-10">
                        <PdfTree
                            document={document}
                            onClick={async (item, path) => {
                                let destination = (await document.getDestination(String(item.dest))) as RefProxy[];
                                if (!destination || destination.length <= 0) return;
                                let newPageIndex = await document.getPageIndex(destination[0]);
                                setPageIndex(newPageIndex);
                                containerRef.current!.children[newPageIndex].scrollIntoView({});
                            }}
                        />
                    </div>
                )}
            </div>
            {document && (
                <div className="max-w-5xl flex-grow-0 flex-shrink" ref={containerRef}>
                    {pages}
                </div>
            )}
        </div>
    );
}
