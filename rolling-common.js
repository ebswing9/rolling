// rolling-common.js
// 학생용(index.html)과 관리자용(admin.html) 페이지가 함께 쓰는
// Realtime Database 접근 함수 모음입니다.

import { db } from "./firebase-config.js";
import {
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";

const ROOT = "rollingPaper";

// ---------- 비밀번호 해시 ----------
// 완벽한 보안이 필요한 데이터가 아니라(학급 내부용), 평문 저장만 피하는
// 수준의 가벼운 해시입니다. SubtleCrypto(SHA-256)를 사용합니다.
export async function hashPassword(plain) {
  const enc = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- 명단(roster) ----------
export async function getRoster() {
  const snap = await get(ref(db, `${ROOT}/roster`));
  return snap.exists() ? snap.val() : {};
}

export function watchRoster(callback) {
  return onValue(ref(db, `${ROOT}/roster`), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

export async function addStudent(name) {
  const newRef = push(ref(db, `${ROOT}/roster`));
  await set(newRef, { name: name.trim() });
  return newRef.key;
}

export async function addStudentsBulk(names) {
  const existing = await getRoster();
  const existingNames = new Set(Object.values(existing).map((s) => s.name));
  const updates = {};
  let added = 0;
  names.forEach((rawName) => {
    const name = rawName.trim();
    if (!name || existingNames.has(name)) return;
    const newRef = push(ref(db, `${ROOT}/roster`));
    updates[`${ROOT}/roster/${newRef.key}`] = { name };
    existingNames.add(name);
    added += 1;
  });
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
  return added;
}

export async function removeStudent(studentId) {
  await remove(ref(db, `${ROOT}/roster/${studentId}`));
  await remove(ref(db, `${ROOT}/auth/${studentId}`));
  await remove(ref(db, `${ROOT}/writtenBy/${studentId}`));
  // 이 학생이 "받은" 메시지들(messages/{studentId})은 남겨두지 않고 함께 정리합니다.
  await remove(ref(db, `${ROOT}/messages/${studentId}`));
}

// ---------- 인증(비밀번호) ----------
export async function hasPassword(studentId) {
  const snap = await get(ref(db, `${ROOT}/auth/${studentId}/password`));
  return snap.exists();
}

export async function setPassword(studentId, plainPassword) {
  const hashed = await hashPassword(plainPassword);
  await set(ref(db, `${ROOT}/auth/${studentId}/password`), hashed);
}

export async function checkPassword(studentId, plainPassword) {
  const snap = await get(ref(db, `${ROOT}/auth/${studentId}/password`));
  if (!snap.exists()) return false;
  const hashed = await hashPassword(plainPassword);
  return snap.val() === hashed;
}

export async function resetPassword(studentId) {
  await remove(ref(db, `${ROOT}/auth/${studentId}/password`));
}

// ---------- 작성 기간 설정 ----------
export async function getIsOpen() {
  const snap = await get(ref(db, `${ROOT}/settings/isOpen`));
  return snap.exists() ? snap.val() === true : false;
}

export function watchIsOpen(callback) {
  return onValue(ref(db, `${ROOT}/settings/isOpen`), (snap) => {
    callback(snap.exists() ? snap.val() === true : false);
  });
}

export async function setIsOpen(isOpen) {
  await set(ref(db, `${ROOT}/settings/isOpen`), isOpen);
}

// ---------- 메시지 ----------
export const MAX_MESSAGE_LENGTH = 200;

export async function writeMessage(fromId, toId, content) {
  const trimmed = content.trim().slice(0, MAX_MESSAGE_LENGTH);
  await update(ref(db), {
    [`${ROOT}/messages/${toId}/${fromId}`]: {
      content: trimmed,
      createdAt: Date.now(),
    },
    [`${ROOT}/writtenBy/${fromId}/${toId}`]: true,
  });
}

export async function getWrittenBy(fromId) {
  const snap = await get(ref(db, `${ROOT}/writtenBy/${fromId}`));
  return snap.exists() ? snap.val() : {};
}

export function watchWrittenBy(fromId, callback) {
  return onValue(ref(db, `${ROOT}/writtenBy/${fromId}`), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

export async function getMessagesFor(toId) {
  const snap = await get(ref(db, `${ROOT}/messages/${toId}`));
  return snap.exists() ? snap.val() : {};
}

export async function getMessage(fromId, toId) {
  const snap = await get(ref(db, `${ROOT}/messages/${toId}/${fromId}`));
  return snap.exists() ? snap.val() : null;
}

export { ROOT };
