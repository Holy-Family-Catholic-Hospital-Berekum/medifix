import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "../src/firebase";
import PageLayout from "./pageLayout";
import StaffReportDetails from "./staffReportDetails";
import { formatDate } from "../src/utils";

export default function History() {
  const [sidePopup, setSidePopup] = useState(false);
  const [userData, setUserData] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);

  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const profile = userSnap.data();
            setUserData(profile);

            const reportsQuery = query(
              collection(db, "reports"),
              where("reporterId", "==", profile.ID),
              where("status", "==", "completed"),
            );

            const reportsSnap = await getDocs(reportsQuery);
            setReports(
              reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            );
          }
        } catch (error) {
          console.error("Error fetching history data:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
        setUserData(null);
        setReports([]);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const displayReportDetails = (id) => {
    setDisplayDetails(true);
    const reportToDisplay = reports.filter((report) => report.id === id);
    setCurrentReport(reportToDisplay);
  };

  const HistoryContent = (
    <div
      className={`py-24 px-6 flex justify-center  ${reports.length < 5 ? "mb-[500px] md:mb-[500px]" : ""}`}
    >
      {loading ? (
        <p>Loading reports...</p>
      ) : userData ? (
        <div>
          <h2 className="text-xl font-semibold mb-10">
            Completed Works ({reports.length})
          </h2>
          {reports.length > 0 ? (
            <div className="grid gap-4">
              {reports.map((report, i) => (
                <div
                  className={`bg-green-500 select-none border border-gray-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition hover:bg-green-600 rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4`}
                  key={i}
                  onClick={() => displayReportDetails(report.id)}
                >
                  <h1>{report.category.toUpperCase()}</h1>
                  <div className="flex justify-between gap-4">
                    <span className="text-blue-200 bg-yellow-800 px-1 rounded">
                      {formatDate(report.dateCompleted)}
                    </span>
                    <span className="text-red-400 bg-gray-800 px-1 rounded">
                      {report.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Nothing to display here...yet</p>
          )}
        </div>
      ) : (
        <p>Please log in to view your history.</p>
      )}
    </div>
  );

  return (
    <>
      <span
        className={`material-symbols-outlined md:hidden z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 right-0 bg-red-400 text-white`}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>

      <StaffReportDetails
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
        currentReport={currentReport}
        setCurrentReport={setCurrentReport}
      />

      <PageLayout content={HistoryContent} sidePopup={sidePopup} />
    </>
  );
}
