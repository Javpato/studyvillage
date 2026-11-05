import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
export class PdfReader {
 private cached:{id:string;doc:PDFDocumentProxy}|null=null;
 async open(id:string,bytes:Uint8Array):Promise<PDFDocumentProxy>{if(this.cached?.id===id)return this.cached.doc;const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist/legacy/build/pdf.mjs');GlobalWorkerOptions.workerSrc=workerUrl;await this.cached?.doc.loadingTask.destroy();const doc=await getDocument({data:bytes.slice(),stopAtErrors:true}).promise;if(doc.numPages>500){await doc.loadingTask.destroy();throw new Error('El PDF supera 500 páginas.');}this.cached={id,doc};return doc;}
 async paint(id:string,index:number,bytes:Uint8Array,canvas:HTMLCanvasElement):Promise<void>{const doc=await this.open(id,bytes);const page=await doc.getPage(index);const view=page.getViewport({scale:1});const scale=Math.min(768/view.width,1024/view.height);const viewport=page.getViewport({scale});const surface=document.createElement('canvas');surface.width=Math.ceil(viewport.width);surface.height=Math.ceil(viewport.height);await page.render({canvas:surface,canvasContext:surface.getContext('2d')!,viewport}).promise;canvas.width=768;canvas.height=1024;const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,768,1024);c.drawImage(surface,0,0);page.cleanup();}
 async close(){await this.cached?.doc.loadingTask.destroy();this.cached=null;}
}
