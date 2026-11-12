// Loads pdf.js for scanning PDFs (src/scan/pages.web.ts adds this script when
// someone picks a PDF). pdf.min.mjs and the rest are copied here from
// node_modules by scripts/copy-pdfjs.mjs at build time.
import * as pdfjs from './pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
window.abuPdfjs = pdfjs;
window.dispatchEvent(new Event('abu-pdfjs'));
