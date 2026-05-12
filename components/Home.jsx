import NavBar from "./navBar";
import { useState, useEffect } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import { nanoid } from "nanoid";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  doc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../src/firebase";

export default function Home({
  bgColor,
  primaryColor,
  secColor,
  completedRedirect,
  overdueRedirect,
  assignedRedirect,
  title1,
  title2,
  titleBgColor,
  reportDate1,
  reportDate2,
  firstReportsStatus,
  secondReportsStatus,
  reportCardHoverColor,
  titleBorderColor,
  navBarColor,
  slideInBgColor,
  reportDetailsBgColor,
  reportsHiddenOnMobileTitle,
  specificReportsPage,
  logoBGColor,
  homeRedirect,
}) {
  const [sidePopup, setSidePopup] = useState(false);
  const [showReportsHiddenOnMobile, SetShowReportsHiddenOnMobile] =
    useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [reports, setReports] = useState([]);

  const [showGenModal, setShowGenModal] = useState(false);
  const [genType, setGenType] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [generatedID, setGeneratedID] = useState("");
  const [currentReportId, setCurrentReportId] = useState(null);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  const generateRegistrationID = async () => {
    const allowedTypes = {
      admin: ["estate", "staff", "worker"],
      estate: ["staff", "worker"],
    };
    const permitted = allowedTypes[user?.role];
    if (!permitted) return;
    setGenType(permitted[0]); // default to first allowed type
    setGeneratedID("");
    setShowGenModal(true);
  };

  const handleGenerate = async () => {
    if (!genType || genLoading) return;
    setGenLoading(true);
    try {
      const id = nanoid();
      await setDoc(doc(db, "registrationIDs", id), {
        type: genType,
        used: false,
      });
      setGeneratedID(id);
    } catch (error) {
      console.error("Failed to generate ID:", error);
      alert("Failed to generate registration ID. Please try again.");
    } finally {
      setGenLoading(false);
    }
  };

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? `${primaryColor}` : "text-[#111827] hover:text-blue-200"
    }`;

  const handleClose = () => {
    // give slide-down time to finish before hiding
    setTimeout(() => SetShowReportsHiddenOnMobile(false), 300);
  };

  useEffect(() => {
    let reportsQuery;

    if (user?.role === "worker") {
      reportsQuery = query(
        collection(db, "reports"),
        where("assignedTo", "==", user.ID),
      );
    } else if (user?.role === "staff") {
      // Staff already see all reports via list rule — no change needed
      reportsQuery = query(collection(db, "reports"));
    } else {
      reportsQuery = query(collection(db, "reports"));
    }

    const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
      const reportsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReports(reportsData);
    });

    return () => unsubscribe();
  }, []);

  // Get all alerts for the current user
  const getAllAlerts = () => {
    const allAlerts = [];
    reports.forEach((report) => {
      if (!report.alerts || !Array.isArray(report.alerts)) return;

      report.alerts.forEach((alert) => {
        if (alert.sentTo === user?.role || alert.sentTo === user?.ID) {
          allAlerts.push({
            ...alert,
            reportId: report.id,
            reportCategory: report.category,
          });
        }
      });
    });

    return allAlerts.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const alerts = getAllAlerts();

  const firstReports = reports.filter((report) =>
    Array.isArray(firstReportsStatus)
      ? firstReportsStatus.includes(report.status)
      : report.status === firstReportsStatus,
  );

  const secondReports = reports.filter((report) =>
    Array.isArray(secondReportsStatus)
      ? secondReportsStatus.includes(report.status)
      : report.status === secondReportsStatus,
  );

  const displayReportDetails = (id) => {
    setCurrentReportId(id);
    setDisplayDetails(true);
  };

  // Derive currentReport live from the reports state
  const currentReport = reports.filter(
    (report) => report.id === currentReportId,
  );

  const hasFeedback = (report) =>
    report.feedback && !report.feedbackViewedBy?.includes(user?.ID);

  const completedWithFeedback = reports.filter(
    (r) => r.status === "completed" && hasFeedback(r),
  ).length;

  const firstReportsCard = firstReports.map((report, i) => (
    <div
      className={`relative ${report.status !== "completed" && report.priorityLevel === "urgent" ? "bg-red-500" : report.status !== "completed" && report.priorityLevel === "routine" ? secColor : "bg-green-500"} select-none border border-gray-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition ${report.priorityLevel === "routine" ? reportCardHoverColor : "hover:bg-red-600"} rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4`}
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      {hasFeedback(report) && (
        <span className="absolute -top-2 -right-2 bg-yellow-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full shadow animate-bounce">
          💬 Feedback
        </span>
      )}
      <h1>{report.priorityLevel.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report[reportDate1]?.toDate().toLocaleDateString()}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  const secondReportsCard = secondReports.map((report, i) => (
    <div
      className={`${report.status !== "completed" && report.priorityLevel === "routine" ? secColor : "bg-red-500"} z-60 border select-none border-yellow-800 md:flex flex-col gap-2 items-center justify-center cursor-pointer transition ${report.priorityLevel === "routine" ? reportCardHoverColor : "hover:bg-red-600"} rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4 ${showReportsHiddenOnMobile ? "flex" : "hidden"} `}
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.priorityLevel.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report[reportDate2]?.toDate().toLocaleDateString()}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  return (
    <>
      <ReportDetailsContainer
        currentReport={currentReport}
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
        reportDetailsBgColor={reportDetailsBgColor}
      />

      {showGenModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-gray-800">
              Generate Registration ID
            </h2>

            {!generatedID ? (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-gray-600 font-medium">
                    Select account type
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {(user?.role === "admin"
                      ? ["estate", "staff", "worker"]
                      : ["staff", "worker"]
                    ).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGenType(type)}
                        className={`px-4 py-2 rounded-full capitalize text-sm font-medium border transition cursor-pointer ${
                          genType === type
                            ? "bg-red-400 text-white border-red-400"
                            : "bg-white text-gray-700 border-gray-300 hover:border-red-300"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowGenModal(false)}
                    className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={genLoading}
                    className={`flex-1 py-2 rounded-lg text-white font-medium transition cursor-pointer ${
                      genLoading
                        ? "bg-red-300 cursor-not-allowed"
                        : "bg-red-400 hover:bg-red-500"
                    }`}
                  >
                    {genLoading ? "Generating..." : "Generate"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Share this ID with the new{" "}
                  <span className="font-semibold capitalize">{genType}</span>:
                </p>
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm font-mono text-gray-800 break-all">
                    {generatedID}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(generatedID)}
                    className="material-symbols-outlined text-gray-500 hover:text-gray-800 transition cursor-pointer text-lg"
                  >
                    content_copy
                  </button>
                </div>
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGeneratedID("");
                      setGenType(user?.role === "admin" ? "estate" : "staff");
                    }}
                    className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                  >
                    Generate Another
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGenModal(false)}
                    className="flex-1 py-2 rounded-lg bg-red-400 hover:bg-red-500 text-white font-medium transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showReportsHiddenOnMobile && (
        <ReportsHiddenOnMobile
          showReportsHiddenOnMobile={showReportsHiddenOnMobile}
          onClose={handleClose}
          reportsHiddenOnMobile={secondReportsCard}
          reportsHiddenOnMobileTitle={reportsHiddenOnMobileTitle}
          secondReports={secondReports}
        />
      )}
      <NavBar
        navBarColor={navBarColor}
        logoBGColor={logoBGColor}
        homeRedirect={homeRedirect}
      />
      <SlideInRight
        sidePopup={sidePopup}
        slideInBgColor={slideInBgColor}
        assignedRedirect={assignedRedirect}
        completedRedirect={completedRedirect}
        overdueRedirect={overdueRedirect}
        completedWithFeedback={completedWithFeedback}
      />
      <div className="md:hidden">
        <span
          className="material-symbols-outlined select-none z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400"
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </span>
      </div>

      {!specificReportsPage && (
        <div
          className="fixed z-100 bg-red-400 bottom-0 top-auto cursor-pointer left-1/2 -translate-x-1/2 select-none rounded-t-full px-10 py-1 md:hidden"
          onClick={() => SetShowReportsHiddenOnMobile((prev) => !prev)}
        >
          <span className="text-gray-900">
            {showReportsHiddenOnMobile
              ? "Close"
              : `${reportsHiddenOnMobileTitle && reportsHiddenOnMobileTitle.split(" ")[0]}`}
          </span>
        </div>
      )}

      <main className={`flex ${bgColor}`}>
        <div
          className={`w-full fixed inset-y-0 z-10 max-w-[20%] h-screen ${secColor}  md:flex flex-col pt-24 px-10 gap-10 hidden`}
        >
          {assignedRedirect && (
            <NavLink to={`${assignedRedirect}`} className={navClass}>
              Assigned
            </NavLink>
          )}
          <NavLink to={`${completedRedirect}`} end className={navClass}>
            Completed
            {completedWithFeedback > 0 && (
              <span className="ml-2 bg-yellow-400 text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {completedWithFeedback}
              </span>
            )}
          </NavLink>
          <NavLink to={`${overdueRedirect}`} className={navClass}>
            Overdue
          </NavLink>
        </div>
        <div className="w-full h-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  overflow-y-auto py-24 flex flex-col items-center z-0">
          {(user?.role === "admin" || user?.role === "estate") && (
            <button
              onClick={generateRegistrationID}
              className="bg-red-400 hover:bg-red-500 cursor-pointer transition text-white font-bold py-2 px-4 rounded my-4"
            >
              Generate Registration ID
            </button>
          )}
          <h1
            className={`text-xl border-y ${titleBorderColor} md:text-2xl ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
          >
            {title1}
          </h1>

          {firstReports.some(hasFeedback) && (
            <div className="w-full max-w-[80%] mt-5 text-center ...">
              💬 Some completed works have feedback tap a card to review.
            </div>
          )}
          {firstReports.length > 0 ? (
            <div className="flex lg:max-w-[80%]  md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
              {firstReportsCard}
            </div>
          ) : (
            <p className=" my-20">Nothing to display here...yet</p>
          )}
          {!specificReportsPage && (
            <h1
              className={`text-xl hidden md:block md:text-2xl border-y ${titleBorderColor} ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
            >
              {title2}
            </h1>
          )}
          {secondReports.length > 0 && !specificReportsPage ? (
            <div className="flex lg:max-w-[80%]  md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
              {secondReportsCard}
            </div>
          ) : !specificReportsPage && secondReports.length <= 0 ? (
            <p className="hidden md:block my-20">
              Nothing to display here...yet
            </p>
          ) : (
            ""
          )}
        </div>
      </main>
    </>
  );
}
