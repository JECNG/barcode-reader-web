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
        this.savedGroupNames = [];
        this.stream = null;
        this.scanInterval = null;
        this.lastScannedCode = null;
        this.lastScanTime = 0;
        this.isScanning = false;
        this.selectedDeviceId = null;
        this.availableDevices = [];
        this.currentDeviceIndex = 0;
        this.isFacingBack = true;
        
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
        
        // 저장된 그룹명 목록 로드
        const savedGroups = localStorage.getItem('saved_group_names');
        if (savedGroups) {
            try {
                this.savedGroupNames = JSON.parse(savedGroups);
            } catch (e) {
                console.error('Failed to load saved group names:', e);
                this.savedGroupNames = [];
            }
        }
    }

    saveGroupBarcodes() {
        localStorage.setItem('group_barcodes', JSON.stringify(this.groupBarcodes));
    }

    saveGroupNames() {
        localStorage.setItem('saved_group_names', JSON.stringify(this.savedGroupNames));
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    }

    async startCamera() {
        try {
            // 카메라 디바이스 목록 가져오기
            this.availableDevices = await this.codeReader.listVideoInputDevices();
            
            if (this.availableDevices.length === 0) {
                throw new Error('카메라를 찾을 수 없습니다');
            }

            // 카메라 전환 버튼 표시/숨김
            const switchBtn = document.getElementById('btnSwitchCamera');
            if (switchBtn) {
                if (this.availableDevices.length > 1) {
                    switchBtn.style.display = 'flex';
                } else {
                    switchBtn.style.display = 'none';
                }
            }

            // 후면 카메라를 기본으로 찾기 (모바일/데스크톱 모두)
            let deviceId = null;
            
            // 후면 카메라 찾기
            const backCameraIndex = this.availableDevices.findIndex(device => {
                const label = device.label.toLowerCase();
                return label.includes('back') || 
                       label.includes('rear') ||
                       label.includes('environment') ||
                       label.includes('후면') ||
                       (device.getCapabilities && device.getCapabilities().facingMode === 'environment');
            });
            
            // facingMode로도 찾기
            let backCameraByFacing = -1;
            if (backCameraIndex < 0) {
                // getUserMedia로 facingMode 확인
                try {
                    const testStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'environment' }
                    });
                    const track = testStream.getVideoTracks()[0];
                    const settings = track.getSettings();
                    testStream.getTracks().forEach(t => t.stop());
                    
                    // environment facingMode를 지원하는 카메라 찾기
                    backCameraByFacing = this.availableDevices.findIndex(device => {
                        return device.deviceId === settings.deviceId;
                    });
                } catch (e) {
                    // facingMode 확인 실패
                }
            }
            
            if (backCameraIndex >= 0) {
                this.currentDeviceIndex = backCameraIndex;
                deviceId = this.availableDevices[backCameraIndex].deviceId;
            } else if (backCameraByFacing >= 0) {
                this.currentDeviceIndex = backCameraByFacing;
                deviceId = this.availableDevices[backCameraByFacing].deviceId;
            } else {
                // 후면 카메라를 찾지 못하면 첫 번째 카메라 사용
                this.currentDeviceIndex = 0;
                deviceId = this.availableDevices[0].deviceId;
            }

            this.selectedDeviceId = deviceId;
            await this.switchToDevice(deviceId);
            
        } catch (err) {
            console.error('Camera access error:', err);
            this.barcodeText.textContent = '카메라 접근 권한이 필요합니다';
            this.showToast('카메라 접근 권한을 허용해주세요', 'error');
        }
    }

    async switchToDevice(deviceId) {
        try {
            // 기존 스트림 정지
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            // 새 카메라 접근 권한 요청
            // deviceId가 있으면 사용, 없으면 facingMode 사용
            const videoConstraints = deviceId 
                ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } };
            
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints
            });
            
            this.video.srcObject = this.stream;
            
            // 모바일에서는 좌우 반전 제거
            if (this.isMobileDevice()) {
                this.video.style.transform = 'none';
            } else {
                this.video.style.transform = 'scaleX(-1)';
            }
            
            await this.video.play();
            
            // 비디오가 준비되면 스캔 시작
            this.video.addEventListener('loadedmetadata', () => {
                this.barcodeText.textContent = '카메라 준비 완료 - 바코드를 스캔하세요';
                if (!this.isScanning) {
                    this.startScanning();
                }
            }, { once: true });
            
        } catch (err) {
            console.error('Camera switch error:', err);
            this.showToast('카메라 전환 실패', 'error');
        }
    }

    async switchCamera() {
        if (!this.availableDevices || this.availableDevices.length <= 1) {
            this.showToast('전환할 카메라가 없습니다', 'error');
            return;
        }

        try {
            // 다음 카메라로 전환
            this.currentDeviceIndex = (this.currentDeviceIndex + 1) % this.availableDevices.length;
            const newDeviceId = this.availableDevices[this.currentDeviceIndex].deviceId;
            this.selectedDeviceId = newDeviceId;
            
            // 후면/전면 카메라 상태 업데이트
            const deviceLabel = this.availableDevices[this.currentDeviceIndex].label.toLowerCase();
            this.isFacingBack = deviceLabel.includes('back') || 
                               deviceLabel.includes('rear') || 
                               deviceLabel.includes('environment');
            
            // 스캔 중지
            const wasScanning = this.isScanning;
            this.isScanning = false;
            
            await this.switchToDevice(newDeviceId);
            
            // 스캔 재시작
            if (wasScanning) {
                setTimeout(() => {
                    this.startScanning();
                }, 500);
            }
            
            this.showToast('카메라 전환됨', 'success');
        } catch (err) {
            console.error('Camera switch error:', err);
            this.showToast('카메라 전환 실패', 'error');
        }
    }

    startScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }

        this.isScanning = true;
        
        // 간단한 방법: 주기적으로 캔버스에서 스캔
        this.scanInterval = setInterval(() => {
            this.scanBarcode();
        }, 200); // 200ms마다 스캔
    }

    async scanBarcode() {
        if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
            return;
        }

        if (!this.isScanning) return;

        try {
            const context = this.canvas.getContext('2d', { willReadFrequently: true });
            const width = this.video.videoWidth || 640;
            const height = this.video.videoHeight || 480;
            
            if (width === 0 || height === 0) {
                return;
            }
            
            this.canvas.width = width;
            this.canvas.height = height;
            
            // 비디오를 캔버스에 그리기
            context.drawImage(this.video, 0, 0, width, height);
            
            // ZXing의 decodeFromVideoDevice를 사용하는 것이 가장 확실함
            // 하지만 이미 비디오 스트림이 있으므로 canvas에서 직접 디코딩
            try {
                // ZXing의 실제 API: decodeFromCanvasElement 또는 decodeFromImageElement
                // 먼저 ImageData로 시도
                const imageData = context.getImageData(0, 0, width, height);
                
                // ZXing 라이브러리의 실제 메서드 확인
                if (typeof this.codeReader.decodeFromImageData === 'function') {
                    const result = await this.codeReader.decodeFromImageData(imageData);
                    if (result) {
                        this.processBarcodeResult(result);
                        return;
                    }
                }
            } catch (e) {
                // ImageData 실패
            }

            // Image로 변환하여 시도
            try {
                const img = new Image();
                const dataUrl = this.canvas.toDataURL('image/png');
                
                await new Promise((resolve, reject) => {
                    img.onload = async () => {
                        try {
                            // decodeFromImageElement 또는 decodeFromImage 시도
                            if (typeof this.codeReader.decodeFromImageElement === 'function') {
                                const result = await this.codeReader.decodeFromImageElement(img);
                                if (result) {
                                    this.processBarcodeResult(result);
                                    resolve();
                                    return;
                                }
                            }
                            
                            if (typeof this.codeReader.decodeFromImage === 'function') {
                                const result = await this.codeReader.decodeFromImage(img);
                                if (result) {
                                    this.processBarcodeResult(result);
                                }
                            }
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    };
                    img.onerror = reject;
                    img.src = dataUrl;
                });
            } catch (e) {
                // 모든 방법 실패 - 정상 (바코드 없음)
            }
        } catch (err) {
            // 바코드를 찾지 못한 경우는 정상 (에러 무시)
        }
    }

    processBarcodeResult(result) {
        if (!result) {
            console.log('Empty result');
            return;
        }
        
        console.log('Processing result:', result);
        
        // ZXing 결과에서 텍스트 추출
        let barcodeValue = null;
        
        // 여러 방법으로 텍스트 추출 시도
        if (typeof result.getText === 'function') {
            barcodeValue = result.getText();
        } else if (result.getText && typeof result.getText === 'function') {
            barcodeValue = result.getText();
        } else if (result.text) {
            barcodeValue = result.text;
        } else if (result.rawValue) {
            barcodeValue = result.rawValue;
        } else if (typeof result === 'string') {
            barcodeValue = result;
        } else if (result.result && typeof result.result.getText === 'function') {
            barcodeValue = result.result.getText();
        } else if (result.result && result.result.text) {
            barcodeValue = result.result.text;
        }
        
        console.log('Extracted barcode value:', barcodeValue);
        
        if (!barcodeValue) {
            console.log('No barcode value found in result');
            return;
        }
        
        const now = Date.now();
        
        // 중복 스캔 방지 (1초 내 같은 바코드 무시)
        if (this.lastScannedCode !== barcodeValue || now - this.lastScanTime > 1000) {
            this.lastScannedCode = barcodeValue;
            this.lastScanTime = now;
            this.handleBarcodeDetected(barcodeValue);
        }
    }

    handleBarcodeDetected(barcodeValue) {
        console.log('Barcode detected:', barcodeValue);
        
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
        // 요소 존재 확인 후 이벤트 리스너 등록
        const safeAddEventListener = (id, event, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener(event, handler);
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        };

        // 녹화 버튼
        safeAddEventListener('btnRecord', 'click', () => {
            this.showGroupInputDialog();
        });

        // 중단 버튼
        safeAddEventListener('btnStop', 'click', () => {
            this.stopRecording();
        });

        // 리스트 버튼
        safeAddEventListener('btnList', 'click', () => {
            this.showBarcodeListDialog();
        });

        // 카메라 전환 버튼
        safeAddEventListener('btnSwitchCamera', 'click', () => {
            this.switchCamera();
        });

        // 옵션 버튼
        safeAddEventListener('btnOptions', 'click', () => {
            this.showOptionsModal();
        });

        safeAddEventListener('closeOptionsModal', 'click', () => {
            this.hideOptionsModal();
        });

        safeAddEventListener('optionsCancel', 'click', () => {
            this.hideOptionsModal();
        });

        // 그룹명 추가 버튼
        safeAddEventListener('btnAddGroup', 'click', () => {
            this.addGroupName();
        });

        // Enter 키로 그룹명 추가
        const newGroupNameInput = document.getElementById('newGroupName');
        if (newGroupNameInput) {
            newGroupNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addGroupName();
                }
            });
        }

        // 그룹명 입력 모달
        safeAddEventListener('groupOk', 'click', () => {
            const groupName = document.getElementById('groupInput').value.trim();
            if (groupName) {
                this.startRecording(groupName);
                this.hideGroupModal();
            } else {
                this.showToast('그룹명을 입력하세요', 'error');
            }
        });

        safeAddEventListener('groupCancel', 'click', () => {
            this.hideGroupModal();
        });

        // 리스트 모달
        safeAddEventListener('closeListModal', 'click', () => {
            this.hideListModal();
        });

        // 복사 버튼
        safeAddEventListener('btnCopy', 'click', () => {
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
        safeAddEventListener('btnClear', 'click', () => {
            if (confirm('리스트가 전체 삭제됩니다. 계속하시겠습니까?')) {
                this.groupBarcodes = [];
                this.saveGroupBarcodes();
                this.updateBarcodeList();
                this.showToast('리스트가 초기화되었습니다', 'success');
            }
        });

        // 내보내기 버튼
        safeAddEventListener('btnExport', 'click', () => {
            this.showExportOptions();
        });

        // 내보내기 옵션 모달
        safeAddEventListener('btnSaveFile', 'click', () => {
            this.hideExportModal();
            this.exportCsv();
        });

        safeAddEventListener('btnShare', 'click', () => {
            this.hideExportModal();
            this.shareCsv();
        });

        safeAddEventListener('exportCancel', 'click', () => {
            this.hideExportModal();
        });

        // Enter 키로 그룹명 입력
        const groupInput = document.getElementById('groupInput');
        if (groupInput) {
            groupInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const groupOkBtn = document.getElementById('groupOk');
                    if (groupOkBtn) {
                        groupOkBtn.click();
                    }
                }
            });
        }
    }

    showGroupInputDialog() {
        document.getElementById('groupInput').value = '';
        document.getElementById('groupModal').classList.add('show');
        this.updateSavedGroupsList();
        setTimeout(() => {
            document.getElementById('groupInput').focus();
        }, 100);
    }

    hideGroupModal() {
        document.getElementById('groupModal').classList.remove('show');
    }

    showOptionsModal() {
        document.getElementById('newGroupName').value = '';
        document.getElementById('optionsModal').classList.add('show');
        this.updateSavedGroupsOptions();
    }

    hideOptionsModal() {
        document.getElementById('optionsModal').classList.remove('show');
    }

    addGroupName() {
        const input = document.getElementById('newGroupName');
        const groupName = input.value.trim();
        
        if (!groupName) {
            this.showToast('그룹명을 입력하세요', 'error');
            return;
        }

        if (this.savedGroupNames.includes(groupName)) {
            this.showToast('이미 존재하는 그룹명입니다', 'error');
            return;
        }

        this.savedGroupNames.push(groupName);
        this.saveGroupNames();
        this.updateSavedGroupsOptions();
        input.value = '';
        this.showToast('그룹명이 추가되었습니다', 'success');
    }

    deleteGroupName(groupName) {
        this.savedGroupNames = this.savedGroupNames.filter(name => name !== groupName);
        this.saveGroupNames();
        this.updateSavedGroupsOptions();
        this.updateSavedGroupsList();
        this.showToast('그룹명이 삭제되었습니다', 'success');
    }

    updateSavedGroupsList() {
        const listContainer = document.getElementById('savedGroupsList');
        if (!listContainer) return;

        if (this.savedGroupNames.length === 0) {
            listContainer.innerHTML = '';
            return;
        }

        listContainer.innerHTML = this.savedGroupNames.map(groupName => 
            `<div class="saved-group-item" data-group="${groupName}">${groupName}</div>`
        ).join('');

        // 그룹명 클릭 시 입력 필드에 자동 입력
        listContainer.querySelectorAll('.saved-group-item').forEach(item => {
            item.addEventListener('click', () => {
                const groupName = item.getAttribute('data-group');
                document.getElementById('groupInput').value = groupName;
            });
        });
    }

    updateSavedGroupsOptions() {
        const container = document.getElementById('savedGroupsOptions');
        if (!container) return;

        if (this.savedGroupNames.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 14px;">저장된 그룹명이 없습니다</div>';
            return;
        }

        container.innerHTML = this.savedGroupNames.map(groupName => 
            `<div class="saved-group-option-item">
                <span class="group-name">${groupName}</span>
                <button class="btn-delete-group" data-group="${groupName}">삭제</button>
            </div>`
        ).join('');

        // 삭제 버튼 이벤트
        container.querySelectorAll('.btn-delete-group').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupName = btn.getAttribute('data-group');
                if (confirm(`"${groupName}" 그룹명을 삭제하시겠습니까?`)) {
                    this.deleteGroupName(groupName);
                }
            });
        });
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
        
        // 녹화 중에도 스캔 계속
        if (!this.isScanning) {
            this.startScanning();
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

    getCsvData() {
        const csvHeader = '\uFEFF바코드,그룹명\n'; // UTF-8 BOM
        let csvBody = '';
        this.groupBarcodes.forEach(item => {
            item.barcodes.forEach(barcode => {
                csvBody += `"${barcode}","${item.group}"\n`;
            });
        });
        return csvHeader + csvBody;
    }

    getFileName() {
        const now = new Date();
        return `BARCODE_EXPORT_${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;
    }

    showExportOptions() {
        if (this.groupBarcodes.length === 0) {
            this.showToast('저장할 바코드가 없습니다', 'error');
            return;
        }
        const exportModal = document.getElementById('exportModal');
        if (exportModal) {
            // 먼저 다른 모달들 숨기기
            document.querySelectorAll('.modal').forEach(modal => {
                if (modal !== exportModal) {
                    modal.classList.remove('show');
                    modal.style.display = 'none';
                }
            });
            
            // 내보내기 모달 표시
            exportModal.classList.add('show');
            exportModal.style.display = 'flex';
            exportModal.style.zIndex = '99999';
            exportModal.style.position = 'fixed';
            exportModal.style.left = '0';
            exportModal.style.top = '0';
            exportModal.style.width = '100%';
            exportModal.style.height = '100%';
            
            console.log('Export modal shown:', exportModal);
        } else {
            console.error('exportModal not found');
            this.showToast('내보내기 모달을 찾을 수 없습니다', 'error');
        }
    }

    hideExportModal() {
        const exportModal = document.getElementById('exportModal');
        if (exportModal) {
            exportModal.classList.remove('show');
            exportModal.style.display = 'none';
            exportModal.style.zIndex = '';
        }
    }

    async exportCsv() {
        const csv = this.getCsvData();
        const fileName = this.getFileName();
        
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

    async shareCsv() {
        const csv = this.getCsvData();
        const fileName = this.getFileName();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const file = new File([blob], fileName, { type: 'text/csv' });

        // Web Share API 사용 (모바일 네이티브 공유)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: '바코드 리스트',
                    text: '바코드 스캔 데이터',
                    files: [file]
                });
                this.showToast('공유되었습니다', 'success');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share error:', err);
                    // 폴백: 다운로드
                    this.downloadFile(csv, fileName);
                }
            }
        } else if (navigator.share) {
            // 파일 공유가 안되면 텍스트만 공유
            try {
                await navigator.share({
                    title: '바코드 리스트',
                    text: csv
                });
                this.showToast('공유되었습니다', 'success');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    // 폴백: 다운로드
                    this.downloadFile(csv, fileName);
                }
            }
        } else {
            // Web Share API가 없으면 다운로드
            this.downloadFile(csv, fileName);
            this.showToast('공유 기능을 사용할 수 없습니다. 파일이 다운로드되었습니다', 'error');
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
        this.isScanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        if (this.codeReader) {
            this.codeReader.reset();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
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
