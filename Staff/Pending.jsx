import PageLayout from "./pageLayout";
import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate } from "../src/utils";

export default function Pending() {
  const [sidePopup, setSidePopup] = useState(false);
  const [reports, setReports] = useState([]);
  const [workerMap, setWorkerMap] = useState({}); // { [workerID]: workerData }
  const [loading, setLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    if (!user?.ID) return;

    const reportsQuery = query(
      collection(db, "reports"),
      where("reporterId", "==", user.ID),
      where("status", "in", [
        "incoming",
        "approved",
        "pending",
        "confirmed",
        "assigned",
        "denied",
      ]),
    );

    const unsubscribe = onSnapshot(
      reportsQuery,
      async (snapshot) => {
        const reportsData = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.dateSent?.toDate?.() ?? new Date(0);
            const bTime = b.dateSent?.toDate?.() ?? new Date(0);
            return bTime - aTime;
          });
        setReports(reportsData);
        setLoading(false);

        // Fetch assigned workers individually by their custom ID field.
        // Staff can't list all users, but can query with a where clause
        // (the list rule allows it because the query is scoped).
        const assignedIDs = [
          ...new Set(
            reportsData
              .filter((r) => r.status === "assigned" && r.assignedTo)
              .map((r) => r.assignedTo),
          ),
        ];

        for (const workerID of assignedIDs) {
          // Skip if already in map
          setWorkerMap((prev) => {
            if (prev[workerID]) return prev;
            // Fetch asynchronously
            getDocs(
              query(
                collection(db, "users"),
                where("ID", "==", workerID),
                limit(1),
              ),
            )
              .then((snap) => {
                if (!snap.empty) {
                  const data = snap.docs[0].data();
                  setWorkerMap((p) => ({ ...p, [workerID]: data }));
                }
              })
              .catch((err) =>
                console.error("Failed to fetch worker:", workerID, err),
              );
            return prev;
          });
        }
      },
      (error) => {
        console.error("Error fetching reports:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user?.ID]);

  const getDenialNote = (report) => {
    if (report.status !== "denied") return null;
    return (
      report.alerts?.find((a) => a.sentTo === user?.ID && a.type === "incoming")
        ?.content || null
    );
  };

  const statusBgColor = {
    incoming: "bg-red-500",
    approved: "bg-red-300",
    pending: "bg-yellow-300",
    confirmed: "bg-yellow-400",
    assigned: "bg-yellow-500",
    denied: "bg-gray-400",
  };

  const pendingReports = (
    <div className="py-24 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Pending Reports</h1>

      {loading ? (
        <p className="text-center">Loading...</p>
      ) : reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report) => {
            const denialNote = getDenialNote(report);
            const assignedWorker =
              report.status === "assigned" && report.assignedTo
                ? workerMap[report.assignedTo] || null
                : null;

            return (
              <div
                key={report.id}
                className={`${statusBgColor[report.status] || "bg-green-500"} rounded-lg p-4 shadow-md border`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg">{report.category}</h3>
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">
                    {report.status}
                  </span>
                </div>
                <p className="text-gray-800 mb-2">{report.reportDescription}</p>
                <div className="text-sm text-gray-700 space-y-1">
                  <p>Priority: {report.priorityLevel}</p>
                  <p>Location: {report.location}</p>
                  <p>Submitted: {formatDate(report.dateSent)}</p>
                </div>

                {/* Worker contact — shown when report is assigned */}
                {report.status === "assigned" && (
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <p className="text-sm font-semibold text-gray-900">
                      Assigned Worker:
                    </p>
                    {assignedWorker ? (
                      <>
                        <p className="text-sm text-gray-900 mt-1">
                          {assignedWorker.name}
                        </p>
                        {assignedWorker.phoneNumber && (
                          <a
                            href={`tel:${assignedWorker.phoneNumber}`}
                            className="inline-flex items-center gap-1 mt-1 text-sm font-medium text-blue-800 underline"
                          >
                            <span className="material-symbols-outlined text-base">
                              call
                            </span>
                            {assignedWorker.phoneNumber}
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        Loading worker details...
                      </p>
                    )}
                  </div>
                )}

                {/* Denial note */}
                {denialNote && (
                  <div className="mt-3 pt-3 border-t border-gray-500">
                    <p className="text-sm font-semibold text-gray-900">
                      Denial Reason:
                    </p>
                    <p className="text-sm text-gray-900 mt-1">{denialNote}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-500">
          Nothing to display here...yet
        </p>
      )}
    </div>
  );

  return (
    <>
      <span
        className="material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400"
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>
      <PageLayout content={pendingReports} sidePopup={sidePopup} />
    </>
  );
}
