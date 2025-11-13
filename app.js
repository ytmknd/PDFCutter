// PDF.js の設定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// グローバル変数
let pdfFile = null;
let pdfDoc = null;
let selectedPages = new Set();
let totalPages = 0;

// DOM要素
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileDetails = document.getElementById('fileDetails');
const pagesContainer = document.getElementById('pagesContainer');
const pagesGrid = document.getElementById('pagesGrid');
const loading = document.getElementById('loading');
const selectionCount = document.getElementById('selectionCount');
const resetBtn = document.getElementById('resetBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const downloadBtn = document.getElementById('downloadBtn');
const splitBtn = document.getElementById('splitBtn');

// イベントリスナー
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
resetBtn.addEventListener('click', resetApp);
selectAllBtn.addEventListener('click', selectAllPages);
deselectAllBtn.addEventListener('click', deselectAllPages);
downloadBtn.addEventListener('click', downloadModifiedPDF);
splitBtn.addEventListener('click', splitPDFIntoPages);

// ドラッグオーバー
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
}

// ドラッグリーブ
function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
}

// ドロップ
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        loadPDF(files[0]);
    } else {
        alert('PDFファイルをドロップしてください。');
    }
}

// ファイル選択
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        alert('PDFファイルを選択してください。');
    }
}

// PDFを読み込む
async function loadPDF(file) {
    pdfFile = file;
    showLoading(true);
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPages = pdfDoc.numPages;
        
        // UI更新
        dropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        pagesContainer.classList.remove('hidden');
        
        fileName.textContent = file.name;
        fileDetails.textContent = `${totalPages} ページ / ${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        // サムネイル生成
        await generateThumbnails();
        
        showLoading(false);
    } catch (error) {
        console.error('PDF読み込みエラー:', error);
        alert('PDFの読み込みに失敗しました。');
        showLoading(false);
        resetApp();
    }
}

// サムネイル生成
async function generateThumbnails() {
    pagesGrid.innerHTML = '';
    selectedPages.clear();
    updateSelectionCount();
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.5 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        // ページアイテム作成
        const pageItem = document.createElement('div');
        pageItem.className = 'page-item';
        pageItem.dataset.pageNum = pageNum;
        
        const img = document.createElement('img');
        img.className = 'page-thumbnail';
        img.src = canvas.toDataURL();
        img.alt = `Page ${pageNum}`;
        
        const pageNumber = document.createElement('div');
        pageNumber.className = 'page-number';
        pageNumber.textContent = `ページ ${pageNum}`;
        
        pageItem.appendChild(img);
        pageItem.appendChild(pageNumber);
        pageItem.addEventListener('click', () => togglePageSelection(pageNum));
        
        pagesGrid.appendChild(pageItem);
    }
}

// ページ選択トグル
function togglePageSelection(pageNum) {
    const pageItem = document.querySelector(`[data-page-num="${pageNum}"]`);
    
    if (selectedPages.has(pageNum)) {
        selectedPages.delete(pageNum);
        pageItem.classList.remove('selected');
    } else {
        selectedPages.add(pageNum);
        pageItem.classList.add('selected');
    }
    
    updateSelectionCount();
}

// すべて選択
function selectAllPages() {
    selectedPages.clear();
    for (let i = 1; i <= totalPages; i++) {
        selectedPages.add(i);
    }
    document.querySelectorAll('.page-item').forEach(item => {
        item.classList.add('selected');
    });
    updateSelectionCount();
}

// 選択解除
function deselectAllPages() {
    selectedPages.clear();
    document.querySelectorAll('.page-item').forEach(item => {
        item.classList.remove('selected');
    });
    updateSelectionCount();
}

// 選択数更新
function updateSelectionCount() {
    const remainingPages = totalPages - selectedPages.size;
    selectionCount.textContent = `削除するページ: ${selectedPages.size}ページ`;
    downloadBtn.disabled = selectedPages.size === 0 || selectedPages.size === totalPages;
    splitBtn.disabled = remainingPages === 0 || remainingPages === totalPages;
}

// 修正したPDFをダウンロード
async function downloadModifiedPDF() {
    if (selectedPages.size === 0) {
        alert('削除するページを選択してください。');
        return;
    }
    
    if (selectedPages.size === totalPages) {
        alert('すべてのページを削除することはできません。少なくとも1ページは残す必要があります。');
        return;
    }
    
    showLoading(true);
    
    try {
        // pdf-libで処理
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdfDocLib = await PDFLib.PDFDocument.load(arrayBuffer);
        
        // 削除するページのインデックスを降順でソート（後ろから削除）
        const pagesToRemove = Array.from(selectedPages).sort((a, b) => b - a);
        
        for (const pageNum of pagesToRemove) {
            pdfDocLib.removePage(pageNum - 1); // 0-indexed
        }
        
        // PDFを保存
        const pdfBytes = await pdfDocLib.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        
        // ダウンロード
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const originalName = pdfFile.name.replace('.pdf', '');
        a.download = `${originalName}_edited.pdf`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showLoading(false);
        
    } catch (error) {
        console.error('PDF処理エラー:', error);
        alert('PDFの処理に失敗しました。');
        showLoading(false);
    }
}

// アプリリセット
function resetApp() {
    pdfFile = null;
    pdfDoc = null;
    selectedPages.clear();
    totalPages = 0;
    
    dropZone.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    pagesContainer.classList.add('hidden');
    pagesGrid.innerHTML = '';
    fileInput.value = '';
}

// 残ページを個別ファイルとして保存
async function splitPDFIntoPages() {
    const remainingPages = totalPages - selectedPages.size;
    
    if (remainingPages === 0) {
        alert('残るページがありません。');
        return;
    }
    
    if (remainingPages === totalPages) {
        alert('削除するページを選択してください。');
        return;
    }
    
    const confirmed = confirm(`削除指定していない${remainingPages}ページを、それぞれ個別のPDFファイルとして保存します。よろしいですか?`);
    if (!confirmed) return;
    
    showLoading(true);
    
    try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const originalName = pdfFile.name.replace('.pdf', '');
        
        let savedCount = 0;
        
        // 削除されないページのみを処理
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (selectedPages.has(pageNum)) {
                continue; // 削除対象ページはスキップ
            }
            
            // 新しいPDFドキュメントを作成
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const newPdfDoc = await PDFLib.PDFDocument.create();
            
            // 該当ページをコピー
            const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
            newPdfDoc.addPage(copiedPage);
            
            // PDFを保存
            const pdfBytes = await newPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            // ダウンロード
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${originalName}_page${pageNum}.pdf`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            savedCount++;
            
            // ブラウザが詰まらないように少し待つ
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        showLoading(false);
        
    } catch (error) {
        console.error('PDF分割エラー:', error);
        alert('PDFの分割に失敗しました。');
        showLoading(false);
    }
}

// ローディング表示
function showLoading(show) {
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}
