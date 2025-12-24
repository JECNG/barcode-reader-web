// ZXing 라이브러리 사용
const { BrowserMultiFormatReader } = ZXing;

class BarcodeReader {
    constructor() {
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

    async startCamera() {
        try {
            const devices = await this.codeReader.listVideoInputDevices();
            const deviceId = devices.length > 0 ? devices[0].deviceId : null;
            
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            this.video.srcObject = this.stream;
            this.video.play();
            
            // 비디오가 재생되면 스캔 시작
            this.video.addEventListener('loadedmetadata', () => {
                this.startScanning();
            });
        } catch (err) {
            console.error('Camera access error:', err);
            this.barcodeText.textContent = '카메라 접근 권한이 필요합니다';
            alert('카메라 접근 권한을 허용해주세요.');
        }
    }

    startScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }

        this.scanInterval = setInterval(() => {
            this.scanBarcode();
        }, 500); // 500ms마다 스캔
    }

    async scanBarcode() {
        if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
            return;
        }

        const context = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        try {
            const imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const result = await this.codeReader.decodeFromImageData(imageData);
            
            if (result && result.getText()) {
                const barcodeValue = result.getText();
                this.handleBarcodeDetected(barcodeValue);
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
            }
        }

        // 화면에 표시
        this.barcodeText.textContent = `BARCODES: ${barcodeValue}`;
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
                alert('그룹명을 입력하세요');
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
            navigator.clipboard.writeText(text).then(() => {
                alert('복사됨');
            }).catch(err => {
                console.error('Copy failed:', err);
            });
        });

        // 전체 삭제 버튼
        document.getElementById('btnClear').addEventListener('click', () => {
            if (confirm('리스트가 전체 삭제됩니다. 계속하시겠습니까?')) {
                this.groupBarcodes = [];
                this.saveGroupBarcodes();
                this.updateBarcodeList();
                alert('리스트가 초기화되었습니다');
            }
        });

        // 내보내기 버튼
        document.getElementById('btnExport').addEventListener('click', () => {
            this.exportCsv();
        });
    }

    showGroupInputDialog() {
        document.getElementById('groupInput').value = '';
        document.getElementById('groupModal').classList.add('show');
        document.getElementById('groupInput').focus();
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
                alert(`녹화 시작: ${groupName}`);
            }
        } else {
            this.currentGroup = groupName;
            this.isRecording = true;
            this.recordedBarcodes.clear();
            alert(`녹화 시작: ${groupName}`);
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
        }
        
        this.currentGroup = null;
        this.recordedBarcodes.clear();
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
        this.groupBarcodes.forEach(item => {
            item.barcodes.forEach(barcode => {
                csvText += `${barcode},${item.group}\n`;
            });
        });
        document.getElementById('barcodeList').value = csvText;
    }

    exportCsv() {
        const csvHeader = '\uFEFF바코드,그룹명\n'; // UTF-8 BOM
        let csvBody = '';
        this.groupBarcodes.forEach(item => {
            item.barcodes.forEach(barcode => {
                csvBody += `"${barcode}","${item.group}"\n`;
            });
        });
        const csv = csvHeader + csvBody;
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const fileName = `BARCODE_EXPORT_${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('저장 완료');
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }
}

// 앱 초기화
let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new BarcodeReader();
});

// 페이지 종료 시 정리
window.addEventListener('beforeunload', () => {
    if (app) {
        app.stop();
    }
});

