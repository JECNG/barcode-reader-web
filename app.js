// ZXing 라이브러리 사용
let BrowserMultiFormatReader;

class BarcodeReader {
    constructor() {
        // ZXing 라이브러리 확인
        if (!BrowserMultiFormatReader) {
            throw new Error('ZXing library not loaded');
        }
        
        this.codeReader = new BrowserMultiFormatReader();
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.barcodeText = document.getElementById('barcodeText');
        this.isRecording = false;
        this.currentGroup = null;
        this.groupBarcodes = [];
        this.recordedBarcodes = new Set();
        this.stream = null;
        this.scanInterval = null;
        this.lastScannedCode = null;
        this.lastScanTime = 0;
        
        this.loadGroupBarcodes();
        this.initEventListeners();
        this.startCamera();
    }

    loadGroupBarcodes() {
        const saved = localStorage.getItem('group_barcodes');
        if (saved) {
            try {
                this.groupBarcodes = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load barcodes:', e);
                this.groupBarcodes = [];
            }
        }
    }

    saveGroupBarcodes() {
        localStorage.setItem('group_barcodes', JSON.stringify(this.groupBarcodes));
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    }

    async startCamera() {
        try {
            // 카메라 접근 권한 요청
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.video.srcObject = this.stream;
            
            // 모바일에서는 좌우 반전 제거
            if (this.isMobileDevice()) {
                this.video.style.transform = 'none';
            }
            
            await this.video.play();
            
            // 비디오가 준비되면 스캔 시작
            this.video.addEventListener('loadedmetadata', () => {
                this.barcodeText.textContent = '카메라 준비 완료 - 바코드를 스캔하세요';
                this.startScanning();
            }, { once: true });
            
        } catch (err) {
            console.error('Camera access error:', err);
            this.barcodeText.textContent = '카메라 접근 권한이 필요합니다';
            this.showToast('카메라 접근 권한을 허용해주세요', 'error');
        }
    }

    startScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }

        // 더 빠른 스캔을 위해 300ms로 변경
        this.scanInterval = setInterval(() => {
            this.scanBarcode();
        }, 300);
    }

    async scanBarcode() {
        if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
            return;
        }

        try {
            const context = this.canvas.getContext('2d', { willReadFrequently: true });
            const width = this.video.videoWidth || 640;
            const height = this.video.videoHeight || 480;
            
            this.canvas.width = width;
            this.canvas.height = height;
            
            // 비디오를 캔버스에 그리기
            context.drawImage(this.video, 0, 0, width, height);
            
            // ZXing의 올바른 방법: ImageData를 직접 사용
            const imageData = context.getImageData(0, 0, width, height);
            
            // ZXing 라이브러리로 디코딩
            const result = await this.codeReader.decodeFromImageData(imageData);
            
            if (result) {
                const barcodeValue = result.getText();
                const now = Date.now();
                
                // 중복 스캔 방지 (1초 내 같은 바코드 무시)
                if (this.lastScannedCode !== barcodeValue || now - this.lastScanTime > 1000) {
                    this.lastScannedCode = barcodeValue;
                    this.lastScanTime = now;
                    this.handleBarcodeDetected(barcodeValue);
                }
            }
        } catch (err) {
            // 바코드를 찾지 못한 경우는 정상 (에러 무시)
        }
    }

    handleBarcodeDetected(barcodeValue) {
        // 녹화 중이면 기록
        if (this.isRecording && this.currentGroup) {
            if (!this.recordedBarcodes.has(barcodeValue)) {
                this.recordedBarcodes.add(barcodeValue);
                this.updateRecordingIndicator();
                this.showToast(`바코드 추가: ${barcodeValue}`, 'success');
            }
        }

        // 화면에 표시
        this.barcodeText.textContent = `스캔됨: ${barcodeValue}`;
        this.barcodeText.style.color = '#10b981';
        
        // 2초 후 원래 메시지로 복귀
        setTimeout(() => {
            if (this.isRecording && this.currentGroup) {
                this.barcodeText.textContent = `녹화 중 - 스캔된 바코드: ${this.recordedBarcodes.size}개`;
            } else {
                this.barcodeText.textContent = '카메라 준비 완료 - 바코드를 스캔하세요';
            }
            this.barcodeText.style.color = '#10b981';
        }, 2000);
    }

    initEventListeners() {
        // 녹화 버튼
        document.getElementById('btnRecord').addEventListener('click', () => {
            this.showGroupInputDialog();
        });

        // 중단 버튼
        document.getElementById('btnStop').addEventListener('click', () => {
            this.stopRecording();
        });

        // 리스트 버튼
        document.getElementById('btnList').addEventListener('click', () => {
            this.showBarcodeListDialog();
        });

        // 그룹명 입력 모달
        document.getElementById('groupOk').addEventListener('click', () => {
            const groupName = document.getElementById('groupInput').value.trim();
            if (groupName) {
                this.startRecording(groupName);
                this.hideGroupModal();
            } else {
                this.showToast('그룹명을 입력하세요', 'error');
            }
        });

        document.getElementById('groupCancel').addEventListener('click', () => {
            this.hideGroupModal();
        });

        // 리스트 모달
        document.getElementById('closeListModal').addEventListener('click', () => {
            this.hideListModal();
        });

        document.getElementById('listOk').addEventListener('click', () => {
            this.hideListModal();
        });

        // 복사 버튼
        document.getElementById('btnCopy').addEventListener('click', () => {
            const text = document.getElementById('barcodeList').value;
            if (!text || text.trim() === '바코드,그룹명' || text.trim() === '') {
                this.showToast('복사할 내용이 없습니다', 'error');
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('클립보드에 복사되었습니다', 'success');
            }).catch(err => {
                console.error('Copy failed:', err);
                this.showToast('복사에 실패했습니다', 'error');
            });
        });

        // 전체 삭제 버튼
        document.getElementById('btnClear').addEventListener('click', () => {
            if (confirm('리스트가 전체 삭제됩니다. 계속하시겠습니까?')) {
                this.groupBarcodes = [];
                this.saveGroupBarcodes();
                this.updateBarcodeList();
                this.showToast('리스트가 초기화되었습니다', 'success');
            }
        });

        // 내보내기 버튼
        document.getElementById('btnExport').addEventListener('click', () => {
            this.exportCsv();
        });

        // Enter 키로 그룹명 입력
        document.getElementById('groupInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('groupOk').click();
            }
        });
    }

    showGroupInputDialog() {
        document.getElementById('groupInput').value = '';
        document.getElementById('groupModal').classList.add('show');
        setTimeout(() => {
            document.getElementById('groupInput').focus();
        }, 100);
    }

    hideGroupModal() {
        document.getElementById('groupModal').classList.remove('show');
    }

    startRecording(groupName) {
        // 이미 있는 그룹명인지 확인
        const alreadyExists = this.groupBarcodes.some(item => item.group === groupName);
        
        if (alreadyExists) {
            if (confirm('이미 리스트에 있는 그룹명입니다. 계속하시겠습니까?')) {
                this.currentGroup = groupName;
                this.isRecording = true;
                this.recordedBarcodes.clear();
                this.updateRecordingIndicator();
                this.barcodeText.textContent = `녹화 중 - 스캔된 바코드: 0개`;
                this.showToast(`녹화 시작: ${groupName}`, 'success');
            }
        } else {
            this.currentGroup = groupName;
            this.isRecording = true;
            this.recordedBarcodes.clear();
            this.updateRecordingIndicator();
            this.barcodeText.textContent = `녹화 중 - 스캔된 바코드: 0개`;
            this.showToast(`녹화 시작: ${groupName}`, 'success');
        }
    }

    updateRecordingIndicator() {
        const indicator = document.getElementById('recordingIndicator');
        const groupNameEl = document.getElementById('currentGroupName');
        
        if (this.isRecording && this.currentGroup) {
            indicator.style.display = 'flex';
            groupNameEl.textContent = this.currentGroup;
            this.barcodeText.textContent = `녹화 중 - 스캔된 바코드: ${this.recordedBarcodes.size}개`;
        } else {
            indicator.style.display = 'none';
        }
    }

    stopRecording() {
        this.isRecording = false;
        
        if (this.currentGroup && this.recordedBarcodes.size > 0) {
            const barcodes = Array.from(this.recordedBarcodes);
            this.groupBarcodes.push({
                group: this.currentGroup,
                barcodes: barcodes
            });
            this.saveGroupBarcodes();
            this.showToast(`${barcodes.length}개의 바코드가 저장되었습니다`, 'success');
        } else if (this.currentGroup) {
            this.showToast('저장된 바코드가 없습니다', 'error');
        }
        
        this.currentGroup = null;
        this.recordedBarcodes.clear();
        this.updateRecordingIndicator();
        this.barcodeText.textContent = '카메라 준비 완료 - 바코드를 스캔하세요';
        this.showBarcodeListDialog();
    }

    showBarcodeListDialog() {
        this.updateBarcodeList();
        document.getElementById('listModal').classList.add('show');
    }

    hideListModal() {
        document.getElementById('listModal').classList.remove('show');
    }

    updateBarcodeList() {
        let csvText = '바코드,그룹명\n';
        let totalCount = 0;
        this.groupBarcodes.forEach(item => {
            item.barcodes.forEach(barcode => {
                csvText += `${barcode},${item.group}\n`;
                totalCount++;
            });
        });
        
        if (totalCount === 0) {
            csvText = '';
        }
        
        document.getElementById('barcodeList').value = csvText;
        document.getElementById('listCount').textContent = `총 ${totalCount}개 항목`;
    }

    async exportCsv() {
        if (this.groupBarcodes.length === 0) {
            this.showToast('저장할 바코드가 없습니다', 'error');
            return;
        }

        const csvHeader = '\uFEFF바코드,그룹명\n'; // UTF-8 BOM
        let csvBody = '';
        this.groupBarcodes.forEach(item => {
            item.barcodes.forEach(barcode => {
                csvBody += `"${barcode}","${item.group}"\n`;
            });
        });
        const csv = csvHeader + csvBody;
        
        const now = new Date();
        const fileName = `BARCODE_EXPORT_${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;
        
        // File System Access API 사용 (Chrome/Edge)
        if ('showSaveFilePicker' in window) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'CSV 파일',
                        accept: { 'text/csv': ['.csv'] }
                    }]
                });
                
                const writable = await fileHandle.createWritable();
                await writable.write(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
                await writable.close();
                
                this.showToast('파일이 저장되었습니다', 'success');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('File save error:', err);
                    this.downloadFile(csv, fileName);
                }
            }
        } else {
            // 폴백: 다운로드 방식
            this.downloadFile(csv, fileName);
        }
    }

    downloadFile(csv, fileName) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        this.showToast('파일이 다운로드되었습니다', 'success');
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.codeReader) {
            this.codeReader.reset();
        }
    }
}

// ZXing 라이브러리 로드 대기
function initApp() {
    // ZXing이 로드되었는지 확인
    if (typeof ZXing === 'undefined') {
        console.error('ZXing library not found');
        const barcodeText = document.getElementById('barcodeText');
        if (barcodeText) {
            barcodeText.textContent = 'ZXing 라이브러리를 로드할 수 없습니다';
            barcodeText.style.color = '#ef4444';
        }
        return;
    }

    try {
        // ZXing에서 BrowserMultiFormatReader 가져오기
        BrowserMultiFormatReader = ZXing.BrowserMultiFormatReader;
        
        if (!BrowserMultiFormatReader) {
            throw new Error('BrowserMultiFormatReader not found in ZXing');
        }

        // 앱 초기화
        app = new BarcodeReader();
    } catch (error) {
        console.error('App initialization error:', error);
        const barcodeText = document.getElementById('barcodeText');
        if (barcodeText) {
            barcodeText.textContent = `초기화 오류: ${error.message}`;
            barcodeText.style.color = '#ef4444';
        }
    }
}

// DOM이 로드되고 ZXing도 로드될 때까지 대기
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        // ZXing이 이미 로드되었는지 확인
        if (typeof ZXing !== 'undefined') {
            initApp();
        } else {
            // ZXing 로드를 기다림
            const checkZXing = setInterval(() => {
                if (typeof ZXing !== 'undefined') {
                    clearInterval(checkZXing);
                    initApp();
                }
            }, 100);
            
            // 5초 후 타임아웃
            setTimeout(() => {
                clearInterval(checkZXing);
                if (typeof ZXing === 'undefined') {
                    const barcodeText = document.getElementById('barcodeText');
                    if (barcodeText) {
                        barcodeText.textContent = 'ZXing 라이브러리 로드 시간 초과';
                        barcodeText.style.color = '#ef4444';
                    }
                }
            }, 5000);
        }
    });
} else {
    // DOM이 이미 로드된 경우
    if (typeof ZXing !== 'undefined') {
        initApp();
    } else {
        window.addEventListener('load', initApp);
    }
}

// 페이지 종료 시 정리
window.addEventListener('beforeunload', () => {
    if (app) {
        app.stop();
    }
});
