# 바코드 리더 웹 앱

Android 바코드 리더 앱의 웹 버전입니다.

## 기능

- 카메라를 통한 실시간 바코드 스캔
- 그룹별 바코드 기록 및 관리
- CSV 파일로 내보내기
- 로컬 스토리지에 데이터 저장

## 사용 방법

1. 카메라 접근 권한 허용
2. "녹화" 버튼을 눌러 그룹명 입력 후 바코드 스캔 시작
3. "중단" 버튼으로 녹화 중지 및 리스트에 추가
4. "리스트" 버튼으로 저장된 바코드 확인 및 내보내기

## 기술 스택

- HTML5
- CSS3
- JavaScript (Vanilla)
- ZXing 라이브러리 (바코드 스캔)

## GitHub Pages 배포

이 프로젝트는 GitHub Pages에서 바로 작동합니다.

### 배포 방법

1. GitHub에 리포지토리 생성
2. Settings > Pages에서 Source를 `main` 브랜치의 `/ (root)`로 설정
3. 자동으로 배포됩니다

## 브라우저 호환성

- Chrome/Edge (권장)
- Firefox
- Safari (iOS 11+)

## 주의사항

- HTTPS 환경에서만 카메라 접근이 가능합니다 (GitHub Pages는 자동으로 HTTPS 제공)
- 모바일 브라우저에서도 사용 가능합니다

