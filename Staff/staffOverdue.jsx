import PageLayout from "./pageLayout";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../src/firebase";
import { formatDate } from "../src/utils";

export default function StaffOverdue() {
  const [sidePopup, setSidePopup] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  useEffect(() => {
    const fetchReports = async () => {
      if (!user?.ID) return;

      try {
        const reportsQuery = query(
          collection(db, "reports"),
          where("reporterId", "==", user.ID),
          where("status", "==", "overdue"),
        );
        const snapshot = await getDocs(reportsQuery);
        const reportsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setReports(reportsData);
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [user?.ID]);

  const overdueReports = (
    <div className="py-24 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Overdue Reports</h1>

      {loading ? (
        <p className="text-center">Loading...</p>
      ) : reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-lg p-4 shadow-md border"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{report.category}</h3>
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                  {report.status}
                </span>
              </div>
              <p className="text-gray-600 mb-2">{report.reportDescription}</p>
              <div className="text-sm text-gray-500">
                <p>Priority: {report.priorityLevel}</p>
                <p>Location: {report.location}</p>
                <p>Submitted: {formatDate(report.dateSent)}</p>
                <p>Due: {formatDate(report.dateDue)}</p>
              </div>
            </div>
          ))}
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
        className={`material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400`}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>
      <PageLayout content={overdueReports} sidePopup={sidePopup} />
    </>
  );
}
