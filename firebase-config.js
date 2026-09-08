// firebase-config.js
// -----------------------------------------------------------------------
// 학급 대시보드(firebase.js)에서 쓰시던 것과 "같은 Firebase 프로젝트"의
// 설정값을 그대로 아래에 넣어주세요. (Firebase 콘솔 > 프로젝트 설정 > 일반
// > 내 앱 > SDK 설정 및 구성 에서 확인하실 수 있어요. 이미 갖고 계신
// firebase.js 안에 있는 firebaseConfig 객체를 그대로 복사해오면 됩니다.)
//
// Realtime Database를 쓰시므로 databaseURL이 꼭 채워져 있어야 합니다.
// -----------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCp3vLQM0aKX7s1ArE2YD3BsLNHcbQQJFE",
  authDomain: "classboard-58841.firebaseapp.com",
  databaseURL: "https://classboard-58841-default-rtdb.firebaseio.com",
  projectId: "classboard-58841",
  storageBucket: "classboard-58841.firebasestorage.app",
  messagingSenderId: "961369750358",
  appId: "1:961369750358:web:86a2d7a9c25f1e6204b4f7"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 이 앱의 모든 데이터는 Realtime Database 안에서
//   rollingPaper/
// 최상위 노드 하나에만 저장됩니다. 기존 학급 대시보드가 쓰는
// attendance / quiz / points 등의 노드와는 절대 섞이지 않습니다.
