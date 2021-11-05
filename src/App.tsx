import { useEffect, useState } from "react";
import * as pdf from "pdfjs-dist";

pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

export default function App() {
    const [pageCount, setPageCount] = useState(0);

    async function loadPdf() {
        // https://mozilla.github.io/pdf.js/examples/
        let res = await pdf.getDocument("/multiboot.pdf").promise;

        setPageCount(res.numPages);
    }

    useEffect(() => {
        loadPdf();
    }, []);

    return (
        <div className="text-blue-400">
            <pre>page count = {pageCount}</pre>
        </div>
    );
}
