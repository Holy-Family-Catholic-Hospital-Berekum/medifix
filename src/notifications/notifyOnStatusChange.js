// src/notifications/notifyOnStatusChange.js
import { collection, getDocs, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import { resolveTargets } from "./resolvedTargets";

async function resolveOneAudience(target, report) {
  if (target.audience === "reporter")
    return report.reporterId ? [report.reporterId] : [];
  if (target.audience === "assignedWorker")
    return report.assignedTo ? [report.assignedTo] : [];
  if (target.audience === "role") {
    const snap = await getDocs(
      query(collection(db, "users"), where("role", "==", target.role)),
    );
    return snap.docs.map((d) => d.data().ID).filter(Boolean);
  }
  return [];
}

export async function notifyOnStatusChange(
  oldStatus,
  newStatus,
  report,
  { title, body } = {},
) {
  const targets = resolveTargets(oldStatus, newStatus);
  if (!targets) return;

  const idLists = await Promise.all(
    targets.map((t) => resolveOneAudience(t, report)),
  );
  const targetUserIds = [...new Set(idLists.flat())]; // dedupe — e.g. assignedWorker could theoretically overlap a role list

  if (targetUserIds.length === 0) return;

  const idToken = await getAuth().currentUser?.getIdToken();
  if (!idToken) return;

  fetch("/api/send-notification", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      targetUserIds,
      title: title || "Report update",
      body: body || `Report is now ${newStatus}.`,
      data: { reportId: report.id, status: newStatus },
    }),
  }).catch((err) => console.error("Notification send failed:", err));
}
